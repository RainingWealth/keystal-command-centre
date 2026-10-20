#!/usr/bin/env python3
"""Test double for the Hermes CLI. Test-only: the app uses it only when KEYSTAL_OS_HERMES points here.

`kanban list --json` behaviour is chosen with FAKE_HERMES_KANBAN (ok | missing | error | garbage | binary | hang),
or at run time by the contents of the file named in FAKE_HERMES_MODE_FILE, and FAKE_HERMES_KANBAN_JSON
(path to the JSON to print). Every invocation is appended to FAKE_HERMES_LOG when set. `chat` replays just enough of the one-shot
stream-json protocol for the existing chat plumbing to be exercised; it is not a model.
"""
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
import uuid

args = sys.argv[1:]
if os.environ.get('FAKE_HERMES_LOG'):
    with open(os.environ['FAKE_HERMES_LOG'], 'a') as log:
        log.write(json.dumps(args) + '\n')
if args[:1] == ['kanban']:
    mode_file = os.environ.get('FAKE_HERMES_MODE_FILE')
    mode = Path(mode_file).read_text().strip() if mode_file and Path(mode_file).exists() else os.environ.get('FAKE_HERMES_KANBAN', 'ok')
    if mode == 'missing':
        sys.stderr.write("hermes: error: argument command: invalid choice: 'kanban' (choose from 'chat', 'skills')\n")
        sys.exit(2)
    if mode == 'error':
        sys.stderr.write('sqlite3.OperationalError: database is locked (/Users/someone/.hermes/kanban.db)\n')
        sys.exit(1)
    if mode == 'binary':
        sys.stdout.buffer.write(b'\xff\xfe\x00 not utf-8')
        sys.exit(0)
    if mode == 'garbage':
        print('this is not json')
        sys.exit(0)
    if mode == 'hang':
        time.sleep(120)
    if 'list' in args and '--json' in args:
        path = os.environ.get('FAKE_HERMES_KANBAN_JSON')
        print(Path(path).read_text() if path else '[]')
        sys.exit(0)
    sys.exit(2)

if args[:1] == ['chat']:
    store = Path(os.environ.get('FAKE_HERMES_STATE', tempfile.gettempdir())) / 'fake-hermes-sessions.json'
    sessions = json.loads(store.read_text()) if store.exists() else {}
    prompt = sys.stdin.read().split('User request follows:', 1)[-1]
    sid = args[args.index('--resume') + 1] if '--resume' in args else uuid.uuid4().hex
    memory = sessions.setdefault(sid, {})
    teach = re.search(r'marker (\S+?)\. Reply exactly: (.+?)\. Do not', prompt)
    if teach:
        memory['marker'] = teach.group(1)
        text = teach.group(2)
    elif 'What harmless marker' in prompt:
        text = memory.get('marker', 'unknown')
    else:
        text = 'Stub reply.'
    store.write_text(json.dumps(sessions))
    print(json.dumps({'type': 'result', 'text': text, 'session_id': sid, 'exit_code': 0}))
    sys.exit(0)

sys.exit(2)
