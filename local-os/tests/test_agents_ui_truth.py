"""Browser tests for the truthful Hermes Kanban panel, links, session identifiers and projects."""
import json
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness import SYNTHETIC_KANBAN  # noqa: E402
from test_agents_ui import UiCase  # noqa: E402


class Pinned(UiCase):
    server_kwargs = {'extra_env': {'KEYSTAL_OS_KANBAN_BOARD': 'ops', 'KEYSTAL_OS_PREVIEW_LABEL': 'ISOLATED PREVIEW · synthetic data · STUB Hermes (simulated)'}}

    def setUp(self):
        self.server.set_kanban_rows(SYNTHETIC_KANBAN)
        self.server.set_kanban_mode('ok')
        super().setUp()

    def refresh_panel(self):
        self.go('agents')
        self.page.locator('#kanban-refresh').click()
        self.page.locator('#kanban-refresh:enabled').wait_for()

    def test_preview_banner_labels_simulated_integrations(self):
        banner = self.page.locator('#preview-banner')
        self.assertTrue(banner.is_visible())
        self.assertIn('STUB Hermes (simulated)', banner.inner_text())

    def test_panel_shows_the_facts_separately_and_accounts_for_every_record(self):
        self.refresh_panel()
        panel = self.page.locator('#kanban-panel')
        panel.locator('.kanban-row').first.wait_for()
        text = panel.inner_text()
        for label in ('LAST ATTEMPT', 'LAST SUCCESSFUL READ', 'BOARD'):
            self.assertIn(label, text)
        self.assertIn('Board: ops', text)
        self.assertIn('FRESH', text)
        self.assertIn('received 5 · shown 4 · 1 archived skipped', text)
        self.assertIn('Hermes states as reported: ready 1 · running 1 · blocked 1 · mystery 1', text)
        self.assertIn('not proof that a worker is live', text)
        self.assertIn('Read automatically every 5 min', text)
        self.assertEqual(panel.locator('.kanban-row').count(), 4)

    def test_failed_read_keeps_the_rows_and_says_so_with_both_times(self):
        self.refresh_panel()
        self.server.set_kanban_mode('error')
        self.refresh_panel()
        panel = self.page.locator('#kanban-panel')
        panel.locator('.badge', has_text='READ FAILED').wait_for()
        text = panel.inner_text()
        self.assertIn('Showing the last successful read', text)
        self.assertIn('may be out of date', text)
        self.assertEqual(panel.locator('.kanban-row').count(), 4, 'rows are not blanked by a failed read')
        self.assertNotIn('someone', text, 'raw stderr (a local path) never reaches the browser')
        self.assertIn('Run `hermes kanban list` in a terminal', text)
        self.assertIn('LAST SUCCESSFUL READ', text)
        self.server.set_kanban_mode('ok')
        self.refresh_panel()
        panel.locator('.badge', has_text='CONNECTED · READ-ONLY').wait_for()
        self.assertNotIn('Showing the last successful read', panel.inner_text())

    def test_wholly_unrecognisable_output_is_a_read_failure_not_an_empty_board(self):
        self.refresh_panel()
        self.server.set_kanban_rows([{'foo': 1}, {'bar': 2}])
        self.refresh_panel()
        panel = self.page.locator('#kanban-panel')
        panel.locator('.badge', has_text='READ FAILED').wait_for()
        self.assertIn('none were recognisable', panel.inner_text())
        self.assertEqual(panel.locator('.kanban-row').count(), 4)

    def test_long_boards_are_listed_in_part_with_an_explicit_count_and_toggle(self):
        self.server.set_kanban_rows([{'id': f'c{i}', 'title': f'Synthetic card {i}', 'status': 'todo'} for i in range(150)])
        self.refresh_panel()
        panel = self.page.locator('#kanban-panel')
        panel.locator('.kanban-row').first.wait_for()
        self.assertEqual(panel.locator('.kanban-row').count(), 100)
        self.assertIn('Listing 100 of 150 stored records', panel.inner_text())
        panel.locator('[data-kanban-toggle]').click()
        self.assertEqual(panel.locator('.kanban-row').count(), 150)
        panel.locator('[data-kanban-toggle]').click()
        self.assertEqual(panel.locator('.kanban-row').count(), 100)

    def test_over_the_storage_limit_is_announced_as_truncation(self):
        self.server.set_kanban_rows([{'id': f'c{i}', 'title': f'Synthetic card {i}', 'status': 'todo'} for i in range(1010)])
        self.refresh_panel()
        panel = self.page.locator('#kanban-panel')
        panel.locator('.kanban-error', has_text='TRUNCATED').wait_for()
        self.assertIn('TRUNCATED: 10 more records were not stored', panel.inner_text())
        self.go('today')
        self.assertIn('TRUNCATED', self.page.locator('#agent-overview .agent-card:has(h3:text-is("Hermes"))').inner_text())

    def test_hermes_card_explains_what_its_counts_include(self):
        self.refresh_panel()
        self.go('today')
        card = self.page.locator('#agent-overview .agent-card:has(h3:text-is("Hermes"))')
        card.locator('.agent-live small').first.wait_for()
        text = card.inner_text()
        self.assertIn('Includes 4 unlinked board records', text)
        self.assertIn('3 in the tiles, 1 with an unknown state (not in the tiles)', text, 'every unlinked record is accounted for, including the ones the tiles cannot show')
        self.assertIn('A board state is a record, not proof of a live worker', text)
        self.assertEqual(card.locator('.agent-stats .has').count(), 3)
        self.assertNotIn('Working on a chat turn now', text, 'a board record marked running is not a live worker')

    def test_link_a_hermes_card_counts_it_once_and_shows_the_board_state(self):
        p = self.page
        self.server.set_kanban_rows(SYNTHETIC_KANBAN)
        self.refresh_panel()
        self.create('UI: tracked hermes work', agent='hermes')
        self.open_task('UI: tracked hermes work')
        form = p.locator('[data-task-form="link-hermes"]')
        form.locator('select[name="external_id"]').select_option('t_002')
        form.locator('button[type="submit"]').click()
        p.locator('#task-dialog .evidence-row', has_text='Hermes Kanban card').wait_for()
        text = p.locator('#task-dialog').inner_text()
        self.assertIn('Board record: running (active)', text)
        self.assertIn('not proof of a live worker', text)
        self.assertIn('This differs from the status tracked here', text)
        self.assertIn('nothing was changed in the other system', text)
        p.locator('[data-close="task-dialog"]').click()
        self.go('agents')
        row = p.locator('#kanban-panel .kanban-row', has_text='Synthetic: build intake form')
        self.assertIn('LINKED · open task', row.inner_text())
        self.assertEqual(p.locator('#kanban-panel .kanban-row', has_text='Synthetic: review outreach copy').locator('[data-task-open]').count(), 0)
        self.go('today')
        card = p.locator('#agent-overview .agent-card:has(h3:text-is("Hermes"))')
        self.assertIn('1 linked card counted once', card.inner_text())
        self.assertIn('differ from the board', card.inner_text())
        self.go('agents')
        row.locator('[data-task-open]').click()
        p.wait_for_selector('#task-dialog[open]')
        self.assertIn('UI: tracked hermes work', p.locator('#task-dialog h2').inner_text())
        p.locator('[data-unlink]').click()
        p.locator('#task-dialog', has_text='Not linked to a Hermes card or a ClickUp task').wait_for()
        self.assertIn('Link removed here only', p.locator('#toast').inner_text())
        p.locator('[data-close="task-dialog"]').click()

    def test_linking_is_offered_only_for_unlinked_cards_and_tasks_stay_with_hermes(self):
        p = self.page
        self.refresh_panel()
        self.create('UI: claude task', agent='claude')
        self.open_task('UI: claude task')
        form = p.locator('[data-task-form="link-hermes"]')
        form.locator('select[name="external_id"]').select_option('t_001')
        form.locator('button[type="submit"]').click()
        p.locator('#toast', has_text='only be linked to tasks assigned to Hermes').wait_for()
        self.assertEqual(p.locator('#task-dialog .evidence-row', has_text='Hermes Kanban card').count(), 0)
        p.locator('[data-close="task-dialog"]').click()

    def test_clickup_reference_session_identifier_and_project(self):
        p = self.page
        self.create('UI: reference flow', agent='codex', project='Synthetic Project X')
        self.go('agents')
        self.assertIn('Synthetic Project X', self.card('UI: reference flow').inner_text())
        self.open_task('UI: reference flow')
        click = p.locator('[data-task-form="link-clickup"]')
        click.locator('input[name="scope"]').fill('workspace-1')
        click.locator('input[name="context"]').fill('list-9')
        click.locator('input[name="external_id"]').fill('abc123')
        click.locator('input[name="url"]').fill('https://app.clickup.com/t/abc123')
        click.locator('button[type="submit"]').click()
        p.locator('#task-dialog .evidence-row', has_text='ClickUp task').wait_for()
        text = p.locator('#task-dialog').inner_text()
        self.assertIn('app.clickup.com / workspace-1 / abc123 · list list-9', text)
        self.assertEqual(p.locator('#task-dialog .evidence-row a[rel="noopener noreferrer"]').count(), 1)
        sess = p.locator('[data-task-form="session"]')
        sess.locator('input[name="session_ref"]').fill('sess_01HX')
        sess.locator('input[name="run_ref"]').fill('run-7')
        sess.locator('select[name="source"]').select_option('agent_reported')
        sess.locator('button[type="submit"]').click()
        p.locator('#task-dialog .evidence-row', has_text='sess_01HX').wait_for()
        row = p.locator('#task-dialog .evidence-row', has_text='sess_01HX').inner_text()
        self.assertIn('Codex · sess_01HX · run run-7', row)
        self.assertIn('AGENT-REPORTED', row)
        sess.locator('input[name="session_ref"]').fill('not valid!')
        sess.locator('button[type="submit"]').click()
        p.locator('#toast', has_text='Invalid session_ref').wait_for()
        p.locator('[data-close="task-dialog"]').click()
        self.go('agents')
        card = self.card('UI: reference flow').inner_text()
        self.assertIn('LINKED 1', card)
        p.locator('#task-project-filter').select_option('Synthetic Project X')
        self.assertEqual(self.card('UI: reference flow').count(), 1)
        p.locator('#task-project-filter').select_option('__none')
        self.assertEqual(self.card('UI: reference flow').count(), 0)
        p.locator('#task-project-filter').select_option('')

    def test_attention_strip_reports_unlinked_board_records_with_their_age(self):
        self.refresh_panel()
        self.go('today')
        strip = self.page.locator('#agent-overview')
        strip.locator('p.footnote.attention', has_text='Hermes board').wait_for()
        text = strip.inner_text()
        self.assertIn('Hermes board, unlinked records (observed', text)
        self.assertIn('1 blocked', text)
        self.assertIn('Board states are records, not proof of a live worker', text)

    def test_no_horizontal_overflow_with_the_new_sections_at_phone_widths(self):
        self.refresh_panel()
        self.create('UI: responsive links with a deliberately long title to exercise wrapping in the dialog sections at every width', agent='hermes')
        for width, height in ((1440, 1000), (980, 900), (390, 844), (320, 700)):
            self.page.set_viewport_size({'width': width, 'height': height})
            self.go('agents')
            self.assertTrue(self.no_overflow(), f'agents page overflows at {width}px')
            self.page.locator('.task-card [data-task-open]').first.click()
            self.page.wait_for_selector('#task-dialog[open]')
            self.assertTrue(self.no_overflow(), f'task dialog overflows at {width}px')
            box = self.page.locator('#task-dialog').bounding_box()
            self.assertLessEqual(box['x'] + box['width'], width + 1)
            self.page.locator('[data-close="task-dialog"]').click()


