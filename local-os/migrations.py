"""Versioned, additive SQLite migrations for the Keystal OS workbench.

Rules: a shipped migration is never edited (append a new one); migrations only add
tables, indexes and triggers; each runs in one transaction; an existing database is
copied aside before its first migration; a database newer than this code is refused.
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
]
LATEST = len(MIGRATIONS)


def _has_tables(c):
    return c.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchone()[0] > 0


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
    """Bring `db` to the latest schema. Returns {'from', 'to', 'backup'}."""
    db = Path(db)
    c = sqlite3.connect(db, timeout=15, isolation_level=None)
    try:
        current = c.execute('PRAGMA user_version').fetchone()[0]
        if current > LATEST:
            raise RuntimeError(f'Database schema v{current} is newer than this Keystal OS (v{LATEST}). Refusing to open it.')
        backup = None
        if current < LATEST and _has_tables(c):
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
