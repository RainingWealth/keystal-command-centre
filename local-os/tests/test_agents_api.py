import json
import sqlite3
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from harness import Server  # noqa: E402
import agent_tasks  # noqa: E402

AGENTS = ['Hermes', 'ChatGPT', 'Claude', 'Codex', 'Gemini']


class ApiCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = Server().start()
        cls.c = cls.server.client()

    @classmethod
    def tearDownClass(cls):
        cls.server.stop()
        cls.server.tmp.cleanup()

    def task(self, **kw):
        body = {'title': 'Synthetic task', 'agent_id': 'claude', **kw}
        code, data = self.c.post('/api/agent-tasks', body)
        self.assertEqual(code, 201, data)
        return data['id']

    def detail(self, tid):
        code, data, _ = self.c.request('/api/agent-tasks/' + tid)
        self.assertEqual(code, 200)
        return data

    def status(self, tid, status, **kw):
        return self.c.post('/api/agent-tasks/status', {'id': tid, 'status': status, **kw})


class RegistryAndHonesty(ApiCase):
    def test_five_agents_listed_with_no_invented_activity(self):
        s = Server(hermes=False); s.start()
        try:
            state = s.client().state()
            cards = state['agents']['agents']
            self.assertEqual([a['name'] for a in cards], AGENTS)
            for a in cards:
                self.assertEqual(sum(a['counts'].values()), 0)
                self.assertIsNone(a['last_update'])
                self.assertEqual(a['running'], [])
            self.assertEqual(state['agent_tasks'], [])
            self.assertEqual(state['agents']['totals']['running'], 0)
        finally:
            s.stop(); s.tmp.cleanup()

    def test_only_observed_board_records_ever_appear_on_a_fresh_workspace(self):
        # With Hermes present and a Kanban board, the Hermes card shows the board's records (observed) and nothing else.
        s = Server(); s.start()
        try:
            state = s.client().state()
            cards = {a['id']: a for a in state['agents']['agents']}
            self.assertEqual(state['agent_tasks'], [])
            for key in ('chatgpt', 'claude', 'codex', 'gemini'):
                self.assertEqual(sum(cards[key]['counts'].values()), 0)
            hermes = cards['hermes']['counts']
            self.assertEqual((hermes['queued'], hermes['running'], hermes['blocked'], hermes['awaiting_review']), (1, 1, 1, 0))
            self.assertEqual(cards['hermes']['board']['board_only'], 4)
            self.assertEqual(cards['hermes']['board']['tracked_tasks'], 0)
        finally:
            s.stop(); s.tmp.cleanup()

    def test_only_hermes_is_observed_others_report_not_connected(self):
        cards = {a['id']: a for a in self.c.state()['agents']['agents']}
        self.assertEqual(cards['hermes']['connection']['status'], 'observed')
        self.assertIsNotNone(cards['hermes']['observation'])
        for key in ('chatgpt', 'claude', 'codex', 'gemini'):
            self.assertEqual(cards[key]['connection']['status'], 'not_connected')
            self.assertIsNone(cards[key]['observation'])

    def test_hermes_reported_not_found_when_cli_missing(self):
        s = Server(hermes=False); s.start()
        try:
            c = s.client()
            hermes = c.state()['agents']['agents'][0]
            self.assertEqual(hermes['connection']['status'], 'not_connected')
            self.assertEqual(c.state()['kanban']['status'], 'not_connected')
        finally:
            s.stop(); s.tmp.cleanup()


