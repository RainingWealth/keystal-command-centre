"""Claude Code hook sender (hooks/claude_watch_hook.py) against a synthetic server. Nothing here touches ~/Keystal."""
import datetime as dt
import json
import os
import socket
import sqlite3
import subprocess
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'hooks'))
from harness import LOCAL_OS, Server, free_port  # noqa: E402
import claude_watch_hook  # noqa: E402

HOOK = LOCAL_OS / 'hooks' / 'claude_watch_hook.py'
SESSION = '6f1c2b7e-3a1d-4c55-9e0a-2b8f5d7c1a90'
PRIVATE = ('PRIVATE-PROMPT-TEXT', 'PRIVATE-TOOL-INPUT', 'PRIVATE-TOOL-OUTPUT', '/Users/someone/.claude/projects/x/PRIVATE-TRANSCRIPT.jsonl',
           'PRIVATE-CWD-FOLDER', 'sk-PRIVATE-SECRET-KEY', 'PRIVATE-LAST-MESSAGE')


def hook_input(name, session=SESSION):
    """The shape Claude Code sends, with private content in every field the sender must ignore."""
    base = {'session_id': session, 'transcript_path': PRIVATE[3], 'cwd': '/tmp/' + PRIVATE[4], 'hook_event_name': name, 'permission_mode': 'default'}
    extra = {'SessionStart': {'source': 'startup'},
             'PostToolUse': {'tool_name': 'Bash', 'tool_input': {'command': 'echo ' + PRIVATE[1] + ' ' + PRIVATE[5]}, 'tool_response': {'stdout': PRIVATE[2]}},
             'Stop': {'stop_hook_active': False, 'last_assistant_message': PRIVATE[6], 'prompt': PRIVATE[0]},
             'SessionEnd': {'reason': 'exit'}}.get(name, {'prompt': PRIVATE[0]})
    return {**base, **extra}


class HookCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = Server().start()
        cls.browser = cls.server.client()

    @classmethod
    def tearDownClass(cls):
        cls.server.stop()
        cls.server.tmp.cleanup()

    def run_hook(self, payload, data=None, port=None, raw=None):
        env = {**os.environ, 'KEYSTAL_OS_DATA': str(data or self.server.data), 'KEYSTAL_OS_PORT': str(port or self.server.port)}
        started = time.monotonic()
        r = subprocess.run([sys.executable, str(HOOK)], input=raw if raw is not None else json.dumps(payload).encode(), capture_output=True, env=env, timeout=20)
        return r, time.monotonic() - started

    def events(self):
        c = sqlite3.connect(self.server.data / 'workbench.sqlite3')
        try:
            return c.execute('SELECT event_key,agent_id,session_ref,run_ref,event_type,occurred_at,received_at,source FROM agent_events ORDER BY id').fetchall()
        finally:
            c.close()


class Delivers(HookCase):
    def test_all_four_hooks_are_stored_as_claude_metadata_only(self):
        before = len(self.events())
        for name in ('SessionStart', 'PostToolUse', 'Stop', 'SessionEnd'):
            r, _ = self.run_hook(hook_input(name))
            self.assertEqual((r.returncode, r.stdout, r.stderr), (0, b'', b''), 'silent, exit 0')
        rows = self.events()[before:]
        self.assertEqual([r[4] for r in rows], ['SessionStart', 'PostToolUse', 'Stop', 'SessionEnd'])
        for key, agent, session, run, _, occurred, received, source in rows:
            self.assertRegex(key, r'^cc-[0-9a-f]{32}$')
            self.assertEqual((agent, session, run, source), ('claude', SESSION, '', 'hook_reported'))
            age = (dt.datetime.fromisoformat(received) - dt.datetime.fromisoformat(occurred)).total_seconds()
            self.assertTrue(occurred.endswith('+00:00') and 0 <= age < 5, (occurred, received))
        self.assertEqual(len({r[0] for r in rows}), 4, 'every event has its own key')

    def test_no_private_content_is_sent_or_stored(self):
        for name in ('SessionStart', 'PostToolUse', 'Stop', 'SessionEnd', 'UserPromptSubmit'):
            event = claude_watch_hook.build_event(hook_input(name))
            if event:
                self.assertEqual(set(event), {'event_key', 'agent_id', 'session_ref', 'event_type', 'occurred_at'})
                self.assertFalse(any(p in json.dumps(event) for p in PRIVATE), event)
            self.run_hook(hook_input(name))
        c = sqlite3.connect(self.server.data / 'workbench.sqlite3')
        dump = '\n'.join(c.iterdump())
        c.close()
        export = json.dumps(self.browser.request('/api/export')[1])
        for p in PRIVATE + ('Bash', 'startup', 'transcript'):
            self.assertNotIn(p, dump)
            self.assertNotIn(p, export)

    def test_events_never_create_or_change_tasks(self):
        code, task, _ = self.browser.request('/api/agent-tasks', {'title': 'Synthetic hook task', 'agent_id': 'claude', 'request_key': 'h' * 20})
        self.assertEqual(code, 201, task)
        c = sqlite3.connect(self.server.data / 'workbench.sqlite3')
        c.execute("INSERT INTO agent_task_sessions(task_id,agent_id,session_ref,run_ref,note,source,created) VALUES(?,'claude',?,'','','manual','n')", (task['id'], SESSION))
        c.commit()
        tables = ('agent_tasks', 'agent_task_history', 'agent_task_evidence', 'agent_task_sessions', 'agent_task_requests')
        before = [c.execute(f'SELECT * FROM {t} ORDER BY rowid').fetchall() for t in tables]
        for name in ('SessionStart', 'PostToolUse', 'Stop', 'SessionEnd'):
            self.run_hook(hook_input(name))
        self.assertEqual([c.execute(f'SELECT * FROM {t} ORDER BY rowid').fetchall() for t in tables], before, 'Stop and SessionEnd complete nothing')
        c.close()
        detail = self.browser.request(f'/api/agent-tasks/{task["id"]}')[1]['task']
        self.assertEqual((detail['status'], detail['review_state']), ('queued', 'none'))


