"""The Hermes Kanban display must tell the truth: keep the last good read on failure, fail closed on
bad output, account for every record it received, and never present a board state as a live worker."""
import json
import os
import random
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from harness import Server, SYNTHETIC_KANBAN  # noqa: E402
import agent_tasks  # noqa: E402
import migrations  # noqa: E402

T0 = '2026-10-20T10:00:00+00:00'


def rec(i, status='todo', **extra):
    return {'id': f't{i}', 'title': f'Synthetic task {i}', 'status': status, **extra}


def db():
    d = Path(tempfile.mkdtemp()) / 'w.sqlite3'
    migrations.migrate(d)
    c = sqlite3.connect(d)
    c.row_factory = sqlite3.Row
    return c


class Parse(unittest.TestCase):
    def test_non_empty_list_that_is_entirely_unrecognisable_fails_closed(self):
        for payload in ([{'name': 'x'}, {'foo': 1}], ['a', 'b', 3], [{'id': 1}, {'title': 'no id'}, {'id': '', 'title': 'x'}]):
            result = agent_tasks.parse_kanban(payload)
            self.assertEqual(result['status'], 'failed', payload)
            self.assertIn('none were recognisable', result['detail'])
            self.assertEqual(result['received'], len(payload))
            self.assertNotIn('rows', result)

    def test_empty_list_is_a_connected_empty_board(self):
        result = agent_tasks.parse_kanban([])
        self.assertEqual((result['status'], result['received'], result['stored']), ('connected', 0, 0))

    def test_not_a_list_fails(self):
        for payload in ({'error': 'x'}, 'text', 5, None, {'tasks': 'nope'}):
            self.assertEqual(agent_tasks.parse_kanban(payload)['status'], 'failed', payload)

    def test_duplicates_are_merged_explicitly_and_counts_match_what_is_displayed(self):
        result = agent_tasks.parse_kanban([rec(1), rec(1, title='second copy'), rec(2)])
        self.assertEqual((result['received'], result['duplicates'], result['unique'], result['stored']), (3, 1, 2, 2))
        self.assertEqual([r['title'] for r in result['rows'] if r['external_id'] == 't1'], ['Synthetic task 1'], 'first occurrence wins, deterministically')
        self.assertIn('1 duplicates merged', result['detail'])

    def test_no_silent_cap_201_records_are_all_stored_and_over_the_limit_is_announced(self):
        result = agent_tasks.parse_kanban([rec(i) for i in range(201)])
        self.assertEqual((result['stored'], result['dropped'], result['truncated']), (201, 0, False))
        big = agent_tasks.parse_kanban([rec(i) for i in range(agent_tasks.KANBAN_MAX_STORED + 25)])
        self.assertEqual((big['stored'], big['dropped'], big['truncated'], big['unique']), (agent_tasks.KANBAN_MAX_STORED, 25, True, agent_tasks.KANBAN_MAX_STORED + 25))
        self.assertIn('TRUNCATED: 25 more not stored', big['detail'])

    def test_states_are_explicit_raw_is_preserved_and_unknown_is_never_guessed(self):
        result = agent_tasks.parse_kanban([rec(1, 'Todo'), rec(2, 'scheduled'), rec(3, 'archived'), rec(4, 'quantum'), rec(5, 'review'), rec(6, 'done'), rec(7, ''), {'id': 'x8', 'title': 'no status field'}])
        by = {r['external_id']: r for r in result['rows']}
        self.assertEqual((by['t1']['status'], by['t1']['state_class'], by['t1']['status_raw']), ('queued', 'open', 'Todo'))
        self.assertEqual((by['t2']['status'], by['t2']['state_class']), (None, 'scheduled'))
        self.assertNotIn('t3', by)
        self.assertEqual(result['archived_skipped'], 1)
        self.assertEqual((by['t4']['status'], by['t4']['state_class'], by['t4']['status_raw']), (None, 'unknown', 'quantum'))
        self.assertEqual((by['t5']['status'], by['t6']['status']), ('awaiting_review', 'completed'))
        self.assertEqual((by['t7']['status_raw'], by['t7']['state_class']), ('unknown', 'unknown'))
        self.assertEqual(by['x8']['status_raw'], 'unknown')

    def test_every_received_record_is_accounted_for(self):
        rng = random.Random(20261020)
        statuses = ['todo', 'running', 'blocked', 'done', 'archived', 'scheduled', 'mystery', '', None]
        for _ in range(200):
            payload = []
            for i in range(rng.randint(0, 40)):
                kind = rng.random()
                if kind < .15:
                    payload.append(rng.choice(['junk', 7, None, [1], {'x': 1}, {'id': 1}, {'title': 't'}]))
                else:
                    payload.append({'id': rng.choice([f'a{i}', f'a{rng.randint(0, 5)}']), 'title': 'T', 'status': rng.choice(statuses)})
            result = agent_tasks.parse_kanban(payload)
            if result['status'] != 'connected':
                self.assertTrue(payload and result['rejected'] == len(payload))
                continue
            self.assertEqual(result['received'], result['rejected'] + result['archived_skipped'] + result['duplicates'] + result['unique'], payload)
            self.assertEqual(result['stored'], len(result['rows']))
            self.assertEqual(result['stored'], result['unique'] - result['dropped'])

    def test_real_hermes_shape_with_extra_fields_still_parses(self):
        # Modelled on what Keystal reported from a real `hermes kanban list --json` (ids, titles, todo/blocked/done states).
        # No real sample is committed and the field names are undocumented: the probe tool prints the real ones.
        payload = [{'id': f'abc{i}', 'title': 'Synthetic', 'status': s, 'assignee': 'worker', 'tenant': None, 'priority': 0, 'created_at': 1760000000, 'body': 'x'} for i, s in enumerate(('todo', 'blocked', 'done'))]
        result = agent_tasks.parse_kanban(payload)
        self.assertEqual([r['status'] for r in result['rows']], ['queued', 'blocked', 'completed'])
        self.assertIn('assignee', result['field_names'])
        self.assertEqual(result['rows'][0]['updated_raw'], '1760000000')


