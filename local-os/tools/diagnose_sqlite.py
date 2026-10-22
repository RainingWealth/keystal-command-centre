"""Which SQLite this Python uses and how it behaves on this machine. Prints JSON.

Works only on synthetic databases in a new temporary folder, which it deletes; it never opens Keystal data.
Used to explain platform-specific test results (the hot-journal tests and the concurrent-backup writer on macOS).

    python3 local-os/tools/diagnose_sqlite.py
"""
import contextlib
import hashlib
import io
import os
import json
import platform
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

LOCAL_OS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(LOCAL_OS))
sys.path.insert(0, str(LOCAL_OS / 'tools'))
import db_tool  # noqa: E402
import migrations  # noqa: E402

MAGIC = 'd9d505f920a163d7'


def error_of(exc):
    return {'type': type(exc).__name__, 'message': str(exc), 'code': getattr(exc, 'sqlite_errorcode', None), 'name': getattr(exc, 'sqlite_errorname', None)}


def library():
    try:
        import _sqlite3
        module = getattr(_sqlite3, '__file__', None)
    except ImportError as exc:
        return {'error': str(exc)}
    info = {'module': module}
    tool = (['otool', '-L'] if shutil.which('otool') else ['ldd'] if shutil.which('ldd') else None)
    if module and tool:
        out = subprocess.run(tool + [module], capture_output=True, text=True).stdout
        info['links'] = [line.strip() for line in out.splitlines() if 'sqlite' in line.lower()] or 'no separate libsqlite3: SQLite is built into the module'
    c = sqlite3.connect(':memory:')
    info['compile_options'] = [r[0] for r in c.execute('PRAGMA compile_options')]
    c.close()
    return info


def defaults(db):
    c = sqlite3.connect(db)
    try:
        return {p: c.execute(f'PRAGMA {p}').fetchone()[0] for p in ('journal_mode', 'synchronous', 'cache_size', 'cache_spill', 'page_size', 'locking_mode')}
    finally:
        c.close()


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def guarded(fn, *args):
    started = time.monotonic()
    try:
        return {'result': fn(*args), 'seconds': round(time.monotonic() - started, 2)}
    except Exception as exc:
        return {'error': error_of(exc), 'seconds': round(time.monotonic() - started, 2)}


def interrupted(db, pragmas):
    """The test fixture: a child process dies mid-transaction. Reports what it left behind and what SQLite makes of it."""
    size, before = db.stat().st_size, digest(db)
    code = f"""import sqlite3,os,json
c=sqlite3.connect({str(db)!r},isolation_level=None)
for p in {pragmas!r}: c.execute(p)
print(json.dumps({{k: c.execute('PRAGMA '+k).fetchone()[0] for k in ('cache_size','cache_spill','synchronous','journal_mode')}}),flush=True)
c.execute('BEGIN IMMEDIATE')
for i in range(3000): c.execute("INSERT INTO events(kind,label,created) VALUES('x',?,'n')",('y'*200,))
os._exit(9)"""
    child = subprocess.run([sys.executable, '-c', code], capture_output=True, text=True)
    journal = Path(str(db) + '-journal')
    head = journal.read_bytes()[:8].hex() if journal.exists() else None
    report = {'child_pragmas': pragmas, 'child_settings': child.stdout.strip(), 'child_exit': child.returncode, 'child_stderr': child.stderr[-300:],
              'files_left': sorted(x.name for x in db.parent.iterdir() if x.name.startswith(db.name)),
              'journal_head': head, 'journal_is_hot_by_header': head == MAGIC, 'db_bytes_before': size, 'db_bytes_after': db.stat().st_size,
              'db_changed_by_child': digest(db) != before}
    c = sqlite3.connect(migrations.ro_uri(db), uri=True, timeout=5)
    try:
        report['read_only_open'] = {'succeeded': True, 'events_rows_seen': c.execute('SELECT COUNT(*) FROM events').fetchone()[0]}
    except sqlite3.Error as exc:
        report['read_only_open'] = error_of(exc)
    finally:
        c.close()
    report['needs_recovery'] = guarded(migrations.needs_recovery, db)
    report['recover'] = guarded(migrations.recover, db)
    report['db_identical_to_before_after_recover'] = digest(db) == before
    return report


