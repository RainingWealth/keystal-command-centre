import hashlib
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import migrations  # noqa: E402

LEGACY_SCHEMA = [s for s in migrations.MIGRATIONS[0][1]]


def legacy_db(path):
    """A database exactly as the pre-agents app left it: original tables, user_version 0, real rows."""
    c = sqlite3.connect(path)
    for statement in LEGACY_SCHEMA:
        c.execute(statement)
    c.execute("INSERT INTO captures VALUES('c1','Synthetic capture','Build','QA','2026-10-20','inbox',1,'2026-10-19T00:00:00+00:00')")
    c.execute("INSERT INTO threads VALUES('t1','Synthetic thread','sess1','2026-10-19T00:00:00+00:00')")
    c.execute("INSERT INTO messages VALUES('m1','t1','user','hello','2026-10-19T00:00:00+00:00')")
    c.execute("INSERT INTO runs VALUES('r1','t1','completed','2026-10-19T00:00:00+00:00','2026-10-19T00:01:00+00:00',NULL,'key-1','hash')")
    c.execute("INSERT INTO events(kind,label,created) VALUES('capture','Capture saved locally','2026-10-19T00:00:00+00:00')")
    c.execute("INSERT INTO meta VALUES('chat','{\"status\": \"verified\"}')")
    c.commit()
    c.close()


FROZEN_HASHES = {  # SHA-256 of each shipped migration's statements as they are in PR #1 head e0aea41 (not merged yet). Never edit a shipped migration.
    1: '43ac9a096b98a50e064d599bf3c2702b8f1f2c70ca5e92fdc9f93018d18d81ce',
    2: '033e4ba47f06179cdd65aacb1b6f2bdcefdb00157f33f2a852853ba3d963db3f',
}


def pr_v2_db(path, with_rows=True):
    """A database exactly as PR #1's server leaves it: schema v2, with real rows in every table."""
    c = sqlite3.connect(path)
    for _, statements in migrations.MIGRATIONS[:2]:
        for statement in statements:
            c.execute(statement)
    c.execute('PRAGMA user_version=2')
    if with_rows:
        c.execute("INSERT INTO captures VALUES('c1','Synthetic capture','Build','QA','2026-10-20','inbox',1,'2026-10-19T00:00:00+00:00')")
        c.execute("INSERT INTO messages VALUES('m1','t0','user','hello','2026-10-19T00:00:00+00:00')")
        c.execute("INSERT INTO agent_tasks(id,title,agent_id,status,status_source,review_state,requires_review,created,updated,status_changed) VALUES('a1','Synthetic task','claude','awaiting_review','agent_reported','pending',1,'n','n','n')")
        c.execute("INSERT INTO agent_tasks(id,title,agent_id,status,status_source,review_state,requires_review,created,updated,status_changed) VALUES('a2','Done without review','codex','completed','manual','none',0,'n','n','n')")
        c.execute("INSERT INTO agent_task_history(task_id,at,kind,source,actor) VALUES('a1','n','created','manual','You')")
        c.execute("INSERT INTO agent_task_evidence(task_id,at,label,url,source) VALUES('a1','n','Output','https://example.com/x','agent_reported')")
        c.execute("INSERT INTO kanban_snapshot VALUES('t1','Synthetic card','running','running','coder',NULL,'2026-10-19T00:00:00+00:00')")
        c.execute("INSERT INTO meta VALUES('kanban', ?)", ('{"status": "connected", "detail": "Read 1 task", "checked_at": "2026-10-19T00:00:00+00:00", "count": 1}',))
    c.commit()
    c.close()


