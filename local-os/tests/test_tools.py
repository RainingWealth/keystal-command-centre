"""Operator tools: they must do only what they say (read-only where promised, no content printed, clean up)."""
import hashlib
import json
import os
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from pathlib import Path

TESTS = Path(__file__).resolve().parent
TOOLS = TESTS.parent / 'tools'
sys.path.insert(0, str(TESTS))
from harness import SYNTHETIC_KANBAN, free_port  # noqa: E402


def tree_hash(root):
    h = hashlib.sha256()
    for path in sorted(Path(root).rglob('*')):
        if path.is_file():
            h.update(str(path.relative_to(root)).encode())
            h.update(path.read_bytes())
            h.update(str(path.stat().st_mtime_ns).encode())
    return h.hexdigest()


class PreserveWorkspace(unittest.TestCase):
    def test_snapshots_dirty_work_without_touching_the_source_including_git_internals(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = Path(tmp) / 'ws'
            ws.mkdir()
            git = lambda *a: subprocess.run(['git', '-C', str(ws), *a], check=True, capture_output=True)
            git('init', '-q'); git('config', 'user.email', 'qa@example.com'); git('config', 'user.name', 'QA')
            (ws / 'a.txt').write_text('one\n'); git('add', 'a.txt'); git('commit', '-qm', 'init')
            (ws / 'a.txt').write_text('one\ntwo\n')
            (ws / 'staged.txt').write_text('staged\n'); git('add', 'staged.txt')
            (ws / 'untracked file.txt').write_text('new\n')
            time.sleep(1.1)  # make any index refresh visible as an mtime change
            before = tree_hash(ws)
            out = subprocess.run([str(TOOLS / 'preserve_workspace.sh'), str(ws), str(Path(tmp) / 'backups')], capture_output=True, text=True)
            self.assertEqual(out.returncode, 0, out.stderr)
            self.assertEqual(tree_hash(ws), before, 'not a byte or mtime changed in the source, .git included')
            dest = next((Path(tmp) / 'backups').iterdir())
            self.assertEqual(oct(dest.stat().st_mode & 0o777), '0o700')
            for name in ('status.txt', 'head.txt', 'branch.txt', 'staged.patch', 'unstaged.patch', 'untracked.tgz', 'repo.bundle', 'stash-list.txt', 'SHA256SUMS'):
                self.assertTrue((dest / name).exists(), name)
            self.assertIn('staged', (dest / 'staged.patch').read_text())
            self.assertIn('+two', (dest / 'unstaged.patch').read_text())
            listing = subprocess.run(['tar', '-tzf', str(dest / 'untracked.tgz')], capture_output=True, text=True).stdout
            self.assertIn('untracked file.txt', listing)
            self.assertEqual(subprocess.run(['git', '-C', str(dest / 'full-copy'), 'status', '--porcelain'], capture_output=True, text=True).stdout.count('\n'), 3)

    def test_refuses_a_non_git_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = subprocess.run([str(TOOLS / 'preserve_workspace.sh'), tmp, str(Path(tmp) / 'b')], capture_output=True, text=True)
            self.assertEqual(out.returncode, 2)
            self.assertFalse((Path(tmp) / 'b').exists())


class ProbeHermesKanban(unittest.TestCase):
    def run_probe(self, *args, mode='ok', rows=SYNTHETIC_KANBAN):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / 'k.json').write_text(json.dumps(rows))
            env = {**os.environ, 'FAKE_HERMES_KANBAN': mode, 'FAKE_HERMES_KANBAN_JSON': str(Path(tmp) / 'k.json'), 'FAKE_HERMES_LOG': str(Path(tmp) / 'log')}
            out = subprocess.run([sys.executable, str(TOOLS / 'probe_hermes_kanban.py'), '--hermes', str(TESTS / 'fake_hermes.py'), *args], capture_output=True, text=True, env=env)
            calls = [json.loads(l) for l in (Path(tmp) / 'log').read_text().splitlines()] if (Path(tmp) / 'log').exists() else []
            return out, calls

    def test_summarises_without_printing_any_board_content(self):
        out, calls = self.run_probe('--board', 'ops')
        self.assertEqual(out.returncode, 0, out.stderr)
        report = json.loads(out.stdout)
        self.assertEqual((report['status'], report['counts']['received'], report['counts']['stored']), ('connected', 5, 4))
        self.assertEqual(report['unmapped_raw_states'], ['mystery'])
        self.assertIn('assignee', report['json_field_names_seen'])
        for secret in ('Synthetic', 'writer', 'coder', 't_001'):
            self.assertNotIn(secret, out.stdout, 'no titles, assignees or ids are printed')
        self.assertEqual(calls, [['kanban', '--board', 'ops', 'list', '--json'], ['kanban', 'boards', 'list']], 'only the two read commands ran')

    def test_checks_the_pinned_board_exists_without_printing_the_board_list(self):
        out, calls = self.run_probe('--board', 'ops')
        report = json.loads(out.stdout)
        self.assertEqual(report['board_in_boards_list'], True)
        self.assertIn(['kanban', 'boards', 'list'], calls)
        self.assertNotIn('synthetic', out.stdout.replace('"board": "ops"', ''), 'other board names are not printed')
        out, _ = self.run_probe('--board', 'nosuchboard')
        report = json.loads(out.stdout)
        self.assertEqual((out.returncode, report['board_in_boards_list']), (1, False))
        self.assertIn('may not be of the board you meant', report['warning'])

    def test_failures_exit_nonzero(self):
        self.assertEqual(self.run_probe(mode='missing')[0].returncode, 1)
        self.assertEqual(self.run_probe(rows=[{'nope': 1}])[0].returncode, 1)
        out, calls = self.run_probe('--board', 'Bad Board')
        self.assertEqual((out.returncode, calls), (2, []))