def filesystem(path):
    """df and mount facts for the folder holding `path` (metadata only)."""
    path = Path(path).expanduser().resolve()
    while not path.exists():
        path = path.parent
    df = subprocess.run(['df', '-P', str(path)], capture_output=True, text=True).stdout.strip().splitlines()
    mountpoint = df[-1].split()[-1] if len(df) > 1 else None
    mounts = subprocess.run(['/sbin/mount'] if Path('/sbin/mount').exists() else ['mount'], capture_output=True, text=True).stdout.splitlines()
    return {'folder': str(path), 'df': df[-1] if df else None, 'mount': next((m for m in mounts if mountpoint and f' on {mountpoint} ' in m), None)}


def concurrent(db, outdir, seconds, writer_in_process):
    """The concurrent-backup test: db_tool backups (in this process) while another writer commits continuously."""
    migrations.migrate(db)
    result = {'writer': 'thread in this process' if writer_in_process else 'separate process', 'backups': 0, 'backup_problems': [], 'writer_rows': 0, 'writer_error': None}
    stop = threading.Event()

    def writer():
        c = sqlite3.connect(db, timeout=30)
        try:
            while not stop.is_set():
                c.execute("INSERT INTO events(kind,label,created) VALUES('t','r','n')")
                c.commit()
                result['writer_rows'] += 1
        except sqlite3.Error as exc:
            result['writer_error'] = error_of(exc)
        finally:
            c.close()

    if writer_in_process:
        worker = threading.Thread(target=writer)
        worker.start()
    else:
        code = f"""import sqlite3,time,json,sys
c=sqlite3.connect({str(db)!r},timeout=30); n=0; end=time.time()+{seconds + 2}
try:
    while time.time()<end:
        c.execute("INSERT INTO events(kind,label,created) VALUES('t','r','n')"); c.commit(); n+=1
    print(json.dumps({{'rows':n}}))
except sqlite3.Error as e:
    print(json.dumps({{'rows':n,'error':{{'type':type(e).__name__,'message':str(e),'code':getattr(e,'sqlite_errorcode',None),'name':getattr(e,'sqlite_errorname',None)}}}}))"""
        worker = subprocess.Popen([sys.executable, '-c', code], stdout=subprocess.PIPE, text=True)
    end = time.time() + seconds
    try:
        while time.time() < end:
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                code_ = db_tool.main(['backup', '--db', str(db), '--out', str(outdir)])
            result['backups'] += 1
            if code_:
                result['backup_problems'].append(json.loads(out.getvalue()).get('problems') or json.loads(out.getvalue()).get('result'))
    finally:
        if writer_in_process:
            stop.set()
            worker.join()
        else:
            child = json.loads(worker.communicate()[0] or '{}')
            result['writer_rows'], result['writer_error'] = child.get('rows', 0), child.get('error')
    return result


def main():
    # The test suite looks up proxies through urllib, which on macOS starts system dispatch threads. Apple's SQLite has
    # been reported to return 'disk I/O error' only once such threads are running, so do the same before testing.
    urllib.request.getproxies()
    tmp = Path(tempfile.mkdtemp(prefix='keystal-sqlite-diagnose-'))
    try:
        report = {'platform': platform.platform(), 'python': sys.version, 'executable': sys.executable, 'sqlite_version': sqlite3.sqlite_version,
                  'library': library(), 'temp_folder': {'as_given': str(tmp), 'resolved': str(tmp.resolve())},
                  'filesystems': {'temp': guarded(filesystem, tmp), 'keystal_data': guarded(filesystem, os.environ.get('KEYSTAL_OS_DATA', '~/Keystal/outputs/keystal-os/local-state'))}}
        db = tmp / 'defaults.sqlite3'
        migrations.migrate(db)
        report['defaults'] = defaults(db)
        report['hot_journal'] = {}
        for name, pragmas in (('test_fixture_before_fix', ['PRAGMA cache_size=1']), ('test_fixture_after_fix', ['PRAGMA synchronous=OFF', 'PRAGMA cache_size=1'])):
            db = tmp / f'{name}.sqlite3'
            migrations.migrate(db)
            report['hot_journal'][name] = guarded(interrupted, db, pragmas)
        report['concurrent_backup'] = [guarded(concurrent, tmp / f'concurrent-{i}.sqlite3', tmp / f'bk-{i}', 8, in_process) for i, in_process in enumerate((True, False))]
        print(json.dumps(report, indent=2))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