class Refuses(HookCase):
    def test_other_hooks_bad_sessions_and_bad_input_send_nothing(self):
        before = len(self.events())
        bad = [hook_input('UserPromptSubmit'), hook_input('PreToolUse'), hook_input('Notification'),
               hook_input('Stop', session='../../etc'), hook_input('Stop', session='has space'), hook_input('Stop', session=''),
               hook_input('Stop', session='S1234567D'), {**hook_input('Stop'), 'session_id': 5}, ['not', 'an', 'object']]
        for payload in bad:
            r, _ = self.run_hook(payload)
            self.assertEqual((r.returncode, r.stdout, r.stderr), (0, b'', b''))
        for raw in (b'', b'{not json', b'\xff\xfe'):
            r, _ = self.run_hook(None, raw=raw)
            self.assertEqual((r.returncode, r.stdout, r.stderr), (0, b'', b''))
        self.assertEqual(len(self.events()), before)

    def test_wrong_missing_or_exposed_token_sends_nothing(self):
        import shutil
        import tempfile
        before = len(self.events())
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            r, _ = self.run_hook(hook_input('Stop'), data=data)  # no token file
            self.assertEqual((r.returncode, r.stderr), (0, b''))
            (data / 'watch-token').write_text('x' * 43)
            os.chmod(data / 'watch-token', 0o600)
            r, _ = self.run_hook(hook_input('Stop'), data=data)  # wrong token: the server refuses
            self.assertEqual((r.returncode, r.stderr), (0, b''))
            shutil.copy(self.server.data / 'watch-token', data / 'watch-token')
            os.chmod(data / 'watch-token', 0o644)
            r, _ = self.run_hook(hook_input('Stop'), data=data)  # right token, but readable by others: not used
            self.assertEqual((r.returncode, r.stderr), (0, b''))
            os.chmod(data / 'watch-token', 0o600)
            os.remove(data / 'watch-token')
            os.symlink(self.server.data / 'watch-token', data / 'watch-token')
            r, _ = self.run_hook(hook_input('Stop'), data=data)  # a symlink is not followed
            self.assertEqual((r.returncode, r.stderr), (0, b''))
        self.assertEqual(len(self.events()), before)

    def test_a_stopped_or_hung_server_never_blocks(self):
        r, took = self.run_hook(hook_input('Stop'), port=free_port())  # nothing listening
        self.assertEqual((r.returncode, r.stdout, r.stderr), (0, b'', b''))
        self.assertLess(took, 3)
        with socket.socket() as hung:  # accepts the connection but never answers
            hung.bind(('127.0.0.1', 0))
            hung.listen(5)
            r, took = self.run_hook(hook_input('Stop'), port=hung.getsockname()[1])
        self.assertEqual((r.returncode, r.stdout, r.stderr), (0, b'', b''))
        self.assertLess(took, 4, 'the 1-second network timeout bounds the wait')

    def test_proxy_settings_never_see_the_token(self):
        with socket.socket() as proxy:
            proxy.bind(('127.0.0.1', 0))
            proxy.listen(5)
            proxy.settimeout(0.2)
            env_proxy = f'http://127.0.0.1:{proxy.getsockname()[1]}'
            env = {**os.environ, 'KEYSTAL_OS_DATA': str(self.server.data), 'KEYSTAL_OS_PORT': str(self.server.port),
                   'HTTP_PROXY': env_proxy, 'http_proxy': env_proxy, 'ALL_PROXY': env_proxy, 'NO_PROXY': ''}
            before = len(self.events())
            subprocess.run([sys.executable, str(HOOK)], input=json.dumps(hook_input('Stop')).encode(), env=env, timeout=20)
            with self.assertRaises(socket.timeout):
                proxy.accept()
        self.assertEqual(len(self.events()), before + 1, 'delivered directly to the loopback server')


class ExampleConfig(unittest.TestCase):
    def test_example_settings_register_the_four_hooks_async(self):
        config = json.loads((LOCAL_OS / 'hooks' / 'claude-settings.example.json').read_text())
        self.assertEqual(set(config['hooks']), {'SessionStart', 'PostToolUse', 'Stop', 'SessionEnd'})
        for groups in config['hooks'].values():
            for hook in (h for g in groups for h in g['hooks']):
                self.assertEqual((hook['type'], hook['async']), ('command', True))
                self.assertIn('claude_watch_hook.py', hook['command'])
                self.assertNotRegex(hook['command'], r'(?i)token|bearer|authorization')


if __name__ == '__main__':
    unittest.main()
