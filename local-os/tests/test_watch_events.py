"""POST /api/watch/events: dedicated bearer token, strict input, append-only storage. Synthetic data only."""
import http.client
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from harness import LOCAL_OS, Server  # noqa: E402

PATH = '/api/watch/events'


def event(**over):
    base = {'event_key': 'evt-synthetic-000001', 'agent_id': 'claude', 'session_ref': 'sess-1', 'event_type': 'SessionStart',
            'occurred_at': '2026-10-23T08:00:00+00:00'}
    base.update(over)
    return {k: v for k, v in base.items() if v is not None}


class WatchCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = Server().start()
        cls.browser = cls.server.client()  # an authenticated browser session: cookie + CSRF
        cls.token = (cls.server.data / 'watch-token').read_text().strip()

    @classmethod
    def tearDownClass(cls):
        cls.server.stop()
        cls.server.tmp.cleanup()

    def post(self, body, token=True, headers=None, raw=None):
        h = {'Content-Type': 'application/json', 'Host': f'127.0.0.1:{self.server.port}'}
        if token:
            h['Authorization'] = f'Bearer {self.token if token is True else token}'
        h.update(headers or {})
        conn = http.client.HTTPConnection('127.0.0.1', self.server.port, timeout=10)
        try:
            conn.putrequest('POST', PATH, skip_host=True, skip_accept_encoding=True)
            data = raw if raw is not None else json.dumps(body).encode()
            h.setdefault('Content-Length', str(len(data)))
            for k, v in h.items():
                conn.putheader(k, v)
            conn.endheaders()
            conn.send(data)
            r = conn.getresponse()
            text = r.read().decode()
            return r.status, json.loads(text) if text.startswith('{') else text
        finally:
            conn.close()

    def db(self):
        c = sqlite3.connect(self.server.data / 'workbench.sqlite3')
        self.addCleanup(c.close)
        return c

    def stored(self, key):
        return self.db().execute('SELECT agent_id,session_ref,run_ref,event_type,occurred_at,received_at,source FROM agent_events WHERE event_key=?', (key,)).fetchall()


class Accepts(WatchCase):
    def test_all_four_event_types_are_stored_with_server_assigned_source_and_receipt(self):
        for i, kind in enumerate(('SessionStart', 'PostToolUse', 'Stop', 'SessionEnd')):
            before = time.time()
            code, body = self.post(event(event_key=f'evt-types-0000000{i}', event_type=kind, run_ref='run-1'))
            self.assertEqual((code, body['stored'], body['duplicate']), (201, True, False), body)
            row = self.stored(f'evt-types-0000000{i}')
            self.assertEqual(row[0][:5], ('claude', 'sess-1', 'run-1', kind, '2026-10-23T08:00:00+00:00'))
            self.assertEqual(row[0][6], 'hook_reported')
            received = row[0][5]
            self.assertTrue(received.endswith('+00:00') and received == body['received_at'])
            self.assertGreaterEqual(time.mktime(time.strptime(received[:19], '%Y-%m-%dT%H:%M:%S')) - time.timezone, before - 2)

    def test_tool_names_map_to_agent_ids(self):
        for i, (name, agent) in enumerate((('Claude Code', 'claude'), ('Codex CLI', 'codex'), ('Gemini CLI', 'gemini'), ('Hermes', 'hermes'), ('codex', 'codex'))):
            code, body = self.post(event(event_key=f'evt-names-0000000{i}', agent_id=name))
            self.assertEqual(code, 201, body)
            self.assertEqual(self.stored(f'evt-names-0000000{i}')[0][0], agent)

    def test_timestamps_are_normalised_to_utc(self):
        cases = {'2026-10-23T16:00:00+08:00': '2026-10-23T08:00:00+00:00', '2026-10-23T08:00:00Z': '2026-10-23T08:00:00+00:00',
                 '2026-10-23T03:30:00.250-04:30': '2026-10-23T08:00:00.250000+00:00'}
        for i, (given, expected) in enumerate(cases.items()):
            code, body = self.post(event(event_key=f'evt-utc-00000000{i}', occurred_at=given))
            self.assertEqual(code, 201, body)
            self.assertEqual(self.stored(f'evt-utc-00000000{i}')[0][4], expected)

    def test_a_retry_is_a_duplicate_and_a_different_event_under_the_same_key_is_a_conflict(self):
        first = event(event_key='evt-dup-0000000001', event_type='Stop', occurred_at='2026-10-23T08:00:00Z')
        self.assertEqual(self.post(first)[0], 201)
        original = self.stored('evt-dup-0000000001')
        retry = dict(first, occurred_at='2026-10-23T16:00:00+08:00', agent_id='Claude Code')  # same event, other spelling
        self.assertEqual(self.post(retry), (200, {'stored': False, 'duplicate': True, 'event_key': 'evt-dup-0000000001'}))
        for change in ({'event_type': 'SessionEnd'}, {'session_ref': 'sess-2'}, {'run_ref': 'run-9'}, {'agent_id': 'codex'}, {'occurred_at': '2026-10-23T08:00:01Z'}):
            with self.subTest(change=change):
                code, body = self.post(dict(first, **change))
                self.assertEqual(code, 409, body)
        self.assertEqual(self.stored('evt-dup-0000000001'), original, 'the original event is never overwritten, received_at included')
        self.assertEqual(self.db().execute("SELECT COUNT(*) FROM agent_events WHERE event_key='evt-dup-0000000001'").fetchone()[0], 1)


