"""Versioned, additive SQLite migrations for the Keystal OS workbench.

Rules: a shipped migration is never edited (append a new one; tests pin their hashes);
migrations only add tables, columns, indexes and triggers; each runs in one transaction;
an existing database is copied aside (SQLite online backup) before its first migration; a
database newer than this code is refused; a database holding tables that a pending migration
would create with a different shape (for example another implementation's `agents` table) is
refused before anything is written. `CREATE TABLE IF NOT EXISTS` is not reconciliation.
"""
import datetime as dt
import os
from pathlib import Path
import re
import sqlite3

STATUSES = "'queued','running','awaiting_review','blocked','failed','paused','completed','stale'"
SOURCES = "'observed','manual','agent_reported'"
NOW = "strftime('%Y-%m-%dT%H:%M:%S+00:00','now')"

MIGRATIONS = [
    ('captures, chat and activity (original schema)', [
        "CREATE TABLE IF NOT EXISTS captures(id TEXT PRIMARY KEY,title TEXT NOT NULL,lane TEXT NOT NULL,owner TEXT NOT NULL,due TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'inbox',pinned INTEGER DEFAULT 0,created TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS threads(id TEXT PRIMARY KEY,title TEXT NOT NULL,session_id TEXT,created TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,thread_id TEXT NOT NULL,role TEXT NOT NULL,body TEXT NOT NULL,created TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,thread_id TEXT NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL,ended TEXT,error TEXT,request_key TEXT UNIQUE NOT NULL,payload_hash TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,label TEXT NOT NULL,created TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)",
    ]),
    ('agents, agent tasks, history, evidence and Hermes Kanban snapshot', [
        "CREATE TABLE IF NOT EXISTS agents(id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL,integration TEXT NOT NULL CHECK(integration IN ('local_cli','manual')),position INTEGER NOT NULL,created TEXT NOT NULL)",
        f"""CREATE TABLE IF NOT EXISTS agent_tasks(
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            agent_id TEXT REFERENCES agents(id),
            status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ({STATUSES})),
            status_source TEXT NOT NULL CHECK(status_source IN ({SOURCES})),
            review_state TEXT NOT NULL DEFAULT 'none' CHECK(review_state IN ('none','pending','approved','rejected')),
            requires_review INTEGER NOT NULL DEFAULT 1 CHECK(requires_review IN (0,1)),
            priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
            lane TEXT NOT NULL DEFAULT 'Operate',
            due TEXT NOT NULL DEFAULT '',
            created TEXT NOT NULL,
            updated TEXT NOT NULL,
            status_changed TEXT NOT NULL)""",
        "CREATE INDEX IF NOT EXISTS agent_tasks_agent_status ON agent_tasks(agent_id,status)",
        f"""CREATE TABLE IF NOT EXISTS agent_task_history(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL REFERENCES agent_tasks(id),
            at TEXT NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('created','status','assigned','edited','note','evidence','review')),
            field TEXT NOT NULL DEFAULT '',
            from_value TEXT,
            to_value TEXT,
            note TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL CHECK(source IN ({SOURCES})),
            actor TEXT NOT NULL)""",
        "CREATE INDEX IF NOT EXISTS agent_task_history_task ON agent_task_history(task_id,id)",
        f"""CREATE TABLE IF NOT EXISTS agent_task_evidence(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL REFERENCES agent_tasks(id),
            at TEXT NOT NULL,
            label TEXT NOT NULL,
            url TEXT NOT NULL DEFAULT '',
            note TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL CHECK(source IN ({SOURCES})))""",
        "CREATE INDEX IF NOT EXISTS agent_task_evidence_task ON agent_task_evidence(task_id,id)",
        # The audit trail is append-only at the database level.
        "CREATE TRIGGER IF NOT EXISTS agent_task_history_no_update BEFORE UPDATE ON agent_task_history BEGIN SELECT RAISE(ABORT,'history is append-only'); END",
        "CREATE TRIGGER IF NOT EXISTS agent_task_history_no_delete BEFORE DELETE ON agent_task_history BEGIN SELECT RAISE(ABORT,'history is append-only'); END",
        "CREATE TRIGGER IF NOT EXISTS agent_task_evidence_no_update BEFORE UPDATE ON agent_task_evidence BEGIN SELECT RAISE(ABORT,'evidence is append-only'); END",
        "CREATE TRIGGER IF NOT EXISTS agent_task_evidence_no_delete BEFORE DELETE ON agent_task_evidence BEGIN SELECT RAISE(ABORT,'evidence is append-only'); END",
        # Read-only copy of what `hermes kanban list --json` last returned. Never edited from this app.
        "CREATE TABLE IF NOT EXISTS kanban_snapshot(external_id TEXT PRIMARY KEY,title TEXT NOT NULL,status_raw TEXT NOT NULL,status TEXT,assignee TEXT,updated_raw TEXT,fetched TEXT NOT NULL)",
        # The five agents are registry entries, not activity. Their status is always derived from real records.
        f"INSERT OR IGNORE INTO agents(id,name,role,integration,position,created) VALUES('hermes','Hermes','Local operator · Ask Keystal bridge','local_cli',1,{NOW})",
        f"INSERT OR IGNORE INTO agents(id,name,role,integration,position,created) VALUES('chatgpt','ChatGPT','General assistant','manual',2,{NOW})",
        f"INSERT OR IGNORE INTO agents(id,name,role,integration,position,created) VALUES('claude','Claude','Writing and analysis','manual',3,{NOW})",
        f"INSERT OR IGNORE INTO agents(id,name,role,integration,position,created) VALUES('codex','Codex','Coding agent','manual',4,{NOW})",
        f"INSERT OR IGNORE INTO agents(id,name,role,integration,position,created) VALUES('gemini','Gemini','Research assistant','manual',5,{NOW})",
    ]),
    ('projects, external references, session identities, completion gate, snapshot state class', [
        # Plain CREATE (no IF NOT EXISTS): a name collision must fail loudly and roll back, never be skipped.
        "CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,name_key TEXT NOT NULL UNIQUE,created TEXT NOT NULL)",
        "ALTER TABLE agent_tasks ADD COLUMN project_id TEXT REFERENCES projects(id)",
        "CREATE INDEX agent_tasks_project ON agent_tasks(project_id)",
        # A link between a local task and a record in a system that owns that record. Identity is
        # provider + instance/profile + board/workspace + external id, so ids from different boards,
        # profiles or workspaces never collide and one external record maps to exactly one local task.
        f"""CREATE TABLE external_refs(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL REFERENCES agent_tasks(id),
            provider TEXT NOT NULL CHECK(provider IN ('clickup','hermes_kanban')),
            instance TEXT NOT NULL CHECK(length(instance)>0),
            scope TEXT NOT NULL CHECK(length(scope)>0),
            external_id TEXT NOT NULL CHECK(length(external_id)>0),
            context TEXT NOT NULL DEFAULT '',
            url TEXT NOT NULL DEFAULT '',
            label TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL CHECK(source IN ({SOURCES})),
            created TEXT NOT NULL,
            UNIQUE(provider,instance,scope,external_id))""",
        # Idempotent task creation: a retried or double-submitted create returns the first task, never a second one.
        "CREATE TABLE agent_task_requests(request_key TEXT PRIMARY KEY CHECK(length(request_key) BETWEEN 16 AND 80),task_id TEXT NOT NULL REFERENCES agent_tasks(id),payload_hash TEXT NOT NULL,created TEXT NOT NULL)",
        "CREATE INDEX external_refs_task ON external_refs(task_id)",
        "CREATE TRIGGER external_refs_immutable BEFORE UPDATE ON external_refs BEGIN SELECT RAISE(ABORT,'a link cannot be edited; unlink and link again'); END",
        # Opaque identifiers an agent's own system gave to the work (session / run). Never transcripts.
        f"""CREATE TABLE agent_task_sessions(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL REFERENCES agent_tasks(id),
            agent_id TEXT NOT NULL REFERENCES agents(id),
            session_ref TEXT NOT NULL CHECK(length(session_ref)>0),
            run_ref TEXT NOT NULL DEFAULT '',
            note TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL CHECK(source IN ({SOURCES})),
            created TEXT NOT NULL,
            UNIQUE(task_id,agent_id,session_ref,run_ref))""",
        "CREATE INDEX agent_task_sessions_task ON agent_task_sessions(task_id)",
        "CREATE INDEX agent_task_sessions_ref ON agent_task_sessions(agent_id,session_ref)",
        "CREATE TRIGGER agent_task_sessions_no_update BEFORE UPDATE ON agent_task_sessions BEGIN SELECT RAISE(ABORT,'session records are append-only'); END",
        "CREATE TRIGGER agent_task_sessions_no_delete BEFORE DELETE ON agent_task_sessions BEGIN SELECT RAISE(ABORT,'session records are append-only'); END",
        # Source state class of each Hermes board record (open/active/attention/closed/scheduled/unknown).
        "ALTER TABLE kanban_snapshot ADD COLUMN state_class TEXT",
        # The approval gate lives in the database so that no write path (API, import, hook, manual SQL)
        # can complete a review-required task without an approved review and at least one evidence item.
        "CREATE TRIGGER agent_tasks_completion_gate_insert BEFORE INSERT ON agent_tasks WHEN NEW.status='completed' AND NEW.requires_review=1 BEGIN SELECT RAISE(ABORT,'completion needs an approved review with evidence'); END",
        # An UPDATE may not CREATE an unapproved completion. A row that was already in that state before this gate
        # existed (schema v2 let the owner switch review on after completing) keeps working for notes, evidence and
        # reopening; it is flagged in the UI and by db_tool, never silently rewritten.
        "CREATE TRIGGER agent_tasks_completion_gate_update BEFORE UPDATE ON agent_tasks WHEN NEW.status='completed' AND NEW.requires_review=1 AND (NEW.review_state!='approved' OR NOT EXISTS(SELECT 1 FROM agent_task_evidence e WHERE e.task_id=NEW.id)) AND NOT (OLD.status='completed' AND OLD.requires_review=1 AND OLD.review_state IS NEW.review_state) BEGIN SELECT RAISE(ABORT,'completion needs an approved review with evidence'); END",
        "CREATE TRIGGER agent_tasks_approved_only_when_completed_insert BEFORE INSERT ON agent_tasks WHEN NEW.review_state='approved' AND NEW.status!='completed' BEGIN SELECT RAISE(ABORT,'an approved review belongs to a completed task'); END",
        "CREATE TRIGGER agent_tasks_approved_only_when_completed_update BEFORE UPDATE ON agent_tasks WHEN NEW.review_state='approved' AND NEW.status!='completed' BEGIN SELECT RAISE(ABORT,'an approved review belongs to a completed task'); END",
    ]),
    ('edit revision on every task (optimistic concurrency, ported from the other local implementation)', [
        "ALTER TABLE agent_tasks ADD COLUMN revision INTEGER NOT NULL DEFAULT 1",
        # Every write path bumps it, including ones added later: a second browser tab saving over a newer version is
        # refused with 409 instead of silently winning. recursive_triggers is off, so the inner UPDATE does not loop.
        "CREATE TRIGGER agent_tasks_revision AFTER UPDATE ON agent_tasks WHEN NEW.revision = OLD.revision BEGIN UPDATE agent_tasks SET revision = OLD.revision + 1 WHERE id = NEW.id; END",
    ]),
]
LATEST = len(MIGRATIONS)


