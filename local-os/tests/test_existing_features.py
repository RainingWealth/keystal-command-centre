"""Regression checks for what the app did before Agents & tasks: chat through the Hermes bridge, saved
documents and captures. Self-contained: a stub Hermes CLI and synthetic documents, never the owner's files."""
import sys
import time
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness import Server  # noqa: E402


class ExistingFeatures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = Server().start()
        cls.c = cls.server.client()

    @classmethod
    def tearDownClass(cls):
        cls.server.stop()
        cls.server.tmp.cleanup()

    def wait_run(self, client, run_id):
        for _ in range(100):
            state = client.state()
            run = next(r for r in state['runs'] if r['id'] == run_id)
            if run['status'] != 'running':
                return state, run
            time.sleep(.1)
        self.fail('chat run did not finish')

    def test_saved_documents_come_from_the_configured_folder_only(self):
        docs = {d['id']: d for d in self.c.state()['documents']}
        self.assertTrue(docs['manual']['available'])
        self.assertFalse(docs['tools']['available'], 'documents not present in the folder are reported unavailable')
        code, doc, _ = self.c.request('/api/doc/manual')
        self.assertEqual(code, 200)
        self.assertTrue(doc['content'].startswith('Keystal OS'))
        self.assertIn('Synthetic operating manual used only by tests', doc['content'])
        self.assertTrue(doc['source'].startswith(str(self.server.docs)), 'the test server never reads ~/Keystal')
        self.assertEqual(self.c.request('/api/doc/tools')[0], 404)
        self.assertEqual(self.c.request('/api/doc/..%2f..%2fetc%2fpasswd')[0], 404)

    def test_two_turn_chat_keeps_context_and_survives_restart(self):
        # Through the real /api/chat bridge and session-resume plumbing, with the stub CLI standing in for the model.
        code, run, _ = self.c.request('/api/chat', {'prompt': 'Acceptance test. Remember the harmless marker amber-orbit. Reply exactly: amber-orbit recorded. Do not call tools.', 'request_key': uuid.uuid4().hex})
        self.assertEqual(code, 202)
        state, result = self.wait_run(self.c, run['run_id'])
        self.assertEqual(result['status'], 'completed')
        code, run2, _ = self.c.request('/api/chat', {'thread_id': run['thread_id'], 'prompt': 'What harmless marker did I ask you to remember? Reply with only the marker. Do not call tools.', 'request_key': uuid.uuid4().hex})
        state, _ = self.wait_run(self.c, run2['run_id'])
        replies = [m['body'] for m in state['messages'] if m['thread_id'] == run['thread_id'] and m['role'] == 'assistant']
        self.assertEqual(replies, ['amber-orbit recorded', 'amber-orbit'])
        self.server.restart()
        client = self.server.client()
        self.assertEqual(len([m for m in client.state()['messages'] if m['thread_id'] == run['thread_id']]), 4)
        type(self).c = client

    def test_captures_pin_archive_restore_and_persist(self):
        code, saved = self.c.post('/api/captures', {'title': 'Synthetic capture', 'owner': 'QA', 'lane': 'Build', 'due': '2026-10-20'})
        self.assertEqual(code, 201)
        for action in ('pin', 'archive', 'restore'):
            self.assertEqual(self.c.post('/api/captures/update', {'id': saved['id'], 'action': action})[0], 200)
        self.server.restart()
        client = self.server.client()
        type(self).c = client
        self.assertTrue(any(x['id'] == saved['id'] and x['status'] == 'inbox' for x in client.state()['captures']))

    def test_security_headers_and_guards_on_new_endpoints(self):
        code, _, headers = self.c.request('/api/agent-tasks/' + 'a' * 32)
        self.assertEqual(code, 404)
        self.assertIn("frame-ancestors 'none'", headers['Content-Security-Policy'])
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual(self.c.request('/api/kanban/refresh', {}, {'X-Keystal-CSRF': 'wrong'})[0], 403)
        self.assertEqual(self.c.request('/api/agent-tasks/session', {'id': 'a' * 32, 'session_ref': 'x'}, {'Origin': 'http://evil.example'})[0], 403)


if __name__ == '__main__':
    unittest.main()
