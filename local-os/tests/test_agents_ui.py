import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness import Server  # noqa: E402

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover
    sync_playwright = None


class UiCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if sync_playwright is None:
            raise unittest.SkipTest('Python Playwright is not installed')
        cls.server = Server().start()
        cls.pw = sync_playwright().start()
        try:
            cls.browser = cls.pw.chromium.launch()
        except Exception as exc:  # pragma: no cover
            cls.pw.stop()
            cls.server.stop()
            raise unittest.SkipTest(f'Chromium unavailable: {exc}')

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.stop()
        cls.server.tmp.cleanup()

    def setUp(self):
        self.errors = []
        self.page = self.browser.new_page(viewport={'width': 1440, 'height': 1000})
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        self.page.on('console', lambda m: self.errors.append(m.text) if m.type == 'error' and not m.text.startswith('Failed to load resource') else None)  # expected 4xx validation responses are not JS errors
        self.page.goto(self.server.base)
        self.page.locator('#server-status', has_text='connected').wait_for()

    def tearDown(self):
        self.assertEqual(self.errors, [])
        self.page.close()

    def go(self, view):
        self.page.locator(f'[data-view="{view}"]').click()
        self.assertTrue(self.page.locator(f'[data-page="{view}"]').is_visible())

    def card(self, title):
        return self.page.locator('.task-card', has=self.page.locator('h3', has_text=re.compile('^' + re.escape(title) + '$')))

    def create(self, title, agent='claude', **fields):
        p = self.page
        self.go('agents')
        p.locator('#task-add').click()
        p.locator('#agent-task-title').fill(title)
        p.locator('#agent-task-agent').select_option(agent)
        for name, value in fields.items():
            p.locator(f'#agent-task-form [name="{name}"]').fill(value)
        p.locator('#agent-task-form button[type="submit"]').click()
        self.card(title).wait_for()

    def open_task(self, title):
        self.go('agents')
        self.card(title).locator('[data-task-open]').click()
        self.page.wait_for_selector('#task-dialog[open]')

    def record(self, status, source='manual', note=''):
        p = self.page
        p.locator('[data-task-form="update"] select[name="status"]').select_option(status)
        p.locator('[data-task-form="update"] select[name="source"]').select_option(source)
        p.locator('[data-task-form="update"] textarea[name="note"]').fill(note)
        p.locator('[data-task-form="update"] button[type="submit"]').click()

    def no_overflow(self):
        return self.page.evaluate('document.documentElement.scrollWidth <= innerWidth')


class EmptyState(unittest.TestCase):
    def test_fresh_workspace_shows_agents_and_no_invented_activity(self):
        if sync_playwright is None:
            self.skipTest('Python Playwright is not installed')
        with Server() as server, sync_playwright() as pw:
            try:
                browser = pw.chromium.launch()
            except Exception as exc:
                self.skipTest(f'Chromium unavailable: {exc}')
            page = browser.new_page(viewport={'width': 1440, 'height': 1000})
            page.goto(server.base)
            page.locator('#server-status', has_text='connected').wait_for()
            cards = page.locator('#agent-overview .agent-card')
            self.assertEqual(cards.count(), 5)
            self.assertEqual([t.strip() for t in cards.locator('h3').all_inner_texts()], ['Hermes', 'ChatGPT', 'Claude', 'Codex', 'Gemini'])
            self.assertEqual(page.locator('#agent-overview .agent-card .badge:text-is("NOT CONNECTED")').count(), 4)
            self.assertEqual(page.locator('#agent-overview .agent-card .badge:text-is("LOCAL CLI DETECTED")').count(), 1)
            self.assertIn('No tasks tracked yet', page.locator('#agent-overview').inner_text())
            self.assertEqual(page.locator('#agent-overview .agent-stats .has').count(), 0, 'every count is zero')
            self.assertEqual(page.locator('#agent-overview .agent-running').count(), 0)
            self.assertEqual(page.locator('#agent-overview .agent-card:has(h3:text-is("Hermes")) .src-observed').count(), 1)
            self.assertEqual(page.locator('#agent-overview .agent-card:has(h3:text-is("Claude")) .src-observed').count(), 0, 'no observed badge on an unconnected agent')
            page.locator('[data-view="agents"]').click()
            self.assertIn('No agent tasks yet', page.locator('#agent-task-list').inner_text())
            page.locator('#kanban-panel .badge', has_text='CONNECTED').wait_for()
            browser.close()


class Navigation(UiCase):
    def test_every_view_renders_including_agents(self):
        for view in ('today', 'captures', 'agents', 'knowledge', 'activity', 'connections'):
            self.go(view)
        self.assertEqual(self.page.locator('#page-name').inner_text(), 'Connections')
        self.go('agents')
        self.assertEqual(self.page.locator('#page-name').inner_text(), 'Agents & tasks')

    def test_connections_view_explains_manual_agents_and_kanban(self):
        self.go('connections')
        text = self.page.locator('#connection-list').inner_text()
        self.assertIn('Hermes Kanban', text)
        self.assertIn('ChatGPT · Claude · Codex · Gemini', text)
        self.assertIn('NOT CONNECTED · MANUAL TRACKING', text)
        self.assertIn('no paid API', text)

    def test_existing_capture_flow_still_works(self):
        p = self.page
        self.go('captures')
        p.locator('#capture-add').click()
        p.locator('#capture-title').fill('Synthetic capture from UI test')
        p.locator('#capture-form button[type="submit"]').click()
        p.wait_for_selector('.capture-card h3:text("Synthetic capture from UI test")')
        p.reload()
        p.wait_for_selector('.capture-card h3:text("Synthetic capture from UI test")')


