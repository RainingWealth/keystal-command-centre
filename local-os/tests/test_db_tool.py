import contextlib
import hashlib
import io
import json
import os
import sqlite3
import sys
import tempfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'tools'))
import db_tool  # noqa: E402
import migrations  # noqa: E402
from test_migrations import alt_db, foreign_db, legacy_db, pr_v2_db, file_hash, dump, interrupted_writer  # noqa: E402


def run(*argv):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = db_tool.main(list(argv))
    return code, json.loads(out.getvalue())


class ToolCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.db = self.dir / 'workbench.sqlite3'
        self.addCleanup(self.tmp.cleanup)

    def listing(self):
        return sorted(str(p.relative_to(self.dir)) for p in self.dir.rglob('*') if p.is_file())


class Inspect(ToolCase):
    def test_read_only_and_reports_counts_never_content(self):
        pr_v2_db(self.db)
        before, files = file_hash(self.db), self.listing()
        code, report = run('inspect', '--db', str(self.db))
        self.assertEqual(code, 0)
        self.assertEqual(file_hash(self.db), before)
        self.assertEqual(self.listing(), files, 'no journal, backup or other file appeared')
        self.assertEqual(report['classification'], 'keystal schema v2')
        self.assertEqual(report['tables']['agent_tasks']['rows'], 2)
        self.assertEqual((report['pending_migrations'], report['content_read'], report['read_only']), (migrations.LATEST - 2, False, True))
        text = json.dumps(report)
        for private in ('Synthetic task', 'Synthetic capture', 'hello', 'https://example.com'):
            self.assertNotIn(private, text, 'row content must never appear in an inspection report')

    def test_classification_of_every_known_shape(self):
        cases = {}
        legacy_db(self.dir / 'a.sqlite3'); cases['a'] = 'original (pre-agents) schema'
        pr_v2_db(self.dir / 'b.sqlite3'); cases['b'] = 'keystal schema v2'
        migrations.migrate(self.dir / 'c.sqlite3'); cases['c'] = f'keystal schema v{migrations.LATEST}'
        foreign_db(self.dir / 'd.sqlite3'); cases['d'] = 'conflicting: tables from another implementation'
        sqlite3.connect(self.dir / 'e.sqlite3').close(); cases['e'] = 'empty'
        for key, expected in cases.items():
            self.assertEqual(run('inspect', '--db', str(self.dir / f'{key}.sqlite3'))[1]['classification'], expected, key)

    def test_foreign_schema_exits_nonzero_and_lists_the_conflict(self):
        foreign_db(self.db)
        code, report = run('inspect', '--db', str(self.db))
        self.assertEqual(code, 3)
        self.assertEqual([c['name'] for c in report['conflicts']], ['agents'])

    def test_reports_invariant_violations_in_an_existing_database(self):
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        c.execute('DROP TRIGGER agent_tasks_completion_gate_insert')  # a database written by something that bypassed the gate
        c.execute("INSERT INTO agent_tasks(id,title,status,status_source,requires_review,created,updated,status_changed) VALUES('x','t','completed','manual',1,'n','n','n')")
        c.commit(); c.close()
        code, report = run('inspect', '--db', str(self.db))
        self.assertEqual((code, report['invariants']['completed_without_approval_and_evidence']), (0, 1), 'a data condition to flag, not a broken database')
        self.assertIn('no approval and evidence', report['warnings'][0])

    def test_missing_database_is_an_error_not_a_new_file(self):
        with self.assertRaises(SystemExit):
            run('inspect', '--db', str(self.dir / 'nope.sqlite3'))
        self.assertFalse((self.dir / 'nope.sqlite3').exists())


