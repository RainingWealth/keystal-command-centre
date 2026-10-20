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
            url TEXT NOT NULL DEFAULT '',
            label TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL CHECK(source IN ({SOURCES})),
            created TEXT NOT NULL,
            UNIQUE(provider,instance,scope,external_id))""",
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
        "CREATE TRIGGER agent_tasks_completion_gate_update BEFORE UPDATE ON agent_tasks WHEN NEW.status='completed' AND NEW.requires_review=1 AND (NEW.review_state!='approved' OR NOT EXISTS(SELECT 1 FROM agent_task_evidence e WHERE e.task_id=NEW.id)) BEGIN SELECT RAISE(ABORT,'completion needs an approved review with evidence'); END",
        "CREATE TRIGGER agent_tasks_approved_only_when_completed_insert BEFORE INSERT ON agent_tasks WHEN NEW.review_state='approved' AND NEW.status!='completed' BEGIN SELECT RAISE(ABORT,'an approved review belongs to a completed task'); END",
        "CREATE TRIGGER agent_tasks_approved_only_when_completed_update BEFORE UPDATE ON agent_tasks WHEN NEW.review_state='approved' AND NEW.status!='completed' BEGIN SELECT RAISE(ABORT,'an approved review belongs to a completed task'); END",
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
    return {r[0]: [x[1] for x in c.execute(f'PRAGMA table_info("{r[0]}")')]
            for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")}


def _objects(c):
    return {r[0]: (r[1], r[2]) for r in c.execute("SELECT name,type,tbl_name FROM sqlite_master WHERE type IN ('index','trigger') AND name NOT LIKE 'sqlite_%'")}


def declared(upto):
    """Tables (name -> columns) and index/trigger names (name -> table) that migrations 1..upto declare."""
    mem = sqlite3.connect(':memory:', isolation_level=None)
    try:
        for _, statements in MIGRATIONS[:upto]:
            for statement in statements:
                mem.execute(statement)
        return _user_tables(mem), {k: v[1] for k, v in _objects(mem).items()}
    finally:
        mem.close()


def _conflicts(c, current):
    live_tables, live_objects = _user_tables(c), _objects(c)
    conflicts = []
    now_tables, _ = declared(current)
    for name, cols in now_tables.items():
        if name not in live_tables:
            conflicts.append({'name': name, 'reason': f'table expected at schema v{current} is missing', 'live_columns': None, 'declared_columns': cols})
        elif set(live_tables[name]) != set(cols):
            conflicts.append({'name': name, 'reason': f'table does not have the shape schema v{current} declares', 'live_columns': live_tables[name], 'declared_columns': cols})
    seen = set(now_tables)
    for version in range(current + 1, LATEST + 1):
        tables, objects = declared(version)
        before_tables, before_objects = declared(version - 1) if version > 1 else ({}, {})
        for name in tables:
            if name in before_tables or name in seen:
                continue
            seen.add(name)
            if name in live_tables and set(live_tables[name]) != set(tables[name]):
                conflicts.append({'name': name, 'reason': f'a table named {name} already exists with different columns; migration {version} would skip or break on it', 'live_columns': live_tables[name], 'declared_columns': tables[name]})
        for name, owner in objects.items():
            if name in before_objects:
                continue
            if name in live_objects and not (owner in live_tables and live_objects[name][1] == owner and set(live_tables.get(owner, [])) == set(tables.get(owner, []))):
                conflicts.append({'name': name, 'reason': f'an index or trigger named {name} already exists (on {live_objects[name][1]})', 'live_columns': None, 'declared_columns': None})
    return conflicts


def plan(db):
    """Read-only look at what migrating `db` would do. Never writes, never creates the file."""
    db = Path(db)
    if not db.exists():
        return {'exists': False, 'current': 0, 'latest': LATEST, 'pending': LATEST, 'has_data': False, 'conflicts': []}
    c = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
    try:
        current = c.execute('PRAGMA user_version').fetchone()[0]
        has_data = bool(_user_tables(c))
        conflicts = _conflicts(c, current) if current <= LATEST else []
        return {'exists': True, 'current': current, 'latest': LATEST, 'pending': max(LATEST - current, 0), 'has_data': has_data, 'conflicts': conflicts, 'newer_than_code': current > LATEST}
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
