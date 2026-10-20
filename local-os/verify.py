#!/usr/bin/env python3
"""Exercise a real isolated local server and real Hermes turns. No simulated AI output."""
import http.cookiejar
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request
import urllib.error
import uuid
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
OUT = Path.home() / 'Keystal/outputs/keystal-os'
PORT = 8767
BASE = f'http://127.0.0.1:{PORT}'
checks = []

def check(name, condition):
    if not condition:
        raise AssertionError(name)
    checks.append({'name':name,'status':'passed'})

class Client:
    def __init__(self):
        self.jar=http.cookiejar.CookieJar()
        self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf=''
    def request(self,path,body=None,headers=None):
        h={'Content-Type':'application/json','Origin':BASE,'X-Keystal-CSRF':self.csrf}
        h.update(headers or {})
        request=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,headers=h)
        try:
            r=self.opener.open(request,timeout=45)
        except urllib.error.HTTPError as exc:
            r=exc
        raw=r.read()
        try:data=json.loads(raw)
        except ValueError:data=raw.decode()
        return r.status,data,r.headers
    def bootstrap(self):
        self.request('/')
        code,data,_=self.request('/api/state')
        assert code==200
        self.csrf=data['csrf']
        return data

with tempfile.TemporaryDirectory(prefix='keystal-test-',dir=os.environ.get('TMPDIR',str(Path.home()/'.hermes/cache/scratch'))) as temp:
    env={**os.environ,'KEYSTAL_OS_PORT':str(PORT),'KEYSTAL_OS_DATA':temp}
    process=None
    def start():
        p=subprocess.Popen(['python3',str(ROOT/'server.py')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                urllib.request.urlopen(BASE,timeout=1).close()
                return p
            except Exception:time.sleep(.1)
        raise RuntimeError('Test server failed to start')
    try:
        process=start()
        anonymous=Client()
        check('Unauthenticated API blocked',anonymous.request('/api/state')[0]==401)
        client=Client(); client.bootstrap()
        code,page,headers=client.request('/')
        check('App served with restrictive CSP',code==200 and "frame-ancestors 'none'" in headers.get('Content-Security-Policy',''))
        check('Private responses are not cached',headers.get('Cache-Control')=='no-store')
        check('Session cookie is HttpOnly and SameSite Strict','HttpOnly' in headers.get('Set-Cookie','') and 'SameSite=Strict' in headers.get('Set-Cookie',''))
        check('DNS rebinding host rejected',client.request('/api/state',headers={'Host':'evil.example'})[0]==403)
        body={'title':'QA capture — synthetic','owner':'QA','lane':'Build','due':'2026-10-20'}
        check('Cross-origin write rejected',client.request('/api/captures',body,{'Origin':'https://evil.example'})[0]==403)
        check('Missing CSRF rejected',client.request('/api/captures',body,{'X-Keystal-CSRF':''})[0]==403)
        check('Non-JSON write rejected',client.request('/api/captures',body,{'Content-Type':'text/plain'})[0]==415)
        check('Empty capture rejected',client.request('/api/captures',{**body,'title':''})[0]==400)
        check('Invalid lane rejected',client.request('/api/captures',{**body,'lane':'arbitrary'})[0]==400)
        check('Invalid date rejected',client.request('/api/captures',{**body,'due':'2026-99-00'})[0]==400)
        code,saved,_=client.request('/api/captures',body); rid=saved['id']
        check('Capture written',code==201)
        check('Pin accepted',client.request('/api/captures/update',{'id':rid,'action':'pin'})[0]==200)
        state=client.request('/api/state')[1]
        check('Capture readback exact',state['captures'][0]['title']==body['title'] and state['captures'][0]['pinned']==1)
        check('Invalid capture action rejected',client.request('/api/captures/update',{'id':rid,'action':'complete-in-clickup'})[0]==400)
        check('Archive accepted',client.request('/api/captures/update',{'id':rid,'action':'archive'})[0]==200)
        check('Archive clears pin',client.request('/api/state')[1]['captures'][0]['pinned']==0)
        check('Restore accepted',client.request('/api/captures/update',{'id':rid,'action':'restore'})[0]==200)
        check('No arbitrary file route',client.request('/api/doc/credentials')[0]==404)
        check('Existing OS document readable',client.request('/api/doc/manual')[0]==200)
        check('Export excludes CSRF and provider credentials','csrf' not in client.request('/api/export')[1] and 'runtime' not in client.request('/api/export')[1])
        check('Sensitive identifier blocked before model',client.request('/api/chat',{'prompt':'S1234567D','request_key':uuid.uuid4().hex})[0]==400)
        check('Unknown conversation rejected',client.request('/api/chat',{'prompt':'hello','thread_id':'unknown','request_key':uuid.uuid4().hex})[0]==404)
        # Agents & tasks: tracking only, honest provenance, evidence-gated approval.
        state=client.request('/api/state')[1]
        check('Five agents registered',[a['name'] for a in state['agents']['agents']]==['Hermes','ChatGPT','Claude','Codex','Gemini'])
        check('Unconnected agents report Not Connected',all(a['connection']['status']=='not_connected' for a in state['agents']['agents'] if a['id']!='hermes'))
        check('No agent activity is invented on a fresh workspace',not state['agent_tasks'] and all(sum(a['counts'].values())==0 for a in state['agents']['agents']))
        check('Agent task write needs CSRF',client.request('/api/agent-tasks',{'title':'QA task — synthetic'},{'X-Keystal-CSRF':''})[0]==403)
        check('Empty agent task rejected',client.request('/api/agent-tasks',{'title':''})[0]==400)
        code,made,_=client.request('/api/agent-tasks',{'title':'QA agent task — synthetic','agent_id':'claude'}); tid=made['id']
        check('Agent task written',code==201)
        check('Browser cannot claim observed provenance',client.request('/api/agent-tasks/status',{'id':tid,'status':'running','source':'observed'})[0]==400)
        check('Agent-reported status accepted',client.request('/api/agent-tasks/status',{'id':tid,'status':'running','source':'agent_reported'})[0]==200)
        check('Completion without review rejected',client.request('/api/agent-tasks/status',{'id':tid,'status':'completed'})[0]==400)
        client.request('/api/agent-tasks/status',{'id':tid,'status':'awaiting_review'})
        check('Approval without evidence rejected',client.request('/api/agent-tasks/review',{'id':tid,'decision':'approve'})[0]==400)
        check('Script-scheme evidence link rejected',client.request('/api/agent-tasks/evidence',{'id':tid,'label':'x','url':'javascript:alert(1)'})[0]==400)
        check('Evidence recorded',client.request('/api/agent-tasks/evidence',{'id':tid,'label':'QA output','url':'https://example.com/qa'})[0]==201)
        check('Approval with evidence completes the task',client.request('/api/agent-tasks/review',{'id':tid,'decision':'approve'})[0]==200)
        check('Agent task history readable',len(client.request('/api/agent-tasks/'+tid)[1]['history'])>=5)
        check('Export includes agent tasks and no CSRF',any(t['id']==tid for t in client.request('/api/export')[1]['agent_tasks']) and 'csrf' not in client.request('/api/export')[1])
        # Restart the isolated app only; never restart the user's Hermes gateway.
        process.terminate();process.wait(timeout=10);process=start();client=Client();state=client.bootstrap()
        check('Capture survives server restart',any(c['id']==rid and c['status']=='inbox' for c in state['captures']))
        check('Agent task survives server restart',any(t['id']==tid and t['status']=='completed' for t in state['agent_tasks']))
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            context=browser.new_context(viewport={'width':1440,'height':1000})
            page=context.new_page(); errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
            page.goto(BASE);page.wait_for_function("document.querySelector('#server-status').textContent.includes('connected')")
            for view in ['today','captures','agents','knowledge','activity','connections']:
                page.locator(f'[data-view="{view}"]').click()
                check('View renders: '+view,page.locator(f'[data-page="{view}"]').is_visible())
            page.locator('[data-view="captures"]').click();page.locator('#capture-add').click()
            injection='<img src=x onerror="window.__xss=1">'
            page.locator('#capture-title').fill(injection)
            page.locator('#capture-form button[type="submit"]').click()
            page.wait_for_selector('.capture-card h3:text("<img")')
            check('User content rendered as text',page.evaluate('window.__xss === undefined') and page.locator('.capture-card img').count()==0)
            page.locator('#capture-search').fill('QA capture')
            check('Search filters captures',page.locator('.capture-card').count()==1)
            page.locator('#capture-search').fill('')
            page.reload();page.wait_for_function("document.querySelector('#server-status').textContent.includes('connected')")
            page.locator('[data-view="knowledge"]').click();page.locator('[data-doc="manual"]').click()
            page.wait_for_selector('#document-dialog[open]')
            check('Knowledge opens real document',page.locator('#document-content').inner_text().startswith('Keystal OS'))
            page.locator('[data-close="document-dialog"]').click();page.locator('[data-view="today"]').click()
            check('Desktop has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
            page.set_viewport_size({'width':390,'height':844})
            check('Mobile has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
            page.locator('[data-view="agents"]').click()
            check('Agents view has no horizontal overflow on mobile',page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
            page.locator('[data-view="today"]').click()
            page.locator('#open-capture').click();check('Capture dialog fits mobile',page.locator('#capture-dialog').bounding_box()['width']<=390)
            page.locator('[data-close="capture-dialog"]').click()
            check('No browser JS errors',not errors)
            browser.close()
        # A real two-turn model run, not a fixture. Constrained to the web toolset.
        key=uuid.uuid4().hex
        payload={'prompt':'Acceptance test. Remember the harmless marker amber-orbit. Reply exactly: amber-orbit recorded. Do not call tools.','request_key':key}
        code,run,_=client.request('/api/chat',payload)
        check('Real chat accepted',code==202)
        replay=client.request('/api/chat',payload)
        check('Duplicate request does not create another run',replay[0]==200 and replay[1]['run_id']==run['run_id'])
        check('Idempotency conflict rejected',client.request('/api/chat',{**payload,'prompt':'different'})[0]==409)
        def wait_run(run_id):
            for _ in range(100):
                s=client.request('/api/state')[1]
                r=next(x for x in s['runs'] if x['id']==run_id)
                if r['status']!='running':return s,r
                time.sleep(2)
            raise RuntimeError('Real Hermes test timed out')
        s,r=wait_run(run['run_id']);check('Real Hermes turn completes',r['status']=='completed')
        answer=[m for m in s['messages'] if m['thread_id']==run['thread_id'] and m['role']=='assistant'][-1]['body']
        check('Real reply contains requested marker','amber-orbit' in answer)
        _,run2,_=client.request('/api/chat',{'thread_id':run['thread_id'],'prompt':'What harmless marker did I ask you to remember? Reply with only the marker. Do not call tools.','request_key':uuid.uuid4().hex})
        s,r=wait_run(run2['run_id']);check('Resumed Hermes conversation completes',r['status']=='completed')
        answer=[m for m in s['messages'] if m['thread_id']==run['thread_id'] and m['role']=='assistant'][-1]['body']
        check('Conversation context retained','amber-orbit' in answer)
        process.terminate();process.wait(timeout=10);process=start();client=Client();s=client.bootstrap()
        check('Conversation survives local server restart',len([m for m in s['messages'] if m['thread_id']==run['thread_id']])==4)
        check('Live chat readiness recorded',s['checks']['chat']['status']=='verified')
    finally:
        if process and process.poll() is None:process.terminate();process.wait(timeout=10)
        report={'passed':len(checks),'checks':checks,'scope':'Isolated local server; real Hermes calls; synthetic captures only. No hosted or CRM acceptance claimed.'}
        (OUT/'verification.json').write_text(json.dumps(report,indent=2))
        print(json.dumps(report,indent=2))