class Backup(ToolCase):
    def test_online_backup_is_verified_private_and_leaves_the_source_alone(self):
        pr_v2_db(self.db)
        before = file_hash(self.db)
        code, report = run('backup', '--db', str(self.db), '--out', str(self.dir / 'bk'))
        self.assertEqual((code, report['problems'], report['verified']['integrity']), (0, [], 'ok'))
        backup = Path(report['backup'])
        self.assertEqual((backup.stat().st_mode & 0o777, (self.dir / 'bk').stat().st_mode & 0o777), (0o600, 0o700))
        self.assertEqual(file_hash(self.db), before)
        self.assertEqual(dump(backup), dump(self.db))
        self.assertEqual(report['sha256'], file_hash(backup))
        self.assertIn('online backup', report['method'])

    def test_backup_stays_consistent_while_another_process_writes(self):
        migrations.migrate(self.db)
        stop = threading.Event()
        written = []

        def writer():
            c = sqlite3.connect(self.db, timeout=30)
            i = 0
            while not stop.is_set():
                c.execute('INSERT INTO events(kind,label,created) VALUES(?,?,?)', ('t', f'row {i}', 'n'))
                c.commit()
                written.append(i)
                i += 1
            c.close()

        thread = threading.Thread(target=writer)
        thread.start()
        try:
            for _ in range(5):
                code, report = run('backup', '--db', str(self.db), '--out', str(self.dir / 'bk'))
                self.assertEqual((code, report['problems']), (0, []), 'the backup matches the row counts seen when it started')
                self.assertEqual(report['verified']['integrity'], 'ok')
        finally:
            stop.set()
            thread.join()
        self.assertGreater(len(written), 0, 'the writer really was running')

    def test_a_corrupt_backup_is_caught_by_restore_test(self):
        pr_v2_db(self.db)
        _, report = run('backup', '--db', str(self.db), '--out', str(self.dir / 'bk'))
        backup = Path(report['backup'])
        data = bytearray(backup.read_bytes())
        for i in range(2048, min(len(data), 2048 + 4096)):
            data[i] ^= 0xFF
        backup.write_bytes(bytes(data))
        out, err = io.StringIO(), io.StringIO()
        try:
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                code = db_tool.main(['restore-test', '--backup', str(backup)])
        except sqlite3.DatabaseError:
            return  # SQLite refused to read the damaged file at all: also a detected failure
        self.assertEqual(code, 3, 'a damaged backup must fail restore-test')


class RestoreTest(ToolCase):
    def test_restore_into_scratch_verifies_and_dry_runs_the_migration(self):
        pr_v2_db(self.db)
        _, backup = run('backup', '--db', str(self.db), '--out', str(self.dir / 'bk'))
        before = file_hash(self.db)
        files = self.listing()
        code, report = run('restore-test', '--backup', backup['backup'], '--db', str(self.db))
        self.assertEqual((code, report['problems'], report['restored_into_scratch'], report['source_untouched']), (0, [], True, True))
        self.assertEqual(report['verified']['rows']['agent_tasks'], 2)
        self.assertTrue(report['migration_dry_run']['ok'])
        self.assertEqual(report['compared_with_live_database']['differences'], {})
        self.assertEqual(file_hash(self.db), before)
        self.assertEqual(self.listing(), files, 'the scratch copy was cleaned up and nothing else was written')

    def test_restore_test_reports_a_foreign_backup_as_a_conflict(self):
        foreign_db(self.db)
        _, backup = run('backup', '--db', str(self.db), '--out', str(self.dir / 'bk'))
        code, report = run('restore-test', '--backup', backup['backup'])
        self.assertEqual(code, 3)
        self.assertEqual([c['name'] for c in report['conflicts']], ['agents'])


class MigrateCheck(ToolCase):
    def test_runs_on_a_copy_only_and_proves_no_row_is_lost(self):
        legacy_db(self.db)
        before, files = file_hash(self.db), self.listing()
        code, report = run('migrate-check', '--db', str(self.db))
        self.assertEqual((code, report['result'], report['existing_table_row_counts_preserved'], report['live_database_unchanged']), (0, 'OK', True, True))
        self.assertEqual((report['from_version'], report['to_version'], report['ran_on']), (0, migrations.LATEST, 'scratch copy only'))
        self.assertEqual(file_hash(self.db), before)
        self.assertEqual(self.listing(), files)

    def test_pr_v2_database_passes(self):
        pr_v2_db(self.db)
        code, report = run('migrate-check', '--db', str(self.db))
        self.assertEqual((code, report['result'], report['invariants']['completed_without_approval_and_evidence']), (0, 'OK', 0))

    def test_foreign_schema_is_refused_like_the_real_migration_would(self):
        foreign_db(self.db)
        before = file_hash(self.db)
        code, report = run('migrate-check', '--db', str(self.db))
        self.assertEqual(code, 3)
        self.assertTrue(report['result'].startswith('REFUSED'))
        self.assertEqual(file_hash(self.db), before)

    def test_a_database_newer_than_this_code_is_refused(self):
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        c.execute(f'PRAGMA user_version={migrations.LATEST + 1}')
        c.commit(); c.close()
        code, report = run('migrate-check', '--db', str(self.db))
        self.assertEqual(code, 3)
        self.assertIn('newer', report['result'])


