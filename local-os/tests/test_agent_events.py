"""Migration v6: append-only agent activity events. Storage only; synthetic databases in temporary folders."""
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import migrations  # noqa: E402
from test_migrations import LEGACY_ID, pr_v2_with_pre_gate_row  # noqa: E402

COLUMNS = '(event_key,agent_id,session_ref,run_ref,event_type,occurred_at,received_at,source)'
NOW = '2026-10-23T08:00:00+00:00'


def event(key='evt-0000000000000001', agent='claude', session='sess-1', run='', kind='SessionStart', at=NOW, received=NOW, source='hook_reported'):
    return (key, agent, session, run, kind, at, received, source)


def v5_db(path):
    """A real v5 database holding data in every older table that matters: original rows, a pre-gate task, a session."""
    pr_v2_with_pre_gate_row(path)
    with mock.patch.object(migrations, 'LATEST', 5):
        migrations.migrate(path)
    c = sqlite3.connect(path)
    c.execute("INSERT INTO agent_task_sessions(task_id,agent_id,session_ref,run_ref,note,source,created) VALUES(?,'codex','sess-1','','', 'manual','n')", (LEGACY_ID,))
    c.commit()
    c.close()


def rows(path, skip=('agent_events', 'sqlite_sequence')):
    c = sqlite3.connect(path)
    try:
        tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name") if r[0] not in skip]
        return {t: c.execute(f'SELECT * FROM "{t}" ORDER BY rowid').fetchall() for t in tables}
    finally:
        c.close()


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name) / 'workbench.sqlite3'

    def connect(self):
        c = sqlite3.connect(self.db, isolation_level=None)
        c.execute('PRAGMA foreign_keys=ON')  # as the server's connect() does
        self.addCleanup(c.close)
        return c


