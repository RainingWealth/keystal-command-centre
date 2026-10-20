"""Agents & tasks: a local tracking board for work delegated to AI agents.

Tracking only. Nothing here contacts, starts or controls an agent. Every status,
note and piece of evidence carries a provenance:
  observed        read directly by this server (Hermes CLI / Kanban, chat runs, stale sweep)
  manual          typed in by the owner in this app
  agent_reported  relayed by the owner from an agent; not verified by this OS
The browser can only ever claim `manual` or `agent_reported`; `observed` is server-only.

Authority boundary: ClickUp owns business commitments; Hermes Kanban owns internal agent
execution. This app aggregates and links to them (read-only for Hermes) and keeps its own
delegation, review and evidence records. It is never a third execution authority.
"""
import datetime as dt
import json
import os
import re
import sqlite3
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
# Raw Hermes board state -> (our status or None, explicit state class). Raw states are always kept
# as Hermes reported them; anything not listed is class "unknown" and is shown, never guessed at.
KANBAN_STATES = {
    'triage': ('queued', 'open'), 'todo': ('queued', 'open'), 'ready': ('queued', 'open'),
    'running': ('running', 'active'), 'blocked': ('blocked', 'attention'), 'review': ('awaiting_review', 'attention'),
    'done': ('completed', 'closed'), 'scheduled': (None, 'scheduled'), 'archived': (None, 'archived'),
}
KANBAN_MAX_STORED = 1000
ID_PART = re.compile(r'[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}')
REF_ID = re.compile(r'[A-Za-z0-9][A-Za-z0-9._:/@+=-]{0,127}')
TASK_FIELDS = ('title', 'description', 'agent_id', 'priority', 'lane', 'due', 'requires_review', 'project')
PROVIDERS = ('clickup', 'hermes_kanban')


def _stale_hours():
    try:
        return max(float(os.environ.get('KEYSTAL_OS_STALE_HOURS', '24')), 0.0)
    except ValueError:
        return 24.0


def kanban_timing():
    """(refresh_seconds, stale_after_seconds). refresh 0 disables the background read."""
    def number(name, default):
        try:
            return int(os.environ.get(name, default))
        except ValueError:
            return default
    refresh = number('KEYSTAL_OS_KANBAN_REFRESH_SECONDS', 300)
    refresh = 0 if refresh <= 0 else max(refresh, 30)
    return refresh, max(number('KEYSTAL_OS_KANBAN_STALE_SECONDS', max(600, 2 * refresh)), 60)


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


def strict(data, allowed):
    """Fail closed: a field this endpoint does not own (status, review_state, source...) is an error, not ignored."""
    extra = sorted(set(data) - set(allowed))
    if extra:
        raise ApiError('Field(s) not accepted here: ' + ', '.join(str(k)[:40] for k in extra[:5]))


def project_id(c, now, name):
    if not name:
        return None
    key = ' '.join(name.lower().split())
    row = c.execute('SELECT id FROM projects WHERE name_key=?', (key,)).fetchone()
    if row:
        return row['id']
    pid = uuid.uuid4().hex
    c.execute('INSERT INTO projects(id,name,name_key,created) VALUES(?,?,?,?)', (pid, ' '.join(name.split()), key, now))
    return pid


def project_name(c, pid):
    row = c.execute('SELECT name FROM projects WHERE id=?', (pid,)).fetchone() if pid else None
    return row['name'] if row else ''


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
    strict(data, TASK_FIELDS)
    title = field(data, 'title', 200, required=True)
    description = field(data, 'description', 4000)
    agent_id = agent_ref(c, data.get('agent_id'))
    priority = choice(data, 'priority', PRIORITIES, 'normal')
    lane = choice(data, 'lane', LANES, 'Operate')
    due = due_date(data.get('due'))
    requires_review = flag(data.get('requires_review', True), 'requires_review')
    pid = project_id(c, now, field(data, 'project', 80))
    tid = uuid.uuid4().hex
    c.execute('INSERT INTO agent_tasks(id,title,description,agent_id,status,status_source,review_state,requires_review,priority,lane,due,project_id,created,updated,status_changed) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
              (tid, title, description, agent_id, 'queued', 'manual', 'none', requires_review, priority, lane, due, pid, now, now, now))
    name = c.execute('SELECT name FROM agents WHERE id=?', (agent_id,)).fetchone() if agent_id else None
    log(c, now, tid, 'created', 'manual', 'You', to_value='queued', note=f'Created and assigned to {name["name"]}' if name else 'Created, not yet assigned')
    event(c, now, f'Agent task saved locally{" for " + name["name"] if name else ""} — tracking only, no agent contacted')
    return 201, {'id': tid, 'scope': 'local-tracking'}