def foreign_db(path, colliding_names=False):
    """Stand-in for another implementation's database (its real schema was not available to this suite):
    the original tables plus an `agents` table with different columns and a `tasks` table."""
    c = sqlite3.connect(path)
    for statement in migrations.MIGRATIONS[0][1]:
        c.execute(statement)
    c.execute("CREATE TABLE agents(id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT,status TEXT)")
    c.execute("CREATE TABLE tasks(id TEXT PRIMARY KEY,title TEXT NOT NULL,status TEXT NOT NULL,agent_id TEXT,review TEXT)")
    c.execute("INSERT INTO agents VALUES('hermes','Hermes','cli','ok')")
    c.execute("INSERT INTO tasks VALUES('f1','Foreign task','completed','hermes','pending')")
    c.execute("INSERT INTO captures VALUES('c1','Synthetic capture','Build','QA','','inbox',0,'n')")
    if colliding_names:
        c.execute("CREATE TABLE agent_tasks(id TEXT PRIMARY KEY,title TEXT,state TEXT)")
        c.execute("CREATE INDEX agent_tasks_agent_status ON agent_tasks(state)")
        c.execute("INSERT INTO agent_tasks VALUES('f2','Foreign agent task','done')")
    c.commit()
    c.close()


def dump(path):
    c = sqlite3.connect(path)
    try:
        return '\n'.join(c.iterdump())
    finally:
        c.close()


