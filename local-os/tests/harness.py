"""Shared test harness: an isolated Keystal OS server on a free loopback port with a fake Hermes CLI."""
import http.cookiejar
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

TESTS = Path(__file__).resolve().parent
LOCAL_OS = TESTS.parent
FAKE_HERMES = TESTS / 'fake_hermes.py'
SYNTHETIC_KANBAN = [
    {'id': 't_001', 'title': 'Synthetic: review outreach copy', 'status': 'ready', 'assignee': 'writer', 'updated_at': '2026-10-20T08:00:00Z'},
    {'id': 't_002', 'title': 'Synthetic: build intake form', 'status': 'running', 'assignee': 'coder'},
    {'id': 't_003', 'title': 'Synthetic: archived task', 'status': 'archived'},
    {'id': 't_004', 'title': 'Synthetic: waiting on input', 'status': 'blocked'},
    {'id': 't_005', 'title': 'Synthetic: unmapped status', 'status': 'mystery'},
]


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class Client:
    def __init__(self, base):
        self.base = base
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf = ''

    def request(self, path, body=None, headers=None):
        h = {'Content-Type': 'application/json', 'Origin': self.base, 'X-Keystal-CSRF': self.csrf}
        h.update(headers or {})
        req = urllib.request.Request(self.base + path, data=json.dumps(body).encode() if body is not None else None, headers=h)
        try:
            r = self.opener.open(req, timeout=45)
        except urllib.error.HTTPError as exc:
            r = exc
        raw = r.read()
        try:
            data = json.loads(raw)
        except ValueError:
            data = raw.decode()
        return r.status, data, r.headers

    def bootstrap(self):
        self.request('/')
        code, data, _ = self.request('/api/state')
        assert code == 200, code
        self.csrf = data['csrf']
        return data

    def state(self):
        return self.request('/api/state')[1]

    def post(self, path, body):
        code, data, _ = self.request(path, body)
        return code, data


class Server:
    """Context manager. `hermes=False` points the app at a path that does not exist (no Hermes installed)."""
    def __init__(self, hermes=True, extra_env=None, data=None):
        self.hermes = hermes
        self.extra_env = extra_env or {}
        self.tmp = tempfile.TemporaryDirectory(prefix='keystal-agents-test-')
        self.data = Path(data) if data else Path(self.tmp.name) / 'state'
        self.control = Path(self.tmp.name)
        self.port = free_port()
        self.base = f'http://127.0.0.1:{self.port}'
        self.process = None
        (self.control / 'kanban.json').write_text(json.dumps(SYNTHETIC_KANBAN))
        (self.control / 'mode').write_text('ok')

    @property
    def env(self):
        return {**os.environ, 'KEYSTAL_OS_DATA': str(self.data), 'KEYSTAL_OS_PORT': str(self.port),
                'KEYSTAL_OS_HERMES': str(FAKE_HERMES) if self.hermes else str(self.control / 'no-such-hermes'),
                'FAKE_HERMES_KANBAN_JSON': str(self.control / 'kanban.json'), 'FAKE_HERMES_MODE_FILE': str(self.control / 'mode'),
                'FAKE_HERMES_LOG': str(self.control / 'hermes.log'), 'FAKE_HERMES_STATE': str(self.control), **self.extra_env}

    def set_kanban_mode(self, mode):
        (self.control / 'mode').write_text(mode)

    def set_kanban_rows(self, rows):
        (self.control / 'kanban.json').write_text(json.dumps(rows))

    def hermes_calls(self):
        log = self.control / 'hermes.log'
        return [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []

    def start(self):
        self.process = subprocess.Popen([sys.executable, str(LOCAL_OS / 'server.py')], env=self.env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                urllib.request.urlopen(self.base, timeout=1).close()
                return self
            except Exception:
                time.sleep(.1)
        raise RuntimeError('Test server failed to start')

    def stop(self):
        if self.process and self.process.poll() is None:
            self.process.terminate()
            self.process.wait(timeout=10)

    def restart(self):
        self.stop()
        return self.start()

    def client(self):
        c = Client(self.base)
        c.bootstrap()
        return c

    def __enter__(self):
        return self.start()

    def __exit__(self, *exc):
        self.stop()
        self.tmp.cleanup()
