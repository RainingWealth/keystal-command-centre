"""Regressions for the five-lens review; all data and Hermes calls are synthetic."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_agents_ui import UiCase


class PollReview(UiCase):
    def test_11_hung_poll_expires_and_marks_the_whole_page_stale(self):
        p = self.page
        self.go('agents')
        p.wait_for_function('() => !pollBusy && state.kanban.last_success_at')
        p.clock.install()
        p.evaluate("""() => {
            window.fetch = (_path, options) => new Promise((_resolve, reject) => {
                options.signal?.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')));
            });
        }""")
        p.evaluate('void refresh()')
        p.clock.fast_forward(12000)
        self.assertFalse(p.evaluate('pollBusy'), 'a hung request must release the polling guard')
        self.assertTrue(p.locator('#connection-warning').is_visible())
        self.assertTrue(p.locator('#send-message').is_disabled())
        self.assertNotIn('FRESH', p.locator('#kanban-panel').inner_text())
        self.assertNotIn('CONNECTED · READ-ONLY', p.locator('#kanban-panel').inner_text())

    def test_12_failed_poll_labels_cached_views_and_recovers_after_cookie_loss(self):
        p = self.page
        p.wait_for_function('() => !pollBusy && state.kanban.last_success_at')
        p.route('**/api/state', lambda r: r.fulfill(status=500, content_type='application/json', body='{"error":"database locked"}'))
        p.evaluate('refresh()')
        self.assertTrue(p.locator('#connection-warning').is_visible())
        self.assertNotIn('FRESH', p.locator('#kanban-panel').inner_text())
        self.assertNotIn('just now', p.locator('#agent-overview').inner_text())
        self.assertNotIn('LOCAL CLI DETECTED', p.locator('#agent-overview').inner_text())
        p.unroute('**/api/state')
        p.context.clear_cookies()
        p.evaluate('refresh()')
        self.assertIn('Local workspace connected', p.locator('#server-status').inner_text())
        self.assertFalse(p.locator('#connection-warning').is_visible())


if __name__ == '__main__':
    unittest.main()
