"""Agents & tasks: a local tracking board for work delegated to AI agents.

Tracking only. Nothing here contacts, starts or controls an agent. Every status,
note and piece of evidence carries a provenance:
  observed        read directly by this server (Hermes CLI / Kanban, chat runs, stale sweep)
  manual          typed in by the owner in this app
  agent_reported  relayed by the owner from an agent; not verified by this OS
The browser can only ever claim `manual` or `agent_reported`; `observed` is server-only.
"""
import datetime as dt
import json
import os
import re
import subprocess
import uuid
from urllib.parse import urlsplit

STATUSES = ('queued', 'running', 'awaiting_review', 'blocked', 'failed', 'paused', 'completed', 'stale')
STATUS_LABELS = {'queued': 'Queued', 'running': 'Running', 'awaiting_review': 'Awaiting review', 'blocked': 'Blocked', 'failed': 'Failed', 'paused': 'Paused', 'completed': 'Completed', 'stale': 'Stale'}
SOURCES = ('observed', 'manual', 'agent_reported')
CLIENT_SOURCES = ('manual', 'agent_reported')
SOURCE_LABELS = {'observed': 'observed', 'manual': 'manual', 'agent_reported': 'agent-reported'}
PRIORITIES = ('low', 'normal', 'high', 'urgent')
LANES = ('Sell', 'Serve', 'Operate', 'Build', 'Personal')
SENSITIVE = re.compile(r'\b[STFGM]\d{7}[A-Z]\b', re.I)
TASK_ID = re.compile(r'[0-9a-f]{32}')
BOARD = re.compile(r'[a-z0-9][a-z0-9_-]{0,63}')
KANBAN_STATUS = {'triage': 'queued', 'todo': 'queued', 'ready': 'queued', 'running': 'running', 'blocked': 'blocked', 'review': 'awaiting_review', 'done': 'completed'}
KANBAN_LIMIT = 200


def _stale_hours():
    try:
        return max(float(os.environ.get('KEYSTAL_OS_STALE_HOURS', '24')), 0.0)
    except ValueError:
        return 24.0


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


# ---------------------------------------------------------------- validation

def field(data, key, maximum, default='', required=False):
    value = data.get(key, default)
    if value is None:
        value = ''
    if not isinstance(value, str):
        raise ApiError('Invalid ' + key)
    value = value.strip()
    if len(value) > maximum:
        raise ApiError(f'{key} is too long (max {maximum} characters)')
    if required and not value:
        raise ApiError(f'{key} is required')
    if SENSITIVE.search(value):
        raise ApiError('Remove personal identification numbers. Use [CLIENT].')
    return value


def choice(data, key, allowed, default):
    value = data.get(key, default)
    if value not in allowed:
        raise ApiError('Invalid ' + key)
    return value


def flag(value, key):
    if value in (True, 1):
        return 1
    if value in (False, 0):
        return 0
    raise ApiError('Invalid ' + key)


def due_date(value):
    if value in (None, ''):
        return ''
    if not isinstance(value, str):
        raise ApiError('Invalid due date')
    try:
        return dt.date.fromisoformat(value.strip()).isoformat()
    except ValueError:
        raise ApiError('Invalid due date')


def evidence_url(value):
    if value in (None, ''):
        return ''
    if not isinstance(value, str) or len(value.strip()) > 500:
        raise ApiError('Invalid evidence link')
    value = value.strip()
    parts = urlsplit(value)
    if parts.scheme not in ('http', 'https') or not parts.hostname or '@' in parts.netloc or re.search(r'[\s\x00-\x1f\x7f<>"\']', value):
        raise ApiError('Evidence link must be a plain http(s) URL without credentials')
    return value


def agent_ref(c, value):
    if value in (None, ''):
        return None
    if not isinstance(value, str):
        raise ApiError('Invalid agent')
    row = c.execute('SELECT id FROM agents WHERE id=?', (value,)).fetchone()
    if not row:
        raise ApiError('Unknown agent')
    return row['id']


def load_task(c, data):
    tid = field(data, 'id', 64, required=True)
    row = c.execute('SELECT * FROM agent_tasks WHERE id=?', (tid,)).fetchone() if TASK_ID.fullmatch(tid) else None
    if not row:
        raise ApiError('Task not found', 404)
    return row


def actor_for(c, task, source):
    if source == 'observed':
        return 'Keystal OS'
    if source == 'agent_reported':
        row = c.execute('SELECT name FROM agents WHERE id=?', (task['agent_id'],)).fetchone() if task['agent_id'] else None
        return row['name'] if row else 'Agent'
    return 'You'