class Security(ApiCase):
    def test_unauthenticated_requests_blocked(self):
        from harness import Client
        anon = Client(self.server.base)
        self.assertEqual(anon.request('/api/agent-tasks/' + 'a' * 32)[0], 401)
        self.assertEqual(anon.request('/api/agent-tasks', {'title': 'x'})[0], 403)
        self.assertEqual(anon.request('/api/kanban/refresh', {})[0], 403)

    def test_writes_need_origin_csrf_and_json(self):
        body = {'title': 'Synthetic'}
        self.assertEqual(self.c.request('/api/agent-tasks', body, {'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(self.c.request('/api/agent-tasks', body, {'X-Keystal-CSRF': ''})[0], 403)
        self.assertEqual(self.c.request('/api/agent-tasks', body, {'Content-Type': 'text/plain'})[0], 415)
        self.assertEqual(self.c.request('/api/kanban/refresh', {}, {'Origin': 'https://evil.example'})[0], 403)

    def test_dns_rebinding_host_rejected(self):
        self.assertEqual(self.c.request('/api/agent-tasks/' + 'a' * 32, headers={'Host': 'evil.example'})[0], 403)

    def test_task_id_is_validated_not_interpolated(self):
        for bad in ('..%2f..%2fetc', "x'or'1'='1", 'A' * 32, 'g' * 32, 'a' * 31):
            self.assertEqual(self.c.request('/api/agent-tasks/' + bad)[0], 404, bad)
        self.assertEqual(self.c.post('/api/agent-tasks/status', {'id': "' OR 1=1 --", 'status': 'running'})[0], 404)

    def test_personal_identifiers_rejected_in_every_free_text_field(self):
        tid = self.task()
        for path, body in (('/api/agent-tasks', {'title': 'Call S1234567D'}),
                           ('/api/agent-tasks', {'title': 'ok', 'description': 'client T7654321A'}),
                           ('/api/agent-tasks/note', {'id': tid, 'note': 'NRIC G1234567X'}),
                           ('/api/agent-tasks/evidence', {'id': tid, 'label': 'ok', 'note': 'F1234567N'}),
                           ('/api/agent-tasks/update', {'id': tid, 'title': 'S1234567D'})):
            self.assertEqual(self.c.post(path, body)[0], 400, path)

    def test_markup_is_stored_inertly(self):
        payload = '<img src=x onerror="window.__xss=1">'
        tid = self.task(title=payload)
        self.assertEqual(self.detail(tid)['task']['title'], payload)


class Validation(ApiCase):
    def test_create_rejects_bad_input(self):
        base = {'title': 'ok'}
        cases = [{'title': ''}, {'title': '   '}, {'title': 'x' * 201}, {'title': 5}, {**base, 'agent_id': 'skynet'}, {**base, 'priority': 'asap'},
                 {**base, 'lane': 'Elsewhere'}, {**base, 'due': '2026-99-99'}, {**base, 'due': 'tomorrow'}, {**base, 'requires_review': 'yes'}, {**base, 'description': 'x' * 4001}]
        for body in cases:
            self.assertEqual(self.c.post('/api/agent-tasks', body)[0], 400, body)
        self.assertEqual(self.c.post('/api/agent-tasks', {})[0], 400)

    def test_create_defaults_and_readback(self):
        code, data = self.c.post('/api/agent-tasks', {'title': '  Draft a call script  '})
        self.assertEqual(code, 201)
        t = self.detail(data['id'])['task']
        self.assertEqual((t['title'], t['status'], t['status_source'], t['agent_id'], t['priority'], t['requires_review'], t['review_state']), ('Draft a call script', 'queued', 'manual', None, 'normal', 1, 'none'))

    def test_unknown_task_is_404(self):
        bodies = {'/api/agent-tasks/status': {'status': 'running'}, '/api/agent-tasks/note': {'note': 'x'}, '/api/agent-tasks/evidence': {'label': 'x'},
                  '/api/agent-tasks/review': {'decision': 'approve'}, '/api/agent-tasks/update': {'title': 'x'}, '/api/agent-tasks/unlink': {'ref_id': 1},
                  '/api/agent-tasks/session': {'agent_id': 'codex', 'session_ref': 's1'}, '/api/agent-tasks/link': {'provider': 'clickup', 'instance': 'w', 'scope': 's', 'external_id': 'x'}}
        for path, body in bodies.items():
            self.assertEqual(self.c.post(path, {'id': 'f' * 32, **body})[0], 404, path)

    def test_edit_records_history_and_reassignment_is_not_dispatch(self):
        tid = self.task()
        self.assertEqual(self.c.post('/api/agent-tasks/update', {'id': tid, 'agent_id': 'codex', 'priority': 'urgent', 'title': 'Renamed'})[1]['changed'], ['agent_id', 'priority', 'title'])
        self.assertEqual(self.c.post('/api/agent-tasks/update', {'id': tid, 'agent_id': 'codex'})[1]['changed'], [], 'no-op edits write nothing')
        d = self.detail(tid)
        self.assertEqual(d['task']['agent_id'], 'codex')
        kinds = [(h['kind'], h['field'], h['from_value'], h['to_value']) for h in d['history']]
        self.assertIn(('assigned', 'agent', 'Claude', 'Codex'), kinds)
        self.assertIn(('edited', 'priority', 'normal', 'urgent'), kinds)
        self.assertEqual(self.c.post('/api/agent-tasks/update', {'id': tid, 'agent_id': 'skynet'})[0], 400)


class Provenance(ApiCase):
    def test_browser_can_never_claim_observed(self):
        tid = self.task()
        self.assertEqual(self.status(tid, 'running', source='observed')[0], 400)
        self.assertEqual(self.c.post('/api/agent-tasks/note', {'id': tid, 'note': 'x', 'source': 'observed'})[0], 400)
        self.assertEqual(self.c.post('/api/agent-tasks/evidence', {'id': tid, 'label': 'x', 'source': 'observed'})[0], 400)
        self.assertEqual(self.status(tid, 'running', source='bogus')[0], 400)
        self.assertEqual(self.detail(tid)['task']['status'], 'queued')

    def test_manual_is_default_and_agent_reported_is_attributed_to_the_agent(self):
        tid = self.task(agent_id='gemini')
        self.assertEqual(self.status(tid, 'running')[0], 200)
        self.assertEqual(self.detail(tid)['task']['status_source'], 'manual')
        self.assertEqual(self.status(tid, 'paused', source='agent_reported')[0], 200)
        d = self.detail(tid)
        self.assertEqual(d['task']['status_source'], 'agent_reported')
        last = d['history'][-1]
        self.assertEqual((last['source'], last['actor'], last['from_value'], last['to_value']), ('agent_reported', 'Gemini', 'running', 'paused'))
        self.assertEqual(d['history'][-2]['actor'], 'You')

    def test_review_decisions_are_always_manual(self):
        tid = self.task()
        self.status(tid, 'awaiting_review', source='agent_reported')
        self.c.post('/api/agent-tasks/evidence', {'id': tid, 'label': 'Output', 'source': 'agent_reported'})
        self.assertEqual(self.c.post('/api/agent-tasks/review', {'id': tid, 'decision': 'approve', 'source': 'agent_reported'})[0], 400, 'a review has no source field: it is always the owner')
        self.assertEqual(self.c.post('/api/agent-tasks/review', {'id': tid, 'decision': 'approve'})[0], 200)
        d = self.detail(tid)
        self.assertEqual(d['task']['status_source'], 'manual')
        self.assertEqual([h['source'] for h in d['history'] if h['kind'] == 'review'], ['manual'])
        self.assertEqual(d['evidence'][0]['source'], 'agent_reported')


class StatusRules(ApiCase):
    def test_all_eight_statuses_are_accepted_by_the_api(self):
        self.assertEqual(agent_tasks.STATUSES, ('queued', 'running', 'awaiting_review', 'blocked', 'failed', 'paused', 'completed', 'stale'))
        tid = self.task(requires_review=False)
        for status in ('running', 'awaiting_review', 'blocked', 'failed', 'paused', 'stale', 'completed'):
            body = {'note': 'reason'} if status in ('blocked', 'failed') else {}
            code, data = self.status(tid, status, **body)
            self.assertEqual(code, 200, (status, data))
            self.assertEqual(self.detail(tid)['task']['status'], status)
            if status == 'completed':
                self.assertEqual(self.status(tid, 'queued', note='reopen')[0], 200)
        self.assertEqual(self.status(tid, 'archived')[0], 400)
        self.assertEqual(self.status(tid, 'Running')[0], 400)

    def test_guards(self):
        tid = self.task()
        self.assertEqual(self.status(tid, 'queued')[0], 400, 'same status')
        self.assertEqual(self.status(tid, 'blocked')[0], 400, 'blocked needs a reason')
        self.assertEqual(self.status(tid, 'failed', note='  ')[0], 400, 'failed needs a reason')
        self.assertEqual(self.status(tid, 'completed')[0], 400, 'completion needs review')
        unassigned = self.task(agent_id='')
        self.assertEqual(self.status(unassigned, 'running')[0], 400, 'running needs an agent')
        self.assertEqual(self.c.post('/api/agent-tasks/update', {'id': tid, 'agent_id': ''})[0], 200)
        running = self.task()
        self.status(running, 'running')
        self.assertEqual(self.c.post('/api/agent-tasks/update', {'id': running, 'agent_id': ''})[0], 400, 'cannot unassign a running task')

    def test_stale_view_is_rejected_with_conflict(self):
        tid = self.task()
        self.assertEqual(self.status(tid, 'running', expected_status='queued')[0], 200)
        self.assertEqual(self.status(tid, 'paused', expected_status='queued')[0], 409)
        self.assertEqual(self.detail(tid)['task']['status'], 'running')

    def test_review_flow_with_evidence_gate(self):
        tid = self.task()
        self.status(tid, 'running')
        self.assertEqual(self.c.post('/api/agent-tasks/review', {'id': tid, 'decision': 'approve'})[0], 409, 'only awaiting_review can be reviewed')
        self.status(tid, 'awaiting_review', source='agent_reported')
        self.assertEqual(self.detail(tid)['task']['review_state'], 'pending')
        self.assertEqual(self.c.post('/api/agent-tasks/review', {'id': tid, 'decision': 'approve'})[0], 400, 'no evidence yet')
        self.assertEqual(self.detail(tid)['task']['status'], 'awaiting_review')
        self.assertEqual(self.c.post('/api/agent-tasks/review', {'id': tid, 'decision': 'maybe'})[0], 400)
        self.assertEqual(self.c.post('/api/agent-tasks/evidence', {'id': tid, 'label': 'Draft in shared folder', 'note': 'checked by reading it'})[0], 201)
        self.assertEqual(self.c.post('/api/agent-tasks/review', {'id': tid, 'decision': 'approve', 'note': 'Looks right'})[0], 200)
        t = self.detail(tid)['task']
        self.assertEqual((t['status'], t['review_state']), ('completed', 'approved'))
        self.assertEqual(self.c.post('/api/agent-tasks/review', {'id': tid, 'decision': 'approve'})[0], 409)
        self.assertEqual(self.status(tid, 'running')[0], 400, 'completed tasks can only be reopened to queued')
        self.assertEqual(self.status(tid, 'queued')[0], 400, 'reopening needs a reason')
        self.assertEqual(self.status(tid, 'queued', note='Client changed scope')[0], 200)
        self.assertEqual(self.detail(tid)['task']['review_state'], 'none')

    def test_reject_needs_a_reason_and_sends_work_back(self):
        tid = self.task()
        self.status(tid, 'awaiting_review')
        self.assertEqual(self.c.post('/api/agent-tasks/review', {'id': tid, 'decision': 'reject'})[0], 400)
        self.assertEqual(self.c.post('/api/agent-tasks/review', {'id': tid, 'decision': 'reject', 'note': 'Missing the pricing section'})[0], 200)
        t = self.detail(tid)
        self.assertEqual((t['task']['status'], t['task']['review_state']), ('queued', 'rejected'))
        self.assertIn('Missing the pricing section', [h['note'] for h in t['history']])

    def test_review_not_required_allows_direct_completion(self):
        tid = self.task(requires_review=False)
        self.assertEqual(self.status(tid, 'completed')[0], 200)
        self.status(tid, 'queued', note='again')
        self.status(tid, 'awaiting_review')
        self.assertEqual(self.c.post('/api/agent-tasks/update', {'id': tid, 'requires_review': True})[0], 200)
        self.assertEqual(self.c.post('/api/agent-tasks/update', {'id': tid, 'requires_review': False})[0], 400, 'cannot drop review mid-review')

    def test_history_is_complete_and_ordered(self):
        tid = self.task()
        self.status(tid, 'running')
        self.c.post('/api/agent-tasks/note', {'id': tid, 'note': 'Halfway through', 'source': 'agent_reported'})
        self.status(tid, 'blocked', note='Needs the competitor list')
        kinds = [(h['kind'], h['to_value']) for h in self.detail(tid)['history']]
        self.assertEqual(kinds, [('created', 'queued'), ('status', 'running'), ('note', None), ('status', 'blocked')])


class Evidence(ApiCase):
    def test_links_must_be_plain_http_urls(self):
        tid = self.task()
        bad = ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'ftp://example.com/x', 'file:///etc/passwd', 'https://user:pw@example.com/x',
               'https://exa mple.com', 'http://', '//example.com', 'https://example.com/"onmouseover=1', 'https://example.com/' + 'a' * 500]
        for url in bad:
            self.assertEqual(self.c.post('/api/agent-tasks/evidence', {'id': tid, 'label': 'x', 'url': url})[0], 400, url)
        self.assertEqual(self.detail(tid)['evidence'], [])
        for url in ('https://example.com/pull/1', 'http://127.0.0.1:3000/report?id=2#top'):
            self.assertEqual(self.c.post('/api/agent-tasks/evidence', {'id': tid, 'label': 'Output', 'url': url})[0], 201, url)
        self.assertEqual(self.c.post('/api/agent-tasks/evidence', {'id': tid, 'label': ''})[0], 400)
        self.assertEqual(len(self.detail(tid)['evidence']), 2)

    def test_evidence_is_recorded_not_fetched(self):
        self.server.client()  # waits for the startup Kanban read so the call count below is stable
        before = len(self.server.hermes_calls())
        tid = self.task()
        self.c.post('/api/agent-tasks/evidence', {'id': tid, 'label': 'Output', 'url': 'http://127.0.0.1:9/never-fetched'})
        self.assertEqual(len(self.server.hermes_calls()), before)


class StaleSweep(ApiCase):
    def age(self, tid, hours):
        db = sqlite3.connect(self.server.data / 'workbench.sqlite3')
        old = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        db.execute('UPDATE agent_tasks SET updated=? WHERE id=?', (old, tid))
        db.commit()
        db.close()

    def test_silent_running_task_is_flagged_stale_by_the_server_and_says_so(self):
        quiet, fresh, queued = self.task(), self.task(), self.task()
        for t in (quiet, fresh):
            self.status(t, 'running', source='agent_reported')
        self.age(quiet, 48)
        self.age(queued, 480)
        tasks = {t['id']: t for t in self.c.state()['agent_tasks']}
        self.assertEqual((tasks[quiet]['status'], tasks[quiet]['status_source']), ('stale', 'observed'))
        self.assertEqual(tasks[fresh]['status'], 'running')
        self.assertEqual(tasks[queued]['status'], 'queued', 'only running tasks go stale')
        last = self.detail(quiet)['history'][-1]
        self.assertEqual((last['kind'], last['source'], last['actor'], last['to_value']), ('status', 'observed', 'Keystal OS', 'stale'))
        self.assertIn('may still be working', last['note'])
        self.c.state(); self.c.state()
        self.assertEqual(len([h for h in self.detail(quiet)['history'] if h['to_value'] == 'stale']), 1, 'flagged once, not on every poll')

    def test_update_after_stale_returns_to_manual_provenance(self):
        tid = self.task()
        self.status(tid, 'running', source='agent_reported')
        self.age(tid, 30)
        self.c.state()
        self.assertEqual(self.status(tid, 'running', expected_status='stale')[0], 200)
        t = self.detail(tid)['task']
        self.assertEqual((t['status'], t['status_source']), ('running', 'manual'))

    def test_note_refreshes_the_clock(self):
        tid = self.task()
        self.status(tid, 'running')
        self.age(tid, 20)
        self.c.post('/api/agent-tasks/note', {'id': tid, 'note': 'Still going', 'source': 'agent_reported'})
        self.age(tid, 0)
        self.assertEqual({t['id']: t for t in self.c.state()['agent_tasks']}[tid]['status'], 'running')

    def test_threshold_is_configurable(self):
        s = Server(extra_env={'KEYSTAL_OS_STALE_HOURS': '1'}); s.start()
        try:
            c = s.client()
            tid = c.post('/api/agent-tasks', {'title': 'x', 'agent_id': 'codex'})[1]['id']
            c.post('/api/agent-tasks/status', {'id': tid, 'status': 'running'})
            db = sqlite3.connect(s.data / 'workbench.sqlite3')
            db.execute('UPDATE agent_tasks SET updated=?', ((datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),))
            db.commit(); db.close()
            self.assertEqual(c.state()['agent_tasks'][0]['status'], 'stale')
        finally:
            s.stop(); s.tmp.cleanup()


class Overview(ApiCase):
    def test_counts_and_last_update_come_from_real_records(self):
        s = Server(); s.start()
        try:
            c = s.client()
            a = c.post('/api/agent-tasks', {'title': 'a', 'agent_id': 'codex'})[1]['id']
            b = c.post('/api/agent-tasks', {'title': 'b', 'agent_id': 'codex'})[1]['id']
            c.post('/api/agent-tasks', {'title': 'c'})
            c.post('/api/agent-tasks/status', {'id': a, 'status': 'running', 'source': 'agent_reported'})
            c.post('/api/agent-tasks/status', {'id': b, 'status': 'blocked', 'note': 'why'})
            state = c.state()
            codex = next(x for x in state['agents']['agents'] if x['id'] == 'codex')
            self.assertEqual((codex['counts']['running'], codex['counts']['blocked'], codex['counts']['queued'], codex['open']), (1, 1, 0, 2))
            self.assertEqual(codex['last_update']['source'], 'manual')
            self.assertEqual([r['title'] for r in codex['running']], ['a'])
            self.assertEqual(codex['running'][0]['status_source'], 'agent_reported')
            self.assertEqual(state['agents']['unassigned_open'], 1)
            claude = next(x for x in state['agents']['agents'] if x['id'] == 'claude')
            self.assertEqual(sum(claude['counts'].values()), 0)
        finally:
            s.stop(); s.tmp.cleanup()

    def test_hermes_observation_reflects_chat_runs_table_only(self):
        s = Server(); s.start()
        try:
            c = s.client()
            self.assertIsNone(c.state()['agents']['agents'][0]['observation']['last_chat_run'])
            code, run, _ = c.request('/api/chat', {'prompt': 'hello', 'request_key': 'k' * 20})
            self.assertEqual(code, 202)
            import time
            for _ in range(50):
                last = c.state()['agents']['agents'][0]['observation']['last_chat_run']
                if last and last['status'] != 'running':
                    break
                time.sleep(.2)
            self.assertEqual(last['status'], 'completed')
        finally:
            s.stop(); s.tmp.cleanup()


class Kanban(ApiCase):
    def setUp(self):  # the class shares one server: every test starts from the same synthetic board
        from harness import SYNTHETIC_KANBAN
        self.server.set_kanban_rows(SYNTHETIC_KANBAN)
        self.server.set_kanban_mode('ok')

    def refresh(self, server=None):
        s = server or self.server
        return s.client().post('/api/kanban/refresh', {})

    def test_connected_read_only_and_normalised(self):
        self.server.set_kanban_mode('ok')
        code, view = self.refresh()
        self.assertEqual((code, view['status'], view['counts']['stored']), (200, 'connected', 4))
        k = self.c.state()['kanban']
        by = {t['external_id']: t for t in k['tasks']}
        self.assertNotIn('t_003', by, 'archived tasks are skipped')
        self.assertEqual((by['t_001']['status'], by['t_001']['assignee']), ('queued', 'writer'))
        self.assertEqual(by['t_002']['status'], 'running')
        self.assertEqual(by['t_004']['status'], 'blocked')
        self.assertEqual((by['t_005']['status'], by['t_005']['status_raw']), (None, 'mystery'), 'unmapped statuses are shown as Hermes reported them')
        self.assertEqual(k['source'], 'observed')
        hermes = self.c.state()['agents']['agents'][0]
        self.assertEqual((hermes['board']['status'], hermes['board']['board_only']), ('connected', 4))

    def test_only_read_commands_are_ever_sent_to_hermes(self):
        self.server.set_kanban_mode('ok')
        self.refresh()
        calls = [c for c in self.server.hermes_calls() if c[:1] == ['kanban']]
        self.assertTrue(calls)
        for call in calls:
            self.assertEqual(call, ['kanban', 'list', '--json'])

    def test_kanban_cards_cannot_be_edited_through_the_api(self):
        self.server.set_kanban_mode('ok')
        self.refresh()
        for path, body in (('/api/agent-tasks/status', {'id': 't_001', 'status': 'completed'}), ('/api/agent-tasks/update', {'id': 't_001', 'title': 'x'}), ('/api/agent-tasks/evidence', {'id': 't_001', 'label': 'x'})):
            self.assertEqual(self.c.post(path, body)[0], 404)
        self.assertEqual(self.c.request('/api/kanban/t_001', {'status': 'done'})[0], 404)

    def test_empty_board_is_connected_not_an_error(self):
        self.server.set_kanban_rows([])
        code, view = self.refresh()
        self.assertEqual((view['status'], view['counts']['stored'], view['counts']['received']), ('connected', 0, 0))
        self.server.set_kanban_rows([{'id': 1, 'title': 'x', 'status': 'todo'}])
        self.assertEqual(self.refresh()[1]['counts']['stored'], 1)
        self.server.set_kanban_rows({'tasks': [{'task_id': 'a', 'title': 'wrapped', 'status': 'done'}, 'junk', {'title': 'no id', 'status': 'todo'}]})
        view = self.refresh()[1]
        self.assertEqual((view['status'], view['counts']['received'], view['counts']['stored'], view['counts']['rejected']), ('connected', 3, 1, 2), 'partly recognised: connected, with the rejects counted')

    def test_not_connected_when_this_hermes_has_no_kanban(self):
        self.server.set_kanban_mode('ok')
        self.assertEqual(self.refresh()[1]['counts']['stored'], 4)
        self.server.set_kanban_mode('missing')
        view = self.refresh()[1]
        self.assertEqual(view['status'], 'not_connected')
        self.assertIn('no Kanban command', view['detail'])
        self.assertEqual(len(view['tasks']), 4, 'the last good snapshot is kept, and labelled as the last successful read')
        self.assertTrue(view['showing_last_success'])
        self.server.set_kanban_mode('ok')
        self.refresh()

    def test_not_connected_when_hermes_is_not_installed(self):
        s = Server(hermes=False); s.start()
        try:
            view = s.client().post('/api/kanban/refresh', {})[1]
            self.assertEqual(view['status'], 'not_connected')
            self.assertIsNone(view['last_success_at'])
            self.assertEqual(view['tasks'], [])
            self.assertEqual(s.hermes_calls(), [])
        finally:
            s.stop(); s.tmp.cleanup()

    def test_failures_are_reported_without_leaking_stderr(self):
        self.server.set_kanban_mode('error')
        view = self.refresh()[1]
        self.assertEqual(view['status'], 'failed')
        self.assertNotIn('someone', json.dumps(self.c.state()))
        self.server.set_kanban_mode('garbage')
        self.assertEqual(self.refresh()[1]['status'], 'failed')
        self.server.set_kanban_mode('binary')
        self.assertEqual(self.refresh()[1]['status'], 'failed', 'undecodable output is a reported failure, not a crash')
        self.server.set_kanban_mode('ok')
        self.assertEqual(self.refresh()[1]['status'], 'connected')

    def test_timeout_is_reported(self):
        import os
        from unittest import mock
        with mock.patch.dict(os.environ, {'FAKE_HERMES_KANBAN': 'hang'}):
            result = agent_tasks.fetch_kanban(str(Path(__file__).resolve().parent / 'fake_hermes.py'), timeout=1)
        self.assertEqual((result['status'], result.get('rows')), ('failed', None))
        self.assertIn('did not answer', result['detail'])

    def test_board_name_is_validated(self):
        for board, expected in (('atm10-server', True), ('Bad Board', False), ('../x', False), ('', False)):
            self.assertEqual(bool(agent_tasks.BOARD.fullmatch(board)), expected, board)

    def test_unchecked_state_before_first_read_is_explicit(self):
        s = Server(); s.process = None
        # Server.start() triggers an automatic read; a fresh database with no read recorded reports 'unchecked'.
        import tempfile, migrations
        d = Path(tempfile.mkdtemp()) / 'w.sqlite3'
        migrations.migrate(d)
        c = sqlite3.connect(d); c.row_factory = sqlite3.Row
        view = agent_tasks.kanban_view(c, '2026-10-20T00:00:00+00:00')
        c.close(); s.tmp.cleanup()
        self.assertEqual((view['status'], view['counts']['stored'], view['tasks'], view['last_success_at'], view['stale']), ('unchecked', 0, [], None, None))


class ExistingFeaturesPreserved(ApiCase):
    def test_captures_still_work_alongside_agent_tasks(self):
        code, saved = self.c.post('/api/captures', {'title': 'QA capture — synthetic', 'owner': 'QA', 'lane': 'Build', 'due': '2026-10-20'})
        self.assertEqual(code, 201)
        self.assertEqual(self.c.post('/api/captures/update', {'id': saved['id'], 'action': 'pin'})[0], 200)
        state = self.c.state()
        self.assertTrue(any(x['id'] == saved['id'] and x['pinned'] == 1 for x in state['captures']))
        self.assertEqual(self.c.post('/api/captures/update', {'id': saved['id'], 'action': 'complete-in-clickup'})[0], 400)

    def test_export_contains_agent_data_and_no_secrets(self):
        tid = self.task()
        self.c.post('/api/agent-tasks/evidence', {'id': tid, 'label': 'Output'})
        export = self.c.request('/api/export')[1]
        for key in ('agents', 'agent_tasks', 'agent_task_history', 'agent_task_evidence', 'captures', 'messages', 'events'):
            self.assertIn(key, export)
        self.assertNotIn('csrf', export)
        self.assertNotIn('runtime', export)
        self.assertTrue(any(t['id'] == tid for t in export['agent_tasks']))

    def test_activity_log_says_nothing_was_sent_to_an_agent(self):
        self.task()
        labels = [e['label'] for e in self.c.state()['events'] if e['kind'] == 'agent']
        self.assertTrue(labels)
        self.assertTrue(all('no agent' in l.lower() or 'link not fetched' in l.lower() or 'decision recorded locally' in l.lower() for l in labels), labels)

    def test_data_survives_restart_including_history(self):
        s = Server(); s.start()
        try:
            c = s.client()
            tid = c.post('/api/agent-tasks', {'title': 'Persist me', 'agent_id': 'claude'})[1]['id']
            c.post('/api/agent-tasks/status', {'id': tid, 'status': 'running', 'source': 'agent_reported'})
            c.post('/api/agent-tasks/evidence', {'id': tid, 'label': 'Out', 'url': 'https://example.com/x'})
            s.restart()
            c = s.client()
            d = c.request('/api/agent-tasks/' + tid)[1]
            self.assertEqual((d['task']['title'], d['task']['status'], d['task']['status_source']), ('Persist me', 'running', 'agent_reported'))
            self.assertEqual([h['kind'] for h in d['history']], ['created', 'status', 'evidence'])
            self.assertEqual(len(d['evidence']), 1)
        finally:
            s.stop(); s.tmp.cleanup()

    def test_existing_database_is_migrated_on_startup_with_backup(self):
        import tempfile, test_migrations
        d = Path(tempfile.mkdtemp())
        test_migrations.legacy_db(d / 'workbench.sqlite3')
        s = Server(data=d)
        code, message = s.run_to_exit()
        self.assertEqual(code, 2, 'an existing database is not migrated without --migrate')
        self.assertIn('--migrate', message)
        self.assertEqual(sqlite3.connect(d / 'workbench.sqlite3').execute('PRAGMA user_version').fetchone()[0], 0)
        self.assertEqual(list(d.glob('*.backup-*')), [], 'nothing was written, not even a backup')
        s.args = ['--migrate']
        s.start()
        try:
            c = s.client()
            state = c.state()
            self.assertEqual([x['title'] for x in state['captures']], ['Synthetic capture'])
            self.assertEqual([m['body'] for m in state['messages']], ['hello'])
            self.assertEqual(len(state['agents']['agents']), 5)
            self.assertTrue(list(d.glob('workbench.backup-v0-*.sqlite3')))
        finally:
            s.stop(); s.tmp.cleanup()


if __name__ == '__main__':
    unittest.main()