class Unpinned(UiCase):
    def setUp(self):
        self.server.set_kanban_rows(SYNTHETIC_KANBAN)
        self.server.set_kanban_mode('ok')
        super().setUp()

    def test_board_is_not_claimed_and_linking_explains_why_it_is_off(self):
        p = self.page
        self.go('agents')
        p.locator('#kanban-refresh').click()
        p.locator('#kanban-refresh:enabled').wait_for()
        text = p.locator('#kanban-panel').inner_text()
        self.assertIn('Hermes current board (not pinned', text)
        self.create('UI: unpinned', agent='hermes')
        self.open_task('UI: unpinned')
        self.assertEqual(p.locator('[data-task-form="link-hermes"]').count(), 0)
        self.assertIn('Linking needs a pinned board', p.locator('#task-dialog').inner_text())
        p.locator('[data-close="task-dialog"]').click()

    def test_no_preview_banner_in_a_normal_run(self):
        self.assertFalse(self.page.locator('#preview-banner').is_visible())


class NotConnected(UiCase):
    server_kwargs = {'hermes': False}

    def test_nothing_is_presented_as_read_when_hermes_is_absent(self):
        p = self.page
        self.go('agents')
        panel = p.locator('#kanban-panel')
        panel.locator('.badge', has_text='NOT CONNECTED').first.wait_for()
        text = panel.inner_text()
        self.assertIn('None yet', text)
        self.assertIn('No board has been read yet', text)
        self.assertNotIn('FRESH', text)
        self.assertNotIn('STALE', text)
        self.assertEqual(panel.locator('.kanban-row').count(), 0)
        self.assertNotIn('received 0', text, 'no read happened, so no counts are claimed')