class Refuses(WatchCase):
    def count(self):
        return self.db().execute('SELECT COUNT(*) FROM agent_events').fetchone()[0]

    def test_missing_or_wrong_bearer_token(self):
        before = self.count()
        for token, extra in ((False, {}), ('wrong-token-' + 'x' * 32, {}), (self.token[:-1], {}), ('', {}),
                             (False, {'Authorization': f'Basic {self.token}'}), (False, {'Authorization': self.token})):
            with self.subTest(token=str(token)[:12], extra=list(extra)):
                code, body = self.post(event(event_key='evt-auth-000000001'), token=token, headers=extra)
                self.assertEqual(code, 401, body)
        self.assertEqual(self.count(), before)

    def test_the_browser_session_cookie_and_csrf_never_authenticate(self):
        cookie = '; '.join(f'{c.name}={c.value}' for c in self.browser.jar)
        self.assertIn('keystal_local_', cookie)
        code, body = self.post(event(event_key='evt-cookie-00000001'), token=False, headers={'Cookie': cookie, 'X-Keystal-CSRF': self.browser.csrf})
        self.assertEqual(code, 401, body)
        code, body, _ = self.browser.request(PATH, event(event_key='evt-cookie-00000002'))  # exactly what the page could send
        self.assertEqual(code, 403, body)
        self.assertEqual(self.stored('evt-cookie-00000001') + self.stored('evt-cookie-00000002'), [])

    def test_cross_origin_and_bad_host_are_refused_even_with_the_token(self):
        port = self.server.port
        for headers in ({'Origin': 'https://evil.example'}, {'Origin': f'http://127.0.0.1:{port}'}, {'Origin': 'null'},
                        {'Host': f'evil.example:{port}'}, {'Host': f'127.0.0.1:{port + 1}'}, {'Host': 'localhost'}):
            with self.subTest(headers=headers):
                code, body = self.post(event(event_key='evt-host-000000001'), headers=headers)
                self.assertEqual(code, 403, body)
        self.assertEqual(self.stored('evt-host-000000001'), [])

    def test_no_cors_is_offered(self):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.port, timeout=10)
        conn.request('OPTIONS', PATH, headers={'Origin': 'https://evil.example', 'Access-Control-Request-Method': 'POST'})
        r = conn.getresponse()
        r.read()
        conn.close()
        self.assertNotEqual(r.status, 200)
        self.assertIsNone(r.getheader('Access-Control-Allow-Origin'))
        code, _ = self.post(event(event_key='evt-cors-000000001'))
        self.assertEqual(code, 201)

    def test_content_type_and_size_limits(self):
        for content_type in ('text/plain', 'application/x-www-form-urlencoded', ''):
            with self.subTest(content_type=content_type):
                self.assertEqual(self.post(event(event_key='evt-ctype-00000001'), headers={'Content-Type': content_type})[0], 415)
        big = json.dumps(event(event_key='evt-big-0000000001', session_ref='s')).encode()
        big = big[:-1] + b',"pad":"' + b'x' * 4200 + b'"}'
        self.assertEqual(self.post(None, raw=big)[0], 413)
        self.assertEqual(self.post(None, raw=b'{}', headers={'Content-Length': 'abc'})[0], 413)
        self.assertEqual(self.post(None, raw=b'[]')[0], 400)
        self.assertEqual(self.post(None, raw=b'{not json')[0], 400)
        self.assertEqual(self.stored('evt-big-0000000001') + self.stored('evt-ctype-00000001'), [])

    def test_unknown_fields_server_fields_and_invalid_values(self):
        bad = {
            'unknown field': event(tool_args='rm -rf /'),
            'client sets source': event(source='observed'),
            'client sets received_at': event(received_at='2020-01-01T00:00:00+00:00'),
            'prompt smuggled': event(prompt='secret'),
            'unsupported agent': event(agent_id='chatgpt'),
            'unknown agent': event(agent_id='copilot'),
            'agent not a string': event(agent_id=5),
            'lower-case type': event(event_type='stop'),
            'unknown type': event(event_type='PreToolUse'),
            'short key': event(event_key='short'),
            'long key': event(event_key='k' * 81),
            'key with a space': event(event_key='evt synthetic 000001'),
            'missing key': event(event_key=None),
            'missing session': event(session_ref=None),
            'empty session': event(session_ref=''),
            'long session': event(session_ref='s' * 129),
            'session path': event(session_ref='../../etc/passwd'),
            'session not a string': event(session_ref=['a']),
            'long run': event(run_ref='r' * 129),
            'run with a space': event(run_ref='run 1'),
            'run null': event(run_ref=None) | {'run_ref': None},
            'no offset': event(occurred_at='2026-10-23T08:00:00'),
            'not a date': event(occurred_at='yesterday at noon!!'),
            'impossible date': event(occurred_at='2026-13-45T99:99:99+00:00'),
            'date only': event(occurred_at='2026-10-23'),
            'timestamp too long': event(occurred_at='2026-10-23T08:00:00.000000000000000+00:00'),
            'timestamp a number': event(occurred_at=1761206400),
            'identifier in session': event(session_ref='S1234567D'),
            'identifier in run': event(run_ref='run-T7654321Z'),
        }
        before = self.count()
        for label, body in bad.items():
            with self.subTest(label):
                code, reply = self.post(body)
                self.assertEqual(code, 400, reply)
        self.assertEqual(self.count(), before)