def log(c, now, task_id, kind, source, actor, field_name='', from_value=None, to_value=None, note=''):
    c.execute('INSERT INTO agent_task_history(task_id,at,kind,field,from_value,to_value,note,source,actor) VALUES(?,?,?,?,?,?,?,?,?)',
              (task_id, now, kind, field_name, from_value, to_value, note, source, actor))


def event(c, now, label, kind='agent'):
    c.execute('INSERT INTO events(kind,label,created) VALUES(?,?,?)', (kind, label, now))


# ----------------------------------------------------------------- mutations

def create_task(c, now, data):
    title = field(data, 'title', 200, required=True)
    description = field(data, 'description', 4000)
    agent_id = agent_ref(c, data.get('agent_id'))
    priority = choice(data, 'priority', PRIORITIES, 'normal')
    lane = choice(data, 'lane', LANES, 'Operate')
    due = due_date(data.get('due'))
    requires_review = flag(data.get('requires_review', True), 'requires_review')
    tid = uuid.uuid4().hex
    c.execute('INSERT INTO agent_tasks(id,title,description,agent_id,status,status_source,review_state,requires_review,priority,lane,due,created,updated,status_changed) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
              (tid, title, description, agent_id, 'queued', 'manual', 'none', requires_review, priority, lane, due, now, now, now))
    name = c.execute('SELECT name FROM agents WHERE id=?', (agent_id,)).fetchone() if agent_id else None
    log(c, now, tid, 'created', 'manual', 'You', to_value='queued', note=f'Created and assigned to {name["name"]}' if name else 'Created, not yet assigned')
    event(c, now, f'Agent task saved locally{" for " + name["name"] if name else ""} — tracking only, no agent contacted')
    return 201, {'id': tid, 'scope': 'local-tracking'}


def update_task(c, now, data):
    task = load_task(c, data)
    changes = {}
    if 'title' in data:
        changes['title'] = field(data, 'title', 200, required=True)
    if 'description' in data:
        changes['description'] = field(data, 'description', 4000)
    if 'agent_id' in data:
        changes['agent_id'] = agent_ref(c, data['agent_id'])
    if 'priority' in data:
        changes['priority'] = choice(data, 'priority', PRIORITIES, task['priority'])
    if 'lane' in data:
        changes['lane'] = choice(data, 'lane', LANES, task['lane'])
    if 'due' in data:
        changes['due'] = due_date(data['due'])
    if 'requires_review' in data:
        changes['requires_review'] = flag(data['requires_review'], 'requires_review')
    changes = {k: v for k, v in changes.items() if task[k] != v}
    if not changes:
        return 200, {'ok': True, 'changed': []}
    if changes.get('requires_review') == 0 and task['status'] == 'awaiting_review':
        raise ApiError('Resolve the pending review before turning review off.')
    if 'agent_id' in changes and changes['agent_id'] is None and task['status'] == 'running':
        raise ApiError('A running task needs an agent. Change its status before unassigning.')
    sets = ','.join(f'{k}=?' for k in changes)
    c.execute(f'UPDATE agent_tasks SET {sets},updated=? WHERE id=?', (*changes.values(), now, task['id']))
    for key, new in changes.items():
        if key == 'agent_id':
            names = {r['id']: r['name'] for r in c.execute('SELECT id,name FROM agents')}
            log(c, now, task['id'], 'assigned', 'manual', 'You', 'agent', names.get(task['agent_id'], 'Unassigned'), names.get(new, 'Unassigned'))
        else:
            old = task[key]
            log(c, now, task['id'], 'edited', 'manual', 'You', key, str(old), str(new))
    event(c, now, 'Agent task edited locally — tracking only, no agent contacted')
    return 200, {'ok': True, 'changed': sorted(changes)}


