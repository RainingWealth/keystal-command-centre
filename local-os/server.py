#!/usr/bin/env python3
"""Keystal OS: loopback-only, single-user workbench. Not a public deployment."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
import traceback
import uuid
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

import agent_tasks
import migrations
from agent_tasks import ApiError

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('KEYSTAL_OS_DATA', str(Path.home() / 'Keystal/outputs/keystal-os/local-state')))
DATA.mkdir(parents=True, exist_ok=True, mode=0o700)
os.chmod(DATA, 0o700)
DB = DATA / 'workbench.sqlite3'
PORT = int(os.environ.get('KEYSTAL_OS_PORT', '8766'))
TOKEN = secrets.token_urlsafe(32)
CSRF = secrets.token_urlsafe(32)
HERMES = shutil.which(os.environ.get('KEYSTAL_OS_HERMES', 'hermes'))
KANBAN_BOARD = os.environ.get('KEYSTAL_OS_KANBAN_BOARD', '').strip()
HERMES_INSTANCE = os.environ.get('KEYSTAL_OS_HERMES_INSTANCE', 'local').strip()
PREVIEW_LABEL = os.environ.get('KEYSTAL_OS_PREVIEW_LABEL', '').strip()[:80]
BUSY = threading.Lock()
KANBAN_BUSY = threading.Lock()
DOCROOT = Path.home() / 'Keystal/outputs/keystal-os'
DOCS = {
    'manual': ('Operating manual', 'Keystal OS.md', 'Command, routing and decision rights'),
    'tools': ('Tool register', 'Keystal OS - Tool Register.md', 'Which system owns what'),
    'decisions': ('Decision register', 'Keystal OS - Decision Register.md', 'Unresolved decisions, kept visible'),
    'setup': ('Everywhere setup guide', 'Keystal Everywhere - Consolidated Setup Guide.md', 'The path from local to always-on'),
    'handoff': ('Agent handoff', 'Keystal Everywhere - Agent Handoff.md', 'Context for the next operator'),
}
PREAMBLE = '''You are Keystal, Rayvern's executive AI; Raios is your internal work OS.
This is the Keystal OS LOCAL WORKBENCH, not an already-deployed cloud system.
Be direct, warm, concise. Use headings and actionable next steps. Work across independent
AI services, loans, mortgages and other ventures; do not default to insurance.
This bridge is drafting and public-web research only. No terminal, file-writing, CRM,
calendar or messaging tools are granted. Never claim to save/send/book/update any external
record. The web app itself stores this conversation separately. Local captures are draft
staging, NOT ClickUp tasks. Obsidian/Dropbox is knowledge; ClickUp is task authority;
Airtable is CRM. Do not invent pipeline figures, tasks, deadlines, connectivity or facts.
Never send or solicit private client identifiers, health or financial details. Use [CLIENT].
Do not search public web for private client information. Ask for sanitised context instead.
For missing present-day evidence, use available public research tools or label unchecked.
If asked to execute external or local-system changes, explain that this bridge is draft-only
and direct Ray to the main Hermes chat for approval-based execution.
No hosting has been selected. This local app works only while its Mac/server is running.
User request follows:\n'''

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def connect():
    c = sqlite3.connect(DB, timeout=15)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA foreign_keys=ON')
    return c

def refuse(message):
    print(message, file=sys.stderr)
    sys.exit(2)

def startup_checks():
    """Fail at startup, never silently fall back: a wrong board or profile would be displayed as the selected one."""
    if KANBAN_BOARD and not agent_tasks.BOARD.fullmatch(KANBAN_BOARD):
        refuse(f'KEYSTAL_OS_KANBAN_BOARD={KANBAN_BOARD[:80]!r} is not a valid Hermes board name (lowercase letters, digits, hyphen and underscore; 1-64 characters, starting with a letter or digit). Refusing to start rather than read a different board.')
    if not agent_tasks.ID_PART.fullmatch(HERMES_INSTANCE):
        refuse(f'KEYSTAL_OS_HERMES_INSTANCE={HERMES_INSTANCE[:80]!r} is not a valid instance/profile label.')

def init(migrate_ok=False):
    """Open the database. A database that already holds data is only migrated on an explicit --migrate."""
    state = migrations.plan(DB)
    if state.get('newer_than_code'):
        refuse(f"{DB} is schema v{state['current']}, newer than this Keystal OS (v{state['latest']}). Refusing to open it.")
    if state['conflicts']:
        names = ', '.join(sorted({c['name'] for c in state['conflicts']}))
        refuse(f'{DB} has tables that conflict with this version ({names}), probably from another implementation. Nothing was changed. Run: python3 local-os/tools/db_tool.py inspect --db "{DB}"')
    if state['pending'] and state['has_data'] and not migrate_ok:
        refuse(f"{DB} is at schema v{state['current']} and this version needs v{state['latest']}. Nothing was changed.\n"
               f'1) python3 local-os/tools/db_tool.py backup --db "{DB}"\n2) python3 local-os/tools/db_tool.py migrate-check --db "{DB}"\n3) start with: python3 local-os/server.py --migrate')
    migrations.migrate(DB)
    with connect() as c:
        c.execute("UPDATE runs SET status='interrupted',error='Local server restarted; request was not retried automatically.',ended=? WHERE status='running'", (now(),))
    os.chmod(DB, 0o600)

def event(c, kind, label):
    c.execute('INSERT INTO events(kind,label,created) VALUES(?,?,?)', (kind, label, now()))

def meta(c, key, value):
    c.execute('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)', (key, json.dumps(value)))

def getstate():
    with connect() as c:
        stamp = now()
        agent_tasks.sweep_stale(c, stamp)
        runtime = {'mode': 'local', 'bridge_available': bool(HERMES), 'busy': BUSY.locked(), 'hosted': False, 'chat_scope': 'Drafting + public web research', 'preview_label': PREVIEW_LABEL}
        kanban = agent_tasks.kanban_view(c, stamp)
        return {
            'csrf': CSRF,
            'captures': [dict(r) for r in c.execute('SELECT * FROM captures ORDER BY pinned DESC,created DESC')],
            'threads': [dict(r) for r in c.execute('SELECT id,title,created FROM threads ORDER BY created DESC')],
            'messages': [dict(r) for r in c.execute('SELECT * FROM messages ORDER BY created,rowid')],
            'runs': [dict(r) for r in c.execute('SELECT id,thread_id,status,created,ended,error FROM runs ORDER BY created DESC LIMIT 30')],
            'events': [dict(r) for r in c.execute('SELECT * FROM events ORDER BY id DESC LIMIT 80')],
            'checks': {r['key']: json.loads(r['value']) for r in c.execute('SELECT * FROM meta')},
            'runtime': runtime,
            'agents': agent_tasks.overview(c, runtime, kanban),
            'agent_tasks': agent_tasks.list_tasks(c),
            'projects': agent_tasks.list_projects(c),
            'kanban': kanban,
            'documents': [{'id': k, 'title': v[0], 'description': v[2], 'available': (DOCROOT / v[1]).is_file(), 'source': 'Local saved document'} for k, v in DOCS.items()],
            'server_time': now(),
        }

class BadRequest(ApiError):
    pass

def refresh_kanban(manual=False):
    """Read-only refresh of the Hermes Kanban snapshot. Returns the stored read bookkeeping, or None if a read is already running.
    The configured board is used exactly as named; it is never replaced by a default."""
    if not KANBAN_BUSY.acquire(blocking=False):
        return None
    try:
        board = KANBAN_BOARD or None
        result = agent_tasks.fetch_kanban(HERMES, board)
        with connect() as c:
            return agent_tasks.store_kanban(c, now(), result, board, HERMES_INSTANCE, manual)
    except Exception:
        traceback.print_exc()
        return None
    finally:
        KANBAN_BUSY.release()

def kanban_loop(seconds):
    while True:
        refresh_kanban()
        time.sleep(seconds)

def text(data, key, maximum, default=None):
    value = data.get(key, default)
    if not isinstance(value, str) or len(value.strip()) > maximum:
        raise BadRequest('Invalid ' + key)
    return value.strip()

def run_hermes(run_id, thread_id, prompt, session_id):
    try:
        if not HERMES:
            raise RuntimeError('Hermes CLI unavailable. Open the main Hermes app to configure it.')
        args = [HERMES, 'chat', '--oneshot', '-Q', '--format', 'stream-json', '--toolsets', 'web', '--max-turns', '6', '--in', str(ROOT)]
        if session_id:
            args += ['--resume', session_id]
        args += ['--query-file', '-']
        # No shell, no browser-supplied paths, no credentials in arguments.
        result = subprocess.run(args, input=PREAMBLE + prompt, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=ROOT, timeout=180)
        final = None
        for line in result.stdout.splitlines():
            try:
                item = json.loads(line)
            except (ValueError, TypeError):
                continue
            if isinstance(item, dict) and item.get('type') == 'result':
                final = item
        if result.returncode or not final or final.get('exit_code') or not str(final.get('text', '')).strip():
            # Raw provider stderr may contain account/config details; never ship it to the browser.
            raise RuntimeError('Hermes did not complete this turn. Check provider access in the main Hermes app; no success was recorded.')
        answer = str(final['text'])
        with connect() as c:
            c.execute('INSERT INTO messages VALUES(?,?,?,?,?)', (uuid.uuid4().hex, thread_id, 'assistant', answer, now()))
            c.execute('UPDATE threads SET session_id=? WHERE id=?', (final.get('session_id') or session_id, thread_id))
            c.execute("UPDATE runs SET status='completed',ended=? WHERE id=?", (now(), run_id))
            meta(c, 'chat', {'status': 'verified', 'checked_at': now(), 'detail': 'A real Hermes turn completed. Drafting / public-web research only.'})
            event(c, 'chat', 'Keystal returned a verified response')
    except subprocess.TimeoutExpired:
        fail(run_id, 'Turn timed out after 180 seconds. The CLI client was stopped; underlying gateway work may still finish. Check Hermes before retrying.')
    except Exception as exc:
        fail(run_id, str(exc) if isinstance(exc, RuntimeError) else 'Local bridge failed. Check the server; request was not automatically repeated.')
    finally:
        BUSY.release()

def fail(run_id, error):
    with connect() as c:
        c.execute("UPDATE runs SET status='failed',ended=?,error=? WHERE id=?", (now(), error, run_id))
        meta(c, 'chat', {'status': 'failed', 'checked_at': now(), 'detail': error})
        event(c, 'error', 'Keystal turn failed — no completed result claimed')

class Handler(BaseHTTPRequestHandler):
    server_version = 'KeystalLocal/1.0'
    def log_message(self, format, *args):
        return
    def validhost(self):
        return self.headers.get('Host') in (f'127.0.0.1:{PORT}', f'localhost:{PORT}')
    def authorised(self):
        try:
            cookie = SimpleCookie(self.headers.get('Cookie', ''))
            return secrets.compare_digest(cookie['keystal_local'].value, TOKEN)
        except (KeyError, ValueError):
            return False
    def send(self, code, data, content_type='application/json; charset=utf-8', bootstrap=False):
        body = json.dumps(data, ensure_ascii=False).encode() if content_type.startswith('application/json') else (data.encode() if isinstance(data, str) else data)
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
        if bootstrap:
            self.send_header('Set-Cookie', f'keystal_local={TOKEN}; HttpOnly; SameSite=Strict; Path=/')
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        if not self.validhost():
            return self.send(403, {'error': 'Invalid host'})
        path = urlsplit(self.path).path
        if path == '/':
            return self.send(200, (ROOT / 'index.html').read_bytes(), 'text/html; charset=utf-8', True)
        if path in ('/styles.css', '/app.js', '/icon.svg'):
            kind = {'/styles.css': 'text/css', '/app.js': 'application/javascript', '/icon.svg': 'image/svg+xml'}[path]
            return self.send(200, (ROOT / path[1:]).read_bytes(), kind)
        if not self.authorised():
            return self.send(401, {'error': 'Open Keystal OS on this Mac first.'})
        if path == '/api/state':
            return self.send(200, getstate())
        if path.startswith('/api/doc/'):
            doc = DOCS.get(path.split('/')[-1])
            if not doc or not (DOCROOT / doc[1]).is_file():
                return self.send(404, {'error': 'Document unavailable'})
            return self.send(200, {'title': doc[0], 'content': (DOCROOT / doc[1]).read_text(), 'source': str(DOCROOT / doc[1]), 'scope': 'Saved document, not live source-system state'})
        if path.startswith('/api/agent-tasks/'):
            try:
                with connect() as c:
                    return self.send(200, agent_tasks.task_detail(c, path.rsplit('/', 1)[-1]))
            except ApiError as exc:
                return self.send(exc.status, {'error': str(exc)})
        if path == '/api/export':
            state = getstate()
            with connect() as c:
                agent_data = agent_tasks.export_rows(c)
            return self.send(200, {**{k: state[k] for k in ('captures', 'threads', 'messages', 'events', 'server_time')}, **agent_data})
        return self.send(404, {'error': 'Not found'})
    def do_POST(self):
        if not self.validhost() or not self.authorised():
            return self.send(403, {'error': 'Access rejected'})
        if self.headers.get('Origin') not in (f'http://127.0.0.1:{PORT}', f'http://localhost:{PORT}') or not secrets.compare_digest(self.headers.get('X-Keystal-CSRF', ''), CSRF):
            return self.send(403, {'error': 'Request origin / CSRF rejected'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.send(415, {'error': 'JSON required'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size < 2 or size > 24000:
                return self.send(413, {'error': 'Request too large or empty'})
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise BadRequest('Object required')
            return self.post(urlsplit(self.path).path, data)
        except ApiError as exc:
            return self.send(exc.status, {'error': str(exc)})
        except ValueError as exc:
            return self.send(400, {'error': str(exc)})
        except Exception:
            traceback.print_exc()
            return self.send(500, {'error': 'Local operation failed. No external update claimed.'})
    def post(self, path, data):
        if path in agent_tasks.ROUTES:
            with connect() as c:
                c.execute('BEGIN IMMEDIATE')
                code, payload = agent_tasks.ROUTES[path](c, now(), data)
            return self.send(code, payload)
        if path == '/api/kanban/refresh':
            if refresh_kanban(manual=True) is None:
                return self.send(409, {'error': 'A Kanban read is already running.'})
            with connect() as c:
                return self.send(200, agent_tasks.kanban_view(c, now()))
        if path == '/api/captures':
            title = text(data, 'title', 400)
            lane = text(data, 'lane', 30, 'Operate')
            owner = text(data, 'owner', 80, 'Ray') or 'Ray'
            due = text(data, 'due', 10, '')
            if not title or lane not in ('Sell', 'Serve', 'Operate', 'Build', 'Personal'):
                raise BadRequest('Title and valid lane required')
            if due:
                dt.date.fromisoformat(due)
            rid = uuid.uuid4().hex
            with connect() as c:
                c.execute('INSERT INTO captures VALUES(?,?,?,?,?,?,?,?)', (rid, title, lane, owner, due, 'inbox', 0, now()))
                event(c, 'capture', 'Capture saved locally — not sent to ClickUp')
            return self.send(201, {'id': rid, 'scope': 'local-draft'})
        if path == '/api/captures/update':
            rid = text(data, 'id', 64)
            action = text(data, 'action', 20)
            with connect() as c:
                row = c.execute('SELECT * FROM captures WHERE id=?', (rid,)).fetchone()
                if not row:
                    return self.send(404, {'error': 'Capture not found'})
                if action == 'pin':
                    c.execute('UPDATE captures SET pinned=0')
                    c.execute("UPDATE captures SET pinned=1,status='inbox' WHERE id=?", (rid,))
                elif action in ('archive', 'restore'):
                    c.execute('UPDATE captures SET status=?,pinned=0 WHERE id=?', ('archived' if action == 'archive' else 'inbox', rid))
                else:
                    raise BadRequest('Invalid action')
                event(c, 'capture', {'pin': 'Primary move selected locally', 'archive': 'Local capture archived', 'restore': 'Local capture restored'}[action])
            return self.send(200, {'ok': True})
        if path == '/api/chat':
            prompt = text(data, 'prompt', 6000)
            tid = text(data, 'thread_id', 64, '')
            key = text(data, 'request_key', 80)
            if not prompt or not re.fullmatch(r'[A-Za-z0-9_-]{16,80}', key):
                raise BadRequest('Prompt and unique request key required')
            if re.search(r'\b[STFGM]\d{7}[A-Z]\b', prompt, re.I):
                raise BadRequest('Remove personal identification numbers. Use [CLIENT].')
            digest = hashlib.sha256((tid + '\0' + prompt).encode()).hexdigest()
            with connect() as c:
                old = c.execute('SELECT * FROM runs WHERE request_key=?', (key,)).fetchone()
                if old:
                    if old['payload_hash'] != digest:
                        return self.send(409, {'error': 'Request key reused with different content'})
                    return self.send(200, {'run_id': old['id'], 'thread_id': old['thread_id'], 'replayed': True})
                if tid and not c.execute('SELECT id FROM threads WHERE id=?', (tid,)).fetchone():
                    return self.send(404, {'error': 'Conversation not found'})
            if not BUSY.acquire(blocking=False):
                return self.send(409, {'error': 'Keystal is completing another turn. Wait for it to finish.'})
            try:
                with connect() as c:
                    if not tid:
                        tid = uuid.uuid4().hex
                        c.execute('INSERT INTO threads VALUES(?,?,?,?)', (tid, prompt[:70], None, now()))
                    session = c.execute('SELECT session_id FROM threads WHERE id=?', (tid,)).fetchone()[0]
                    rid = uuid.uuid4().hex
                    c.execute('INSERT INTO messages VALUES(?,?,?,?,?)', (uuid.uuid4().hex, tid, 'user', prompt, now()))
                    c.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)', (rid, tid, 'running', now(), None, None, key, digest))
                    event(c, 'chat', 'Request accepted by the local Hermes bridge')
                threading.Thread(target=run_hermes, args=(rid, tid, prompt, session), daemon=True).start()
                return self.send(202, {'run_id': rid, 'thread_id': tid})
            except Exception:
                BUSY.release()
                raise
        if path == '/api/check/dropbox':
            py = Path.home() / '.hermes/hermes-agent/venv/bin/python'
            helper = Path.home() / '.hermes/skills/rayvern-brain/scripts/rayvern_brain.py'
            try:
                r = subprocess.run([str(py), str(helper), 'read', 'START HERE.md'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=35)
                ok = r.returncode == 0 and b'Rayvern Brain' in r.stdout
            except (OSError, subprocess.TimeoutExpired):
                ok = False
            check = {'status': 'verified' if ok else 'failed', 'checked_at': now(), 'detail': 'Fresh read of vault START HERE.md succeeded. No write performed.' if ok else 'Vault read failed. Reconnect in the main Hermes app.'}
            with connect() as c:
                meta(c, 'dropbox', check)
                event(c, 'connection', 'Dropbox read check ' + ('passed' if ok else 'failed'))
            return self.send(200, check)
        return self.send(404, {'error': 'Not found'})

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Keystal OS: loopback-only, single-user workbench.')
    parser.add_argument('--migrate', action='store_true', help='apply pending database migrations to an existing database (a backup is taken first)')
    args = parser.parse_args()
    startup_checks()
    init(args.migrate)
    threading.Thread(target=kanban_loop, args=(agent_tasks.kanban_timing()[0] or 10**9,), daemon=True).start()
    server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print(f'Keystal OS local server: http://127.0.0.1:{PORT}', flush=True)
    print('Loopback only. No cloud deployment. Ctrl+C stops the server.', flush=True)
    server.serve_forever()