class Quarantine(ToolCase):
    def test_dry_run_changes_nothing(self):
        foreign_db(self.db, colliding_names=True)
        before, files = file_hash(self.db), self.listing()
        code, report = run('quarantine', '--db', str(self.db))
        self.assertEqual((code, report['executed']), (0, False))
        self.assertEqual(sorted(report['would_rename']), ['agent_tasks', 'agents'])
        self.assertIn('agent_tasks_agent_status', report['would_drop_colliding_indexes_and_triggers'])
        self.assertEqual((file_hash(self.db), self.listing()), (before, files))

    def test_execute_backs_up_first_preserves_every_foreign_row_then_migrates(self):
        foreign_db(self.db, colliding_names=True)
        code, report = run('quarantine', '--db', str(self.db), '--out', str(self.dir / 'bk'), '--execute')
        self.assertEqual((code, report['executed'], report['conflicts_remaining']), (0, True, []))
        self.assertTrue(Path(report['backup']).is_file())
        self.assertTrue(Path(report['saved_definitions']).is_file())
        ddl = json.loads(Path(report['saved_definitions']).read_text())
        self.assertIn('CREATE INDEX agent_tasks_agent_status', ddl['agent_tasks_agent_status'])
        c = sqlite3.connect(self.db)
        stamp = list(report['would_rename'].values())
        self.assertEqual(c.execute(f'SELECT name FROM "{report["would_rename"]["agents"]}"').fetchall(), [('Hermes',)])
        self.assertEqual(c.execute(f'SELECT title FROM "{report["would_rename"]["agent_tasks"]}"').fetchall(), [('Foreign agent task',)])
        self.assertEqual(c.execute('SELECT title FROM tasks').fetchall(), [('Foreign task',)], 'unrelated foreign tables are not touched')
        self.assertEqual(c.execute('SELECT title FROM captures').fetchall(), [('Synthetic capture',)])
        c.close()
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        self.assertEqual([r[0] for r in c.execute('SELECT name FROM agents ORDER BY position')], ['Hermes', 'ChatGPT', 'Claude', 'Codex', 'Gemini'])
        self.assertEqual(c.execute('SELECT COUNT(*) FROM agent_tasks').fetchone()[0], 0)
        self.assertEqual(c.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
        c.close()
        self.assertEqual(len(stamp), 2)

    def test_a_view_elsewhere_follows_the_quarantined_table(self):
        foreign_db(self.db)
        c = sqlite3.connect(self.db)
        c.execute('CREATE VIEW foreign_report AS SELECT name FROM agents')
        c.commit(); c.close()
        code, report = run('quarantine', '--db', str(self.db), '--out', str(self.dir / 'bk'), '--execute')
        self.assertEqual((code, report['executed']), (0, True))
        self.assertIn('foreign_report', report['references_that_will_follow_the_rename'])
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        self.assertEqual(c.execute('SELECT name FROM foreign_report').fetchall(), [('Hermes',)], 'the view still shows the foreign rows, not the new agents table')
        c.close()

    def test_nothing_to_do_without_a_conflict(self):
        legacy_db(self.db)
        code, report = run('quarantine', '--db', str(self.db), '--execute')
        self.assertEqual((code, report['executed']), (0, False))


class ReviewFindings(ToolCase):
    def test_a_hot_journal_is_reported_with_instructions_not_a_traceback(self):
        migrations.migrate(self.db)
        interrupted_writer(self.db)
        for cmd in (['inspect'], ['backup', '--out', str(self.dir / 'bk')], ['migrate-check'], ['quarantine']):
            code_, report = run(*cmd, '--db', str(self.db))
            self.assertEqual(code_, 3, cmd)
            self.assertIn('NEEDS RECOVERY', report['result'])
        self.assertTrue(Path(str(self.db) + '-journal').exists(), 'the tool did not touch the journal')

    def test_foreign_keys_elsewhere_follow_the_quarantined_table_and_never_re_parent(self):
        c = sqlite3.connect(self.db)
        for statement in migrations.MIGRATIONS[0][1]:
            c.execute(statement)
        c.executescript("""CREATE TABLE agents(id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT,status TEXT);
            CREATE TABLE tasks(id TEXT PRIMARY KEY,title TEXT NOT NULL,status TEXT NOT NULL,agent_id TEXT REFERENCES agents(id),review TEXT);
            INSERT INTO agents VALUES('claude','Claude (foreign row)','api','ok'); INSERT INTO tasks VALUES('f1','Foreign task','completed','claude','pending');""")
        c.close()
        code, report = run('quarantine', '--db', str(self.db), '--out', str(self.dir / 'bk'), '--execute')
        self.assertEqual((code, report['executed']), (0, True))
        self.assertEqual(report['references_that_will_follow_the_rename'], ['tasks.agent_id -> agents'])
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        parent = c.execute('PRAGMA foreign_key_list(tasks)').fetchone()[2]
        self.assertTrue(parent.startswith('quarantined_agents_'), parent)
        self.assertEqual(c.execute(f'SELECT a.name FROM tasks t JOIN "{parent}" a ON a.id=t.agent_id').fetchall(), [('Claude (foreign row)',)])
        self.assertEqual(c.execute("SELECT role FROM agents WHERE id='claude'").fetchone()[0], 'Writing and analysis', 'the new agents table is untouched by the foreign rows')
        self.assertEqual(c.execute('PRAGMA foreign_key_check').fetchall(), [])
        c.close()

    def test_quarantine_never_moves_the_owners_own_altered_table(self):
        pr_v2_db(self.db)
        c = sqlite3.connect(self.db)
        c.execute('ALTER TABLE agent_tasks ADD COLUMN surprise TEXT')
        c.commit(); c.close()
        code, report = run('inspect', '--db', str(self.db))
        self.assertIn('altered keystal schema', report['classification'])
        before = file_hash(self.db)
        code, report = run('quarantine', '--db', str(self.db), '--execute')
        self.assertEqual((code, report['executed']), (3, False))
        self.assertIn('would hide your own data', json.dumps(report['refused']))
        self.assertEqual(file_hash(self.db), before)

    def test_quarantine_refuses_a_view_holding_a_table_name(self):
        pr_v2_db(self.db)
        c = sqlite3.connect(self.db)
        c.execute('CREATE VIEW projects AS SELECT DISTINCT lane AS id FROM agent_tasks')
        c.commit(); c.close()
        code, report = run('quarantine', '--db', str(self.db), '--execute')
        self.assertEqual((code, report['executed']), (3, False))

    def test_a_database_with_a_broken_foreign_key_declaration_can_still_be_inspected(self):
        c = sqlite3.connect(self.db)
        for statement in migrations.MIGRATIONS[0][1]:
            c.execute(statement)
        c.execute('CREATE TABLE agents(id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT)')
        c.execute('CREATE TABLE tasks(id TEXT PRIMARY KEY,title TEXT,agent_name TEXT REFERENCES agents(name))')
        c.commit(); c.close()
        code, report = run('inspect', '--db', str(self.db))
        self.assertEqual(code, 3)
        self.assertIn('foreign key mismatch', report['invariants']['foreign_key_check_error'])


class Restore(ToolCase):
    def setUp(self):
        super().setUp()
        import socket
        with socket.socket() as sock:  # a port nothing listens on, so the 'server running' guard is not tripped by accident
            sock.bind(('127.0.0.1', 0))
            self.port = sock.getsockname()[1]
        os.environ['KEYSTAL_OS_PORT'] = str(self.port)
        self.addCleanup(os.environ.pop, 'KEYSTAL_OS_PORT', None)

    def backed_up_then_migrated(self):
        pr_v2_db(self.db)
        _, report = run('backup', '--db', str(self.db), '--out', str(self.dir / 'bk'))
        migrations.migrate(self.db)
        return Path(report['backup'])

    def test_dry_run_changes_nothing_and_says_which_code_opens_the_backup(self):
        backup = self.backed_up_then_migrated()
        before, files = file_hash(self.db), self.listing()
        code, report = run('restore', '--backup', str(backup), '--db', str(self.db))
        self.assertEqual((code, report['executed'], report['backup_schema_version']), (0, False, 2))
        self.assertIn('PR #1 head e0aea41 opens it as is', report['which_code_opens_it'])
        self.assertEqual((file_hash(self.db), self.listing()), (before, files))

    def test_execute_rolls_back_to_the_backup_and_keeps_the_replaced_file(self):
        backup = self.backed_up_then_migrated()
        migrated = dump(self.db)
        code, report = run('restore', '--backup', str(backup), '--db', str(self.db), '--execute')
        self.assertEqual((code, report['executed'], report['problems']), (0, True, []))
        self.assertEqual(dump(self.db), dump(backup), 'the live database is now exactly the backup')
        self.assertEqual(dump(report['replaced_file_kept']), migrated, 'the replaced database is kept, not deleted')
        self.assertEqual(oct(self.db.stat().st_mode & 0o777), '0o600')
        self.assertEqual(migrations.plan(self.db)['current'], 2)

    def test_refuses_while_a_server_is_listening(self):
        import socket
        backup = self.backed_up_then_migrated()
        before = file_hash(self.db)
        with socket.socket() as server:
            server.bind(('127.0.0.1', self.port))
            server.listen()
            code, report = run('restore', '--backup', str(backup), '--db', str(self.db), '--execute')
        self.assertEqual((code, report['executed']), (3, False))
        self.assertIn('Stop the Keystal server first', report['refused'])
        self.assertEqual(file_hash(self.db), before)

    def test_refuses_a_backup_that_fails_verification(self):
        backup = self.backed_up_then_migrated()
        data = bytearray(backup.read_bytes())
        for i in range(2048, min(len(data), 2048 + 4096)):
            data[i] ^= 0xFF
        backup.write_bytes(bytes(data))
        before = file_hash(self.db)
        try:
            code, report = run('restore', '--backup', str(backup), '--db', str(self.db), '--execute')
        except sqlite3.DatabaseError:
            code, report = 3, {'executed': False}
        self.assertEqual((code, report['executed']), (3, False))
        self.assertEqual(file_hash(self.db), before)


class AlternativeImplementation(ToolCase):
    """End to end on the other implementation's real schema: inspect, quarantine, migrate, start."""
    def test_reconciliation_path_preserves_every_foreign_row_and_ends_at_the_latest_schema(self):
        alt_db(self.db)
        code, report = run('inspect', '--db', str(self.db))
        self.assertEqual((code, report['classification']), (3, 'conflicting: tables from another implementation'))
        before = {t: v['rows'] for t, v in report['tables'].items()}
        code, report = run('migrate-check', '--db', str(self.db))
        self.assertEqual(code, 3)
        code, report = run('quarantine', '--db', str(self.db), '--out', str(self.dir / 'bk'), '--execute')
        self.assertEqual((code, report['executed'], report['conflicts_remaining']), (0, True, []))
        self.assertEqual(sorted(report['would_rename']), ['agents'])
        self.assertEqual(report['references_that_will_follow_the_rename'], ['tasks.agent_id -> agents'])
        code, report = run('migrate-check', '--db', str(self.db))
        self.assertEqual((code, report['result']), (0, 'OK'))
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        quarantined = report_name = next(n for (n,) in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'quarantined_agents_%'"))
        for table in ('tasks', 'task_history', 'task_migrations', 'captures'):
            self.assertEqual(c.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0], before[table], table)
        self.assertEqual(c.execute(f'SELECT COUNT(*) FROM "{quarantined}"').fetchone()[0], before['agents'])
        self.assertEqual(c.execute('PRAGMA foreign_key_list(tasks)').fetchone()[2], quarantined)
        self.assertEqual(c.execute('SELECT COUNT(*) FROM agents').fetchone()[0], 5)
        self.assertEqual(c.execute('SELECT COUNT(*) FROM agent_tasks').fetchone()[0], 0, 'nothing is imported implicitly')
        self.assertEqual(c.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
        self.assertEqual(c.execute('PRAGMA foreign_key_check').fetchall(), [])
        c.close()
        self.assertTrue(report_name)


if __name__ == '__main__':
    unittest.main()