class Store(unittest.TestCase):
    def setUp(self):
        self.c = db()
        self.addCleanup(self.c.close)

    def read(self, payload, now, board=None, manual=False):
        return agent_tasks.store_kanban(self.c, now, agent_tasks.parse_kanban(payload), board, 'local', manual)

    def view(self, now=T0):
        return agent_tasks.kanban_view(self.c, now)

    def test_failed_refresh_keeps_the_last_good_snapshot_and_reports_both_times(self):
        self.read([rec(i) for i in range(4)], T0)
        self.assertEqual(len(self.view()['tasks']), 4)
        later = '2026-10-20T10:04:00+00:00'
        agent_tasks.store_kanban(self.c, later, {'status': 'failed', 'detail': 'Hermes could not list the Kanban board.'}, None, 'local')
        v = self.view('2026-10-20T10:05:00+00:00')
        self.assertEqual(len(v['tasks']), 4, 'the displayed records survive a failed read')
        self.assertEqual((v['status'], v['last_attempt_at'], v['last_success_at']), ('failed', later, T0))
        self.assertTrue(v['showing_last_success'])
        self.assertEqual(v['age_seconds'], 300)
        self.assertEqual(v['counts']['stored'], 4)
        self.assertEqual(v['error'], 'Hermes could not list the Kanban board.')

    def test_unsupported_and_wholly_invalid_reads_also_keep_the_last_good_snapshot(self):
        self.read([rec(1), rec(2)], T0)
        agent_tasks.store_kanban(self.c, '2026-10-20T10:01:00+00:00', {'status': 'not_connected', 'detail': 'This Hermes version has no Kanban command.'}, None, 'local')
        self.assertEqual(len(self.view()['tasks']), 2)
        self.read([{'garbage': True}], '2026-10-20T10:02:00+00:00')
        v = self.view('2026-10-20T10:03:00+00:00')
        self.assertEqual((v['status'], len(v['tasks']), v['last_success_at']), ('failed', 2, T0))

    def test_recovery_replaces_the_snapshot_and_clears_the_error(self):
        self.read([rec(1), rec(2)], T0)
        agent_tasks.store_kanban(self.c, '2026-10-20T10:01:00+00:00', {'status': 'failed', 'detail': 'x'}, None, 'local')
        self.read([rec(9, 'running')], '2026-10-20T10:02:00+00:00')
        v = self.view('2026-10-20T10:02:30+00:00')
        self.assertEqual(([t['external_id'] for t in v['tasks']], v['status'], v['error'], v['showing_last_success'], v['stale']), (['t9'], 'connected', None, False, False))

    def test_stale_is_derived_from_the_last_success_not_the_last_attempt(self):
        self.read([rec(1)], T0)
        self.assertFalse(self.view('2026-10-20T10:05:00+00:00')['stale'])
        self.assertTrue(self.view('2026-10-20T10:20:00+00:00')['stale'])
        agent_tasks.store_kanban(self.c, '2026-10-20T10:19:59+00:00', {'status': 'failed', 'detail': 'x'}, None, 'local')
        self.assertTrue(self.view('2026-10-20T10:20:00+00:00')['stale'], 'a failed attempt does not make old data fresh')
        with mock.patch.dict(os.environ, {'KEYSTAL_OS_KANBAN_STALE_SECONDS': '120'}):
            self.assertEqual(self.view('2026-10-20T10:05:00+00:00')['stale_after_seconds'], 120)

    def test_never_read_is_unchecked_not_connected_with_zero(self):
        v = self.view()
        self.assertEqual((v['status'], v['last_success_at'], v['stale'], v['tasks'], v['showing_last_success']), ('unchecked', None, None, [], False))
        agent_tasks.store_kanban(self.c, T0, {'status': 'not_connected', 'detail': 'No CLI'}, None, 'local')
        v = self.view()
        self.assertEqual((v['status'], v['last_success_at'], v['has_snapshot'] if 'has_snapshot' in v else None), ('not_connected', None, None))
        self.assertEqual(v['board']['label'], 'No board has been read yet')

    def test_board_is_labelled_and_a_config_change_is_flagged(self):
        self.read([rec(1)], T0, board='ops')
        v = self.view()
        self.assertEqual((v['board']['name'], v['board']['pinned'], v['board']['changed']), ('ops', True, False))
        self.assertEqual(v['board']['label'], 'Board: ops')
        agent_tasks.store_kanban(self.c, '2026-10-20T10:01:00+00:00', {'status': 'failed', 'detail': 'x'}, 'other', 'local')
        v = self.view('2026-10-20T10:02:00+00:00')
        self.assertEqual((v['board']['name'], v['board']['configured'], v['board']['changed']), ('ops', 'other', True))
        self.read([rec(1)], '2026-10-20T10:03:00+00:00', board=None)
        v = self.view('2026-10-20T10:03:30+00:00')
        self.assertFalse(v['board']['pinned'])
        self.assertIn('not pinned', v['board']['label'])
        self.assertFalse(v['link']['enabled'])

    def test_earlier_schema_v2_bookkeeping_is_still_understood(self):
        self.c.execute("INSERT OR REPLACE INTO meta VALUES('kanban', ?)", (json.dumps({'status': 'connected', 'detail': 'old', 'checked_at': T0, 'count': 3}),))
        self.c.commit()
        v = self.view('2026-10-20T10:01:00+00:00')
        self.assertEqual((v['status'], v['last_success_at'], v['counts']['stored'], v['link']['enabled']), ('connected', T0, 3, False))

    def test_events_are_written_on_change_not_on_every_poll(self):
        n = lambda: self.c.execute("SELECT COUNT(*) FROM events WHERE kind IN ('connection','error')").fetchone()[0]
        self.read([rec(1)], T0)
        first = n()
        self.read([rec(1)], '2026-10-20T10:01:00+00:00')
        self.assertEqual(n(), first, 'unchanged background reads stay quiet')
        self.read([rec(1)], '2026-10-20T10:02:00+00:00', manual=True)
        self.assertEqual(n(), first + 1)
        agent_tasks.store_kanban(self.c, '2026-10-20T10:03:00+00:00', {'status': 'failed', 'detail': 'x'}, None, 'local')
        self.assertEqual(n(), first + 2)


