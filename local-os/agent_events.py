"""Agent activity events: validation and storage for POST /api/watch/events (schema v6, agent_events).

An event is an observation of an agent's own tooling (a session started, a tool ran, a response stopped, a session
ended). It is metadata only and it never changes a tracked task: Stop ends a response, not a task. The server, not the
client, sets received_at and source.
"""
import datetime as dt
import re
import sqlite3

from agent_tasks import ApiError, has_identifier

FIELDS = ('event_key', 'agent_id', 'session_ref', 'run_ref', 'event_type', 'occurred_at')
EVENT_TYPES = ('SessionStart', 'PostToolUse', 'Stop', 'SessionEnd')
# Tool names map to the existing agents table ids. ChatGPT has no local tooling that reports events.
AGENT_NAMES = {'claude': 'claude', 'claude code': 'claude', 'codex': 'codex', 'codex cli': 'codex',
               'gemini': 'gemini', 'gemini cli': 'gemini', 'hermes': 'hermes'}
EVENT_KEY = re.compile(r'[A-Za-z0-9_-]{16,80}')
REF = re.compile(r'[A-Za-z0-9._:-]{1,128}')
SOURCE = 'hook_reported'


def _text(data, key, pattern, required=True):
    value = data.get(key, '' if not required else None)
    if not isinstance(value, str):
        raise ApiError(f'{key} must be a string')
    if not required and value == '':
        return ''
    if not pattern.fullmatch(value):
        raise ApiError(f'Invalid {key}')
    if has_identifier(value):
        raise ApiError('Remove personal identification numbers. Use [CLIENT].')
    return value


def utc(value):
    """An ISO 8601 timestamp WITH an offset, as UTC ('...+00:00'). A time without an offset is ambiguous: refused."""
    if not isinstance(value, str) or not 19 <= len(value) <= 40:
        raise ApiError('Invalid occurred_at')
    try:
        parsed = dt.datetime.fromisoformat(value[:-1] + '+00:00' if value.endswith(('Z', 'z')) else value)
    except ValueError:
        raise ApiError('Invalid occurred_at') from None
    if parsed.tzinfo is None:
        raise ApiError('occurred_at needs a UTC offset (for example +00:00 or Z)')
    return parsed.astimezone(dt.timezone.utc).isoformat()


def clean(data):
    """The canonical event, or ApiError. Unknown fields (including received_at and source) are refused."""
    unknown = sorted(set(data) - set(FIELDS))
    if unknown:
        raise ApiError('Unknown field(s): ' + ', '.join(unknown[:5]))
    agent = data.get('agent_id')
    if not isinstance(agent, str) or agent.strip().lower() not in AGENT_NAMES:
        raise ApiError('Unsupported agent_id')
    event_type = data.get('event_type')
    if event_type not in EVENT_TYPES:
        raise ApiError('Unsupported event_type')
    return {'event_key': _text(data, 'event_key', EVENT_KEY), 'agent_id': AGENT_NAMES[agent.strip().lower()],
            'session_ref': _text(data, 'session_ref', REF), 'run_ref': _text(data, 'run_ref', REF, required=False),
            'event_type': event_type, 'occurred_at': utc(data.get('occurred_at'))}


def record(c, now, data):
    """Store one event. Returns (201, ...) when new, (200, duplicate) for a retry of the same event, 409 when the
    event_key is already taken by different content. The stored event is never overwritten."""
    event = clean(data)
    c.execute('BEGIN IMMEDIATE')
    try:
        stored = c.execute('INSERT INTO agent_events(event_key,agent_id,session_ref,run_ref,event_type,occurred_at,received_at,source) VALUES(?,?,?,?,?,?,?,?)',
                           (*(event[k] for k in FIELDS), now, SOURCE)).rowcount
        if stored:
            c.execute('COMMIT')
            return 201, {'stored': True, 'duplicate': False, 'event_key': event['event_key'], 'received_at': now}
        row = c.execute(f'SELECT {",".join(FIELDS)},source FROM agent_events WHERE event_key=?', (event['event_key'],)).fetchone()
        c.execute('COMMIT')
    except sqlite3.IntegrityError as exc:
        c.execute('ROLLBACK')
        raise ApiError(f'Event refused by the database: {exc}') from None
    except BaseException:
        c.execute('ROLLBACK')
        raise
    if row and tuple(row) == (*(event[k] for k in FIELDS), SOURCE):
        return 200, {'stored': False, 'duplicate': True, 'event_key': event['event_key']}
    return 409, {'error': 'event_key already used for a different event; the original was kept', 'event_key': event['event_key']}
