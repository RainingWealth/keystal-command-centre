#!/usr/bin/env python3
"""Claude Code hook sender for the Keystal OS watcher. Python standard library only.

Claude Code runs this as an async command hook and passes the hook JSON on stdin. Only three facts leave it:
the event name, the session id, and the time this hook ran (hook payloads carry no timestamp). Prompts, transcripts,
transcript paths, tool names, inputs and results are read from stdin only to be discarded, never sent or stored.

It posts to the local Keystal server (POST /api/watch/events, loopback only, no proxy) with the bearer token from
<data folder>/watch-token, waits at most 1 second per network step, and ALWAYS exits 0 silently: a stopped server,
a missing token or a refused event must never interrupt Claude Code. An event is an observation, never a task
update: Stop ends a response, not a task.

Settings: KEYSTAL_OS_DATA (default ~/Keystal/outputs/keystal-os/local-state) and KEYSTAL_OS_PORT (default 8766),
the same variables the server reads.
"""
import datetime as dt
import http.client
import json
import os
import re
import stat
import sys
import uuid
from pathlib import Path

EVENTS = ('SessionStart', 'PostToolUse', 'Stop', 'SessionEnd')
SESSION = re.compile(r'[A-Za-z0-9._:-]{1,128}')
TIMEOUT = 1.0


def build_event(hook_input):
    """The whole outgoing payload, or None. Only the event name and session id are taken from Claude Code's input."""
    if not isinstance(hook_input, dict):
        return None
    name, session = hook_input.get('hook_event_name'), hook_input.get('session_id')
    if name not in EVENTS or not isinstance(session, str) or not SESSION.fullmatch(session):
        return None
    return {'event_key': 'cc-' + uuid.uuid4().hex, 'agent_id': 'claude', 'session_ref': session, 'event_type': name,
            'occurred_at': dt.datetime.now(dt.timezone.utc).isoformat()}


def read_token(data):
    """The token, only from a regular file owned by this user that nobody else can read; otherwise None."""
    try:
        fd = os.open(data / 'watch-token', os.O_RDONLY | os.O_NOFOLLOW)
    except OSError:
        return None
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            return None
        token = os.read(fd, 256).decode('ascii', 'ignore').strip()
        return token if len(token) >= 32 else None
    finally:
        os.close(fd)


def send(event, token, port):
    # http.client, not urllib: environment proxy settings must never see the token or the event.
    conn = http.client.HTTPConnection('127.0.0.1', port, timeout=TIMEOUT)
    try:
        conn.request('POST', '/api/watch/events', body=json.dumps(event),
                     headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
        return conn.getresponse().status
    finally:
        conn.close()


def main():
    try:
        hook_input = json.loads(sys.stdin.buffer.read() or b'null')
        event = build_event(hook_input)
        del hook_input  # nothing else from Claude Code is kept
        if event is None:
            return
        data = Path(os.environ.get('KEYSTAL_OS_DATA') or Path.home() / 'Keystal/outputs/keystal-os/local-state')
        token = read_token(data)
        if token:
            send(event, token, int(os.environ.get('KEYSTAL_OS_PORT', '8766')))
    except BaseException:  # noqa: BLE001 - by design: never disturb Claude Code
        pass


if __name__ == '__main__':
    main()
    sys.exit(0)