def update_task(c, now, data):
    strict(data, ('id',) + TASK_FIELDS)
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
    if 'project' in data:
        wanted = field(data, 'project', 80)
        if ' '.join(wanted.lower().split()) != ' '.join(project_name(c, task['project_id']).lower().split()):
            changes['project_id'] = project_id(c, now, wanted)
    changes = {k: v for k, v in changes.items() if task[k] != v}
    if not changes:
        return 200, {'ok': True, 'changed': []}
    if changes.get('requires_review') == 0 and task['status'] == 'awaiting_review':
        raise ApiError('Resolve the pending review before turning review off.')
    if 'agent_id' in changes and changes['agent_id'] is None and task['status'] == 'running':
        raise ApiError('A running task needs an agent. Change its status before unassigning.')
    if 'requires_review' in changes and task['status'] == 'completed':
        raise ApiError('Reopen the completed task before changing whether it needs review.', 409)
    if 'agent_id' in changes and changes['agent_id'] != 'hermes' and c.execute("SELECT 1 FROM external_refs WHERE task_id=? AND provider='hermes_kanban'", (task['id'],)).fetchone():
        raise ApiError('This task is linked to a Hermes Kanban card, so it stays with Hermes. Unlink the card first.', 409)
    sets = ','.join(f'{k}=?' for k in changes)
    c.execute(f'UPDATE agent_tasks SET {sets},updated=? WHERE id=?', (*changes.values(), now, task['id']))
    for key, new in changes.items():
        if key == 'agent_id':
            names = {r['id']: r['name'] for r in c.execute('SELECT id,name FROM agents')}
            log(c, now, task['id'], 'assigned', 'manual', 'You', 'agent', names.get(task['agent_id'], 'Unassigned'), names.get(new, 'Unassigned'))
        elif key == 'project_id':
            log(c, now, task['id'], 'edited', 'manual', 'You', 'project', project_name(c, task['project_id']), project_name(c, new))
        else:
            old = task[key]
            log(c, now, task['id'], 'edited', 'manual', 'You', key, str(old), str(new))
    event(c, now, 'Agent task edited locally — tracking only, no agent contacted')
    return 200, {'ok': True, 'changed': sorted('project' if k == 'project_id' else k for k in changes)}


def set_status(c, now, data):
    strict(data, ('id', 'status', 'source', 'note', 'expected_status'))
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
    strict(data, ('id', 'note', 'source'))
    task = load_task(c, data)
    source = choice(data, 'source', CLIENT_SOURCES, 'manual')
    note = field(data, 'note', 2000, required=True)
    c.execute('UPDATE agent_tasks SET updated=? WHERE id=?', (now, task['id']))
    log(c, now, task['id'], 'note', source, actor_for(c, task, source), note=note)
    event(c, now, f'Task note added ({SOURCE_LABELS[source]}) — no agent contacted')
    return 201, {'ok': True}


def add_evidence(c, now, data):
    strict(data, ('id', 'label', 'url', 'note', 'source'))
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
    strict(data, ('id', 'decision', 'note'))
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


def _ref_part(data, key, pattern, required=True):
    value = field(data, key, 128, required=required)
    if value and not pattern.fullmatch(value):
        raise ApiError(f'Invalid {key}')
    return value