class ConflictError(RuntimeError):
    """The database holds tables a pending migration would create with a different shape."""
    def __init__(self, conflicts):
        self.conflicts = conflicts
        names = ', '.join(sorted({c['name'] for c in conflicts}))
        super().__init__(f'Database schema conflict ({names}). Nothing was changed. Run `python3 local-os/tools/db_tool.py inspect` and see local-os/README.md (Schema conflicts).')


def _user_tables(c):
    return {r[0]: [x[1] for x in c.execute(f'PRAGMA table_info("{_q(r[0])}")')]
            for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")}


def _q(name):
    return name.replace('"', '""')


def _norm_sql(sql):
    """Compare CREATE TABLE text ignoring case, whitespace and IF NOT EXISTS (the original app used IF NOT EXISTS)."""
    sql = re.sub(r'\s+', ' ', (sql or '').lower()).replace('if not exists ', '')
    return re.sub(r'\s*([(),=])\s*', r'\1', sql).strip()


def _shapes(c):
    """Full structure per table: ordered (name, type, notnull, default, pk) plus normalised CREATE text (CHECKs, UNIQUE, REFERENCES)."""
    out = {}
    for name, sql in c.execute("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"):
        cols = [(x[1], (x[2] or '').upper(), x[3], x[4], x[5]) for x in c.execute(f'PRAGMA table_info("{_q(name)}")')]
        out[name] = {'columns': cols, 'sql': _norm_sql(sql)}
    return out


def _differs(a, b):
    if [x[0] for x in a['columns']] != [x[0] for x in b['columns']]:
        return 'different columns'
    if a['columns'] != b['columns']:
        return 'same column names but different types, NOT NULL, defaults or primary key'
    if a['sql'] != b['sql']:
        return 'same columns but different constraints (CHECK, UNIQUE or REFERENCES)'
    return None


def _objects(c):
    return {r[0]: (r[1], r[2]) for r in c.execute("SELECT name,type,tbl_name FROM sqlite_master WHERE type IN ('index','trigger') AND name NOT LIKE 'sqlite_%'")}


def declared(upto):
    """Table shapes (name -> shape) and index/trigger names (name -> table) that migrations 1..upto declare."""
    mem = sqlite3.connect(':memory:', isolation_level=None)
    try:
        for _, statements in MIGRATIONS[:upto]:
            for statement in statements:
                mem.execute(statement)
        return _shapes(mem), {k: v[1] for k, v in _objects(mem).items()}
    finally:
        mem.close()


def _kinds(c):
    """Every named schema object and its type. Tables, views, indexes and triggers share one namespace."""
    return {r[0]: r[1] for r in c.execute("SELECT name,type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")}


def _declared_kinds(upto):
    mem = sqlite3.connect(':memory:', isolation_level=None)
    try:
        for _, statements in MIGRATIONS[:upto]:
            for statement in statements:
                mem.execute(statement)
        return _kinds(mem)
    finally:
        mem.close()


def _conflicts(c, current):
    """Each conflict has a kind:
    altered     a table this schema version already owns is missing or has a different shape (the owner's own data)
    preexisting a table a pending migration would create already exists with a different shape (another implementation)
    object      an index or trigger name a pending migration would create is already taken
    namespace   a name a migration needs is held by a different kind of object (for example a view named like a table)"""
    live, live_objects, live_kinds = _shapes(c), _objects(c), _kinds(c)
    names = lambda shape: [x[0] for x in shape['columns']] if shape else None
    conflicts = []
    now_tables, _ = declared(current)
    now_kinds = _declared_kinds(current)
    for name, kind in now_kinds.items():
        if name in live_kinds and live_kinds[name] != kind:
            conflicts.append({'kind': 'namespace', 'name': name, 'reason': f'schema v{current} has a {kind} named {name}, but this database has a {live_kinds[name]} with that name', 'live_columns': None, 'declared_columns': None})
    for name, shape in now_tables.items():
        if name in live_kinds and live_kinds[name] != 'table':
            continue
        if name not in live:
            conflicts.append({'kind': 'altered', 'name': name, 'reason': f'table expected at schema v{current} is missing', 'live_columns': None, 'declared_columns': names(shape)})
        elif _differs(live[name], shape):
            conflicts.append({'kind': 'altered', 'name': name, 'reason': f'table does not match schema v{current}: {_differs(live[name], shape)}', 'live_columns': names(live[name]), 'declared_columns': names(shape)})
    seen = set(now_kinds)
    for version in range(current + 1, LATEST + 1):
        tables, objects = declared(version)
        kinds = _declared_kinds(version)
        before_kinds = _declared_kinds(version - 1) if version > 1 else {}
        for name, kind in kinds.items():
            if name in before_kinds or name in seen:
                continue
            seen.add(name)
            if name in live_kinds and live_kinds[name] != kind:
                conflicts.append({'kind': 'namespace', 'name': name, 'reason': f'migration {version} creates a {kind} named {name}, but this database already has a {live_kinds[name]} with that name', 'live_columns': None, 'declared_columns': None})
            elif kind == 'table' and name in live and _differs(live[name], tables[name]):
                conflicts.append({'kind': 'preexisting', 'name': name, 'reason': f'a table named {name} already exists ({_differs(live[name], tables[name])}); migration {version} would skip or break on it', 'live_columns': names(live[name]), 'declared_columns': names(tables[name])})
            elif kind in ('index', 'trigger') and name in live_objects:
                owner = objects[name]
                if not (owner in live and live_objects[name][1] == owner and not _differs(live[owner], tables[owner])):
                    conflicts.append({'kind': 'object', 'name': name, 'reason': f'an {kind} named {name} already exists (on {live_objects[name][1]})', 'live_columns': None, 'declared_columns': None})
    return conflicts


def invariants(c):
    """Data conditions worth flagging. A completed, review-required task without an approved review and evidence can
    exist only from before the database gate (schema v2 allowed switching review on after completion) or a bypass."""
    tables = _user_tables(c)
    out = {}
    if 'agent_tasks' in tables and 'agent_task_evidence' in tables:
        out['completed_without_approval_and_evidence'] = c.execute("""SELECT COUNT(*) FROM agent_tasks t WHERE t.status='completed' AND t.requires_review=1
            AND (t.review_state!='approved' OR NOT EXISTS(SELECT 1 FROM agent_task_evidence e WHERE e.task_id=t.id))""").fetchone()[0]
    try:
        out['foreign_key_violations'] = len(c.execute('PRAGMA foreign_key_check').fetchall())
    except sqlite3.OperationalError as exc:  # e.g. 'foreign key mismatch' in a foreign table's REFERENCES
        out['foreign_key_violations'] = 0
        out['foreign_key_check_error'] = str(exc)[:200]
    return out


def ro_uri(db):
    """A read-only SQLite URI for any path: '#', '?' and '%' in a folder name must not change which file is opened."""
    return Path(db).resolve().as_uri() + '?mode=ro'


def needs_recovery(db):
    """True when SQLite itself says a HOT journal must be rolled back (a writer died mid-transaction), which a read-only
    connection cannot do. A journal that exists because a live writer is mid-transaction is not hot: reads just wait."""
    db = Path(db)
    if not db.exists():
        return False
    c = sqlite3.connect(ro_uri(db), uri=True, timeout=15)
    try:
        c.execute('SELECT COUNT(*) FROM sqlite_master').fetchone()
        return False
    except sqlite3.OperationalError as exc:
        if 'readonly' in str(exc).lower() or 'read-only' in str(exc).lower():
            return True
        raise
    finally:
        c.close()


def recover(db):
    """Let SQLite roll back an interrupted transaction, exactly as any read-write open does. Returns integrity_check."""
    c = sqlite3.connect(db, timeout=15)
    try:
        return c.execute('PRAGMA integrity_check').fetchone()[0]
    finally:
        c.close()


def plan(db):
    """Read-only look at what migrating `db` would do. Never writes, never creates the file."""
    db = Path(db)
    if not db.exists():
        return {'exists': False, 'current': 0, 'latest': LATEST, 'pending': LATEST, 'has_data': False, 'conflicts': []}
    if needs_recovery(db):
        return {'exists': True, 'needs_recovery': True, 'current': None, 'latest': LATEST, 'pending': None, 'has_data': True, 'conflicts': []}
    c = sqlite3.connect(ro_uri(db), uri=True)
    try:
        current = c.execute('PRAGMA user_version').fetchone()[0]
        if current < 0:
            return {'exists': True, 'current': current, 'latest': LATEST, 'pending': None, 'has_data': True, 'conflicts': [], 'invalid_version': True}
        has_data = bool(_user_tables(c))
        conflicts = _conflicts(c, current) if current <= LATEST else []
        return {'exists': True, 'current': current, 'latest': LATEST, 'pending': max(LATEST - current, 0), 'has_data': has_data, 'conflicts': conflicts,
                'newer_than_code': current > LATEST, 'invariants': invariants(c)}
    finally:
        c.close()


def _backup(c, db, version):
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    target = db.with_name(f'{db.stem}.backup-v{version}-{stamp}{db.suffix}')
    os.close(os.open(target, os.O_CREAT | os.O_WRONLY, 0o600))
    dest = sqlite3.connect(target)
    try:
        c.backup(dest)
    finally:
        dest.close()
    os.chmod(target, 0o600)
    return target


def migrate(db):
    """Bring `db` to the latest schema. Returns {'from', 'to', 'backup'}.
    Raises ConflictError (before writing anything) if the schema is not one this code can extend."""
    db = Path(db)
    state = plan(db)
    if state.get('needs_recovery'):
        raise RuntimeError(f'{db} has an interrupted transaction (a hot -journal file). Recover it first (the server does this on start); nothing was changed.')
    if state.get('invalid_version'):
        raise RuntimeError(f"Database user_version {state['current']} is not one this code writes. Refusing to touch it.")
    if state.get('newer_than_code'):
        raise RuntimeError(f"Database schema v{state['current']} is newer than this Keystal OS (v{LATEST}). Refusing to open it.")
    if state['conflicts']:
        raise ConflictError(state['conflicts'])
    c = sqlite3.connect(db, timeout=15, isolation_level=None)
    try:
        current = c.execute('PRAGMA user_version').fetchone()[0]
        backup = None
        if current < LATEST and state['has_data']:
            backup = _backup(c, db, current)
        for version in range(current + 1, LATEST + 1):
            c.execute('BEGIN IMMEDIATE')
            try:
                for statement in MIGRATIONS[version - 1][1]:
                    c.execute(statement)
                c.execute(f'PRAGMA user_version={version}')
                c.execute('COMMIT')
            except BaseException:
                c.execute('ROLLBACK')
                raise
        return {'from': current, 'to': LATEST, 'backup': str(backup) if backup else None}
    finally:
        c.close()