class LinkedCountsOnce(unittest.TestCase):
    def setUp(self):
        self.c = db()
        self.addCleanup(self.c.close)
        self.now = T0
        agent_tasks.store_kanban(self.c, T0, agent_tasks.parse_kanban([rec(1, 'running'), rec(2, 'blocked'), rec(3, 'todo'), rec(4, 'done'), rec(5, 'scheduled'), rec(6, 'mystery')]), 'ops', 'local')
        self.c.commit()

    def call(self, fn, body):
        self.c.execute('BEGIN IMMEDIATE')
        try:
            out = fn(self.c, self.now, body)
            self.c.commit()
            return out
        except agent_tasks.ApiError:
            self.c.rollback()
            raise

    def overview(self):
        view = agent_tasks.kanban_view(self.c, T0)
        return {a['id']: a for a in agent_tasks.overview(self.c, {'bridge_available': True, 'busy': False}, view)['agents']}

    def test_board_only_cards_count_for_hermes_with_scheduled_and_unknown_kept_apart(self):
        h = self.overview()['hermes']
        self.assertEqual((h['counts']['running'], h['counts']['blocked'], h['counts']['queued'], h['counts']['completed']), (1, 1, 1, 1))
        self.assertEqual((h['board']['board_only'], h['board']['scheduled'], h['board']['unknown'], h['board']['linked']), (6, 1, 1, 0))
        self.assertEqual(h['open'], 3, 'scheduled and unknown records are not guessed into a status')

    def test_a_linked_card_is_counted_once_through_its_task(self):
        tid = self.call(agent_tasks.create_task, {'title': 'Tracked', 'agent_id': 'hermes'})[1]['id']
        self.call(agent_tasks.set_status, {'id': tid, 'status': 'running'})
        self.call(agent_tasks.link_task, {'id': tid, 'provider': 'hermes_kanban', 'external_id': 't1'})
        h = self.overview()['hermes']
        self.assertEqual(h['counts']['running'], 1, 'task t1 + its running card are ONE running item, not two')
        self.assertEqual((h['board']['linked'], h['board']['board_only'], h['board']['tracked_tasks']), (1, 5, 1))
        v = agent_tasks.kanban_view(self.c, T0)
        self.assertEqual([t['linked_task_id'] for t in v['tasks'] if t['external_id'] == 't1'], [tid])

    def test_drift_between_tracked_status_and_board_is_surfaced_not_overwritten(self):
        tid = self.call(agent_tasks.create_task, {'title': 'Tracked', 'agent_id': 'hermes'})[1]['id']
        self.call(agent_tasks.link_task, {'id': tid, 'provider': 'hermes_kanban', 'external_id': 't1'})
        self.assertEqual(self.overview()['hermes']['board']['drift'], 1)
        detail = agent_tasks.task_detail(self.c, tid)
        self.assertTrue(detail['refs'][0]['board_record']['drift'])
        self.assertEqual(detail['task']['status'], 'queued', 'the board never rewrites the local status')
        self.assertEqual(detail['refs'][0]['board_record']['record']['status_raw'], 'running')

    def test_linking_rules(self):
        tid = self.call(agent_tasks.create_task, {'title': 'Tracked'})[1]['id']
        other = self.call(agent_tasks.create_task, {'title': 'Other', 'agent_id': 'claude'})[1]['id']
        with self.assertRaises(agent_tasks.ApiError) as e:
            self.call(agent_tasks.link_task, {'id': other, 'provider': 'hermes_kanban', 'external_id': 't1'})
        self.assertEqual(e.exception.status, 409)
        with self.assertRaises(agent_tasks.ApiError) as e:
            self.call(agent_tasks.link_task, {'id': tid, 'provider': 'hermes_kanban', 'external_id': 'nope'})
        self.assertEqual(e.exception.status, 404)
        with self.assertRaises(agent_tasks.ApiError):
            self.call(agent_tasks.link_task, {'id': tid, 'provider': 'hermes_kanban', 'external_id': 't1', 'scope': 'other-board'})
        self.call(agent_tasks.link_task, {'id': tid, 'provider': 'hermes_kanban', 'external_id': 't1'})
        self.assertEqual(self.c.execute('SELECT agent_id FROM agent_tasks WHERE id=?', (tid,)).fetchone()[0], 'hermes', 'linking assigns an unassigned task to Hermes')
        third = self.call(agent_tasks.create_task, {'title': 'Third', 'agent_id': 'hermes'})[1]['id']
        with self.assertRaises(agent_tasks.ApiError) as e:
            self.call(agent_tasks.link_task, {'id': third, 'provider': 'hermes_kanban', 'external_id': 't1'})
        self.assertEqual(e.exception.status, 409, 'one card maps to exactly one task')
        with self.assertRaises(agent_tasks.ApiError) as e:
            self.call(agent_tasks.update_task, {'id': tid, 'agent_id': 'codex'})
        self.assertEqual(e.exception.status, 409, 'a task linked to a Hermes card stays with Hermes')

    def test_linking_needs_a_pinned_board(self):
        agent_tasks.store_kanban(self.c, T0, agent_tasks.parse_kanban([rec(1)]), None, 'local')
        self.c.commit()
        tid = self.call(agent_tasks.create_task, {'title': 'Tracked', 'agent_id': 'hermes'})[1]['id']
        with self.assertRaises(agent_tasks.ApiError) as e:
            self.call(agent_tasks.link_task, {'id': tid, 'provider': 'hermes_kanban', 'external_id': 't1'})
        self.assertEqual(e.exception.status, 409)
        self.assertIn('Pin a board', str(e.exception))