def link_task(c, now, data):
    """Record that a local task corresponds to a record in a system that owns that record.
    Nothing is written to that system, and the task's own status is not overwritten by it."""
    strict(data, ('id', 'provider', 'external_id', 'instance', 'scope', 'url', 'label'))
    task = load_task(c, data)
    provider = choice(data, 'provider', PROVIDERS, None)
    external_id = _ref_part(data, 'external_id', REF_ID)
    label = field(data, 'label', 120)
    if provider == 'hermes_kanban':
        if 'instance' in data or 'scope' in data:
            raise ApiError('Hermes links take their board and profile from the last read, not from the request.')
        meta = _kanban_meta(c)
        if not meta['snapshot_pinned'] or not meta['snapshot_board'] or not meta['instance']:
            raise ApiError('Pin a board (KEYSTAL_OS_KANBAN_BOARD) and refresh before linking cards: a card id is only unique within its board.', 409)
        card = c.execute('SELECT title FROM kanban_snapshot WHERE external_id=?', (external_id,)).fetchone()
        if not card:
            raise ApiError('That card is not in the last successful Hermes read. Refresh the board and try again.', 404)
        if task['agent_id'] not in (None, 'hermes'):
            raise ApiError('Hermes Kanban cards can only be linked to tasks assigned to Hermes.', 409)
        instance, scope, url, label = meta['instance'], meta['snapshot_board'], '', label or card['title'][:120]
    else:
        instance, scope = _ref_part(data, 'instance', ID_PART), _ref_part(data, 'scope', ID_PART)
        url = evidence_url(data.get('url'))
    try:
        c.execute('INSERT INTO external_refs(task_id,provider,instance,scope,external_id,url,label,source,created) VALUES(?,?,?,?,?,?,?,?,?)',
                  (task['id'], provider, instance, scope, external_id, url, label, 'manual', now))
    except sqlite3.IntegrityError:
        raise ApiError('That external record is already linked to a task.', 409)
    if provider == 'hermes_kanban' and task['agent_id'] is None:
        c.execute("UPDATE agent_tasks SET agent_id='hermes' WHERE id=?", (task['id'],))
        log(c, now, task['id'], 'assigned', 'manual', 'You', 'agent', 'Unassigned', 'Hermes', 'Assigned to Hermes by linking a Hermes Kanban card')
    c.execute('UPDATE agent_tasks SET updated=? WHERE id=?', (now, task['id']))
    log(c, now, task['id'], 'edited', 'manual', 'You', 'link', None, f'{provider}:{instance}/{scope}/{external_id}', 'Link recorded here only; nothing was changed in the other system')
    event(c, now, f'Task linked to a {"Hermes Kanban card" if provider == "hermes_kanban" else "ClickUp task"} — nothing changed in that system')
    return 201, {'ok': True}


def unlink_task(c, now, data):
    strict(data, ('id', 'ref_id'))
    task = load_task(c, data)
    ref_id = data.get('ref_id')
    if not isinstance(ref_id, int) or isinstance(ref_id, bool):
        raise ApiError('Invalid ref_id')
    ref = c.execute('SELECT * FROM external_refs WHERE id=? AND task_id=?', (ref_id, task['id'])).fetchone()
    if not ref:
        raise ApiError('Link not found', 404)
    c.execute('DELETE FROM external_refs WHERE id=?', (ref_id,))
    c.execute('UPDATE agent_tasks SET updated=? WHERE id=?', (now, task['id']))
    log(c, now, task['id'], 'edited', 'manual', 'You', 'link', f"{ref['provider']}:{ref['instance']}/{ref['scope']}/{ref['external_id']}", None, 'Link removed here only; nothing was changed in the other system')
    event(c, now, 'Task link removed — nothing changed in the other system')
    return 200, {'ok': True}