class MigrationV6(Base):
    def test_v5_to_v6_keeps_every_row_and_adds_only_the_events_table(self):
        v5_db(self.db)
        before = rows(self.db)
        c = sqlite3.connect(self.db)
        objects_before = set(c.execute("SELECT type,name FROM sqlite_master"))
        c.close()
        result = migrations.migrate(self.db)
        self.assertEqual((result['from'], result['to']), (5, 6))
        self.assertTrue(result['backup'] and Path(result['backup']).is_file(), 'an online backup is taken before migrating data')
        self.assertEqual(rows(self.db), before, 'every existing row is unchanged')
        c = sqlite3.connect(self.db)
        added = set(c.execute("SELECT type,name FROM sqlite_master")) - objects_before
        self.assertEqual(c.execute('PRAGMA user_version').fetchone()[0], 6)
        self.assertEqual(c.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
        c.close()
        self.assertEqual({n for _, n in added}, {'agent_events', 'sqlite_autoindex_agent_events_1', 'agent_events_agent_recent', 'agent_events_session',
                                                 'agent_events_no_update', 'agent_events_no_delete', 'agent_events_duplicate_ignored', 'agent_events_no_replace'})
        state = migrations.plan(self.db)
        self.assertEqual((state['pending'], state['conflicts']), (0, []))
        self.assertEqual(state['invariants']['completed_without_approval_and_evidence'], 1, 'the pre-gate row is still flagged, not rewritten')

    def test_a_fresh_database_reaches_v6(self):
        migrations.migrate(self.db)
        c = self.connect()
        self.assertEqual(c.execute('PRAGMA user_version').fetchone()[0], 6)
        self.assertEqual(c.execute('SELECT COUNT(*) FROM agent_events').fetchone()[0], 0, 'no event is invented')


class Events(Base):
    def setUp(self):
        super().setUp()
        migrations.migrate(self.db)
        self.c = self.connect()

    def insert(self, values):
        return self.c.execute(f'INSERT INTO agent_events{COLUMNS} VALUES(?,?,?,?,?,?,?,?)', values).rowcount

    def test_events_are_stored_and_read_back_by_agent_and_session(self):
        kinds = ('SessionStart', 'PostToolUse', 'Stop', 'SessionEnd')
        for i, kind in enumerate(kinds):
            self.insert(event(key=f'evt-claude-000000{i:02d}', kind=kind, at=f'2026-10-23T08:00:0{i}+00:00', run='run-7' if i else ''))
        self.insert(event(key='evt-codex-00000000001', agent='codex', session='other', kind='SessionStart'))
        self.insert(event(key='evt-hermes-0000000001', agent='hermes', session='board:default', kind='PostToolUse', source='observed'))
        recent = self.c.execute("SELECT event_type,run_ref FROM agent_events WHERE agent_id='claude' AND session_ref='sess-1' ORDER BY occurred_at DESC").fetchall()
        self.assertEqual(recent, [('SessionEnd', 'run-7'), ('Stop', 'run-7'), ('PostToolUse', 'run-7'), ('SessionStart', '')])
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM agent_events").fetchone()[0], 6)
        self.assertEqual(self.c.execute("SELECT source FROM agent_events WHERE agent_id='hermes'").fetchone()[0], 'observed')

    def test_recent_activity_queries_use_the_indexes(self):
        plans = {
            'agent_events_agent_recent': "SELECT * FROM agent_events WHERE agent_id='claude' ORDER BY occurred_at DESC LIMIT 20",
            'agent_events_session': "SELECT * FROM agent_events WHERE agent_id='claude' AND session_ref='s' ORDER BY occurred_at DESC LIMIT 20",
        }
        for index, sql in plans.items():
            plan = ' '.join(r[-1] for r in self.c.execute('EXPLAIN QUERY PLAN ' + sql))
            self.assertIn(index, plan, plan)
            self.assertNotIn('TEMP B-TREE', plan, 'no sort step: the index already orders by time')

    def test_updates_deletes_and_replace_cannot_change_history(self):
        self.insert(event())
        original = self.c.execute('SELECT * FROM agent_events').fetchall()
        for sql in ("UPDATE agent_events SET event_type='Stop'", "UPDATE agent_events SET source='observed'", 'DELETE FROM agent_events'):
            with self.subTest(sql=sql), self.assertRaisesRegex(sqlite3.IntegrityError, 'append-only'):
                self.c.execute(sql)
        # REPLACE on the same event_key, and on the same row id with a new key: neither may overwrite the stored event.
        self.c.execute(f'INSERT OR REPLACE INTO agent_events{COLUMNS} VALUES(?,?,?,?,?,?,?,?)', event(kind='Stop', source='observed'))
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'append-only'):
            self.c.execute(f'REPLACE INTO agent_events(id,{COLUMNS[1:]} VALUES(1,?,?,?,?,?,?,?,?)', event(key='evt-0000000000000002', kind='Stop'))
        self.assertEqual(self.c.execute('SELECT * FROM agent_events').fetchall(), original)

    def test_a_redelivered_event_is_ignored_and_reported_as_a_duplicate(self):
        self.assertEqual(self.insert(event()), 1)
        self.assertEqual(self.insert(event(kind='Stop', received='2026-10-23T08:00:09+00:00')), 0, 'same event_key: nothing stored, rowcount 0')
        self.assertEqual(self.c.execute('SELECT event_type,received_at FROM agent_events').fetchall(), [('SessionStart', NOW)], 'first delivery wins')

    def test_invalid_or_oversized_values_are_refused(self):
        bad = {
            'unknown event type': event(kind='PreToolUse'),
            'lower-case event type': event(kind='stop'),
            'unknown agent': event(agent='chatgpt-desktop'),
            'unknown source': event(source='manual'),
            'short event key': event(key='short'),
            'long event key': event(key='k' * 81),
            'event key with a space': event(key='evt 0000000000000001'),
            'empty session': event(session=''),
            'long session': event(session='s' * 129),
            'session with a slash': event(session='../etc/passwd'),
            'session with a newline': event(session='sess\n1'),
            'session with a quote': event(session="sess'1"),
            'long run': event(run='r' * 129),
            'run with a space': event(run='run 1'),
            'timestamp not a date': event(at='yesterday at noon'),
            'timestamp too long': event(at=NOW + ' ' * 20),
            'receipt not a date': event(received='2026-13-45T99:99:99+00:00'),
            'a Julian day number': event(at='2461336.833333333333'),
            'date without a time': event(at='2026-10-23'),
        }
        for label, values in bad.items():
            with self.subTest(label), self.assertRaises(sqlite3.IntegrityError):
                self.insert(values)
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM agent_events').fetchone()[0], 0)
        for column in ('event_key', 'agent_id', 'session_ref', 'event_type', 'occurred_at', 'received_at', 'source'):
            with self.subTest(missing=column), self.assertRaises(sqlite3.IntegrityError):
                self.c.execute(f'INSERT INTO agent_events{COLUMNS} VALUES(?,?,?,?,?,?,?,?)', tuple(None if c == column else v for c, v in zip(COLUMNS[1:-1].split(','), event())))


class EventsNeverTouchTasks(Base):
    def test_a_stop_or_session_end_changes_no_task_session_or_history(self):
        v5_db(self.db)
        migrations.migrate(self.db)
        c = self.connect()
        c.execute("UPDATE agent_tasks SET status='running', status_changed='m' WHERE id=?", (LEGACY_ID,))  # reopen: an active task
        before = rows(self.db)
        for i, kind in enumerate(('Stop', 'SessionEnd')):
            c.execute(f'INSERT INTO agent_events{COLUMNS} VALUES(?,?,?,?,?,?,?,?)', event(key=f'evt-codex-00000000{i:02d}', agent='codex', kind=kind))
        self.assertEqual(rows(self.db), before, 'tasks, task sessions and history are unchanged: an event is a record, not a completion')
        self.assertEqual(c.execute('SELECT status FROM agent_tasks WHERE id=?', (LEGACY_ID,)).fetchone()[0], 'running')
        self.assertEqual(c.execute("SELECT COUNT(*) FROM agent_events e JOIN agent_task_sessions s ON s.agent_id=e.agent_id AND s.session_ref=e.session_ref").fetchone()[0], 2,
                         'events join the task session by (agent_id, session_ref)')


if __name__ == '__main__':
    unittest.main()
