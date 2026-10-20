#!/usr/bin/env python3
"""Keystal OS database tool. Safe by construction: every command that reads a database opens it
read-only; backups use SQLite's online backup API (never a raw file copy of a live database);
nothing here modifies a database except `quarantine --execute`, which backs up first.

  inspect        schema, row COUNTS only (no content), integrity, classification, pending migrations
  backup         consistent online backup to a new 0600 file, verified (integrity + row counts)
  restore-test   restore a backup into a scratch file, verify it, dry-run the migrations on it
  migrate-check  copy the live database to scratch, apply pending migrations there, prove no row is lost
  quarantine     move another implementation's conflicting tables aside (dry run unless --execute)

All commands print JSON. Exit 0 = fine, 3 = a check failed or action needed, 2 = usage error.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import migrations  # noqa: E402

ORIGINAL_TABLES = {'captures', 'threads', 'messages', 'runs', 'events', 'meta'}


def default_db():
    return Path(os.environ.get('KEYSTAL_OS_DATA', str(Path.home() / 'Keystal/outputs/keystal-os/local-state'))) / 'workbench.sqlite3'


def stamp():
    return dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')


def open_ro(db):
    db = Path(db).resolve()
    if not db.is_file():
        raise SystemExit(f'No such database: {db}')
    return sqlite3.connect(f'{db.as_uri()}?mode=ro', uri=True, timeout=15)


def tables_of(c):
    return {r[0]: [x[1] for x in c.execute(f'PRAGMA table_info("{r[0]}")')] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")}


def counts_of(c):
    return {t: c.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] for t in tables_of(c)}


def counts_at(path):
    c = open_ro(path)
    try:
        return counts_of(c)
    finally:
        c.close()


def classify_at(path, plan):
    c = open_ro(path)
    try:
        return classify(c, plan)
    finally:
        c.close()


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def classify(c, plan):
    tables = tables_of(c)
    if not tables:
        return 'empty'
    if plan['conflicts']:
        return 'conflicting: tables from another implementation'
    version = plan['current']
    if version == 0 and set(tables) <= ORIGINAL_TABLES:
        return 'original (pre-agents) schema'
    return f'keystal schema v{version}'


def invariants(c):
    tables = tables_of(c)
    out = {}
    if 'agent_tasks' in tables and 'agent_task_evidence' in tables:
        out['completed_without_approval_and_evidence'] = c.execute("""SELECT COUNT(*) FROM agent_tasks t WHERE t.status='completed' AND t.requires_review=1
            AND (t.review_state!='approved' OR NOT EXISTS(SELECT 1 FROM agent_task_evidence e WHERE e.task_id=t.id))""").fetchone()[0]
    fk = c.execute('PRAGMA foreign_key_check').fetchall()
    out['foreign_key_violations'] = len(fk)
    return out


def cmd_inspect(args):
    db = Path(args.db)
    c = open_ro(db)
    try:
        plan = migrations.plan(db)
        report = {'database': str(db.resolve()), 'user_version': plan['current'], 'latest_version': plan['latest'], 'pending_migrations': plan['pending'],
                  'classification': classify(c, plan), 'integrity': c.execute('PRAGMA quick_check').fetchone()[0],
                  'tables': {t: {'columns': cols, 'rows': c.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]} for t, cols in tables_of(c).items()},
                  'conflicts': plan['conflicts'], 'invariants': invariants(c), 'read_only': True, 'content_read': False}
    finally:
        c.close()
    bad = report['integrity'] != 'ok' or report['conflicts'] or plan.get('newer_than_code') or any(report['invariants'].values())
    return report, 3 if bad else 0


def online_backup(src_path, dest):
    """Consistent snapshot: hold a read transaction while counting and copying so counts match the copy."""
    src = open_ro(src_path)
    try:
        src.execute('BEGIN')
        expected = counts_of(src)
        version = src.execute('PRAGMA user_version').fetchone()[0]
        os.close(os.open(dest, os.O_CREAT | os.O_WRONLY, 0o600))
        dst = sqlite3.connect(dest)
        try:
            src.backup(dst)
        finally:
            dst.close()
        src.execute('ROLLBACK')
    finally:
        src.close()
    os.chmod(dest, 0o600)
    return expected, version


def verify_copy(path, expected_counts, expected_version):
    c = open_ro(path)
    try:
        problems = []
        integrity = c.execute('PRAGMA integrity_check').fetchone()[0]
        if integrity != 'ok':
            problems.append(f'integrity_check: {integrity}')
        counts = counts_of(c)
        if counts != expected_counts:
            problems.append({'row_counts_differ': {t: [expected_counts.get(t), counts.get(t)] for t in set(counts) | set(expected_counts) if counts.get(t) != expected_counts.get(t)}})
        version = c.execute('PRAGMA user_version').fetchone()[0]
        if version != expected_version:
            problems.append(f'user_version {version} != {expected_version}')
        return {'integrity': integrity, 'rows': counts, 'user_version': version}, problems
    finally:
        c.close()


def cmd_backup(args):
    out = Path(args.out) if args.out else Path(args.db).resolve().parent / 'backups'
    out.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(out, 0o700)
    dest = out / f'{Path(args.db).stem}.backup-{stamp()}.sqlite3'
    expected, version = online_backup(args.db, dest)
    verified, problems = verify_copy(dest, expected, version)
    return {'backup': str(dest), 'bytes': dest.stat().st_size, 'sha256': sha256(dest), 'mode': oct(dest.stat().st_mode & 0o777), 'verified': verified, 'problems': problems, 'method': 'sqlite online backup (read transaction held; live file not copied)'}, 3 if problems else 0


def cmd_restore_test(args):
    scratch = Path(tempfile.mkdtemp(prefix='keystal-restore-test-'))
    os.chmod(scratch, 0o700)
    try:
        restored = scratch / 'restored.sqlite3'
        expected, version = online_backup(args.backup, restored)
        verified, problems = verify_copy(restored, expected, version)
        plan = migrations.plan(restored)
        report = {'backup': str(Path(args.backup).resolve()), 'restored_into_scratch': True, 'verified': verified, 'problems': problems,
                  'classification': classify_at(restored, plan), 'pending_migrations': plan['pending'], 'conflicts': plan['conflicts']}
        if not plan['conflicts'] and plan['pending']:
            before = counts_at(restored)
            try:
                migrations.migrate(restored)
            except Exception as exc:  # reported, never raised: this is a dry run on a scratch copy
                problems.append(f'migration dry run failed: {type(exc).__name__}: {str(exc)[:200]}')
            else:
                after = counts_at(restored)
                lost = {t: [n, after.get(t)] for t, n in before.items() if after.get(t) != n}
                report['migration_dry_run'] = {'ok': not lost, 'rows_changed_in_existing_tables': lost}
                if lost:
                    problems.append('migration dry run changed row counts')
        if args.db:
            live = counts_at(args.db)
            report['compared_with_live_database'] = {'note': 'differences are expected if the live database changed after the backup was taken', 'differences': {t: [expected.get(t), live.get(t)] for t in set(expected) | set(live) if expected.get(t) != live.get(t)}}
        report['source_untouched'] = True
        return report, 3 if problems or plan['conflicts'] else 0
    finally:
        if args.keep:
            print(f'kept scratch copy: {scratch}', file=sys.stderr)
        else:
            shutil.rmtree(scratch, ignore_errors=True)


def cmd_migrate_check(args):
    scratch = Path(tempfile.mkdtemp(prefix='keystal-migrate-check-'))
    os.chmod(scratch, 0o700)
    try:
        before_hash = sha256(Path(args.db))
        copy = scratch / 'copy.sqlite3'
        expected, version = online_backup(args.db, copy)
        plan = migrations.plan(copy)
        report = {'database': str(Path(args.db).resolve()), 'from_version': plan['current'], 'to_version': plan['latest'], 'pending_migrations': plan['pending'], 'ran_on': 'scratch copy only'}
        problems = []
        if plan['conflicts']:
            report.update(result='REFUSED: schema conflict (the real migration would refuse too)', conflicts=plan['conflicts'])
            problems.append('schema conflict')
        elif plan.get('newer_than_code'):
            report.update(result='REFUSED: database is newer than this code')
            problems.append('newer database')
        else:
            try:
                outcome = migrations.migrate(copy)
            except Exception as exc:
                report['result'] = f'FAILED: {type(exc).__name__}: {str(exc)[:200]}'
                problems.append('migration failed')
            else:
                c = open_ro(copy)
                after = counts_of(c)
                lost = {t: [n, after.get(t)] for t, n in expected.items() if after.get(t) != n}
                inv = invariants(c)
                integrity = c.execute('PRAGMA integrity_check').fetchone()[0]
                c.close()
                report.update(result='OK' if not lost and integrity == 'ok' and not any(inv.values()) else 'PROBLEM', existing_table_row_counts_preserved=not lost, rows_changed=lost,
                              integrity=integrity, invariants=inv, backup_taken_by_real_run=bool(outcome['backup']) or 'yes, before the first migration if the database holds data')
                if lost or integrity != 'ok' or any(inv.values()):
                    problems.append('post-migration check failed')
        report['live_database_unchanged'] = sha256(Path(args.db)) == before_hash
        return report, 3 if problems else 0
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


def _referencing_sql(c, names, skip_tables):
    pattern = re.compile(r'\b(' + '|'.join(re.escape(n) for n in names) + r')\b', re.I)
    return [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type IN ('view','trigger') AND tbl_name NOT IN (%s) AND sql IS NOT NULL" % ','.join('?' * len(skip_tables)), list(skip_tables))
            if pattern.search(c.execute('SELECT sql FROM sqlite_master WHERE name=?', (r[0],)).fetchone()[0] or '')]


def cmd_quarantine(args):
    db = Path(args.db)
    plan = migrations.plan(db)
    table_conflicts = [c for c in plan['conflicts'] if c['declared_columns'] is not None or c['live_columns'] is not None]
    object_conflicts = [c for c in plan['conflicts'] if c['live_columns'] is None and c['declared_columns'] is None]
    if not plan['conflicts']:
        return {'database': str(db.resolve()), 'result': 'Nothing to quarantine: no schema conflict.', 'executed': False}, 0
    suffix = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d')
    c = open_ro(db)
    try:
        live = tables_of(c)
        names = [x['name'] for x in table_conflicts]
        rename = {n: f'quarantined_{n}_{suffix}' for n in names if n in live}
        clash = [new for new in rename.values() if new in live]
        outside = _referencing_sql(c, names, names) if names else []
        owned = {r[0]: (r[1], r[2]) for r in c.execute("SELECT name,type,sql FROM sqlite_master WHERE type IN ('index','trigger') AND tbl_name IN (%s) AND sql IS NOT NULL" % ','.join('?' * len(names)), names)} if names else {}
        stray = {x['name'] for x in object_conflicts} - set(owned)
    finally:
        c.close()
    report = {'database': str(db.resolve()), 'would_rename': rename, 'would_drop_indexes_and_triggers_of_those_tables': sorted(owned), 'would_drop_other_colliding_objects': sorted(stray),
              'conflicts': plan['conflicts'], 'executed': False,
              'note': 'Data is renamed, never deleted. Index/trigger definitions are saved next to the backup. Importing the other implementation\'s data into this schema is a separate, reviewed step.'}
    blockers = []
    if clash:
        blockers.append(f'target name(s) already exist: {clash}')
    if outside:
        blockers.append(f'views/triggers on other tables mention these tables and need manual review: {sorted(outside)}')
    if blockers:
        report['refused'] = blockers
        return report, 3
    if not args.execute:
        report['result'] = 'Dry run. Re-run with --execute to apply (a verified backup is taken first).'
        return report, 0
    out = Path(args.out) if args.out else db.resolve().parent / 'backups'
    out.mkdir(parents=True, exist_ok=True, mode=0o700)
    backup_path = out / f'{db.stem}.pre-quarantine-{stamp()}.sqlite3'
    expected, version = online_backup(db, backup_path)
    verified, problems = verify_copy(backup_path, expected, version)
    if problems:
        report['refused'] = ['backup verification failed; nothing was changed', problems]
        return report, 3
    saved = backup_path.with_suffix('.ddl.json')
    c = sqlite3.connect(db, isolation_level=None, timeout=15)
    try:
        c.execute('BEGIN IMMEDIATE')
        try:
            ddl = {}
            for name in sorted(stray):
                row = c.execute("SELECT type,sql FROM sqlite_master WHERE name=? AND type IN ('index','trigger')", (name,)).fetchone()
                if row and row[1]:
                    ddl[name] = row[1]
                    c.execute(f'DROP {row[0].upper()} "{name}"')
            for name, (kind, sql) in owned.items():
                ddl[name] = sql
                c.execute(f'DROP {kind.upper()} "{name}"')
            c.execute('PRAGMA legacy_alter_table=ON')
            for old, new in rename.items():
                c.execute(f'ALTER TABLE "{old}" RENAME TO "{new}"')
            c.execute('COMMIT')
        except BaseException:
            c.execute('ROLLBACK')
            raise
    finally:
        c.close()
    saved.write_text(json.dumps(ddl, indent=2))
    os.chmod(saved, 0o600)
    after = plan_after = migrations.plan(db)
    report.update(executed=True, backup=str(backup_path), backup_verified=verified, saved_definitions=str(saved), conflicts_remaining=after['conflicts'],
                  result='Quarantined. Run migrate-check, then start the server with --migrate.')
    return report, 3 if plan_after['conflicts'] else 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='cmd', required=True)
    for name in ('inspect', 'backup', 'migrate-check', 'quarantine'):
        p = sub.add_parser(name)
        p.add_argument('--db', default=str(default_db()), help='database file (default: the Keystal OS workbench database)')
        if name in ('backup', 'quarantine'):
            p.add_argument('--out', help='directory for backups (default: backups/ next to the database)')
        if name == 'quarantine':
            p.add_argument('--execute', action='store_true', help='apply the plan (default is a dry run)')
    p = sub.add_parser('restore-test')
    p.add_argument('--backup', required=True)
    p.add_argument('--db', help='optionally compare row counts with this live database (read-only)')
    p.add_argument('--keep', action='store_true', help='keep the scratch copy and print its path')
    args = parser.parse_args(argv)
    report, code = {'inspect': cmd_inspect, 'backup': cmd_backup, 'restore-test': cmd_restore_test, 'migrate-check': cmd_migrate_check, 'quarantine': cmd_quarantine}[args.cmd](args)
    print(json.dumps(report, indent=2))
    return code


if __name__ == '__main__':
    sys.exit(main())