def set_status(c, now, data):
    task = load_task(c, data)
    new = choice(data, 'status', STATUSES, None)
    source = choice(data, 'source', CLIENT_SOURCES, 'manual')
    note = field(data, 'note', 2000)
    expected = data.get('expected_status')
    if expected is not None and expected != task['status']:
        raise ApiError('This task changed since you opened it. Reload it and try again.', 409)
    old = task['status']
    if new == old:
        raise ApiError(f'Task is already {STATUS_LABELS[old].lower()}')
    if old == 'completed' and new != 'queued':
        raise ApiError('A completed task can only be reopened (queued).')
    if old == 'completed' and not note:
        raise ApiError('Say why the task is being reopened.')
    if new == 'completed' and task['requires_review']:
        raise ApiError('Completion needs review: move it to Awaiting review, attach evidence, then approve.')
    if new in ('blocked', 'failed') and not note:
        raise ApiError(f'Say why the task is {STATUS_LABELS[new].lower()}.')
    if new == 'running' and not task['agent_id']:
        raise ApiError('Assign an agent before marking a task running.')
    review = 'pending' if new == 'awaiting_review' else ('none' if task['review_state'] == 'pending' or old == 'completed' else task['review_state'])
    cur = c.execute('UPDATE agent_tasks SET status=?,status_source=?,review_state=?,updated=?,status_changed=? WHERE id=? AND status=?',
                    (new, source, review, now, now, task['id'], old))
    if cur.rowcount != 1:
        raise ApiError('This task changed since you opened it. Reload it and try again.', 409)
    log(c, now, task['id'], 'status', source, actor_for(c, task, source), 'status', old, new, note)
    event(c, now, f'Task status set to {STATUS_LABELS[new]} ({SOURCE_LABELS[source]} update) — no agent contacted')
    return 200, {'ok': True}


def add_note(c, now, data):
    task = load_task(c, data)
    source = choice(data, 'source', CLIENT_SOURCES, 'manual')
    note = field(data, 'note', 2000, required=True)
    c.execute('UPDATE agent_tasks SET updated=? WHERE id=?', (now, task['id']))
    log(c, now, task['id'], 'note', source, actor_for(c, task, source), note=note)
    event(c, now, f'Task note added ({SOURCE_LABELS[source]}) — no agent contacted')
    return 201, {'ok': True}


def add_evidence(c, now, data):
    task = load_task(c, data)
    source = choice(data, 'source', CLIENT_SOURCES, 'manual')
    label = field(data, 'label', 120, required=True)
    url = evidence_url(data.get('url'))
    note = field(data, 'note', 1000)
    c.execute('INSERT INTO agent_task_evidence(task_id,at,label,url,note,source) VALUES(?,?,?,?,?,?)', (task['id'], now, label, url, note, source))
    c.execute('UPDATE agent_tasks SET updated=? WHERE id=?', (now, task['id']))
    log(c, now, task['id'], 'evidence', source, actor_for(c, task, source), to_value=label, note=url or note)
    event(c, now, f'Output evidence recorded ({SOURCE_LABELS[source]}) — link not fetched or verified')
    return 201, {'ok': True}


def review_task(c, now, data):
    task = load_task(c, data)
    decision = choice(data, 'decision', ('approve', 'reject'), None)
    note = field(data, 'note', 2000)
    if task['status'] != 'awaiting_review':
        raise ApiError('Only a task that is awaiting review can be approved or rejected.', 409)
    if decision == 'approve':
        if not c.execute('SELECT 1 FROM agent_task_evidence WHERE task_id=? LIMIT 1', (task['id'],)).fetchone():
            raise ApiError('Attach output evidence (a link or a note) before approving.')
        new, state = 'completed', 'approved'
    else:
        if not note:
            raise ApiError('Say what needs to change when rejecting.')
        new, state = 'queued', 'rejected'
    cur = c.execute('UPDATE agent_tasks SET status=?,status_source=?,review_state=?,updated=?,status_changed=? WHERE id=? AND status=?',
                    (new, 'manual', state, now, now, task['id'], 'awaiting_review'))
    if cur.rowcount != 1:
        raise ApiError('This task changed since you opened it. Reload it and try again.', 409)
    log(c, now, task['id'], 'review', 'manual', 'You', 'review', 'pending', state, note)
    log(c, now, task['id'], 'status', 'manual', 'You', 'status', 'awaiting_review', new, 'Approved by you' if decision == 'approve' else 'Rejected: sent back to the queue')
    event(c, now, f'Output {"approved" if decision == "approve" else "rejected"} by you — decision recorded locally')
    return 200, {'ok': True}


ROUTES = {
    '/api/agent-tasks': create_task,
    '/api/agent-tasks/update': update_task,
    '/api/agent-tasks/status': set_status,
    '/api/agent-tasks/note': add_note,
    '/api/agent-tasks/evidence': add_evidence,
    '/api/agent-tasks/review': review_task,
}