class ServerBoardHandling(unittest.TestCase):
    def test_invalid_board_name_stops_the_server_and_reads_nothing(self):
        for bad in ('Bad Board', '../x', 'a b', '-lead', 'x' * 65, 'UPPER'):
            s = Server(extra_env={'KEYSTAL_OS_KANBAN_BOARD': bad})
            code, message = s.run_to_exit()
            self.assertEqual(code, 2, bad)
            self.assertIn('not a valid Hermes board name', message)
            self.assertEqual(s.hermes_calls(), [], 'no Hermes command ran')
            self.assertFalse((s.data / 'workbench.sqlite3').exists(), 'nothing was created')
            s.tmp.cleanup()

    def test_invalid_instance_label_stops_the_server(self):
        s = Server(extra_env={'KEYSTAL_OS_HERMES_INSTANCE': 'bad instance!'})
        self.assertEqual(s.run_to_exit()[0], 2)
        s.tmp.cleanup()

    def test_pinned_board_is_passed_to_hermes_exactly_and_shown(self):
        with Server(extra_env={'KEYSTAL_OS_KANBAN_BOARD': 'atm10-server'}) as s:
            v = s.client().state()['kanban']
            calls = [c for c in s.hermes_calls() if c[:1] == ['kanban']]
            self.assertEqual(calls[0], ['kanban', '--board', 'atm10-server', 'list', '--json'])
            self.assertEqual((v['board']['name'], v['board']['pinned'], v['board']['label']), ('atm10-server', True, 'Board: atm10-server'))
            self.assertTrue(v['link']['enabled'])

    def test_unpinned_board_never_claims_a_board_name(self):
        with Server() as s:
            v = s.client().state()['kanban']
            self.assertEqual(s.hermes_calls()[0], ['kanban', 'list', '--json'])
            self.assertFalse(v['board']['pinned'])
            self.assertIsNone(v['board']['name'])
            self.assertIn('not pinned', v['board']['label'])
            self.assertFalse(v['link']['enabled'])

    def test_board_in_the_snapshot_is_the_board_actually_read_after_a_config_change(self):
        with Server(extra_env={'KEYSTAL_OS_KANBAN_BOARD': 'first'}) as s:
            self.assertEqual(s.client().state()['kanban']['board']['name'], 'first')
            s.extra_env['KEYSTAL_OS_KANBAN_BOARD'] = 'second'
            s.restart()
            c = s.client()
            v = c.state()['kanban']
            self.assertEqual((v['board']['name'], v['status']), ('second', 'connected'), 'the new board was read and is what is labelled')
            s.set_kanban_mode('missing')
            s.extra_env['KEYSTAL_OS_KANBAN_BOARD'] = 'third'
            s.restart()
            v = s.client().state()['kanban']
            self.assertEqual((v['board']['name'], v['board']['configured'], v['board']['changed'], v['showing_last_success']), ('second', 'third', True, True),
                             'when the new board cannot be read, the old snapshot is labelled with ITS board and the change is flagged')

    def test_same_card_id_on_two_boards_does_not_collide(self):
        with Server(extra_env={'KEYSTAL_OS_KANBAN_BOARD': 'one'}) as s:
            c = s.client()
            a = c.post('/api/agent-tasks', {'title': 'A', 'agent_id': 'hermes'})[1]['id']
            self.assertEqual(c.post('/api/agent-tasks/link', {'id': a, 'provider': 'hermes_kanban', 'external_id': 't_001'})[0], 201)
            s.extra_env['KEYSTAL_OS_KANBAN_BOARD'] = 'two'
            s.restart()
            c = s.client()
            b = c.post('/api/agent-tasks', {'title': 'B', 'agent_id': 'hermes'})[1]['id']
            self.assertEqual(c.post('/api/agent-tasks/link', {'id': b, 'provider': 'hermes_kanban', 'external_id': 't_001'})[0], 201, 'same id, different board: allowed')
            view = c.state()['kanban']
            self.assertEqual([t['linked_task_id'] for t in view['tasks'] if t['external_id'] == 't_001'], [b], 'only the link on the board actually shown is applied')
            refs = c.request('/api/agent-tasks/' + a)[1]['refs']
            self.assertEqual(refs[0]['scope'], 'one')
            self.assertFalse(refs[0]['board_record']['comparable'], 'a link to another board is not compared against this snapshot')

    def test_board_running_is_not_reported_as_a_live_worker(self):
        with Server() as s:
            hermes = s.client().state()['agents']['agents'][0]
            self.assertEqual(hermes['counts']['running'], 1, 'the board record is counted')
            self.assertFalse(hermes['observation']['working_now'], 'but it is not evidence that Hermes is working')

    def test_background_read_refreshes_and_stale_flags_when_reads_stop_succeeding(self):
        with Server(extra_env={'KEYSTAL_OS_KANBAN_REFRESH_SECONDS': '30', 'KEYSTAL_OS_KANBAN_STALE_SECONDS': '60'}) as s:
            v = s.client().state()['kanban']
            self.assertEqual((v['refresh_seconds'], v['stale_after_seconds'], v['status']), (30, 60, 'connected'))
        with Server(extra_env={'KEYSTAL_OS_KANBAN_REFRESH_SECONDS': '0'}) as s:
            self.assertEqual(s.client().state()['kanban']['refresh_seconds'], 0)


