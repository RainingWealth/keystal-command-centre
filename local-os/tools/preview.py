#!/usr/bin/env python3
"""Start an ISOLATED loopback preview of Keystal OS: a throwaway data directory, a free port,
synthetic seed data, and a banner in the app saying so. Your real workbench database is never opened.

  python3 local-os/tools/preview.py [--port 8767] [--no-seed] [--hermes stub|none|real]

--hermes stub  (default) a stand-in Hermes CLI with synthetic Kanban data: SIMULATED integration
--hermes none  no Hermes at all: Hermes shows NOT FOUND, Kanban NOT CONNECTED
--hermes real  your real Hermes CLI: the preview then shows YOUR REAL board titles on 127.0.0.1

Saved OS documents come from a throwaway folder holding one synthetic document, never your real
~/Keystal documents. Prints the URL and the exact commit. Ctrl+C, SIGTERM or SIGHUP stops the server
and deletes the throwaway data.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request

LOCAL_OS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(LOCAL_OS / 'tests'))
from harness import Client, SYNTHETIC_KANBAN  # noqa: E402


def commit():
    def git(*a):
        return subprocess.run(['git', '-C', str(LOCAL_OS), *a], capture_output=True, text=True).stdout.strip()
    sha = git('rev-parse', 'HEAD') or 'unknown (not a git checkout)'
    return sha + (' (+ uncommitted changes)' if git('status', '--porcelain') else '') + f'  branch: {git("branch", "--show-current") or "-"}'


def seed(client):
    def post(path, body):
        code, data = client.post(path, body)
        assert code in (200, 201), (path, code, data)
        return data
    a = post('/api/agent-tasks', {'title': 'Synthetic: draft a discovery-call question set', 'agent_id': 'claude', 'priority': 'high', 'lane': 'Sell', 'project': 'Synthetic project'})['id']
    post('/api/agent-tasks/status', {'id': a, 'status': 'running', 'source': 'agent_reported'})
    post('/api/agent-tasks/session', {'id': a, 'session_ref': 'synthetic-session-001', 'source': 'agent_reported'})
    b = post('/api/agent-tasks', {'title': 'Synthetic: refactor intake form validation', 'agent_id': 'codex', 'lane': 'Build', 'project': 'Synthetic project'})['id']
    post('/api/agent-tasks/status', {'id': b, 'status': 'awaiting_review', 'source': 'agent_reported'})
    post('/api/agent-tasks/evidence', {'id': b, 'label': 'Synthetic draft pull request', 'url': 'https://example.com/pull/1', 'source': 'agent_reported'})
    c = post('/api/agent-tasks', {'title': 'Synthetic: summarise public pricing pages', 'agent_id': 'gemini'})['id']
    post('/api/agent-tasks/status', {'id': c, 'status': 'blocked', 'note': 'Waiting on a list of competitors'})
    post('/api/agent-tasks', {'title': 'Synthetic: unassigned idea'})


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--port', type=int, default=8767)
    parser.add_argument('--no-seed', action='store_true')
    parser.add_argument('--hermes', choices=('stub', 'none', 'real'), default='stub')
    parser.add_argument('--board', default='synthetic', help='board name to pin (default: synthetic; with --hermes real use your own or leave blank)')
    args = parser.parse_args(argv)
    scratch = Path(tempfile.mkdtemp(prefix='keystal-preview-'))
    os.chmod(scratch, 0o700)
    (scratch / 'kanban.json').write_text(json.dumps(SYNTHETIC_KANBAN))
    docs = scratch / 'documents'
    docs.mkdir()
    (docs / 'Keystal OS.md').write_text('Keystal OS\n\nSynthetic operating manual for the isolated preview. Your real documents are not shown here.\n')
    env = {**os.environ, 'KEYSTAL_OS_DATA': str(scratch / 'state'), 'KEYSTAL_OS_DOCROOT': str(docs), 'KEYSTAL_OS_PORT': str(args.port), 'KEYSTAL_OS_KANBAN_BOARD': args.board if args.hermes != 'real' or args.board != 'synthetic' else ''}
    label = 'ISOLATED PREVIEW · synthetic data'
    if args.hermes == 'stub':
        env.update(KEYSTAL_OS_HERMES=str(LOCAL_OS / 'tests' / 'fake_hermes.py'), FAKE_HERMES_KANBAN_JSON=str(scratch / 'kanban.json'), FAKE_HERMES_STATE=str(scratch))
        label += ' · STUB Hermes (simulated)'
    elif args.hermes == 'none':
        env['KEYSTAL_OS_HERMES'] = str(scratch / 'no-such-hermes')
        label += ' · no Hermes'
    else:
        label += ' · REAL Hermes CLI'
    env['KEYSTAL_OS_PREVIEW_LABEL'] = label
    process = subprocess.Popen([sys.executable, str(LOCAL_OS / 'server.py')], env=env)
    base = f'http://127.0.0.1:{args.port}'

    def stop(signum, frame):
        raise KeyboardInterrupt
    for sig in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, stop)
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(base, timeout=1).close()
                break
            except Exception:
                if process.poll() is not None:
                    return process.returncode
                time.sleep(.1)
        else:
            print('Server did not start', file=sys.stderr)
            return 1
        if not args.no_seed:
            client = Client(base)
            client.bootstrap()
            seed(client)
        print(f'\n  Keystal OS isolated preview: {base}/\n  commit: {commit()}\n  data:   {scratch / "state"} (deleted on exit; your real database is not opened)\n  documents: one synthetic document (your real ~/Keystal documents are not shown)\n  {label}\n  Loopback only: reachable from this computer only. Ctrl+C to stop.\n', flush=True)
        process.wait()
    except KeyboardInterrupt:
        pass
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=10)
        shutil.rmtree(scratch, ignore_errors=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
