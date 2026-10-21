"""Projects, external links, session identities and the approval gate on every write path."""
import sqlite3
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from harness import Server  # noqa: E402


class Api(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = Server(extra_env={'KEYSTAL_OS_KANBAN_BOARD': 'ops'}).start()
        cls.c = cls.server.client()

    @classmethod
    def tearDownClass(cls):
        cls.server.stop()
        cls.server.tmp.cleanup()

    def task(self, **kw):
        code, data = self.c.post('/api/agent-tasks', {'title': 'Synthetic task', 'agent_id': 'claude', **kw})
        self.assertEqual(code, 201, data)
        return data['id']

    def detail(self, tid):
        return self.c.request('/api/agent-tasks/' + tid)[1]

    def post(self, path, body):
        return self.c.post('/api/agent-tasks/' + path, body)


class Projects(Api):
    def test_project_is_created_once_case_and_spacing_insensitively(self):
        a = self.task(project='  Synthetic   Alpha ')
        b = self.task(project='synthetic alpha')
        names = [p for p in self.c.state()['projects'] if p['name'].lower().split() == ['synthetic', 'alpha']]
        self.assertEqual(len(names), 1)
        self.assertEqual(names[0]['name'], 'Synthetic Alpha', 'the first spelling is kept, whitespace normalised')
        self.assertEqual((self.detail(a)['task']['project'], self.detail(b)['task']['project']), ('Synthetic Alpha', 'Synthetic Alpha'))

    def test_changing_and_clearing_a_project_is_recorded(self):
        tid = self.task(project='Synthetic One')
        self.assertEqual(self.post('update', {'id': tid, 'project': 'Synthetic Two'})[1]['changed'], ['project'])
        self.assertEqual(self.post('update', {'id': tid, 'project': 'synthetic two'})[1]['changed'], [], 'same project, different case: no change')
        self.assertEqual(self.post('update', {'id': tid, 'project': ''})[1]['changed'], ['project'])
        d = self.detail(tid)
        self.assertEqual(d['task']['project'], None)
        moves = [(h['from_value'], h['to_value']) for h in d['history'] if h['field'] == 'project']
        self.assertEqual(moves, [('Synthetic One', 'Synthetic Two'), ('Synthetic Two', '')])

    def test_project_names_are_validated(self):
        self.assertEqual(self.c.post('/api/agent-tasks', {'title': 'x', 'project': 'p' * 81})[0], 400)
        self.assertEqual(self.c.post('/api/agent-tasks', {'title': 'x', 'project': 'Client S1234567D'})[0], 400)
        self.assertEqual(self.c.post('/api/agent-tasks', {'title': 'x', 'project': 5})[0], 400)

    def test_open_task_counts(self):
        tid = self.task(project='Synthetic Counted')
        self.task(project='Synthetic Counted', requires_review=False)
        row = next(p for p in self.c.state()['projects'] if p['name'] == 'Synthetic Counted')
        self.assertEqual((row['tasks'], row['open_tasks']), (2, 2))
        self.assertTrue(tid)


class StrictFields(Api):
    def test_status_and_review_fields_cannot_be_smuggled_into_create_or_update(self):
        for extra in ({'status': 'completed'}, {'review_state': 'approved'}, {'status_source': 'observed'}, {'id': 'x' * 32}, {'created': 'x'}, {'evidence_count': 3}):
            code, data = self.c.post('/api/agent-tasks', {'title': 'x', **extra})
            self.assertEqual(code, 400, extra)
            self.assertIn('not accepted', data['error'])
        tid = self.task()
        for extra in ({'status': 'completed'}, {'review_state': 'approved'}, {'status_source': 'manual'}):
            self.assertEqual(self.post('update', {'id': tid, **extra})[0], 400, extra)
        d = self.detail(tid)['task']
        self.assertEqual((d['status'], d['review_state']), ('queued', 'none'))

    def test_every_endpoint_rejects_fields_it_does_not_own(self):
        tid = self.task()
        for path, body in (('status', {'status': 'running', 'review_state': 'approved'}), ('note', {'note': 'x', 'status': 'completed'}),
                           ('evidence', {'label': 'x', 'status': 'completed'}), ('review', {'decision': 'approve', 'status': 'completed'}),
                           ('link', {'provider': 'clickup', 'scope': 's', 'external_id': 'x', 'task_id': 'other'}),
                           ('link', {'provider': 'clickup', 'scope': 's', 'external_id': 'x', 'instance': 'elsewhere'}),
                           ('unlink', {'ref_id': 1, 'task_id': 'other'}), ('session', {'session_ref': 's', 'status': 'completed'})):
            self.assertEqual(self.post(path, {'id': tid, **body})[0], 400, path)


class ApprovalGateEveryWritePath(Api):
    def completed_via_any_endpoint(self, tid):
        return self.detail(tid)['task']['status'] == 'completed'

    def test_no_api_sequence_completes_a_review_required_task_without_approval_and_evidence(self):
        tid = self.task()
        attempts = [('status', {'status': 'completed'}), ('status', {'status': 'completed', 'source': 'agent_reported'}), ('update', {'status': 'completed'}),
                    ('review', {'decision': 'approve'}), ('update', {'requires_review': False, 'title': 'x'})]
        self.post('status', {'id': tid, 'status': 'running'})
        for path, body in attempts[:4]:
            self.post(path, {'id': tid, **body})
            self.assertFalse(self.completed_via_any_endpoint(tid), (path, body))
        self.post('status', {'id': tid, 'status': 'awaiting_review', 'source': 'agent_reported'})
        self.assertEqual(self.post('review', {'id': tid, 'decision': 'approve'})[0], 400, 'no evidence yet')
        self.assertFalse(self.completed_via_any_endpoint(tid))
        self.assertEqual(self.post('update', {'id': tid, 'requires_review': False})[0], 400, 'cannot switch review off mid-review to slip past it')
        self.post('evidence', {'id': tid, 'label': 'Output'})
        self.assertEqual(self.post('review', {'id': tid, 'decision': 'approve'})[0], 200)
        self.assertTrue(self.completed_via_any_endpoint(tid))

    def test_switching_review_off_then_completing_is_the_owners_explicit_choice_and_is_recorded(self):
        tid = self.task()
        self.assertEqual(self.post('update', {'id': tid, 'requires_review': False})[0], 200)
        self.assertEqual(self.post('status', {'id': tid, 'status': 'completed'})[0], 200)
        history = self.detail(tid)['history']
        self.assertIn(('edited', 'requires_review', '1', '0'), [(h['kind'], h['field'], h['from_value'], h['to_value']) for h in history])

    def test_review_cannot_be_turned_back_on_for_a_completed_task(self):
        tid = self.task(requires_review=False)
        self.post('status', {'id': tid, 'status': 'completed'})
        self.assertEqual(self.post('update', {'id': tid, 'requires_review': True})[0], 409)

    def test_the_database_itself_refuses_a_bypass(self):
        tid = self.task()
        db = sqlite3.connect(self.server.data / 'workbench.sqlite3')
        with self.assertRaises(sqlite3.DatabaseError):
            db.execute("UPDATE agent_tasks SET status='completed' WHERE id=?", (tid,))
        with self.assertRaises(sqlite3.DatabaseError):
            db.execute("INSERT INTO agent_tasks(id,title,status,status_source,requires_review,created,updated,status_changed) VALUES('z','t','completed','manual',1,'n','n','n')")
        db.close()
        self.assertEqual(self.detail(tid)['task']['status'], 'queued')

    def test_sweep_and_links_never_complete_anything(self):
        tid = self.task(agent_id='hermes')
        self.post('link', {'id': tid, 'provider': 'hermes_kanban', 'external_id': 't_001'})
        self.c.state()
        self.assertEqual(self.detail(tid)['task']['status'], 'queued')


class ClickUpLinks(Api):
    GOOD = {'provider': 'clickup', 'scope': 'workspace-1', 'context': 'list-9', 'external_id': 'abc123'}

    def link(self, tid, **over):
        return self.post('link', {'id': tid, **{**self.GOOD, **over}})

    def test_link_is_recorded_listed_and_audited(self):
        tid = self.task()
        code, _ = self.link(tid, external_id='clk-1', url='https://app.clickup.com/t/clk-1', label='Quarterly report')
        self.assertEqual(code, 201)
        d = self.detail(tid)
        ref = d['refs'][0]
        self.assertEqual((ref['provider'], ref['instance'], ref['scope'], ref['context'], ref['external_id'], ref['source'], ref['url'], ref['label']), ('clickup', 'app.clickup.com', 'workspace-1', 'list-9', 'clk-1', 'manual', 'https://app.clickup.com/t/clk-1', 'Quarterly report'))
        self.assertNotIn('board_record', ref)
        self.assertIn(('edited', 'link'), [(h['kind'], h['field']) for h in d['history']])
        self.assertEqual(next(t for t in self.c.state()['agent_tasks'] if t['id'] == tid)['link_count'], 1)

    def test_identity_is_the_full_tuple(self):
        a, b = self.task(), self.task()
        self.assertEqual(self.link(a, external_id='same-id')[0], 201)
        self.assertEqual(self.link(b, external_id='same-id')[0], 409, 'same provider, instance, scope and id: one record, one task')
        self.assertEqual(self.link(a, external_id='same-id')[0], 409, 'and not twice on the same task')
        self.assertEqual(self.link(b, external_id='same-id', context='another-list')[0], 409, 'a ClickUp task in two lists is still one task: the list is context, not identity')
        self.assertEqual(self.link(b, external_id='same-id', scope='workspace-2')[0], 201, 'a different workspace is a different record')

    def test_validation(self):
        tid = self.task()
        for bad in ({'provider': 'jira'}, {'scope': ''}, {'context': 'has space'}, {'scope': "x'; DROP"}, {'external_id': ''}, {'external_id': 'a' * 129},
                    {'url': 'javascript:alert(1)'}, {'url': 'https://u:p@app.clickup.com/x'}, {'scope': 'a' * 65}, {'label': 'S1234567D'}, {'instance': 'my-own'}):
            self.assertEqual(self.link(tid, **bad)[0], 400, bad)
        self.assertEqual(self.detail(tid)['refs'], [])

    def test_unlink_removes_only_the_link_here_and_is_audited(self):
        tid = self.task()
        self.link(tid, external_id='to-remove')
        ref_id = self.detail(tid)['refs'][0]['id']
        self.assertEqual(self.post('unlink', {'id': tid, 'ref_id': 'x'})[0], 400)
        self.assertEqual(self.post('unlink', {'id': tid, 'ref_id': 10 ** 9})[0], 404)
        other = self.task()
        self.assertEqual(self.post('unlink', {'id': other, 'ref_id': ref_id})[0], 404, 'a link can only be removed through its own task')
        self.assertEqual(self.post('unlink', {'id': tid, 'ref_id': ref_id})[0], 200)
        d = self.detail(tid)
        self.assertEqual(d['refs'], [])
        self.assertTrue(any(h['field'] == 'link' and h['from_value'] and h['to_value'] is None for h in d['history']))
        self.assertEqual(self.link(other, external_id='to-remove')[0], 201, 'once unlinked, the record can be linked elsewhere')


class HermesLinks(Api):
    def test_link_comes_from_the_last_read_not_from_the_request(self):
        tid = self.task(agent_id='')
        self.assertEqual(self.post('link', {'id': tid, 'provider': 'hermes_kanban', 'external_id': 't_002', 'scope': 'other'})[0], 400)
        self.assertEqual(self.post('link', {'id': tid, 'provider': 'hermes_kanban', 'external_id': 't_002', 'instance': 'elsewhere'})[0], 400)
        self.assertEqual(self.post('link', {'id': tid, 'provider': 'hermes_kanban', 'external_id': 't_002', 'context': 'x'})[0], 400)
        self.assertEqual(self.post('link', {'id': tid, 'provider': 'hermes_kanban', 'external_id': 'not-a-card'})[0], 404)
        self.assertEqual(self.post('link', {'id': tid, 'provider': 'hermes_kanban', 'external_id': 't_002'})[0], 201)
        d = self.detail(tid)
        ref = d['refs'][0]
        self.assertEqual((ref['provider'], ref['instance'], ref['scope'], ref['external_id']), ('hermes_kanban', 'local', 'ops', 't_002'))
        self.assertEqual(d['task']['agent_id'], 'hermes')
        record = ref['board_record']
        self.assertEqual((record['comparable'], record['in_last_read'], record['record']['status_raw'], record['record']['state_class']), (True, True, 'running', 'active'))
        self.assertTrue(record['drift'], 'board says running; the tracked task is still queued')
        self.assertEqual(d['task']['status'], 'queued')

    def test_archived_cards_are_not_linkable(self):
        tid = self.task(agent_id='hermes')
        self.assertEqual(self.post('link', {'id': tid, 'provider': 'hermes_kanban', 'external_id': 't_003'})[0], 404)


class Sessions(Api):
    def test_identifiers_are_recorded_attributed_and_append_only(self):
        tid = self.task(agent_id='codex')
        code, _ = self.post('session', {'id': tid, 'session_ref': 'sess_01HX', 'run_ref': 'run-7', 'note': 'first pass', 'source': 'agent_reported'})
        self.assertEqual(code, 201)
        d = self.detail(tid)
        s = d['sessions'][0]
        self.assertEqual((s['agent_id'], s['agent_name'], s['session_ref'], s['run_ref'], s['source'], s['note']), ('codex', 'Codex', 'sess_01HX', 'run-7', 'agent_reported', 'first pass'))
        last = d['history'][-1]
        self.assertEqual((last['kind'], last['field'], last['to_value'], last['source'], last['actor']), ('edited', 'session', 'codex:sess_01HX#run-7', 'agent_reported', 'Codex'))
        self.assertEqual(self.post('session', {'id': tid, 'session_ref': 'sess_01HX', 'run_ref': 'run-7'})[0], 409, 'the same identifiers twice')
        self.assertEqual(self.post('session', {'id': tid, 'session_ref': 'sess_01HX', 'run_ref': 'run-8'})[0], 201, 'a different run is a different identity')
        db = sqlite3.connect(self.server.data / 'workbench.sqlite3')
        with self.assertRaisesRegex(sqlite3.DatabaseError, 'append-only'):
            db.execute('DELETE FROM agent_task_sessions')
        db.close()

    def test_agent_defaults_to_the_tasks_agent_and_is_required_otherwise(self):
        assigned = self.task(agent_id='claude')
        self.assertEqual(self.post('session', {'id': assigned, 'session_ref': 's-1'})[0], 201)
        self.assertEqual(self.detail(assigned)['sessions'][0]['agent_id'], 'claude')
        unassigned = self.task(agent_id='')
        self.assertEqual(self.post('session', {'id': unassigned, 'session_ref': 's-1'})[0], 400)
        self.assertEqual(self.post('session', {'id': unassigned, 'session_ref': 's-1', 'agent_id': 'gemini'})[0], 201)
        self.assertEqual(self.post('session', {'id': unassigned, 'session_ref': 's-2', 'agent_id': 'skynet'})[0], 400)

    def test_identifiers_only_never_free_text_or_markup(self):
        tid = self.task()
        for bad in ('has space', 'a/b c', '<script>', "x'y", '', 'é', 'a' * 129, '../../etc/passwd '):
            self.assertEqual(self.post('session', {'id': tid, 'session_ref': bad})[0], 400, repr(bad))
        self.assertEqual(self.post('session', {'id': tid, 'session_ref': 'ok', 'run_ref': 'bad run'})[0], 400)
        self.assertEqual(self.post('session', {'id': tid, 'session_ref': 'ok', 'note': 'S1234567D'})[0], 400)
        self.assertEqual(self.post('session', {'id': tid, 'session_ref': 'ok', 'source': 'observed'})[0], 400, 'the browser cannot claim an observed session')
        self.assertEqual(self.detail(tid)['sessions'], [])


class Export(Api):
    def test_export_includes_the_new_tables_and_no_secrets(self):
        tid = self.task(project='Synthetic Export')
        self.post('link', {'id': tid, 'provider': 'clickup', 'scope': 's', 'external_id': 'exp-1'})
        self.post('session', {'id': tid, 'session_ref': 'exp-session'})
        export = self.c.request('/api/export')[1]
        for key in ('projects', 'external_refs', 'agent_task_sessions'):
            self.assertTrue(export[key], key)
        self.assertNotIn('csrf', export)
        self.assertNotIn('kanban', export, 'a copy of the Hermes board is not part of the workspace export')


class IdempotentCreate(Api):
    def test_a_retried_create_returns_the_first_task_never_a_second(self):
        body = {'title': 'Synthetic once', 'agent_id': 'claude', 'request_key': 'k' * 20 + 'create-1'}
        code, first = self.c.post('/api/agent-tasks', body)
        self.assertEqual(code, 201)
        code, again = self.c.post('/api/agent-tasks', body)
        self.assertEqual((code, again['id'], again['replayed']), (200, first['id'], True))
        self.assertEqual(sum(1 for t in self.c.state()['agent_tasks'] if t['title'] == 'Synthetic once'), 1)
        self.assertEqual(self.c.post('/api/agent-tasks', {**body, 'title': 'Different'})[0], 409)
        for bad in ('short', 'x' * 81, 'has space' * 3, 5):
            self.assertEqual(self.c.post('/api/agent-tasks', {'title': 't', 'request_key': bad})[0], 400, bad)

    def test_a_failed_create_does_not_burn_the_key(self):
        key = 'k' * 20 + 'create-2'
        self.assertEqual(self.c.post('/api/agent-tasks', {'title': '', 'request_key': key})[0], 400)
        self.assertEqual(self.c.post('/api/agent-tasks', {'title': 'Now valid', 'request_key': key})[0], 201)


class ActivityLog(Api):
    def test_every_task_action_line_says_no_agent_was_contacted(self):
        tid = self.task(agent_id='hermes')
        self.post('status', {'id': tid, 'status': 'running'})
        self.post('note', {'id': tid, 'note': 'x', 'source': 'agent_reported'})
        self.post('evidence', {'id': tid, 'label': 'Output'})
        self.post('session', {'id': tid, 'session_ref': 'log-session'})
        self.post('link', {'id': tid, 'provider': 'clickup', 'scope': 'w', 'external_id': 'log-1'})
        ref = self.detail(tid)['refs'][0]['id']
        self.post('unlink', {'id': tid, 'ref_id': ref})
        self.post('status', {'id': tid, 'status': 'awaiting_review'})
        self.post('review', {'id': tid, 'decision': 'approve'})
        self.post('update', {'id': tid, 'priority': 'high'})
        labels = [e['label'] for e in self.c.state()['events'] if e['kind'] == 'agent']
        self.assertGreaterEqual(len(labels), 10)
        self.assertEqual([l for l in labels if 'no agent contacted' not in l], [])


class PreGateRowsThroughTheServer(unittest.TestCase):
    def test_migrate_flags_them_and_every_action_on_them_still_works(self):
        import tempfile
        from test_migrations import LEGACY_ID, pr_v2_with_pre_gate_row
        d = Path(tempfile.mkdtemp())
        pr_v2_with_pre_gate_row(d / 'workbench.sqlite3')
        s = Server(data=d, args=['--migrate'])
        s.start()
        try:
            c = s.client()
            task = next(t for t in c.state()['agent_tasks'] if t['id'] == LEGACY_ID)
            self.assertEqual((task['status'], task['completed_without_approval']), ('completed', 1), 'flagged, not rewritten')
            self.assertEqual(c.post('/api/agent-tasks/note', {'id': LEGACY_ID, 'note': 'checked'})[0], 201)
            self.assertEqual(c.post('/api/agent-tasks/evidence', {'id': LEGACY_ID, 'label': 'Found the output'})[0], 201)
            self.assertEqual(c.post('/api/agent-tasks/update', {'id': LEGACY_ID, 'priority': 'high'})[0], 200)
            self.assertEqual(c.post('/api/agent-tasks/link', {'id': LEGACY_ID, 'provider': 'clickup', 'scope': 'w', 'external_id': 'legacy'})[0], 201)
            self.assertEqual(c.post('/api/agent-tasks/update', {'id': LEGACY_ID, 'requires_review': False})[0], 409, 'cannot quietly drop the requirement on a completed task')
            self.assertEqual(c.post('/api/agent-tasks/status', {'id': LEGACY_ID, 'status': 'queued', 'note': 'Put it through review'})[0], 200)
            self.assertFalse(next(t for t in c.state()['agent_tasks'] if t['id'] == LEGACY_ID)['completed_without_approval'])
        finally:
            s.stop()
            s.tmp.cleanup()

    def test_the_server_says_so_at_startup(self):
        import subprocess, tempfile
        from test_migrations import pr_v2_with_pre_gate_row
        d = Path(tempfile.mkdtemp())
        pr_v2_with_pre_gate_row(d / 'workbench.sqlite3')
        s = Server(data=d, args=['--migrate'])
        p = subprocess.Popen([sys.executable, str(Path(__file__).resolve().parent.parent / 'server.py'), '--migrate'], env=s.env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        try:
            line = p.stderr.readline()
        finally:
            p.terminate(); p.wait(timeout=10); p.stderr.close(); s.tmp.cleanup()
        self.assertIn('1 completed task(s) need review but have no approval and evidence', line)


class AuthorityWording(unittest.TestCase):
    def test_no_shipped_text_calls_clickup_the_execution_or_task_authority(self):
        root = Path(__file__).resolve().parent.parent
        import re
        offenders = []
        for path in [root / 'app.js', root / 'index.html', root / 'server.py', root / 'README.md', *sorted((root / 'docs').glob('*.md'))]:
            text = path.read_text()
            # Within ClickUp's own clause (up to . ; or newline): 'execution authority/record', 'task authority'.
            for m in re.finditer(r'[^.;\n]*ClickUp[^.;\n]*(execution (authority|record)|task authority|authority for tasks)[^.;\n]*', text, re.I):
                offenders.append(f'{path.name}: {m.group(0).strip()[:120]}')
        self.assertEqual(offenders, [])

    def test_the_wording_check_catches_every_phrasing_that_shipped_before(self):
        import re
        pattern = r'[^.;\n]*ClickUp[^.;\n]*(execution (authority|record)|task authority|authority for tasks)[^.;\n]*'
        for old in ("row('ClickUp', 'Execution authority. This OS has no ClickUp adapter", 'ClickUp remains the execution record.', 'ClickUp is task authority;'):
            self.assertTrue(re.search(pattern, old, re.I), old)
        self.assertFalse(re.search(pattern, 'ClickUp owns business commitments; Hermes Kanban owns internal agent execution', re.I))


class Revisions(Api):
    """Ported from the other local implementation: every write path refuses a stale revision."""
    def test_every_write_path_refuses_a_stale_revision_and_changes_nothing(self):
        tid = self.task(agent_id='hermes')
        rev = self.detail(tid)['task']['revision']
        self.assertEqual(self.post('note', {'id': tid, 'note': 'bump', 'revision': rev})[0], 201)
        stale = rev
        current = self.detail(tid)['task']['revision']
        self.assertGreater(current, stale)
        before = self.detail(tid)
        attempts = {'update': {'priority': 'high'}, 'status': {'status': 'running'}, 'note': {'note': 'x'}, 'evidence': {'label': 'x'},
                    'link': {'provider': 'clickup', 'scope': 'w', 'external_id': 'rev-1'}, 'session': {'session_ref': 'rev-s'}, 'unlink': {'ref_id': 1}}
        for path, body in attempts.items():
            code, data = self.post(path, {'id': tid, 'revision': stale, **body})
            self.assertEqual(code, 409, path)
            self.assertIn('changed since you opened it', data['error'])
        after = self.detail(tid)
        self.assertEqual((after['task'], after['history'], after['refs'], after['sessions']), (before['task'], before['history'], before['refs'], before['sessions']))
        self.post('status', {'id': tid, 'status': 'awaiting_review'})
        self.assertEqual(self.post('review', {'id': tid, 'decision': 'reject', 'note': 'x', 'revision': stale})[0], 409)
        for bad in ('1', True, 1.5, None):
            self.assertEqual(self.post('note', {'id': tid, 'note': 'x', 'revision': bad})[0], 400, bad)

    def test_every_write_bumps_the_revision_including_the_servers_own(self):
        tid = self.task(agent_id='codex')
        seen = [self.detail(tid)['task']['revision']]
        for path, body in (('update', {'priority': 'high'}), ('status', {'status': 'running'}), ('note', {'note': 'x'}), ('evidence', {'label': 'x'}),
                           ('session', {'session_ref': 'bump-s'}), ('link', {'provider': 'clickup', 'scope': 'w', 'external_id': 'bump-1'})):
            self.assertIn(self.post(path, {'id': tid, **body})[0], (200, 201), path)
            seen.append(self.detail(tid)['task']['revision'])
        self.assertEqual(seen, sorted(set(seen)), 'strictly increasing')
        db = sqlite3.connect(self.server.data / 'workbench.sqlite3')
        db.execute("UPDATE agent_tasks SET updated='2000-01-01T00:00:00+00:00' WHERE id=?", (tid,))
        db.commit(); db.close()
        before = self.detail(tid)['task']['revision']
        self.c.state()  # the stale sweep is a server write path too
        task = self.detail(tid)['task']
        self.assertEqual(task['status'], 'stale')
        self.assertGreater(task['revision'], before)


if __name__ == '__main__':
    unittest.main()