class TaskLifecycle(UiCase):
    def test_create_assign_and_see_it_on_today(self):
        self.create('UI: draft a discovery script', agent='claude', due='2026-11-01')
        text = self.card('UI: draft a discovery script').inner_text()
        self.assertIn('QUEUED', text)
        self.assertIn('Claude', text)
        self.assertIn('Target: 2026-11-01', text)
        self.assertIn('MANUAL', text)
        self.go('today')
        claude = self.page.locator('#agent-overview .agent-card:has(h3:text-is("Claude"))')
        self.assertEqual(claude.locator('.agent-stats .has b').inner_text(), '1')
        self.assertNotEqual(self.page.locator('#agent-badge').inner_text(), '00')

    def test_markup_in_titles_is_text_never_html(self):
        payload = '<img src=x onerror="window.__xss=1">'
        self.create(payload)
        self.open_task(payload)
        self.page.wait_for_timeout(300)
        self.assertTrue(self.page.evaluate('window.__xss === undefined'))
        self.assertEqual(self.page.locator('#task-dialog img, .task-card img, #agent-overview img').count(), 0)
        self.assertIn('<img', self.page.locator('#task-dialog h2').inner_text())
        self.page.locator('[data-close="task-dialog"]').click()

    def test_blocked_needs_a_reason_and_shows_agent_reported_provenance(self):
        self.create('UI: blocked flow', agent='gemini')
        self.open_task('UI: blocked flow')
        self.record('blocked', source='agent_reported')
        self.page.locator('#toast', has_text='Say why the task is blocked').wait_for()
        self.record('blocked', source='agent_reported', note='Needs the competitor list')
        self.page.wait_for_selector('#task-dialog .badge:text-is("BLOCKED")')
        self.assertIn('AGENT-REPORTED', self.page.locator('#task-dialog .task-flags').first.inner_text())
        history = self.page.locator('#task-dialog .history').inner_text()
        self.assertIn('Status: Queued → Blocked', history)
        self.assertIn('Needs the competitor list', history)
        self.assertIn('Gemini', history)
        self.page.locator('[data-close="task-dialog"]').click()
        self.go('today')
        self.assertTrue(self.page.locator('#agent-overview .attn.st-blocked').count() >= 1)

    def test_review_needs_evidence_then_approve_completes(self):
        p = self.page
        self.create('UI: review flow', agent='codex')
        self.open_task('UI: review flow')
        self.assertNotIn('Completed', p.locator('[data-task-form="update"] select[name="status"]').inner_text().replace('Completed (current)', ''), 'completion is only offered through review')
        self.record('awaiting_review', source='agent_reported')
        p.wait_for_selector('.review-panel')
        self.assertTrue(p.locator('[data-review="approve"]').is_disabled())
        p.locator('[data-review="reject"]').click()
        p.locator('#toast', has_text='what needs to change').wait_for()
        form = p.locator('[data-task-form="evidence"]')
        form.locator('input[name="label"]').fill('Pull request')
        form.locator('input[name="url"]').fill('https://example.com/pull/7')
        form.locator('select[name="source"]').select_option('agent_reported')
        form.locator('button[type="submit"]').click()
        p.wait_for_selector('.evidence-row a')
        link = p.locator('.evidence-row a').first
        self.assertEqual((link.get_attribute('href'), link.get_attribute('target'), link.get_attribute('rel')), ('https://example.com/pull/7', '_blank', 'noopener noreferrer'))
        self.assertIn('AGENT-REPORTED', p.locator('.evidence-row').first.inner_text())
        p.locator('[data-review="approve"]:enabled').wait_for()
        p.locator('#review-note').fill('Reads well')
        p.locator('[data-review="approve"]').click()
        p.wait_for_selector('#task-dialog .badge:text-is("COMPLETED")')
        self.assertIn('APPROVED BY YOU', p.locator('#task-dialog .task-flags').first.inner_text())
        self.assertEqual(p.locator('.review-panel').count(), 0)
        p.locator('[data-close="task-dialog"]').click()
        self.go('agents')
        self.assertEqual(self.card('UI: review flow').count(), 0, 'completed tasks are hidden by default')
        p.locator('#show-completed').check()
        self.assertEqual(self.card('UI: review flow').count(), 1)
        p.locator('#show-completed').uncheck()

    def test_reject_sends_the_task_back_with_the_reason(self):
        p = self.page
        self.create('UI: reject flow', agent='chatgpt')
        self.open_task('UI: reject flow')
        self.record('awaiting_review')
        p.wait_for_selector('.review-panel')
        p.locator('#review-note').fill('Tone is off')
        p.locator('[data-review="reject"]').click()
        p.wait_for_selector('#task-dialog .badge:text-is("QUEUED")')
        self.assertIn('REJECTED · REWORK', p.locator('#task-dialog .task-flags').first.inner_text())
        self.assertIn('Tone is off', p.locator('#task-dialog .history').inner_text())

    def test_edit_and_reassign(self):
        p = self.page
        self.create('UI: edit flow', agent='claude')
        self.open_task('UI: edit flow')
        form = p.locator('[data-task-form="edit"]')
        form.locator('select[name="agent_id"]').select_option('codex')
        form.locator('select[name="priority"]').select_option('urgent')
        form.locator('button[type="submit"]').click()
        p.locator('#task-dialog .history', has_text='Assigned: Claude → Codex').wait_for()
        self.assertIn('URGENT', p.locator('#task-dialog .eyebrow').inner_text())
        p.locator('[data-close="task-dialog"]').click()

    def test_filters(self):
        self.create('UI: filter alpha', agent='codex')
        self.create('UI: filter beta', agent='gemini')
        p = self.page
        self.go('agents')
        p.locator('#task-agent-filter').select_option('gemini')
        self.assertEqual(self.card('UI: filter alpha').count(), 0)
        self.assertEqual(self.card('UI: filter beta').count(), 1)
        p.locator('#task-agent-filter').select_option('')
        p.locator('#task-search').fill('alpha')
        self.assertEqual(self.card('UI: filter beta').count(), 0)
        p.locator('#task-search').fill('')
        p.locator('#task-status-filter').select_option('running')
        self.assertEqual(self.card('UI: filter alpha').count(), 0)
        p.locator('#task-status-filter').select_option('')