class Preview(unittest.TestCase):
    def test_isolated_preview_labels_itself_hides_real_documents_and_cleans_up_on_sigterm(self):
        port = free_port()
        with tempfile.TemporaryDirectory() as home:
            real_docs = Path(home) / 'Keystal/outputs/keystal-os'
            real_docs.mkdir(parents=True)
            (real_docs / 'Keystal OS.md').write_text('Keystal OS\n\nPRIVATE REAL DOCUMENT\n')
            # A stand-in for the real vault helper the Dropbox check runs from HOME: it must never be executed.
            helper = Path(home) / '.hermes/skills/rayvern-brain/scripts'
            helper.mkdir(parents=True)
            (helper / 'rayvern_brain.py').write_text(f"open({str(Path(home) / 'helper-ran')!r}, 'w').write('ran'); print('Rayvern Brain')\n")
            venv = Path(home) / '.hermes/hermes-agent/venv/bin'
            venv.mkdir(parents=True)
            (venv / 'python').symlink_to(sys.executable)
            env = {**os.environ, 'HOME': home}
            p = subprocess.Popen([sys.executable, str(TOOLS / 'preview.py'), '--port', str(port), '--hermes', 'stub'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, env=env)
            try:
                lines = []
                for _ in range(200):
                    line = p.stdout.readline()
                    lines.append(line)
                    if 'Ctrl+C to stop' in line:
                        break
                text = ''.join(lines)
                self.assertIn(f'http://127.0.0.1:{port}/', text)
                self.assertIn('commit:', text)
                scratch = Path(next(l for l in lines if 'data:' in l).split('data:')[1].split('(')[0].strip()).parent
                self.assertTrue(scratch.exists())
                sys.path.insert(0, str(TESTS))
                from harness import Client
                c = Client(f'http://127.0.0.1:{port}')
                state = c.bootstrap()
                self.assertIn('STUB Hermes (simulated)', state['runtime']['preview_label'])
                self.assertGreaterEqual(len(state['agent_tasks']), 4)
                self.assertTrue(all(t['title'].startswith('Synthetic') for t in state['agent_tasks']))
                doc = c.request('/api/doc/manual')[1]
                self.assertNotIn('PRIVATE REAL DOCUMENT', json.dumps(doc), 'the preview never shows the real saved documents')
                check = c.request('/api/check/dropbox', {})[1]
                self.assertEqual(check['status'], 'failed', 'the preview cannot reach the real vault helper under your HOME')
                self.assertFalse((Path(home) / 'helper-ran').exists())
                p.send_signal(signal.SIGTERM)
                p.wait(timeout=15)
                time.sleep(.5)
                with socket.socket() as sock:
                    self.assertNotEqual(sock.connect_ex(('127.0.0.1', port)), 0, 'the server child was stopped')
                self.assertFalse(scratch.exists(), 'throwaway data deleted')
            finally:
                if p.poll() is None:
                    p.kill()
                p.stdout.close()


if __name__ == '__main__':
    unittest.main()
