"""Deterministic regressions for review findings 2, 3, 6, 8, 9 and 10.

Every database, HTTP server and Hermes response in these tests is synthetic.
"""
import ast
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness import Client, LOCAL_OS, Server


class ServerReview(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='keystal-server-review-')
        self.addCleanup(self.tmp.cleanup)
        self.data = Path(self.tmp.name)
        sys.path.insert(0, str(LOCAL_OS))
        self.addCleanup(sys.path.remove, str(LOCAL_OS))
        spec = importlib.util.spec_from_file_location('review_server', LOCAL_OS / 'server.py')
        self.server = importlib.util.module_from_spec(spec)
        with mock.patch.dict(os.environ, {'KEYSTAL_OS_DATA': str(self.data), 'KEYSTAL_OS_HERMES': str(self.data / 'missing-hermes'), 'KEYSTAL_OS_DOCROOT': str(self.data)}):
            spec.loader.exec_module(self.server)
        self.server.init()

    def seed_run(self, status='running', error=None):
        s = self.server
        with s.connect() as c:
            c.execute('INSERT INTO threads VALUES(?,?,?,?)', ('thread', 'Synthetic', None, s.now()))
            c.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)', ('run', 'thread', status, s.now(), None, error, uuid.uuid4().hex, 'synthetic'))

    def test_finding_2_disconnected_202_does_not_release_the_turns_lock(self):
        s = self.server
        handler = object.__new__(s.Handler)
        handler.send = mock.Mock(side_effect=BrokenPipeError('synthetic disconnect'))
        with mock.patch.object(s.threading, 'Thread') as worker:
            with self.assertRaises(BrokenPipeError):
                handler.post('/api/chat', {'prompt': 'Synthetic prompt', 'request_key': uuid.uuid4().hex})
            worker.return_value.start.assert_called_once()
        self.addCleanup(lambda: s.BUSY.release() if s.BUSY.locked() else None)
        self.assertTrue(s.BUSY.locked(), 'only the started turn thread may release BUSY')
        state = s.getstate()
        self.assertEqual(state['runs'][0]['status'], 'running')
        handler.send = lambda code, payload: (code, payload)
        self.assertEqual(handler.post('/api/chat', {'prompt': 'Second prompt', 'request_key': uuid.uuid4().hex})[0], 409)

    def test_finding_2_thread_start_failure_releases_busy(self):
        s = self.server
        handler = object.__new__(s.Handler)
        with mock.patch.object(s.threading, 'Thread') as worker:
            worker.return_value.start.side_effect = RuntimeError('synthetic start failure')
            with self.assertRaisesRegex(RuntimeError, 'start failure'):
                handler.post('/api/chat', {'prompt': 'Synthetic prompt', 'request_key': uuid.uuid4().hex})
        self.assertFalse(s.BUSY.locked())

    def test_finding_3_late_success_does_not_overwrite_interrupted_run(self):
        s = self.server
        self.seed_run('interrupted', 'Synthetic interruption')
        result = subprocess.CompletedProcess([], 0, json.dumps({'type': 'result', 'text': 'Synthetic answer', 'session_id': 'session'}), '')
        s.BUSY.acquire()
        with mock.patch.object(s, 'HERMES', '/synthetic/hermes'), mock.patch.object(s.subprocess, 'run', return_value=result):
            s.run_hermes('run', 'thread', 'Synthetic prompt', None)
        with s.connect() as c:
            self.assertEqual(tuple(c.execute('SELECT status,error FROM runs').fetchone()), ('interrupted', 'Synthetic interruption'))
            self.assertEqual(c.execute('SELECT COUNT(*) FROM messages').fetchone()[0], 0)
            self.assertEqual(c.execute('SELECT COUNT(*) FROM events').fetchone()[0], 0)

    def test_finding_3_late_failure_does_not_overwrite_completed_run(self):
        s = self.server
        self.seed_run('completed')
        s.fail('run', 'Synthetic late failure')
        with s.connect() as c:
            self.assertEqual(tuple(c.execute('SELECT status,error FROM runs').fetchone()), ('completed', None))
            self.assertEqual(c.execute('SELECT COUNT(*) FROM events').fetchone()[0], 0)
            self.assertEqual(c.execute('SELECT COUNT(*) FROM meta').fetchone()[0], 0)

    def test_finding_3_success_clears_any_prior_error(self):
        s = self.server
        self.seed_run(error='Synthetic old error')
        result = subprocess.CompletedProcess([], 0, json.dumps({'type': 'result', 'text': 'Synthetic answer'}), '')
        s.BUSY.acquire()
        with mock.patch.object(s, 'HERMES', '/synthetic/hermes'), mock.patch.object(s.subprocess, 'run', return_value=result):
            s.run_hermes('run', 'thread', 'Synthetic prompt', None)
        with s.connect() as c:
            row = c.execute('SELECT status,error FROM runs').fetchone()
            self.assertEqual(row['status'], 'completed')
            self.assertFalse(row['error'])

    def test_finding_8_state_counts_and_list_use_one_read_snapshot(self):
        s = self.server
        with s.connect() as c:
            c.execute('PRAGMA journal_mode=WAL')
        original = s.agent_tasks.overview

        def concurrent_create(c, runtime, kanban):
            counts = original(c, runtime, kanban)
            with s.connect() as writer:
                s.agent_tasks.create_task(writer, s.now(), {'title': 'Concurrent synthetic task', 'agent_id': 'claude'})
            return counts

        with mock.patch.object(s.agent_tasks, 'overview', side_effect=concurrent_create):
            state = s.getstate()
        self.assertEqual(sum(state['agents']['totals'].values()), len(state['agent_tasks']))
        with s.connect() as c:
            self.assertEqual(c.execute('SELECT COUNT(*) FROM agent_tasks').fetchone()[0], 1)

    def test_finding_8_export_reads_share_the_state_snapshot(self):
        s = self.server
        with s.connect() as c:
            c.execute('PRAGMA journal_mode=WAL')
        original = s.agent_tasks.overview

        def concurrent_create(c, runtime, kanban):
            counts = original(c, runtime, kanban)
            with s.connect() as writer:
                s.agent_tasks.create_task(writer, s.now(), {'title': 'Concurrent export task', 'agent_id': 'claude'})
            return counts

        handler = object.__new__(s.Handler)
        handler.path = '/api/export'
        handler.validhost = lambda: True
        handler.authorised = lambda: True
        handler.send = lambda code, payload: (code, payload)
        with mock.patch.object(s.agent_tasks, 'overview', side_effect=concurrent_create):
            code, exported = handler.get()
        self.assertEqual(code, 200)
        self.assertEqual(len(exported['agent_tasks']), len([e for e in exported['events'] if e['kind'] == 'agent']))
        self.assertEqual(len(exported['agent_tasks']), 0, 'the export must reflect the snapshot before the concurrent creation')

    def test_finding_8_sweep_is_committed_before_read_transaction(self):
        s = self.server
        self.seed_run()
        original = s.agent_tasks.kanban_view

        def inspect_read(c, stamp):
            self.assertTrue(c.in_transaction, 'snapshot SELECTs need an explicit read transaction')
            with s.connect() as observer:
                self.assertEqual(observer.execute('SELECT status FROM runs').fetchone()[0], 'interrupted', 'sweep must be committed before snapshot reads')
            return original(c, stamp)

        with mock.patch.object(s.agent_tasks, 'kanban_view', side_effect=inspect_read):
            s.getstate()

    def test_finding_9_sweep_does_not_log_when_completion_wins(self):
        s = self.server
        self.seed_run()
        with s.connect() as c:
            lock = mock.Mock()

            def completed_before_acquire(blocking=False):
                c.execute("UPDATE runs SET status='completed' WHERE id='run'")
                return True

            lock.acquire.side_effect = completed_before_acquire
            with mock.patch.object(s, 'BUSY', lock):
                s.sweep_orphan_runs(c, s.now())
            self.assertEqual(c.execute('SELECT COUNT(*) FROM events').fetchone()[0], 0)

    def test_finding_10_verify_accepts_board_activity_without_tracked_tasks(self):
        s = self.server
        with s.connect() as c:
            result = s.agent_tasks.parse_kanban([{'id': 'synthetic', 'title': 'Synthetic board card', 'status': 'running'}])
            s.agent_tasks.store_kanban(c, s.now(), result, None, 'local', False)
        # Exercise the actual acceptance assertion without invoking real Hermes or a model.
        tree = ast.parse((LOCAL_OS / 'verify.py').read_text())
        check = next(n for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == 'check' and n.args and isinstance(n.args[0], ast.Constant) and n.args[0].value == 'No agent activity is invented on a fresh workspace')
        state = s.getstate()
        # Keep the real response shape; startup may already have observed board cards.
        self.assertEqual(state['agents']['agents'][0]['counts']['running'], 1)
        condition = ast.Expression(check.args[1])
        self.assertTrue(eval(compile(condition, str(LOCAL_OS / 'verify.py'), 'eval'), {'state': state}))
        state['agent_tasks'] = [{'id': 'unexpected'}]
        self.assertFalse(eval(compile(condition, str(LOCAL_OS / 'verify.py'), 'eval'), {'state': state}))