class InstanceAndPinChanges(unittest.TestCase):
    """The snapshot keeps the board and instance it was READ with; a later failed attempt cannot relabel it."""

    def test_a_failed_attempt_under_a_new_instance_does_not_relabel_the_snapshot_or_its_links(self):
        with Server(extra_env={'KEYSTAL_OS_KANBAN_BOARD': 'ops', 'KEYSTAL_OS_HERMES_INSTANCE': 'local'}) as s:
            c = s.client()
            a = c.post('/api/agent-tasks', {'title': 'A', 'agent_id': 'hermes'})[1]['id']
            self.assertEqual(c.post('/api/agent-tasks/link', {'id': a, 'provider': 'hermes_kanban', 'external_id': 't_002'})[0], 201)
            s.set_kanban_mode('error')
            s.extra_env['KEYSTAL_OS_HERMES_INSTANCE'] = 'work'
            s.restart()
            c = s.client()
            view = c.state()['kanban']
            self.assertEqual((view['status'], view['instance']), ('failed', 'local'), 'the snapshot is still the one read under "local"')
            self.assertEqual([t['linked_task_id'] for t in view['tasks'] if t['external_id'] == 't_002'], [a], 'the existing link still matches')
            b = c.post('/api/agent-tasks', {'title': 'B', 'agent_id': 'hermes'})[1]['id']
            self.assertEqual(c.post('/api/agent-tasks/link', {'id': b, 'provider': 'hermes_kanban', 'external_id': 't_001'})[0], 201)
            ref = c.request('/api/agent-tasks/' + b)[1]['refs'][0]
            self.assertEqual((ref['instance'], ref['scope']), ('local', 'ops'), 'a new link records the instance and board the card was actually read from')

    def test_losing_the_pin_never_counts_linked_work_twice(self):
        with Server(extra_env={'KEYSTAL_OS_KANBAN_BOARD': 'ops'}) as s:
            c = s.client()
            a = c.post('/api/agent-tasks', {'title': 'A', 'agent_id': 'hermes'})[1]['id']
            c.post('/api/agent-tasks/status', {'id': a, 'status': 'running'})
            c.post('/api/agent-tasks/link', {'id': a, 'provider': 'hermes_kanban', 'external_id': 't_002'})
            self.assertEqual(c.state()['agents']['agents'][0]['counts']['running'], 1)
            del s.extra_env['KEYSTAL_OS_KANBAN_BOARD']
            s.restart()
            hermes = s.client().state()['agents']['agents'][0]
            self.assertEqual(hermes['counts']['running'], 1, 'the running card may be the linked task: it is not added again')
            self.assertEqual((hermes['board']['ambiguous'], hermes['board']['linked']), (1, 0))

    def test_truncation_is_explained_where_it_changes_the_meaning(self):
        c = db()
        self.addCleanup(c.close)
        agent_tasks.store_kanban(c, T0, agent_tasks.parse_kanban([rec(i) for i in range(agent_tasks.KANBAN_MAX_STORED + 5)]), 'ops', 'local')
        c.commit()
        c.execute('BEGIN IMMEDIATE')
        tid = agent_tasks.create_task(c, T0, {'title': 'Tracked', 'agent_id': 'hermes'})[1]['id']
        c.commit()
        c.execute('BEGIN IMMEDIATE')
        with self.assertRaises(agent_tasks.ApiError) as e:
            agent_tasks.link_task(c, T0, {'id': tid, 'provider': 'hermes_kanban', 'external_id': f't{agent_tasks.KANBAN_MAX_STORED + 2}'})
        c.rollback()
        self.assertIn('TRUNCATED', str(e.exception))
        self.assertIn('Refreshing will not help', str(e.exception))
        c.execute('BEGIN IMMEDIATE')
        agent_tasks.link_task(c, T0, {'id': tid, 'provider': 'hermes_kanban', 'external_id': 't5'})
        c.commit()
        agent_tasks.store_kanban(c, '2026-10-20T10:01:00+00:00', agent_tasks.parse_kanban([rec(i) for i in range(6, agent_tasks.KANBAN_MAX_STORED + 10)]), 'ops', 'local')
        c.commit()
        record = agent_tasks.task_detail(c, tid)['refs'][0]['board_record']
        self.assertEqual((record['in_last_read'], record['snapshot_truncated']), (False, True), 'a missing card on a truncated read is not reported as gone')

    def test_every_unlinked_record_is_accounted_for_in_the_hermes_breakdown(self):
        c = db()
        self.addCleanup(c.close)
        agent_tasks.store_kanban(c, T0, agent_tasks.parse_kanban([rec(1, 'running'), rec(2, 'todo'), rec(3, 'done'), rec(4, 'scheduled'), rec(5, 'mystery'), rec(6, 'review'), rec(7, 'blocked')]), 'ops', 'local')
        c.commit()
        view = agent_tasks.kanban_view(c, T0)
        b = agent_tasks.overview(c, {'bridge_available': True, 'busy': False}, view)['agents'][0]['board']
        self.assertEqual((b['in_tiles'], b['done'], b['scheduled'], b['unknown']), (4, 1, 1, 1))
        self.assertEqual(b['in_tiles'] + b['done'] + b['scheduled'] + b['unknown'], b['board_only'])


if __name__ == '__main__':
    unittest.main()