class StaleOnEveryPage(UiCase):
    server_kwargs = {'extra_env': {'KEYSTAL_OS_KANBAN_STALE_SECONDS': '60', 'KEYSTAL_OS_KANBAN_REFRESH_SECONDS': '0'}}

    def test_connections_page_shows_age_and_stale_not_a_permanent_green_badge(self):
        import sqlite3
        import datetime as dt
        db = sqlite3.connect(self.server.data / 'workbench.sqlite3')
        meta = json.loads(db.execute("SELECT value FROM meta WHERE key='kanban'").fetchone()[0])
        old = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).isoformat()
        meta['last_success_at'] = meta['last_attempt_at'] = old
        db.execute("UPDATE meta SET value=? WHERE key='kanban'", (json.dumps(meta),))
        db.commit(); db.close()
        self.page.reload()
        self.page.locator('#server-status', has_text='connected').wait_for()
        self.go('connections')
        row = self.page.locator('#connection-list .connection-row', has_text='Hermes Kanban')
        text = row.inner_text()
        self.assertIn('CONNECTED · DATA STALE', text)
        self.assertIn('Last successful read 3h ago', text)
        self.assertIn('not proof of a live worker', text)
        self.assertNotIn('CONNECTED · READ-ONLY', text)
        self.go('agents')
        self.assertIn('STALE', self.page.locator('#kanban-panel').inner_text())


if __name__ == '__main__':
    unittest.main()
