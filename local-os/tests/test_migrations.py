import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import migrations  # noqa: E402

LEGACY_SCHEMA = [s for s in migrations.MIGRATIONS[0][1]]


def legacy_db(path):
    """A database exactly as the pre-agents app left it: original tables, user_version 0, real rows."""
    c = sqlite3.connect(path)
    for statement in LEGACY_SCHEMA:
        c.execute(statement)
    c.execute("INSERT INTO captures VALUES('c1','Synthetic capture','Build','QA','2026-10-20','inbox',1,'2026-10-19T00:00:00+00:00')")
    c.execute("INSERT INTO threads VALUES('t1','Synthetic thread','sess1','2026-10-19T00:00:00+00:00')")
    c.execute("INSERT INTO messages VALUES('m1','t1','user','hello','2026-10-19T00:00:00+00:00')")
    c.execute("INSERT INTO runs VALUES('r1','t1','completed','2026-10-19T00:00:00+00:00','2026-10-19T00:01:00+00:00',NULL,'key-1','hash')")
    c.execute("INSERT INTO events(kind,label,created) VALUES('capture','Capture saved locally','2026-10-19T00:00:00+00:00')")
    c.execute("INSERT INTO meta VALUES('chat','{\"status\": \"verified\"}')")
    c.commit()
    c.close()


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / 'workbench.sqlite3'

    def tearDown(self):
        self.tmp.cleanup()

    def version(self, path=None):
        c = sqlite3.connect(path or self.db)
        try:
            return c.execute('PRAGMA user_version').fetchone()[0]
        finally:
            c.close()

    def test_fresh_database_reaches_latest_without_backup(self):
        result = migrations.migrate(self.db)
        self.assertEqual((result['from'], result['to'], result['backup']), (0, migrations.LATEST, None))
        self.assertEqual(self.version(), migrations.LATEST)

    def test_legacy_database_keeps_every_row_and_is_backed_up_first(self):
        legacy_db(self.db)
        result = migrations.migrate(self.db)
        self.assertEqual(result['from'], 0)
        c = sqlite3.connect(self.db)
        self.assertEqual(c.execute('SELECT title,pinned FROM captures').fetchall(), [('Synthetic capture', 1)])
        self.assertEqual(c.execute('SELECT body FROM messages').fetchall(), [('hello',)])
        self.assertEqual(c.execute('SELECT request_key FROM runs').fetchall(), [('key-1',)])
        self.assertEqual(c.execute("SELECT value FROM meta WHERE key='chat'").fetchone()[0], '{"status": "verified"}')
        self.assertEqual(c.execute('SELECT COUNT(*) FROM events').fetchone()[0], 1)
        c.close()
        backup = Path(result['backup'])
        self.assertTrue(backup.is_file())
        self.assertEqual(backup.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.version(backup), 0, 'backup must be the untouched pre-migration copy')
        b = sqlite3.connect(backup)
        self.assertEqual(b.execute("SELECT COUNT(*) FROM sqlite_master WHERE name='agent_tasks'").fetchone()[0], 0)
        self.assertEqual(b.execute('SELECT COUNT(*) FROM captures').fetchone()[0], 1)
        b.close()

    def test_migrating_twice_is_a_no_op(self):
        legacy_db(self.db)
        migrations.migrate(self.db)
        before = sorted(p.name for p in Path(self.tmp.name).iterdir())
        again = migrations.migrate(self.db)
        self.assertEqual((again['from'], again['to'], again['backup']), (migrations.LATEST, migrations.LATEST, None))
        self.assertEqual(sorted(p.name for p in Path(self.tmp.name).iterdir()), before)

    def test_five_agents_seeded_once_and_not_duplicated(self):
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        c.execute("UPDATE agents SET role='Edited by owner' WHERE id='claude'")
        c.commit()
        c.close()
        c = sqlite3.connect(self.db)
        c.execute('PRAGMA user_version=1')  # force the agents migration to run again
        c.commit()
        c.close()
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        self.assertEqual([r[0] for r in c.execute('SELECT name FROM agents ORDER BY position')], ['Hermes', 'ChatGPT', 'Claude', 'Codex', 'Gemini'])
        self.assertEqual(c.execute("SELECT role FROM agents WHERE id='claude'").fetchone()[0], 'Edited by owner', 'a re-run must not overwrite owner edits')
        c.close()

    def test_database_from_a_newer_version_is_refused_untouched(self):
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        c.execute(f'PRAGMA user_version={migrations.LATEST + 1}')
        c.commit()
        c.close()
        with self.assertRaisesRegex(RuntimeError, 'newer'):
            migrations.migrate(self.db)
        self.assertEqual(self.version(), migrations.LATEST + 1)

    def test_failed_migration_rolls_back_completely(self):
        legacy_db(self.db)
        original = list(migrations.MIGRATIONS)
        migrations.MIGRATIONS.append(('broken', ['CREATE TABLE half_done(id INTEGER)', 'THIS IS NOT SQL']))
        migrations.LATEST = len(migrations.MIGRATIONS)
        try:
            with self.assertRaises(sqlite3.Error):
                migrations.migrate(self.db)
        finally:
            migrations.MIGRATIONS[:] = original
            migrations.LATEST = len(original)
        self.assertEqual(self.version(), len(original), 'earlier migrations stay applied, the failed one leaves no trace')
        c = sqlite3.connect(self.db)
        self.assertEqual(c.execute("SELECT COUNT(*) FROM sqlite_master WHERE name='half_done'").fetchone()[0], 0)
        self.assertEqual(c.execute('SELECT COUNT(*) FROM captures').fetchone()[0], 1)
        c.close()

    def test_history_and_evidence_are_append_only(self):
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        c.execute("INSERT INTO agent_tasks(id,title,status_source,created,updated,status_changed) VALUES('a','t','manual','n','n','n')")
        c.execute("INSERT INTO agent_task_history(task_id,at,kind,source,actor) VALUES('a','n','created','manual','You')")
        c.execute("INSERT INTO agent_task_evidence(task_id,at,label,source) VALUES('a','n','e','manual')")
        for sql in ("UPDATE agent_task_history SET note='x'", 'DELETE FROM agent_task_history', "UPDATE agent_task_evidence SET label='x'", 'DELETE FROM agent_task_evidence'):
            with self.assertRaisesRegex(sqlite3.DatabaseError, 'append-only'):
                c.execute(sql)
        c.close()

    def test_database_rejects_invalid_status_and_provenance(self):
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        with self.assertRaises(sqlite3.IntegrityError):
            c.execute("INSERT INTO agent_tasks(id,title,status,status_source,created,updated,status_changed) VALUES('a','t','done','manual','n','n','n')")
        with self.assertRaises(sqlite3.IntegrityError):
            c.execute("INSERT INTO agent_tasks(id,title,status,status_source,created,updated,status_changed) VALUES('a','t','queued','telepathy','n','n','n')")
        c.close()


if __name__ == '__main__':
    unittest.main()
