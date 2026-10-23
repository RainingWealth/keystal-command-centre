#!/usr/bin/env python3
"""Keystal OS database tool. Safe by construction: inspection commands open databases read-only;
restore --execute opens the live database read-write; backups use SQLite's online backup API (never a raw file copy of a live database);
nothing here modifies a database except `quarantine --execute` and `restore --execute`, which verify and back up first.

  inspect        schema, row COUNTS only (no content), integrity, classification, pending migrations
  backup         consistent online backup to a new 0600 file, verified (integrity + row counts)
  restore-test   restore a backup into a scratch file, verify it, dry-run the migrations on it
  migrate-check  copy the live database to scratch, apply pending migrations there, prove no row is lost
  quarantine     move another implementation's conflicting tables aside (dry run unless --execute)
  restore        put a verified backup back in place of the live database (dry run unless --execute);
                 the replaced file is renamed, never deleted, and the server must be stopped

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
import socket
import sqlite3
import sys
import tempfile
import fcntl

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import migrations  # noqa: E402

ORIGINAL_TABLES = {'captures', 'threads', 'messages', 'runs', 'events', 'meta'}


def default_db():
    return Path(os.environ.get('KEYSTAL_OS_DATA', str(Path.home() / 'Keystal/outputs/keystal-os/local-state'))) / 'workbench.sqlite3'


def stamp():
    return dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')


class NeedsRecovery(Exception):
    pass


def open_ro(db):
    db = Path(db).resolve()
    if not db.is_file():
        raise SystemExit(f'No such database: {db}')
    return sqlite3.connect(migrations.ro_uri(db), uri=True, timeout=migrations.BUSY_TIMEOUT)


def qi(name):
    """Quote an SQL identifier. Names come from a possibly foreign database, so they are never trusted."""
    return '"' + str(name).replace('"', '""') + '"'


def tables_of(c):
    return {r[0]: [x[1] for x in c.execute(f'PRAGMA table_info({qi(r[0])})')] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")}


def counts_of(c):
    return {t: c.execute(f'SELECT COUNT(*) FROM {qi(t)}').fetchone()[0] for t in tables_of(c)}


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
    if plan.get('invalid_version'):
        return f"unknown: user_version {plan['current']} is not one Keystal writes"
    if any(x['kind'] == 'altered' for x in plan['conflicts']):
        return 'altered keystal schema: a table this version owns was changed or removed (not another implementation; needs manual review)'
    if plan['conflicts']:
        return 'conflicting: tables from another implementation'
    version = plan['current']
    if version == 0 and set(tables) <= ORIGINAL_TABLES:
        return 'original (pre-agents) schema'
    return f'keystal schema v{version}'


invariants = migrations.invariants


def warnings_for(inv):
    out = []
    if inv.get('completed_without_approval_and_evidence'):
        out.append(f"{inv['completed_without_approval_and_evidence']} completed task(s) need review but have no approval and evidence (they predate the approval gate, or the gate was bypassed). They are flagged in the dashboard; reopen them to review.")
    return out


def cmd_inspect(args):
    db = Path(args.db)
    c = open_ro(db)
    try:
        plan = migrations.plan(db)
        report = {'database': str(db.resolve()), 'user_version': plan['current'], 'latest_version': plan['latest'], 'pending_migrations': plan['pending'],
                  'classification': classify(c, plan), 'integrity': c.execute('PRAGMA quick_check').fetchone()[0],
                  'tables': {t: {'columns': cols, 'rows': c.execute(f'SELECT COUNT(*) FROM {qi(t)}').fetchone()[0]} for t, cols in tables_of(c).items()},
                  'conflicts': plan['conflicts'], 'invariants': invariants(c), 'read_only': True, 'content_read': False}
    finally:
        c.close()
    report['warnings'] = warnings_for(report['invariants'])
    bad = report['integrity'] != 'ok' or report['conflicts'] or plan.get('newer_than_code') or report['invariants'].get('foreign_key_violations')
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
    dest = migrations.claim(out / f'{Path(args.db).stem}.backup-{stamp()}.sqlite3')
    try:
        expected, version = online_backup(args.db, dest)
    except BaseException:
        dest.unlink(missing_ok=True)
        raise
    verified, problems = verify_copy(dest, expected, version)
    return {'backup': str(dest), 'bytes': dest.stat().st_size, 'sha256': sha256(dest), 'mode': oct(dest.stat().st_mode & 0o777), 'verified': verified, 'problems': problems, 'method': 'sqlite online backup (read transaction held; live file not copied)'}, 3 if problems else 0


def cmd_restore_test(args):
    scratch = Path(tempfile.mkdtemp(prefix='keystal-restore-test-'))
    os.chmod(scratch, 0o700)
    try:
        restored = scratch / 'restored.sqlite3'
        expected, version = online_backup(args.backup, restored)
        verified, problems = verify_copy(restored, expected, version)
        if not expected or not (set(expected) & {'captures','threads','messages','runs','events','meta','agents','agent_tasks','projects'}):
            problems.append('backup has no tables')
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
    if not Path(args.db).is_file():
        return {'database': str(Path(args.db).resolve()), 'result': 'No such database; nothing was changed.'}, 3
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
                ok = not lost and integrity == 'ok' and not inv.get('foreign_key_violations')
                report.update(result=('OK' if not warnings_for(inv) else 'OK with warnings') if ok else 'PROBLEM', existing_table_row_counts_preserved=not lost, rows_changed=lost,
                              integrity=integrity, invariants=inv, warnings=warnings_for(inv), backup_taken_by_real_run=bool(outcome['backup']) or 'yes, before the first migration if the database holds data')
                if not ok:
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
    if not db.is_file():
        return {'database': str(db.resolve()), 'result': 'No such database; nothing was changed.', 'executed': False}, 3
    plan = migrations.plan(db)
    if not plan['conflicts']:
        return {'database': str(db.resolve()), 'result': 'Nothing to quarantine: no schema conflict.', 'executed': False}, 0
    own = [c for c in plan['conflicts'] if c['kind'] in ('altered', 'namespace')]
    if own:
        return {'database': str(db.resolve()), 'executed': False, 'conflicts': plan['conflicts'],
                'refused': ['Quarantine only moves tables that ANOTHER implementation created under names a pending migration needs. '
                            'These conflicts are not that: a table this schema version already owns was changed or removed, or a view/index '
                            'holds a table name. Moving them would hide your own data. Review them by hand (inspect lists the columns).',
                            [c['name'] + ': ' + c['reason'] for c in own]]}, 3
    table_conflicts = [c for c in plan['conflicts'] if c['kind'] == 'preexisting']
    object_conflicts = [c for c in plan['conflicts'] if c['kind'] == 'object']
    suffix = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d')
    c = open_ro(db)
    try:
        live = tables_of(c)
        names = [x['name'] for x in table_conflicts]
        rename = {n: f'quarantined_{n}_{suffix}' for n in names if n in live}
        clash = [new for new in rename.values() if new in live]
        # Renamed the modern way: SQLite rewrites foreign keys, triggers and views that name a renamed table, so the other
        # implementation's rows keep pointing at ITS table (now quarantined), never at the new Keystal table of the same name.
        follows = sorted({f'{t}.{fk[3]} -> {fk[2]}' for t in live if t not in names for fk in c.execute(f'PRAGMA foreign_key_list({qi(t)})') if fk[2] in names})
        follows += sorted(_referencing_sql(c, names, names)) if names else []
        stray = sorted({x['name'] for x in object_conflicts})
    finally:
        c.close()
    report = {'database': str(db.resolve()), 'would_rename': rename, 'would_drop_colliding_indexes_and_triggers': stray,
              'references_that_will_follow_the_rename': follows, 'conflicts': plan['conflicts'], 'executed': False,
              'note': "Data is renamed, never deleted. Foreign keys, views and triggers that point at a renamed table are rewritten to "
                      "point at its quarantined name. Only index/trigger names that collide with this schema are dropped, and their "
                      "definitions are saved next to the backup. Importing the other implementation's rows is a separate, reviewed step."}
    if clash:
        report['refused'] = [f'target name(s) already exist: {clash}']
        return report, 3
    if not args.execute:
        report['result'] = 'Dry run. Re-run with --execute to apply (a verified backup is taken first).'
        return report, 0
    lock_fd = data_lock(db)
    if lock_fd is None:
        report['refused'] = 'Another Keystal OS server is already using this data folder. Nothing was changed.'
        return report, 3
    out = Path(args.out) if args.out else db.resolve().parent / 'backups'
    out.mkdir(parents=True, exist_ok=True, mode=0o700)
    backup_path = migrations.claim(out / f'{db.stem}.pre-quarantine-{stamp()}.sqlite3')
    expected, version = online_backup(db, backup_path)
    verified, problems = verify_copy(backup_path, expected, version)
    if problems:
        report['refused'] = ['backup verification failed; nothing was changed', problems]
        os.close(lock_fd)
        return report, 3
    saved = backup_path.with_suffix('.ddl.json')
    c = sqlite3.connect(db, isolation_level=None, timeout=migrations.BUSY_TIMEOUT)
    try:
        c.execute('PRAGMA legacy_alter_table=OFF')
        c.execute('BEGIN IMMEDIATE')
        try:
            ddl = {}
            for name in stray:
                row = c.execute("SELECT type,sql FROM sqlite_master WHERE name=? AND type IN ('index','trigger')", (name,)).fetchone()
                if row and row[1]:
                    ddl[name] = row[1]
                    c.execute(f'DROP {"INDEX" if row[0] == "index" else "TRIGGER"} {qi(name)}')
            for old, new in rename.items():
                c.execute(f'ALTER TABLE {qi(old)} RENAME TO {qi(new)}')
            dangling = sorted({f'{t}.{fk[3]} -> {fk[2]}' for t in tables_of(c) for fk in c.execute(f'PRAGMA foreign_key_list({qi(t)})') if fk[2] in rename})
            if dangling:
                raise RuntimeError(f'references still name the old tables after the rename: {dangling}')
            if c.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise RuntimeError('integrity_check failed after the rename')
            c.execute('COMMIT')
        except BaseException as exc:
            c.execute('ROLLBACK')
            report['refused'] = [f'Rolled back, nothing was changed: {type(exc).__name__}: {str(exc)[:300]}']
            return report, 3
    finally:
        c.close()
    saved.write_text(json.dumps(ddl, indent=2))
    os.chmod(saved, 0o600)
    after = migrations.plan(db)
    report.update(executed=True, backup=str(backup_path), backup_verified=verified, saved_definitions=str(saved), conflicts_remaining=after['conflicts'],
                  result='Quarantined. Run migrate-check, then start the server with --migrate.' if not after['conflicts'] else 'Quarantined the foreign tables, but conflicts remain (listed). Do not migrate yet.')
    os.close(lock_fd)
    return report, 3 if after['conflicts'] else 0


SCHEMA_CODE = {0: 'the original app (main 3735b38) opens it as is; this branch opens it only after --migrate',
               2: 'PR #1 head e0aea41 opens it as is; this branch opens it only after --migrate',
               3: 'the corrective-pass commits a1589e1 to b9bd4c3 open it as is; current code opens it only after --migrate',
               4: 'this branch up to c7ef6d5; migrate before opening',
               5: 'the current code'}


def server_listening():
    port = int(os.environ.get('KEYSTAL_OS_PORT', '8766'))
    with socket.socket() as s:
        s.settimeout(0.5)
        return port if s.connect_ex(('127.0.0.1', port)) == 0 else None

def data_lock(db):
    fd = os.open(Path(db).resolve().parent / 'keystal-server.lock', os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        return None
    return fd


def cmd_restore(args):
    """Roll back: replace the live database with a backup. Verifies the backup first, keeps the replaced file."""
    db, backup = Path(args.db).resolve(), Path(args.backup).resolve()
    if not backup.is_file():
        return {'database': str(db), 'backup': str(backup), 'problems': ['backup does not exist'], 'result': 'No such backup; nothing was changed.', 'executed': False}, 3
    if db == backup or os.path.samefile(db, backup):
        return {'database': str(db), 'backup': str(backup), 'problems': ['backup and database are the same file'], 'refused': 'Backup and database are the same file.', 'executed': False}, 3
    scratch = Path(tempfile.mkdtemp(prefix='keystal-restore-'))
    os.chmod(scratch, 0o700)
    try:
        check = scratch / 'check.sqlite3'
        expected, version = online_backup(backup, check)
        verified, problems = verify_copy(check, expected, version)
    if not expected or not (set(expected) & {'captures','threads','messages','runs','events','meta','agents','agent_tasks','projects'}):
            problems.append('backup is empty or not a Keystal database')
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
    stamp_ = stamp()
    moved = db.with_name(f'{db.stem}.replaced-{stamp_}{db.suffix}')
    report = {'database': str(db), 'backup': str(backup), 'backup_verified': verified, 'problems': problems,
              'backup_schema_version': version, 'which_code_opens_it': SCHEMA_CODE.get(version, 'unknown schema version'),
              'would_rename_current_to': str(moved) if db.exists() else None, 'executed': False}
    if problems:
        report['refused'] = 'The backup failed verification; nothing was changed.'
        report['executed'] = False
        return report, 3
    port = server_listening()
    if port:
        report['refused'] = f'Something is listening on 127.0.0.1:{port}. Stop the Keystal server first (Ctrl+C), then run this again. Nothing was changed.'
        return report, 3
    lock_fd = None
    if args.execute:
        lock_fd = data_lock(db)
        if lock_fd is None:
            report['refused'] = 'Another Keystal OS server is already using this data folder. Nothing was changed.'
            return report, 3
    if not args.execute:
        report['result'] = 'Dry run. Stop the server, then re-run with --execute. The current database is renamed (kept), never deleted.'
        return report, 0
    if db.exists():
        c = sqlite3.connect(db, timeout=0)
        try:
            c.execute('BEGIN EXCLUSIVE')
            c.execute('ROLLBACK')
        except sqlite3.OperationalError:
            report['refused'] = 'The database is in use by another process. Stop the server first. Nothing was changed.'
            return report, 3
        finally:
            c.close()
        moved = migrations.claim(moved)  # an empty placeholder under a free name; the rename replaces only it
        db.rename(moved)
        for suffix in ('-journal', '-wal', '-shm'):
            side = Path(str(db) + suffix)
            if side.exists():
                side.rename(Path(str(moved) + suffix))
    try:
        expected, version = online_backup(backup, db)
    except sqlite3.DatabaseError as exc:
        if not db.exists() and moved.exists():
            moved.rename(db)
        report.update(refused=f'Restore failed before installation: {exc}; the live database was kept.', result='Nothing was changed.')
        if lock_fd is not None: os.close(lock_fd)
        return report, 3
    verified, problems = verify_copy(db, expected, version)
    report.update(executed=True, restored_rows=verified['rows'], problems=problems, replaced_file_kept=str(moved) if moved.exists() else None,
                  result='Restored. Start the code version listed above.' if not problems else 'Restored file failed verification: the replaced file is kept; put it back by renaming.')
    if lock_fd is not None: os.close(lock_fd)
    return report, 3 if problems else 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='cmd', required=True)
    for name in ('inspect', 'backup', 'migrate-check', 'quarantine'):
        p = sub.add_parser(name)
        # Default backups go next to the database: same disk. Keep a second copy somewhere else (--out to another drive).
        p.add_argument('--db', default=str(default_db()), help='database file (default: the Keystal OS workbench database)')
        if name in ('backup', 'quarantine'):
            p.add_argument('--out', help='directory for backups (default: backups/ next to the database)')
        if name == 'quarantine':
            p.add_argument('--execute', action='store_true', help='apply the plan (default is a dry run)')
    p = sub.add_parser('restore')
    p.add_argument('--backup', required=True)
    p.add_argument('--db', default=str(default_db()), help='the live database to replace (default: the Keystal OS workbench database)')
    p.add_argument('--execute', action='store_true', help='apply (default is a dry run)')
    p = sub.add_parser('restore-test')
    p.add_argument('--backup', required=True)
    p.add_argument('--db', help='optionally compare row counts with this live database (read-only)')
    p.add_argument('--keep', action='store_true', help='keep the scratch copy and print its path')
    args = parser.parse_args(argv)
    try:
        for path in (getattr(args, 'db', None), getattr(args, 'backup', None)):
            if path and Path(path).is_file() and migrations.needs_recovery(path):
                raise NeedsRecovery(str(Path(path).resolve()))
        report, code = {'inspect': cmd_inspect, 'backup': cmd_backup, 'restore-test': cmd_restore_test, 'migrate-check': cmd_migrate_check, 'quarantine': cmd_quarantine, 'restore': cmd_restore}[args.cmd](args)
    except SystemExit as exc:
        report, code = {'database': str(Path(getattr(args, 'db', None) or getattr(args, 'backup', '')).resolve()), 'result': str(exc)}, 3
    except NeedsRecovery as exc:
        report, code = {'database': str(exc), 'result': 'NEEDS RECOVERY: an interrupted transaction left a -journal file. This tool opens databases read-only and cannot roll it back. '
                        'Start the Keystal server once (it lets SQLite roll the transaction back, as any normal open does), then run this command again. Nothing was changed.'}, 3
    except sqlite3.DatabaseError as exc:
        report, code = {'database': str(Path(getattr(args, 'db', None) or args.backup).resolve()),
                        'result': f'STOPPED: SQLite reported "{exc}". Nothing further was done. If the server or another program is writing heavily, wait and run this command again.'}, 3
    print(json.dumps(report, indent=2))
    return code


if __name__ == '__main__':
    sys.exit(main())