class ServerProcessReview(unittest.TestCase):
    def test_finding_3_held_data_lock_refuses_before_database_open(self):
        candidate = Server(hermes=False)
        self.addCleanup(candidate.tmp.cleanup)
        candidate.data.mkdir()
        lock_path = candidate.data / 'keystal-server.lock'
        with lock_path.open('w') as held:
            fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
            try:
                code, error = candidate.run_to_exit(timeout=2)
            except subprocess.TimeoutExpired:
                self.fail('a server started despite the held data-folder lock')
            self.assertEqual(code, 2)
            self.assertIn(f'Another Keystal OS server is already using {candidate.data}. Nothing was changed.', error)
            self.assertFalse((candidate.data / 'workbench.sqlite3').exists())
            self.assertFalse(candidate.hermes_calls())

    def test_finding_3_occupied_port_refuses_before_database_open(self):
        candidate = Server(hermes=False)
        self.addCleanup(candidate.tmp.cleanup)
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', candidate.port))
            listener.listen()
            code, error = candidate.run_to_exit()
        self.assertFalse((candidate.data / 'workbench.sqlite3').exists(), error)
        self.assertEqual(code, 2)
        self.assertFalse(candidate.hermes_calls())

    def test_finding_3_live_server_holds_private_lock_until_exit(self):
        with Server(hermes=False) as running:
            running.client()
            path = running.data / 'keystal-server.lock'
            self.assertTrue(path.exists())
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with path.open() as probe:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
                running.stop()
                fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def test_finding_6_two_ports_keep_independent_cookies_in_one_browser_jar(self):
        with Server(hermes=False) as first, Server(hermes=False) as second:
            client = Client(first.base)
            client.bootstrap()
            client.base = second.base
            client.bootstrap()
            client.base = first.base
            self.assertEqual(client.request('/api/state')[0], 200)
            self.assertEqual({c.name for c in client.jar}, {f'keystal_local_{first.port}', f'keystal_local_{second.port}'})


if __name__ == '__main__':
    unittest.main()