def sweep_stale(c, now_iso):
    """A task reported as running with no update for STALE_HOURS is flagged stale. This is an
    observation of silence by the server, recorded as such; it does not claim the agent stopped."""
    running = c.execute("SELECT id,updated,agent_id FROM agent_tasks WHERE status='running'").fetchall()
    if not running:
        return
    now = dt.datetime.fromisoformat(now_iso)
    hours = _stale_hours()
    for row in running:
        try:
            idle = now - dt.datetime.fromisoformat(row['updated'])
        except ValueError:
            continue
        if idle >= dt.timedelta(hours=hours):
            cur = c.execute("UPDATE agent_tasks SET status='stale',status_source='observed',status_changed=? WHERE id=? AND status='running' AND updated=?", (now_iso, row['id'], row['updated']))
            if cur.rowcount == 1:
                log(c, now_iso, row['id'], 'status', 'observed', 'Keystal OS', 'status', 'running', 'stale', f'No update recorded for {int(idle.total_seconds() // 3600)}h (limit {hours:g}h). Flagged by this server; the agent may still be working.')
                event(c, now_iso, 'A running task has had no update — flagged stale by this server')


# --------------------------------------------------------------------- reads

def list_tasks(c):
    rows = c.execute('''SELECT t.*, a.name AS agent_name,
        (SELECT COUNT(*) FROM agent_task_evidence e WHERE e.task_id=t.id) AS evidence_count
        FROM agent_tasks t LEFT JOIN agents a ON a.id=t.agent_id ORDER BY t.updated DESC, t.created DESC''').fetchall()
    return [dict(r) for r in rows]


def task_detail(c, tid):
    if not TASK_ID.fullmatch(tid):
        raise ApiError('Task not found', 404)
    row = c.execute('SELECT t.*, a.name AS agent_name FROM agent_tasks t LEFT JOIN agents a ON a.id=t.agent_id WHERE t.id=?', (tid,)).fetchone()
    if not row:
        raise ApiError('Task not found', 404)
    return {
        'task': dict(row),
        'history': [dict(r) for r in c.execute('SELECT * FROM agent_task_history WHERE task_id=? ORDER BY id', (tid,))],
        'evidence': [dict(r) for r in c.execute('SELECT * FROM agent_task_evidence WHERE task_id=? ORDER BY id', (tid,))],
    }


def export_rows(c):
    return {
        'agents': [dict(r) for r in c.execute('SELECT * FROM agents ORDER BY position')],
        'agent_tasks': [dict(r) for r in c.execute('SELECT * FROM agent_tasks ORDER BY created')],
        'agent_task_history': [dict(r) for r in c.execute('SELECT * FROM agent_task_history ORDER BY id')],
        'agent_task_evidence': [dict(r) for r in c.execute('SELECT * FROM agent_task_evidence ORDER BY id')],
    }


def kanban_view(c):
    row = c.execute("SELECT value FROM meta WHERE key='kanban'").fetchone()
    meta = json.loads(row['value']) if row else {'status': 'unchecked', 'detail': 'Not checked yet. Use Refresh to read the Hermes Kanban board.', 'checked_at': None, 'count': 0}
    tasks = [dict(r) for r in c.execute('SELECT external_id,title,status_raw,status,assignee,updated_raw,fetched FROM kanban_snapshot ORDER BY rowid')]
    return {**meta, 'tasks': tasks, 'source': 'observed'}


def overview(c, runtime):
    """One card per agent. Counts come from tracked tasks; only Hermes has directly observed facts."""
    counts = {}
    for r in c.execute('SELECT agent_id,status,COUNT(*) AS n FROM agent_tasks GROUP BY agent_id,status'):
        counts.setdefault(r['agent_id'], {})[r['status']] = r['n']
    last_run = c.execute('SELECT status,created,ended FROM runs ORDER BY created DESC LIMIT 1').fetchone()
    kanban = kanban_view(c)
    cards = []
    for a in c.execute('SELECT * FROM agents ORDER BY position').fetchall():
        tally = {s: counts.get(a['id'], {}).get(s, 0) for s in STATUSES}
        last = c.execute("SELECT h.at,h.kind,h.source FROM agent_task_history h JOIN agent_tasks t ON t.id=h.task_id WHERE t.agent_id=? AND h.source!='observed' ORDER BY h.id DESC LIMIT 1", (a['id'],)).fetchone()
        running = [dict(r) for r in c.execute("SELECT id,title,status_source,updated FROM agent_tasks WHERE agent_id=? AND status='running' ORDER BY updated DESC LIMIT 3", (a['id'],))]
        card = {'id': a['id'], 'name': a['name'], 'role': a['role'], 'counts': tally, 'open': sum(v for k, v in tally.items() if k != 'completed'),
                'last_update': dict(last) if last else None, 'running': running, 'observation': None}
        if a['integration'] == 'local_cli':
            found = bool(runtime.get('bridge_available'))
            card['connection'] = {'status': 'observed' if found else 'not_connected', 'label': 'LOCAL CLI DETECTED' if found else 'HERMES CLI NOT FOUND',
                                  'detail': 'Runs on this Mac. This OS observes its chat bridge directly.' if found else 'Install or configure Hermes. Nothing about Hermes can be observed until then.'}
            card['observation'] = {'working_now': bool(runtime.get('busy')), 'last_chat_run': dict(last_run) if last_run else None,
                                   'kanban_status': kanban['status'], 'kanban_count': kanban['count'] if kanban['status'] == 'connected' else None}
        else:
            card['connection'] = {'status': 'not_connected', 'label': 'NOT CONNECTED', 'detail': 'No API or adapter. Status comes only from tasks you enter and updates you or the agent report.'}
        cards.append(card)
    total = {s: sum(counts.get(k, {}).get(s, 0) for k in counts) for s in STATUSES}
    unassigned = sum(v for k, v in counts.get(None, {}).items() if k != 'completed')
    return {'agents': cards, 'totals': total, 'unassigned_open': unassigned, 'stale_hours': _stale_hours()}