def add_session(c, now, data):
    """Attach an opaque session/run identifier from an agent's own system. Identifiers only, never transcripts."""
    strict(data, ('id', 'agent_id', 'session_ref', 'run_ref', 'note', 'source'))
    task = load_task(c, data)
    source = choice(data, 'source', CLIENT_SOURCES, 'manual')
    agent_id = agent_ref(c, data.get('agent_id') or task['agent_id'])
    if not agent_id:
        raise ApiError('Say which agent this session belongs to, or assign the task first.')
    session_ref = _ref_part(data, 'session_ref', REF_ID)
    run_ref = _ref_part(data, 'run_ref', REF_ID, required=False)
    note = field(data, 'note', 300)
    try:
        c.execute('INSERT INTO agent_task_sessions(task_id,agent_id,session_ref,run_ref,note,source,created) VALUES(?,?,?,?,?,?,?)',
                  (task['id'], agent_id, session_ref, run_ref, note, source, now))
    except sqlite3.IntegrityError:
        raise ApiError('That session is already recorded on this task.', 409)
    c.execute('UPDATE agent_tasks SET updated=? WHERE id=?', (now, task['id']))
    log(c, now, task['id'], 'edited', source, actor_for(c, task, source), 'session', None, f'{agent_id}:{session_ref}' + (f'#{run_ref}' if run_ref else ''), note)
    event(c, now, f'Session identifier recorded ({SOURCE_LABELS[source]}) — nothing was contacted')
    return 201, {'ok': True}