class KanbanPanel(UiCase):
    def refresh_panel(self):
        self.go('agents')
        self.page.locator('#kanban-refresh').click()
        self.page.locator('#kanban-refresh:enabled').wait_for()

    def test_connected_then_not_connected(self):
        p = self.page
        self.server.set_kanban_mode('ok')
        self.refresh_panel()
        p.wait_for_selector('.kanban-row')
        text = p.locator('#kanban-panel').inner_text()
        self.assertIn('CONNECTED · READ-ONLY', text)
        self.assertEqual(p.locator('#kanban-panel .kanban-row').count(), 4)
        self.assertIn('Hermes status: mystery', text)
        self.assertEqual(p.locator('#kanban-panel .src-observed').count(), 1)
        self.assertEqual(p.locator('#kanban-panel button, #kanban-panel input, #kanban-panel select, #kanban-panel textarea').count(), 0, 'no controls: the board is read-only')
        self.server.set_kanban_mode('missing')
        self.refresh_panel()
        p.locator('#kanban-panel .kanban-row').first.wait_for(state='detached')
        self.assertIn('NOT CONNECTED', p.locator('#kanban-panel').inner_text())
        self.assertNotIn('Synthetic', p.locator('#kanban-panel').inner_text())
        self.server.set_kanban_mode('ok')


class Responsive(UiCase):
    def test_no_horizontal_overflow_and_dialogs_fit(self):
        self.create('UI: responsive task with a deliberately long title to exercise wrapping in cards and dialogs across every breakpoint', agent='claude')
        for width, height in ((1440, 1000), (1200, 900), (980, 900), (768, 900), (390, 844), (320, 700)):
            self.page.set_viewport_size({'width': width, 'height': height})
            for view in ('today', 'agents', 'connections'):
                self.go(view)
                self.assertTrue(self.no_overflow(), f'{view} overflows at {width}px')
            self.go('agents')
            self.page.locator('.task-card [data-task-open]').first.click()
            self.page.wait_for_selector('#task-dialog[open]')
            box = self.page.locator('#task-dialog').bounding_box()
            self.assertLessEqual(box['x'] + box['width'], width + 1, f'task dialog exceeds {width}px')
            self.assertGreaterEqual(box['x'], 0)
            self.assertTrue(self.no_overflow(), f'task dialog overflows at {width}px')
            self.page.locator('[data-close="task-dialog"]').click()
            self.page.locator('#task-add').click()
            box = self.page.locator('#agent-task-dialog').bounding_box()
            self.assertLessEqual(box['x'] + box['width'], width + 1)
            self.page.locator('[data-close="agent-task-dialog"]').click()

    def test_touch_targets_on_mobile(self):
        self.create('UI: touch target task', agent='claude')
        self.page.set_viewport_size({'width': 390, 'height': 844})
        self.go('agents')
        small = self.page.evaluate("""() => [...document.querySelectorAll('[data-page="agents"] button, [data-page="agents"] select, [data-page="agents"] input:not([type=checkbox])')]
            .filter(e => e.offsetParent !== null).map(e => [e.textContent.trim().slice(0, 30) || e.id, e.getBoundingClientRect().height]).filter(([, h]) => h < 40)""")
        self.assertEqual(small, [])


if __name__ == '__main__':
    unittest.main()