# ------------------------------------------------------------ Hermes Kanban

def fetch_kanban(hermes, board=None, timeout=20):
    """Read-only: runs `hermes kanban list --json`. Returns (status, detail, rows).
    status is connected | not_connected | failed. Raw stderr is never surfaced."""
    if not hermes:
        return 'not_connected', 'Hermes CLI not found, so the Kanban board cannot be read.', []
    args = [hermes, 'kanban']
    if board:
        args += ['--board', board]
    args += ['list', '--json']
    try:
        r = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors='replace', timeout=timeout)
    except subprocess.TimeoutExpired:
        return 'failed', f'Hermes did not answer within {timeout} seconds. Nothing was changed.', []
    except OSError:
        return 'not_connected', 'Hermes CLI could not be started.', []
    if r.returncode:
        err = (r.stderr or '').lower()
        if re.search(r'invalid choice|unknown command|no such command', err) and 'kanban' in err:
            return 'not_connected', 'This Hermes version has no Kanban command, so there is nothing to read.', []
        return 'failed', 'Hermes could not list the Kanban board. Run `hermes kanban list` in a terminal to see why. Nothing was changed.', []
    if len(r.stdout) > 2_000_000:
        return 'failed', 'Hermes returned more Kanban data than this app will read.', []
    try:
        data = json.loads(r.stdout)
    except ValueError:
        return 'failed', 'Hermes Kanban output was not JSON this app recognises. Nothing was imported.', []
    if isinstance(data, dict):
        data = next((data[k] for k in ('tasks', 'items', 'data') if isinstance(data.get(k), list)), None)
    if not isinstance(data, list):
        return 'failed', 'Hermes Kanban output was not a task list this app recognises. Nothing was imported.', []
    rows = []
    for item in data:
        if not isinstance(item, dict):
            continue
        ident = item.get('id', item.get('task_id'))
        title = item.get('title')
        if ident in (None, '') or not isinstance(title, str) or not title.strip():
            continue
        raw = str(item.get('status') or 'unknown').lower()
        if raw == 'archived':
            continue
        assignee = item.get('assignee')
        updated = item.get('updated_at', item.get('updated', item.get('created_at')))
        rows.append({'external_id': str(ident)[:80], 'title': title.strip()[:300], 'status_raw': raw[:40], 'status': KANBAN_STATUS.get(raw),
                     'assignee': str(assignee)[:80] if assignee else None, 'updated_raw': str(updated)[:40] if updated is not None else None})
    return 'connected', f'Read {len(rows)} task{"" if len(rows) == 1 else "s"} from the Hermes Kanban board. Read-only; nothing was changed in Hermes.', rows[:KANBAN_LIMIT]


def store_kanban(c, now, status, detail, rows):
    c.execute('DELETE FROM kanban_snapshot')
    if status == 'connected':
        c.executemany('INSERT OR REPLACE INTO kanban_snapshot(external_id,title,status_raw,status,assignee,updated_raw,fetched) VALUES(?,?,?,?,?,?,?)',
                      [(r['external_id'], r['title'], r['status_raw'], r['status'], r['assignee'], r['updated_raw'], now) for r in rows])
    meta = {'status': status, 'detail': detail, 'checked_at': now, 'count': len(rows)}
    c.execute('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)', ('kanban', json.dumps(meta)))
    event(c, now, {'connected': 'Hermes Kanban read (read-only)', 'not_connected': 'Hermes Kanban not connected', 'failed': 'Hermes Kanban read failed'}[status], 'error' if status == 'failed' else 'connection')
    return meta