ROUTES = {
    '/api/agent-tasks/link': link_task,
    '/api/agent-tasks/unlink': unlink_task,
    '/api/agent-tasks/session': add_session,
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
    rows = c.execute('''SELECT t.*, a.name AS agent_name, p.name AS project,
        (SELECT COUNT(*) FROM agent_task_evidence e WHERE e.task_id=t.id) AS evidence_count,
        (SELECT COUNT(*) FROM external_refs r WHERE r.task_id=t.id) AS link_count
        FROM agent_tasks t LEFT JOIN agents a ON a.id=t.agent_id LEFT JOIN projects p ON p.id=t.project_id
        ORDER BY t.updated DESC, t.created DESC''').fetchall()
    return [dict(r) for r in rows]


def list_projects(c):
    return [dict(r) for r in c.execute("""SELECT p.id,p.name,
        (SELECT COUNT(*) FROM agent_tasks t WHERE t.project_id=p.id AND t.status!='completed') AS open_tasks,
        (SELECT COUNT(*) FROM agent_tasks t WHERE t.project_id=p.id) AS tasks
        FROM projects p ORDER BY p.name_key""")]


def task_detail(c, tid):
    if not TASK_ID.fullmatch(tid):
        raise ApiError('Task not found', 404)
    row = c.execute('SELECT t.*, a.name AS agent_name, p.name AS project FROM agent_tasks t LEFT JOIN agents a ON a.id=t.agent_id LEFT JOIN projects p ON p.id=t.project_id WHERE t.id=?', (tid,)).fetchone()
    if not row:
        raise ApiError('Task not found', 404)
    meta = _kanban_meta(c)
    refs = []
    for r in c.execute('SELECT * FROM external_refs WHERE task_id=? ORDER BY id', (tid,)):
        ref = dict(r)
        if r['provider'] == 'hermes_kanban':
            same_board = meta['snapshot_pinned'] and meta['snapshot_board'] == r['scope'] and meta['instance'] == r['instance']
            card = c.execute('SELECT external_id,title,status_raw,status,state_class,assignee,updated_raw FROM kanban_snapshot WHERE external_id=?', (r['external_id'],)).fetchone() if same_board else None
            ref['board_record'] = {'comparable': bool(same_board), 'in_last_read': bool(card), 'last_success_at': meta['last_success_at'], 'snapshot_board': meta['snapshot_board'],
                                   'record': dict(card) if card else None,
                                   'drift': bool(card and card['status'] and card['status'] != row['status'])}
        refs.append(ref)
    return {
        'task': dict(row),
        'history': [dict(r) for r in c.execute('SELECT * FROM agent_task_history WHERE task_id=? ORDER BY id', (tid,))],
        'evidence': [dict(r) for r in c.execute('SELECT * FROM agent_task_evidence WHERE task_id=? ORDER BY id', (tid,))],
        'refs': refs,
        'sessions': [dict(r) for r in c.execute('SELECT s.*, a.name AS agent_name FROM agent_task_sessions s JOIN agents a ON a.id=s.agent_id WHERE s.task_id=? ORDER BY s.id', (tid,))],
    }


def export_rows(c):
    return {
        'agents': [dict(r) for r in c.execute('SELECT * FROM agents ORDER BY position')],
        'projects': [dict(r) for r in c.execute('SELECT * FROM projects ORDER BY name_key')],
        'agent_tasks': [dict(r) for r in c.execute('SELECT * FROM agent_tasks ORDER BY created')],
        'agent_task_history': [dict(r) for r in c.execute('SELECT * FROM agent_task_history ORDER BY id')],
        'agent_task_evidence': [dict(r) for r in c.execute('SELECT * FROM agent_task_evidence ORDER BY id')],
        'external_refs': [dict(r) for r in c.execute('SELECT * FROM external_refs ORDER BY id')],
        'agent_task_sessions': [dict(r) for r in c.execute('SELECT * FROM agent_task_sessions ORDER BY id')],
    }


# ------------------------------------------------------------ Hermes Kanban

_KANBAN_DEFAULTS = {'last_attempt_at': None, 'last_attempt_status': 'unchecked', 'last_attempt_detail': 'Not checked yet. Use Refresh to read the Hermes Kanban board.',
                    'last_success_at': None, 'attempt_board': None, 'snapshot_board': None, 'snapshot_pinned': False, 'instance': None,
                    'received': 0, 'rejected': 0, 'archived_skipped': 0, 'duplicates': 0, 'unique': 0, 'stored': 0, 'dropped': 0, 'truncated': False,
                    'state_counts': {}, 'status_counts': {}, 'class_counts': {}}


def _kanban_meta(c):
    """Stored read bookkeeping, normalised. Understands the earlier (schema v2) shape."""
    row = c.execute("SELECT value FROM meta WHERE key='kanban'").fetchone()
    if not row:
        return dict(_KANBAN_DEFAULTS)
    raw = json.loads(row['value'])
    if 'last_attempt_at' in raw:
        return {**_KANBAN_DEFAULTS, **raw}
    ok = raw.get('status') == 'connected'
    count = raw.get('count', 0) if ok else 0
    return {**_KANBAN_DEFAULTS, 'last_attempt_at': raw.get('checked_at'), 'last_attempt_status': raw.get('status', 'unchecked'), 'last_attempt_detail': raw.get('detail', ''),
            'last_success_at': raw.get('checked_at') if ok else None, 'received': count, 'unique': count, 'stored': count}


def kanban_view(c, now_iso):
    """What the dashboard may say about Hermes Kanban. Every fact is separate: the last attempt (and its
    sanitized error), the last success (and how old it is), and the snapshot actually displayed."""
    meta = _kanban_meta(c)
    refresh, stale_after = kanban_timing()
    links = {}
    if meta['snapshot_pinned'] and meta['instance']:
        for r in c.execute("SELECT external_id,task_id FROM external_refs WHERE provider='hermes_kanban' AND instance=? AND scope=?", (meta['instance'], meta['snapshot_board'])):
            links[r['external_id']] = r['task_id']
    tasks = [{**dict(r), 'linked_task_id': links.get(r['external_id'])} for r in c.execute('SELECT external_id,title,status_raw,status,state_class,assignee,updated_raw,fetched FROM kanban_snapshot ORDER BY rowid')]
    age = stale = None
    if meta['last_success_at']:
        age = max(0, int((dt.datetime.fromisoformat(now_iso) - dt.datetime.fromisoformat(meta['last_success_at'])).total_seconds()))
        stale = age > stale_after
    status = meta['last_attempt_status']
    pinned = bool(meta['snapshot_pinned'])
    if meta['last_success_at'] is None:
        board = {'name': None, 'pinned': False, 'label': 'No board has been read yet'}
    else:
        board = {'name': meta['snapshot_board'], 'pinned': pinned, 'label': f"Board: {meta['snapshot_board']}" if pinned else 'Hermes current board (not pinned: the board is whichever Hermes has selected)'}
    board['configured'] = meta['attempt_board']
    board['changed'] = bool(meta['last_success_at'] and meta['attempt_board'] != meta['snapshot_board'])
    counts = {k: meta[k] for k in ('received', 'rejected', 'archived_skipped', 'duplicates', 'unique', 'stored', 'dropped', 'truncated')}
    counts['listed_total'] = len(tasks)
    return {
        'status': status, 'detail': meta['last_attempt_detail'], 'error': meta['last_attempt_detail'] if status in ('failed', 'not_connected') else None,
        'last_attempt_at': meta['last_attempt_at'], 'last_success_at': meta['last_success_at'], 'age_seconds': age, 'stale': stale,
        'stale_after_seconds': stale_after, 'refresh_seconds': refresh,
        'showing_last_success': bool(meta['last_success_at']) and status != 'connected',
        'board': board, 'counts': counts, 'state_counts': meta['state_counts'], 'status_counts': meta['status_counts'], 'class_counts': meta['class_counts'],
        'link': {'enabled': bool(pinned and meta['instance'] and meta['last_success_at']),
                 'reason': None if pinned and meta['instance'] and meta['last_success_at'] else 'Linking needs a pinned board (KEYSTAL_OS_KANBAN_BOARD) and one successful read: a card id is only unique within its board.'},
        'tasks': tasks, 'source': 'observed',
    }


def overview(c, runtime, kanban):
    """One card per agent. Counts come from tracked tasks; only Hermes has directly observed facts.
    A Hermes board card that is linked to a tracked task is counted once, through that task; board
    cards with no link are added to Hermes. Board states are observed records, not proof of a live worker."""
    counts = {}
    for r in c.execute('SELECT agent_id,status,COUNT(*) AS n FROM agent_tasks GROUP BY agent_id,status'):
        counts.setdefault(r['agent_id'], {})[r['status']] = r['n']
    last_run = c.execute('SELECT status,created,ended FROM runs ORDER BY created DESC LIMIT 1').fetchone()
    board_only = [t for t in kanban['tasks'] if not t['linked_task_id']]
    board_extra = {s: 0 for s in STATUSES}
    for t in board_only:
        if t['status']:
            board_extra[t['status']] += 1
    drift = 0
    if kanban['tasks']:
        local = {r['id']: r['status'] for r in c.execute('SELECT id,status FROM agent_tasks')}
        drift = sum(1 for t in kanban['tasks'] if t['linked_task_id'] and t['status'] and local.get(t['linked_task_id']) != t['status'])
    cards = []
    for a in c.execute('SELECT * FROM agents ORDER BY position').fetchall():
        tally = {s: counts.get(a['id'], {}).get(s, 0) for s in STATUSES}
        last = c.execute("SELECT h.at,h.kind,h.source FROM agent_task_history h JOIN agent_tasks t ON t.id=h.task_id WHERE t.agent_id=? AND h.source!='observed' ORDER BY h.id DESC LIMIT 1", (a['id'],)).fetchone()
        running = [dict(r) for r in c.execute("SELECT id,title,status_source,updated FROM agent_tasks WHERE agent_id=? AND status='running' ORDER BY updated DESC LIMIT 3", (a['id'],))]
        card = {'id': a['id'], 'name': a['name'], 'role': a['role'], 'last_update': dict(last) if last else None, 'running': running, 'observation': None, 'board': None}
        if a['integration'] == 'local_cli':
            found = bool(runtime.get('bridge_available'))
            tracked = sum(tally.values())
            for s in STATUSES:
                tally[s] += board_extra[s]
            card['connection'] = {'status': 'observed' if found else 'not_connected', 'label': 'LOCAL CLI DETECTED' if found else 'HERMES CLI NOT FOUND',
                                  'detail': 'Runs on this Mac. This OS observes its chat bridge directly.' if found else 'Install or configure Hermes. Nothing about Hermes can be observed until then.'}
            card['observation'] = {'working_now': bool(runtime.get('busy')), 'last_chat_run': dict(last_run) if last_run else None}
            card['board'] = {'status': kanban['status'], 'has_snapshot': bool(kanban['tasks']) or kanban['last_success_at'] is not None, 'stale': kanban['stale'], 'age_seconds': kanban['age_seconds'],
                             'tracked_tasks': tracked, 'board_only': len(board_only), 'linked': sum(1 for t in kanban['tasks'] if t['linked_task_id']),
                             'scheduled': sum(1 for t in board_only if t['state_class'] == 'scheduled'), 'unknown': sum(1 for t in board_only if t['state_class'] == 'unknown'),
                             'drift': drift, 'truncated': kanban['counts']['truncated']}
        else:
            card['connection'] = {'status': 'not_connected', 'label': 'NOT CONNECTED', 'detail': 'No API or adapter. Status comes only from tasks you enter and updates you or the agent report.'}
        card['counts'] = tally
        card['open'] = sum(v for k, v in tally.items() if k != 'completed')
        cards.append(card)
    total = {s: sum(counts.get(k, {}).get(s, 0) for k in counts) for s in STATUSES}
    unassigned = sum(v for k, v in counts.get(None, {}).items() if k != 'completed')
    return {'agents': cards, 'totals': total, 'board_totals': board_extra, 'unassigned_open': unassigned, 'stale_hours': _stale_hours()}


def parse_kanban(data):
    """Normalise a decoded `hermes kanban list --json` payload. Fails closed: a non-empty list in which
    nothing is recognisable is a read failure, never a connected board with zero tasks."""
    if isinstance(data, dict):
        data = next((data[k] for k in ('tasks', 'items', 'data') if isinstance(data.get(k), list)), None)
    if not isinstance(data, list):
        return {'status': 'failed', 'detail': 'Hermes Kanban output was not a task list this app recognises. Nothing was imported and the last good read is kept.'}
    received = len(data)
    seen, rows, names = set(), [], set()
    rejected = archived = duplicates = 0
    for item in data:
        if not isinstance(item, dict):
            rejected += 1
            continue
        names.update(str(k)[:40] for k in list(item)[:60])
        ident = item.get('id', item.get('task_id'))
        title = item.get('title')
        if ident in (None, '') or isinstance(ident, (dict, list)) or not isinstance(title, str) or not title.strip():
            rejected += 1
            continue
        raw = str(item.get('status') if item.get('status') not in (None, '') else 'unknown').strip()[:40] or 'unknown'
        mapped, state_class = KANBAN_STATES.get(raw.lower(), (None, 'unknown'))
        if state_class == 'archived':
            archived += 1
            continue
        eid = str(ident)[:80]
        if eid in seen:
            duplicates += 1
            continue
        seen.add(eid)
        assignee = item.get('assignee')
        updated = item.get('updated_at', item.get('updated', item.get('created_at')))
        rows.append({'external_id': eid, 'title': title.strip()[:300], 'status_raw': raw, 'status': mapped, 'state_class': state_class,
                     'assignee': str(assignee)[:80] if assignee and not isinstance(assignee, (dict, list)) else None,
                     'updated_raw': str(updated)[:40] if updated is not None and not isinstance(updated, (dict, list)) else None})
    counts = {'received': received, 'rejected': rejected, 'archived_skipped': archived, 'duplicates': duplicates, 'unique': len(rows)}
    if received and rejected == received:
        return {'status': 'failed', 'detail': f'Hermes returned {received} record{"" if received == 1 else "s"} but none were recognisable as tasks (each needs an id and a title). Nothing was imported and the last good read is kept.', **counts, 'field_names': sorted(names)}
    stored = rows[:KANBAN_MAX_STORED]
    dropped = len(rows) - len(stored)
    parts = [f'received {received}', f'{len(stored)} shown']
    for label, n in (('duplicates merged', duplicates), ('archived skipped', archived), ('not recognised', rejected)):
        if n:
            parts.append(f'{n} {label}')
    if dropped:
        parts.append(f'TRUNCATED: {dropped} more not stored (limit {KANBAN_MAX_STORED})')
    return {'status': 'connected', 'detail': 'Read the Hermes Kanban board (read-only): ' + ', '.join(parts) + '. Nothing was changed in Hermes.',
            'rows': stored, **counts, 'stored': len(stored), 'dropped': dropped, 'truncated': bool(dropped), 'field_names': sorted(names)}


def fetch_kanban(hermes, board=None, timeout=20):
    """Read-only: runs `hermes kanban [--board B] list --json` and returns a result dict with
    status connected | not_connected | failed. Raw stderr is never surfaced."""
    if not hermes:
        return {'status': 'not_connected', 'detail': 'Hermes CLI not found, so the Kanban board cannot be read.'}
    args = [hermes, 'kanban']
    if board:
        args += ['--board', board]
    args += ['list', '--json']
    try:
        r = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors='replace', timeout=timeout)
    except subprocess.TimeoutExpired:
        return {'status': 'failed', 'detail': f'Hermes did not answer within {timeout} seconds. Nothing was changed and the last good read is kept.'}
    except OSError:
        return {'status': 'not_connected', 'detail': 'Hermes CLI could not be started.'}
    if r.returncode:
        err = (r.stderr or '').lower()
        if re.search(r'invalid choice|unknown command|no such command', err) and 'kanban' in err:
            return {'status': 'not_connected', 'detail': 'This Hermes version has no Kanban command, so there is nothing to read.'}
        return {'status': 'failed', 'detail': 'Hermes could not list the Kanban board. Run `hermes kanban list` in a terminal to see why. Nothing was changed and the last good read is kept.'}
    if len(r.stdout) > 2_000_000:
        return {'status': 'failed', 'detail': 'Hermes returned more Kanban data than this app will read. The last good read is kept.'}
    try:
        data = json.loads(r.stdout)
    except ValueError:
        return {'status': 'failed', 'detail': 'Hermes Kanban output was not JSON this app recognises. Nothing was imported and the last good read is kept.'}
    return parse_kanban(data)


