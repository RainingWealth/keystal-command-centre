"""Regression coverage for operator-tool review findings 22-30, 33 and 34.

All databases, homes and repositories below are synthetic and temporary.
"""
import argparse
import contextlib
import fcntl
import io
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

TESTS = Path(__file__).resolve().parent
TOOLS = TESTS.parent / 'tools'
sys.path[:0] = [str(TESTS), str(TESTS.parent), str(TOOLS)]
import db_tool
import diagnose_sqlite
import migrations
import preview
import test_migrations as fixtures
from harness import Server, free_port


def run(*args):
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        code = db_tool.main(list(args))
    return code, json.loads(output.getvalue())


class DatabaseToolReview(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.db = self.root / 'workbench.sqlite3'
        fixtures.legacy_db(self.db)
        self.backup = self.root / 'backup.sqlite3'
        db_tool.online_backup(self.db, self.backup)
        self.no_server = mock.patch.object(db_tool, 'server_listening', return_value=None)
        self.no_server.start()
        self.addCleanup(self.no_server.stop)

    def test_23_failed_backup_does_not_leave_a_backup_named_empty_file(self):
        args = argparse.Namespace(db=str(self.db), out=str(self.root / 'out'))
        with mock.patch.object(db_tool, 'online_backup', side_effect=sqlite3.OperationalError('synthetic copy failure')):
            with self.assertRaises(sqlite3.OperationalError):
                db_tool.cmd_backup(args)
        self.assertEqual(list((self.root / 'out').glob('*.sqlite3')), [])

    def test_23_empty_or_unrelated_backup_is_refused_by_both_restore_commands(self):
        for shape in ('empty', 'unrelated'):
            backup = self.root / (shape + '.sqlite3')
            with sqlite3.connect(backup) as conn:
                if shape == 'unrelated':
                    conn.execute('CREATE TABLE unrelated(value TEXT)')
            for command in ('restore-test', 'restore'):
                with self.subTest(shape=shape, command=command):
                    code, report = run(command, '--backup', str(backup), '--db', str(self.db))
                    self.assertEqual(code, 3, report)
                    self.assertTrue(report['problems'])

    def test_24_failed_destination_copy_keeps_live_database_at_original_path(self):
        before = self.db.read_bytes()
        original = db_tool.online_backup
        def fail_at_destination(source, destination):
            if Path(destination).parent == self.db.parent:
                raise sqlite3.OperationalError('synthetic full destination disk')
            return original(source, destination)
        with mock.patch.object(db_tool, 'online_backup', side_effect=fail_at_destination):
            code, report = run('restore', '--backup', str(self.backup), '--db', str(self.db), '--execute')
        self.assertEqual(code, 3, report)
        self.assertTrue(self.db.exists(), report)
        self.assertEqual(self.db.read_bytes(), before)

    def test_25_same_file_and_alias_backup_are_refused_during_dry_run(self):
        alias = self.root / 'alias.sqlite3'
        alias.symlink_to(self.db)
        hardlink = self.root / 'hardlink.sqlite3'
        os.link(self.db, hardlink)
        before = self.db.read_bytes()
        for backup in (self.db, alias, hardlink):
            with self.subTest(backup=backup.name):
                code, report = run('restore', '--backup', str(backup), '--db', str(self.db))
                self.assertEqual(code, 3, report)
                self.assertFalse(report['executed'])
                self.assertIn('same', report['refused'].lower())
        self.assertEqual(self.db.read_bytes(), before)

    def test_26_restore_and_quarantine_refuse_the_data_folder_lock_on_any_port(self):
        for command in ('restore', 'quarantine'):
            with self.subTest(command=command):
                database = self.root / (command + '.sqlite3')
                fixtures.foreign_db(database)
                before = database.read_bytes()
                lock = self.root / 'keystal-server.lock'
                with lock.open('a') as holder:
                    fcntl.flock(holder, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    extra = ['--backup', str(self.backup)] if command == 'restore' else []
                    code, report = run(command, '--db', str(database), '--execute', *extra)
                self.assertEqual(code, 3, report)
                self.assertFalse(report['executed'])
                self.assertEqual(database.read_bytes(), before)

    def test_27_missing_and_invalid_inputs_always_report_json_with_exit_three(self):
        missing = self.root / 'missing.sqlite3'
        invalid = self.root / 'not-a-database.sqlite3'
        invalid.write_text('not sqlite')
        cases = [('inspect', '--db'), ('backup', '--db'), ('migrate-check', '--db'),
                 ('quarantine', '--db'), ('restore-test', '--backup'), ('restore', '--backup')]
        for path in (missing, invalid):
            for command, option in cases:
                with self.subTest(path=path.name, command=command):
                    extra = ['--db', str(self.db)] if option == '--backup' else []
                    code, report = run(command, option, str(path), *extra)
                    self.assertEqual(code, 3, report)
                    self.assertIn('result', report)
        self.assertFalse(missing.exists())

    def test_28_existing_backup_folder_permissions_are_preserved(self):
        folder = self.root / 'shared'
        folder.mkdir(mode=0o755)
        os.chmod(folder, 0o755)
        code, report = run('backup', '--db', str(self.db), '--out', str(folder))
        self.assertEqual(code, 0, report)
        self.assertEqual(folder.stat().st_mode & 0o777, 0o755)
        self.assertEqual(Path(report['backup']).stat().st_mode & 0o777, 0o600)

    def test_34_docstring_scopes_live_database_writes_to_both_execute_commands(self):
        intro = db_tool.__doc__.split('\n\n')[0]
        self.assertIn('`restore --execute`', intro)
        self.assertIn('`quarantine --execute`', intro)
        self.assertNotIn('every command that reads a database opens it\nread-only', intro)


class PreviewReview(unittest.TestCase):
    def test_22_port_collision_never_seeds_the_existing_server(self):
        with Server() as server:
            client = server.client()
            before = client.request('/api/export')[1]
            child = subprocess.run([sys.executable, str(TOOLS / 'preview.py'), '--port', str(server.port)],
                                   env=server.env, capture_output=True, text=True, timeout=20)
            after = client.request('/api/export')[1]
            self.assertEqual(after['agent_tasks'], before['agent_tasks'], child.stdout + child.stderr)
            self.assertNotEqual(child.returncode, 0)

    def test_22_responder_identity_is_checked_after_port_preflight_race(self):
        child = mock.Mock()
        child.poll.return_value = None
        child.wait.return_value = 0
        stranger = mock.Mock()
        stranger.bootstrap.return_value = {'runtime': {'preview_label': 'ISOLATED PREVIEW · synthetic data · STUB Hermes (simulated)'}}
        with mock.patch.object(preview.subprocess, 'Popen', return_value=child), \
                mock.patch.object(preview.urllib.request, 'urlopen'), \
                mock.patch.object(preview, 'Client', return_value=stranger), \
                mock.patch.object(preview, 'seed') as seed, \
                mock.patch.object(preview, 'commit', return_value='synthetic'), \
                mock.patch.object(preview.signal, 'signal'):
            code = preview.main(['--port', str(free_port())])
        self.assertNotEqual(code, 0)
        seed.assert_not_called()


class PreserveWorkspaceReview(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.ws = self.root / 'workspace'
        self.ws.mkdir()
        self.git('init', '-q')
        self.git('config', 'user.email', 'qa@example.com')
        self.git('config', 'user.name', 'QA')
        (self.ws / 'one').write_text('synthetic\n')
        self.git('add', 'one')
        self.git('commit', '-qm', 'synthetic')

    def git(self, *args):
        return subprocess.run(['git', '-C', str(self.ws), *args], check=True, capture_output=True, text=True)

    def test_29_nested_destination_is_refused_before_source_is_changed(self):
        destination = self.ws / 'missing-parent' / 'backups'
        result = subprocess.run([str(TOOLS / 'preserve_workspace.sh'), str(self.ws), str(destination)], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.ws / 'missing-parent').exists(), result.stderr)
        self.assertEqual(self.git('status', '--porcelain').stdout, '')

    def test_29_relative_destination_works_with_untracked_files(self):
        (self.ws / 'untracked file').write_text('synthetic\n')
        result = subprocess.run([str(TOOLS / 'preserve_workspace.sh'), 'workspace', 'backups'], cwd=self.root, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        destination = next((self.root / 'backups').iterdir())
        self.assertTrue((destination / 'repo.bundle').is_file())
        listing = subprocess.run(['tar', '-tzf', str(destination / 'untracked.tgz')], capture_output=True, text=True, check=True)
        self.assertIn('untracked file', listing.stdout)

    def test_30_bundle_failure_is_reported_as_failure_not_an_empty_repository(self):
        old_blob = self.git('rev-parse', 'HEAD:one').stdout.strip()
        (self.ws / 'one').write_text('new synthetic content\n')
        self.git('commit', '-qam', 'next synthetic')
        (self.ws / '.git' / 'objects' / old_blob[:2] / old_blob[2:]).unlink()
        result = subprocess.run([str(TOOLS / 'preserve_workspace.sh'), str(self.ws), str(self.root / 'backups')], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertNotIn('Preserved ', result.stdout)
        self.assertIn('bundle', result.stderr.lower())


class FilesystemReview(unittest.TestCase):
    def test_33_missing_folder_is_explicit_and_requested_path_is_retained(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'not' / 'created'
            report = diagnose_sqlite.filesystem(path)
            self.assertEqual(report['folder'], str(path.resolve()))
            self.assertEqual(report['exists'], False)
            self.assertIn('missing', report['warning'].lower())

    def test_33_cloudstorage_and_mobile_documents_are_flagged_without_claiming_unsynced(self):
        with tempfile.TemporaryDirectory() as root, mock.patch.object(Path, 'home', return_value=Path(root)):
            for suffix in ('Library/CloudStorage/Dropbox/state', 'Library/Mobile Documents/com~apple~CloudDocs/state', 'Documents/state'):
                with self.subTest(suffix=suffix):
                    path = Path(root) / suffix
                    path.mkdir(parents=True)
                    report = diagnose_sqlite.filesystem(path)
                    self.assertTrue(report['cloud_sync_risk'])
                    self.assertIn('sync', report['warning'].lower())
                    self.assertEqual(report['resolved_path'], str(path.resolve()))


if __name__ == '__main__':
    unittest.main()