def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / 'workbench.sqlite3'

    def tearDown(self):
        self.tmp.cleanup()

    def version(self, path=None):
        c = sqlite3.connect(path or self.db)
        try:
            return c.execute('PRAGMA user_version').fetchone()[0]
        finally:
            c.close()

    def test_fresh_database_reaches_latest_without_backup(self):
        result = migrations.migrate(self.db)
        self.assertEqual((result['from'], result['to'], result['backup']), (0, migrations.LATEST, None))
        self.assertEqual(self.version(), migrations.LATEST)

    def test_legacy_database_keeps_every_row_and_is_backed_up_first(self):
        legacy_db(self.db)
        result = migrations.migrate(self.db)
        self.assertEqual(result['from'], 0)
        c = sqlite3.connect(self.db)
        self.assertEqual(c.execute('SELECT title,pinned FROM captures').fetchall(), [('Synthetic capture', 1)])
        self.assertEqual(c.execute('SELECT body FROM messages').fetchall(), [('hello',)])
        self.assertEqual(c.execute('SELECT request_key FROM runs').fetchall(), [('key-1',)])
        self.assertEqual(c.execute("SELECT value FROM meta WHERE key='chat'").fetchone()[0], '{"status": "verified"}')
        self.assertEqual(c.execute('SELECT COUNT(*) FROM events').fetchone()[0], 1)
        c.close()
        backup = Path(result['backup'])
        self.assertTrue(backup.is_file())
        self.assertEqual(backup.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.version(backup), 0, 'backup must be the untouched pre-migration copy')
        b = sqlite3.connect(backup)
        self.assertEqual(b.execute("SELECT COUNT(*) FROM sqlite_master WHERE name='agent_tasks'").fetchone()[0], 0)
        self.assertEqual(b.execute('SELECT COUNT(*) FROM captures').fetchone()[0], 1)
        b.close()

    def test_migrating_twice_is_a_no_op(self):
        legacy_db(self.db)
        migrations.migrate(self.db)
        before = sorted(p.name for p in Path(self.tmp.name).iterdir())
        again = migrations.migrate(self.db)
        self.assertEqual((again['from'], again['to'], again['backup']), (migrations.LATEST, migrations.LATEST, None))
        self.assertEqual(sorted(p.name for p in Path(self.tmp.name).iterdir()), before)

    def test_five_agents_seeded_once_and_reseeding_never_overwrites_owner_edits(self):
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        c.execute("UPDATE agents SET role='Edited by owner' WHERE id='claude'")
        for statement in migrations.MIGRATIONS[1][1]:
            if statement.startswith('INSERT OR IGNORE INTO agents'):
                c.execute(statement)  # what a re-run of the seed would do
        c.commit()
        self.assertEqual([r[0] for r in c.execute('SELECT name FROM agents ORDER BY position')], ['Hermes', 'ChatGPT', 'Claude', 'Codex', 'Gemini'])
        self.assertEqual(c.execute("SELECT role FROM agents WHERE id='claude'").fetchone()[0], 'Edited by owner')
        c.close()

    def test_database_from_a_newer_version_is_refused_untouched(self):
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        c.execute(f'PRAGMA user_version={migrations.LATEST + 1}')
        c.commit()
        c.close()
        with self.assertRaisesRegex(RuntimeError, 'newer'):
            migrations.migrate(self.db)
        self.assertEqual(self.version(), migrations.LATEST + 1)

    def test_failed_migration_rolls_back_completely(self):
        legacy_db(self.db)
        original = list(migrations.MIGRATIONS)
        # Valid SQL that only fails against THIS database (the legacy row 'c1' already exists), after creating a table.
        migrations.MIGRATIONS.append(('broken', ['CREATE TABLE half_done(id INTEGER)', "INSERT INTO captures VALUES('c1','dup','Build','QA','','inbox',0,'n')"]))
        migrations.LATEST = len(migrations.MIGRATIONS)
        try:
            with self.assertRaises(sqlite3.Error):
                migrations.migrate(self.db)
        finally:
            migrations.MIGRATIONS[:] = original
            migrations.LATEST = len(original)
        self.assertEqual(self.version(), len(original), 'earlier migrations stay applied, the failed one leaves no trace')
        c = sqlite3.connect(self.db)
        self.assertEqual(c.execute("SELECT COUNT(*) FROM sqlite_master WHERE name='half_done'").fetchone()[0], 0)
        self.assertEqual(c.execute('SELECT COUNT(*) FROM captures').fetchone()[0], 1)
        c.close()

    def test_history_and_evidence_are_append_only(self):
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        c.execute("INSERT INTO agent_tasks(id,title,status_source,created,updated,status_changed) VALUES('a','t','manual','n','n','n')")
        c.execute("INSERT INTO agent_task_history(task_id,at,kind,source,actor) VALUES('a','n','created','manual','You')")
        c.execute("INSERT INTO agent_task_evidence(task_id,at,label,source) VALUES('a','n','e','manual')")
        for sql in ("UPDATE agent_task_history SET note='x'", 'DELETE FROM agent_task_history', "UPDATE agent_task_evidence SET label='x'", 'DELETE FROM agent_task_evidence'):
            with self.assertRaisesRegex(sqlite3.DatabaseError, 'append-only'):
                c.execute(sql)
        c.close()

    def test_database_rejects_invalid_status_and_provenance(self):
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        with self.assertRaises(sqlite3.IntegrityError):
            c.execute("INSERT INTO agent_tasks(id,title,status,status_source,created,updated,status_changed) VALUES('a','t','done','manual','n','n','n')")
        with self.assertRaises(sqlite3.IntegrityError):
            c.execute("INSERT INTO agent_tasks(id,title,status,status_source,created,updated,status_changed) VALUES('a','t','queued','telepathy','n','n','n')")
        c.close()

    def test_shipped_migrations_are_frozen(self):
        for version, expected in FROZEN_HASHES.items():
            actual = hashlib.sha256('\n'.join(migrations.MIGRATIONS[version - 1][1]).encode()).hexdigest()
            self.assertEqual(actual, expected, f'migration {version} was edited after shipping: add a new migration instead')

    def test_pr_v2_database_migrates_forward_keeping_every_row(self):
        pr_v2_db(self.db)
        before = dump(self.db)
        result = migrations.migrate(self.db)
        self.assertEqual((result['from'], result['to']), (2, migrations.LATEST))
        backup = Path(result['backup'])
        self.assertEqual(dump(backup), before, 'the backup holds exactly the PR-v2 schema and rows as they were (logical equality; SQLite rewrites the file layout)')
        c = sqlite3.connect(self.db)
        c.row_factory = sqlite3.Row
        self.assertEqual(c.execute("SELECT title FROM agent_tasks ORDER BY id").fetchall()[0][0], 'Synthetic task')
        self.assertEqual(c.execute('SELECT COUNT(*) FROM agent_tasks').fetchone()[0], 2)
        self.assertEqual(c.execute('SELECT COUNT(*) FROM agent_task_history').fetchone()[0], 1)
        self.assertEqual(c.execute('SELECT label FROM agent_task_evidence').fetchone()[0], 'Output')
        self.assertEqual(c.execute('SELECT external_id,state_class FROM kanban_snapshot').fetchall()[0][:], ('t1', None), 'old snapshot rows survive; their class is unknown until the next read')
        self.assertIsNone(c.execute("SELECT project_id FROM agent_tasks WHERE id='a1'").fetchone()[0])
        for table in ('projects', 'external_refs', 'agent_task_sessions'):
            self.assertEqual(c.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0], 0)
        self.assertEqual(c.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
        self.assertEqual(c.execute('PRAGMA foreign_key_check').fetchall(), [])
        c.close()
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        import agent_tasks
        c = sqlite3.connect(self.db)
        c.row_factory = sqlite3.Row
        view = agent_tasks.kanban_view(c, '2026-10-19T00:01:00+00:00')
        self.assertEqual((view['status'], view['last_success_at'], len(view['tasks'])), ('connected', '2026-10-19T00:00:00+00:00', 1), 'schema-v2 bookkeeping is still read correctly')
        c.close()

    def test_all_three_schemas_end_at_the_same_latest_shape(self):
        shapes = []
        for name, build in (('fresh', lambda p: None), ('original', legacy_db), ('pr_v2', pr_v2_db)):
            path = Path(self.tmp.name) / f'{name}.sqlite3'
            build(path)
            migrations.migrate(path)
            c = sqlite3.connect(path)
            shapes.append(({t: sorted(cols) for t, cols in migrations._user_tables(c).items()}, sorted(migrations._objects(c))))
            c.close()
        self.assertEqual(shapes[0], shapes[1], 'original -> latest ends in the same tables, columns, indexes and triggers as a fresh database')
        self.assertEqual(shapes[0], shapes[2], 'PR-v2 -> latest ends in the same shape too')

    def test_foreign_agents_schema_is_refused_before_anything_is_written(self):
        foreign_db(self.db)
        before = file_hash(self.db)
        with self.assertRaises(migrations.ConflictError) as raised:
            migrations.migrate(self.db)
        self.assertEqual([c['name'] for c in raised.exception.conflicts], ['agents'])
        self.assertEqual(raised.exception.conflicts[0]['live_columns'], ['id', 'name', 'kind', 'status'])
        self.assertEqual(file_hash(self.db), before, 'database bytes are identical: nothing written')
        self.assertEqual([p.name for p in Path(self.tmp.name).iterdir() if p.is_file()], ['workbench.sqlite3'], 'not even a backup or journal was created')
        self.assertEqual(self.version(), 0)

    def test_foreign_table_and_index_name_collisions_are_all_reported(self):
        foreign_db(self.db, colliding_names=True)
        names = sorted(c['name'] for c in migrations.plan(self.db)['conflicts'])
        self.assertEqual(names, ['agent_tasks', 'agent_tasks_agent_status', 'agents'])

    def test_unrelated_foreign_tables_alone_are_not_a_conflict(self):
        legacy_db(self.db)
        c = sqlite3.connect(self.db)
        c.execute('CREATE TABLE tasks(id TEXT PRIMARY KEY,title TEXT)')
        c.execute("INSERT INTO tasks VALUES('f1','Foreign')")
        c.commit()
        c.close()
        self.assertEqual(migrations.plan(self.db)['conflicts'], [])
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        self.assertEqual(c.execute('SELECT title FROM tasks').fetchone()[0], 'Foreign', 'unrelated tables are preserved')
        c.close()

    def test_tampered_pr_schema_is_refused(self):
        pr_v2_db(self.db)
        c = sqlite3.connect(self.db)
        c.execute('ALTER TABLE agent_tasks ADD COLUMN surprise TEXT')
        c.commit()
        c.close()
        names = [x['name'] for x in migrations.plan(self.db)['conflicts']]
        self.assertEqual(names, ['agent_tasks'])
        with self.assertRaises(migrations.ConflictError):
            migrations.migrate(self.db)

    def test_plan_is_read_only(self):
        missing = Path(self.tmp.name) / 'nope.sqlite3'
        self.assertEqual(migrations.plan(missing)['exists'], False)
        self.assertFalse(missing.exists(), 'planning never creates a database')
        pr_v2_db(self.db)
        before = file_hash(self.db)
        state = migrations.plan(self.db)
        self.assertEqual((state['current'], state['pending'], state['has_data'], state['conflicts']), (2, migrations.LATEST - 2, True, []))
        self.assertEqual(file_hash(self.db), before)
        self.assertEqual(sorted(p.name for p in Path(self.tmp.name).iterdir()), ['workbench.sqlite3'])

    def test_migrated_database_passes_integrity_and_foreign_key_checks(self):
        legacy_db(self.db)
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        self.assertEqual(c.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
        self.assertEqual(c.execute('PRAGMA foreign_key_check').fetchall(), [])
        c.close()


class DatabaseInvariants(unittest.TestCase):
    """The approval gate and link identity live in the database, so no write path can bypass them."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / 'w.sqlite3'
        migrations.migrate(self.db)
        self.c = sqlite3.connect(self.db)
        self.c.execute('PRAGMA foreign_keys=ON')
        self.addCleanup(self.tmp.cleanup)
        self.addCleanup(self.c.close)

    def task(self, tid='a', status='queued', review=1, state='none', agent='claude'):
        self.c.execute('INSERT INTO agent_tasks(id,title,agent_id,status,status_source,review_state,requires_review,created,updated,status_changed) VALUES(?,?,?,?,?,?,?,?,?,?)',
                       (tid, 'Synthetic', agent, status, 'manual', state, review, 'n', 'n', 'n'))

    def test_a_review_required_task_cannot_be_inserted_as_completed(self):
        with self.assertRaisesRegex(sqlite3.DatabaseError, 'approved review with evidence'):
            self.task(status='completed')
        with self.assertRaisesRegex(sqlite3.DatabaseError, 'approved review with evidence'):
            self.task(status='completed', state='approved')

    def test_completed_without_review_requirement_is_allowed(self):
        self.task(status='completed', review=0)

    def test_update_to_completed_needs_approval_and_evidence_each(self):
        self.task(status='awaiting_review', state='pending')
        with self.assertRaisesRegex(sqlite3.DatabaseError, 'approved review with evidence'):
            self.c.execute("UPDATE agent_tasks SET status='completed' WHERE id='a'")
        with self.assertRaisesRegex(sqlite3.DatabaseError, 'approved review with evidence'):
            self.c.execute("UPDATE agent_tasks SET status='completed',review_state='approved' WHERE id='a'")
        self.c.execute("INSERT INTO agent_task_evidence(task_id,at,label,source) VALUES('a','n','Output','manual')")
        with self.assertRaisesRegex(sqlite3.DatabaseError, 'approved review with evidence'):
            self.c.execute("UPDATE agent_tasks SET status='completed',review_state='pending' WHERE id='a'")
        self.c.execute("UPDATE agent_tasks SET status='completed',review_state='approved' WHERE id='a'")
        self.c.execute("UPDATE agent_tasks SET updated='later' WHERE id='a'")  # later bookkeeping on an approved task is fine

    def test_review_cannot_be_switched_back_on_for_an_unapproved_completed_task(self):
        self.task(status='completed', review=0)
        with self.assertRaisesRegex(sqlite3.DatabaseError, 'approved review with evidence'):
            self.c.execute("UPDATE agent_tasks SET requires_review=1 WHERE id='a'")

    def test_approved_belongs_only_to_a_completed_task(self):
        with self.assertRaisesRegex(sqlite3.DatabaseError, 'belongs to a completed task'):
            self.task(state='approved')
        self.task()
        with self.assertRaisesRegex(sqlite3.DatabaseError, 'belongs to a completed task'):
            self.c.execute("UPDATE agent_tasks SET review_state='approved' WHERE id='a'")

    def ref(self, task='a', provider='hermes_kanban', instance='local', scope='ops', external_id='t1'):
        self.c.execute('INSERT INTO external_refs(task_id,provider,instance,scope,external_id,source,created) VALUES(?,?,?,?,?,?,?)', (task, provider, instance, scope, external_id, 'manual', 'n'))

    def test_external_ref_identity_is_provider_instance_scope_and_id(self):
        self.task('a'); self.task('b')
        self.ref('a')
        for change in ({'scope': 'other-board'}, {'instance': 'work-profile'}, {'provider': 'clickup'}, {'external_id': 't2'}):
            self.ref('b', **change)  # any one part different is a different record
            self.c.execute("DELETE FROM external_refs WHERE task_id='b'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.ref('b')  # identical identity, even from another task
        with self.assertRaises(sqlite3.IntegrityError):
            self.ref('a')

    def test_external_ref_fields_cannot_be_empty_or_unknown(self):
        self.task()
        for bad in ({'instance': ''}, {'scope': ''}, {'external_id': ''}, {'provider': 'jira'}):
            with self.assertRaises(sqlite3.IntegrityError):
                self.ref(**bad)

    def test_a_link_cannot_be_edited_only_removed(self):
        self.task()
        self.ref()
        with self.assertRaisesRegex(sqlite3.DatabaseError, 'cannot be edited'):
            self.c.execute("UPDATE external_refs SET scope='x'")
        self.c.execute('DELETE FROM external_refs')

    def test_sessions_are_unique_and_append_only(self):
        self.task()
        add = lambda ref='s1', run='': self.c.execute("INSERT INTO agent_task_sessions(task_id,agent_id,session_ref,run_ref,source,created) VALUES('a','claude',?,?,'manual','n')", (ref, run))
        add(); add('s1', 'r1'); add('s2')
        with self.assertRaises(sqlite3.IntegrityError):
            add()
        for sql in ("UPDATE agent_task_sessions SET note='x'", 'DELETE FROM agent_task_sessions'):
            with self.assertRaisesRegex(sqlite3.DatabaseError, 'append-only'):
                self.c.execute(sql)

    def test_project_names_are_unique_ignoring_case_and_spacing_by_key(self):
        self.c.execute("INSERT INTO projects VALUES('p1','Alpha','alpha','n')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.c.execute("INSERT INTO projects VALUES('p2','ALPHA','alpha','n')")

    def test_foreign_keys_hold(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.ref('missing-task')


ORIGINAL_INIT_SQL = '''
        CREATE TABLE IF NOT EXISTS captures(id TEXT PRIMARY KEY,title TEXT NOT NULL,lane TEXT NOT NULL,owner TEXT NOT NULL,due TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'inbox',pinned INTEGER DEFAULT 0,created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS threads(id TEXT PRIMARY KEY,title TEXT NOT NULL,session_id TEXT,created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,thread_id TEXT NOT NULL,role TEXT NOT NULL,body TEXT NOT NULL,created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,thread_id TEXT NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL,ended TEXT,error TEXT,request_key TEXT UNIQUE NOT NULL,payload_hash TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,label TEXT NOT NULL,created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        '''  # verbatim from the original server.py init() (commit 3735b38)


LEGACY_ID = 'b' * 32  # PR #1 ids are uuid4().hex


def pr_v2_with_pre_gate_row(path):
    """PR #1's own API could do this: create a task without review, complete it, then switch review on."""
    pr_v2_db(path, with_rows=False)
    c = sqlite3.connect(path)
    c.execute("INSERT INTO agent_tasks(id,title,agent_id,status,status_source,review_state,requires_review,created,updated,status_changed) VALUES(?,'Completed before the gate','codex','completed','manual','none',1,'n','n','n')", (LEGACY_ID,))
    c.commit()
    c.close()


class StructuralConflicts(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / 'workbench.sqlite3'
        self.addCleanup(self.tmp.cleanup)

    def test_a_database_written_by_the_original_server_code_is_not_a_conflict(self):
        c = sqlite3.connect(self.db)
        c.executescript(ORIGINAL_INIT_SQL)
        c.execute("INSERT INTO captures VALUES('c1','Synthetic','Build','QA','','inbox',0,'n')")
        c.commit(); c.close()
        self.assertEqual(migrations.plan(self.db)['conflicts'], [])
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        self.assertEqual(c.execute('SELECT title FROM captures').fetchone()[0], 'Synthetic')
        c.close()

    def test_same_column_names_with_different_types_are_a_conflict(self):
        c = sqlite3.connect(self.db)
        for statement in migrations.MIGRATIONS[0][1]:
            c.execute(statement)
        c.execute("CREATE TABLE agents(id INTEGER, name TEXT NOT NULL, role TEXT NOT NULL, integration TEXT NOT NULL, position INTEGER NOT NULL, created TEXT NOT NULL)")
        c.execute("INSERT INTO agents VALUES(1,'Foreign','x','y',1,'n')")
        c.commit(); c.close()
        before = file_hash(self.db)
        conflicts = migrations.plan(self.db)['conflicts']
        self.assertEqual([x['name'] for x in conflicts], ['agents'])
        self.assertIn('different types', conflicts[0]['reason'])
        with self.assertRaises(migrations.ConflictError):
            migrations.migrate(self.db)
        self.assertEqual(file_hash(self.db), before)

    def test_same_columns_with_different_constraints_are_a_conflict(self):
        c = sqlite3.connect(self.db)
        for statement in migrations.MIGRATIONS[0][1]:
            c.execute(statement)
        # Identical column list to migration 2, but without its CHECK constraint on integration.
        c.execute("CREATE TABLE agents(id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL,integration TEXT NOT NULL,position INTEGER NOT NULL,created TEXT NOT NULL)")
        c.commit(); c.close()
        conflicts = migrations.plan(self.db)['conflicts']
        self.assertEqual([x['name'] for x in conflicts], ['agents'])
        self.assertIn('different constraints', conflicts[0]['reason'])


class PreGateRows(unittest.TestCase):
    """Rows PR #1 could legitimately create that the new gate would reject: tolerated, flagged, never rewritten."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / 'workbench.sqlite3'
        self.addCleanup(self.tmp.cleanup)
        pr_v2_with_pre_gate_row(self.db)

    def test_plan_reports_it_and_migration_keeps_it_unchanged(self):
        self.assertEqual(migrations.plan(self.db)['invariants']['completed_without_approval_and_evidence'], 1)
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        self.assertEqual(c.execute("SELECT status,review_state,requires_review FROM agent_tasks WHERE id=?", (LEGACY_ID,)).fetchone(), ('completed', 'none', 1))
        self.assertEqual(migrations.invariants(c)['completed_without_approval_and_evidence'], 1)
        c.close()

    def test_bookkeeping_and_reopening_still_work_but_no_new_violation_can_be_made(self):
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        c.execute("PRAGMA foreign_keys=ON")
        c.execute("UPDATE agent_tasks SET updated='later' WHERE id=?", (LEGACY_ID,))  # a note or evidence bumps this
        c.execute("INSERT INTO agent_task_evidence(task_id,at,label,source) VALUES(?,'n','Output','manual')", (LEGACY_ID,))
        c.execute("UPDATE agent_tasks SET updated='later2' WHERE id=?", (LEGACY_ID,))
        with self.assertRaisesRegex(sqlite3.DatabaseError, 'approved review with evidence'):
            c.execute("UPDATE agent_tasks SET review_state='pending' WHERE id=?", (LEGACY_ID,))
        c.execute("UPDATE agent_tasks SET status='queued' WHERE id=?", (LEGACY_ID,))  # reopen
        with self.assertRaisesRegex(sqlite3.DatabaseError, 'approved review with evidence'):
            c.execute("UPDATE agent_tasks SET status='completed' WHERE id=?", (LEGACY_ID,))
        c.close()

    def test_v3_adds_idempotency_and_link_context(self):
        migrations.migrate(self.db)
        c = sqlite3.connect(self.db)
        self.assertIn('context', [r[1] for r in c.execute('PRAGMA table_info(external_refs)')])
        self.assertEqual([r[1] for r in c.execute('PRAGMA table_info(agent_task_requests)')], ['request_key', 'task_id', 'payload_hash', 'created'])
        c.close()


if __name__ == '__main__':
    unittest.main()