def store_kanban(c, now, result, board, instance, manual=False):
    """Record one read attempt. A successful read replaces the snapshot atomically; a failed or
    unsupported read leaves the last good snapshot and its counts untouched."""
    meta = _kanban_meta(c)
    previous = meta['last_attempt_status']
    meta.update(last_attempt_at=now, last_attempt_status=result['status'], last_attempt_detail=result['detail'], attempt_board=board, instance=instance)
    if result['status'] == 'connected':
        rows = result['rows']
        c.execute('DELETE FROM kanban_snapshot')
        c.executemany('INSERT INTO kanban_snapshot(external_id,title,status_raw,status,state_class,assignee,updated_raw,fetched) VALUES(?,?,?,?,?,?,?,?)',
                      [(r['external_id'], r['title'], r['status_raw'], r['status'], r['state_class'], r['assignee'], r['updated_raw'], now) for r in rows])
        state_counts, status_counts, class_counts = {}, {}, {}
        for r in rows:
            state_counts[r['status_raw']] = state_counts.get(r['status_raw'], 0) + 1
            class_counts[r['state_class']] = class_counts.get(r['state_class'], 0) + 1
            if r['status']:
                status_counts[r['status']] = status_counts.get(r['status'], 0) + 1
        meta.update(last_success_at=now, snapshot_board=board, snapshot_pinned=bool(board), state_counts=state_counts, status_counts=status_counts, class_counts=class_counts,
                    **{k: result[k] for k in ('received', 'rejected', 'archived_skipped', 'duplicates', 'unique', 'stored', 'dropped', 'truncated')})
    c.execute('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)', ('kanban', json.dumps(meta)))
    if manual or previous != result['status']:
        kept = ' (showing the last good read)' if meta['last_success_at'] and result['status'] != 'connected' else ''
        event(c, now, {'connected': 'Hermes Kanban read (read-only)', 'not_connected': 'Hermes Kanban not connected', 'failed': 'Hermes Kanban read failed'}[result['status']] + kept,
              'error' if result['status'] == 'failed' else 'connection')
    return meta