class TaskSafety(WatchCase):
    def test_events_never_create_change_or_complete_tasks(self):
        code, task, _ = self.browser.request('/api/agent-tasks', {'title': 'Synthetic watch task', 'agent_id': 'claude', 'request_key': 'k' * 20})
        self.assertEqual(code, 201, task)
        c = self.db()
        c.execute("INSERT INTO agent_task_sessions(task_id,agent_id,session_ref,run_ref,note,source,created) VALUES(?,'claude','sess-task','','','manual','n')", (task['id'],))
        c.commit()
        snapshot = lambda: [self.db().execute(f'SELECT * FROM {t} ORDER BY rowid').fetchall() for t in ('agent_tasks', 'agent_task_history', 'agent_task_evidence', 'agent_task_sessions')]
        before = snapshot()
        for i, kind in enumerate(('SessionStart', 'PostToolUse', 'Stop', 'SessionEnd')):
            self.assertEqual(self.post(event(event_key=f'evt-task-00000000{i}', session_ref='sess-task', event_type=kind))[0], 201)
        self.assertEqual(snapshot(), before, 'no task, history, evidence or session row changed or appeared')
        detail = self.browser.request(f'/api/agent-tasks/{task["id"]}')[1]
        self.assertEqual((detail['task']['status'], detail['task']['review_state']), ('queued', 'none'))


class NoSecretLeaks(unittest.TestCase):
    def test_the_token_never_appears_in_logs_responses_database_exports_or_backups(self):
        server = Server()
        log = Path(server.tmp.name) / 'server.log'
        import datetime as dt
        server.started_at = dt.datetime.now(dt.timezone.utc)
        with open(log, 'w') as out:
            server.process = subprocess.Popen([sys.executable, str(LOCAL_OS / 'server.py')], env=server.env, stdout=out, stderr=out)
            try:
                for _ in range(100):
                    try:
                        urllib.request.urlopen(server.base, timeout=1).close()
                        break
                    except Exception:
                        time.sleep(.1)
                token_file = server.data / 'watch-token'
                self.assertEqual(oct(token_file.stat().st_mode & 0o777), '0o600')
                token = token_file.read_text().strip()
                self.assertGreaterEqual(len(token), 40)
                case = WatchCase()
                case.server, case.token = server, token
                replies = [case.post(event(event_key='evt-leak-000000001'))]
                replies += [case.post(event(event_key='evt-leak-000000001', event_type='Stop'))]
                replies += [case.post(event(), token='nope'), case.post(event(), token=token + 'x'), case.post({'bad': 1})]
                browser = server.client()
                replies += [browser.request('/api/state')[1], browser.request('/api/export')[1]]
                text = json.dumps(replies)
                self.assertNotIn(token, text)
                backup_dir = Path(server.tmp.name) / 'bk'
                subprocess.run([sys.executable, str(LOCAL_OS / 'tools' / 'db_tool.py'), 'backup', '--db', str(server.data / 'workbench.sqlite3'), '--out', str(backup_dir)],
                               capture_output=True, check=True, env={**os.environ, 'KEYSTAL_OS_PORT': '1'})
                for f in backup_dir.iterdir():
                    self.assertNotIn(token.encode(), f.read_bytes())
                dump = '\n'.join(sqlite3.connect(server.data / 'workbench.sqlite3').iterdump())
                self.assertNotIn(token, dump)
            finally:
                server.process.terminate()
                server.process.wait(timeout=10)
        self.assertNotIn(token, log.read_text())
        server.tmp.cleanup()

    def test_an_existing_token_survives_restarts_and_is_kept_private(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp) / 'state'
            first = Server(data=data).start()
            token = (data / 'watch-token').read_text()
            first.stop()
            os.chmod(data / 'watch-token', 0o644)
            second = Server(data=data).start()
            self.assertEqual((data / 'watch-token').read_text(), token, 'the same token: configured tooling keeps working')
            self.assertEqual(oct((data / 'watch-token').stat().st_mode & 0o777), '0o600', 'widened permissions are narrowed again')
            second.stop()
            first.tmp.cleanup()
            second.tmp.cleanup()


if __name__ == '__main__':
    unittest.main()
