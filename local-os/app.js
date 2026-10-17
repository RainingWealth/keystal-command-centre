'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let state = null, currentThread = localStorage.getItem('keystal.thread') || '', lastMessages = '', pendingRequest = null, pollBusy = false, toastTimer;
const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel = (s) => s ? new Date(s).toLocaleString('en-SG', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : 'Not checked';
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 5000); }
async function api(path, body) {
  const options = {credentials:'same-origin', cache:'no-store'};
  if (body !== undefined) Object.assign(options, {method:'POST', headers:{'Content-Type':'application/json','X-Keystal-CSRF':state?.csrf || ''}, body:JSON.stringify(body)});
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
}
function setView(view) {
  if (!$(`[data-page="${view}"]`)) view = 'today';
  $$('[data-page]').forEach(x => x.hidden = x.dataset.page !== view);
  $$('.nav').forEach(x => x.classList.toggle('active', x.dataset.view === view));
  $('#page-name').textContent = ({today:'Today', captures:'Capture inbox', knowledge:'Knowledge', activity:'Activity', connections:'Connections'})[view];
  localStorage.setItem('keystal.view', view);
}
function openCapture(lane = 'Sell') {
  $('#capture-form').reset(); $('#capture-lane').value = lane; $('#capture-dialog').showModal(); $('#capture-title').focus();
}
function richText(target, value) {
  target.replaceChildren();
  let code = false, block = null;
  for (const line of String(value).split('\n')) {
    if (line.startsWith('```')) {code = !code; if (code) {block = document.createElement('pre'); target.append(block);} continue;}
    if (code) {block.textContent += line + '\n'; continue;}
    const heading = line.match(/^#{1,6}\s+(.+)/);
    const element = document.createElement(heading ? 'h3' : 'div');
    const content = heading ? heading[1] : line;
    const parts = content.split(/(\*\*[^*]+\*\*)/g);
    for (const part of parts) {if (part.startsWith('**') && part.endsWith('**')) {const b = document.createElement('strong'); b.textContent = part.slice(2,-2); element.append(b);} else element.append(document.createTextNode(part));}
    if (!content) element.append(document.createElement('br'));
    target.append(element);
  }
}
function captureCard(c) {
  const archived = c.status === 'archived';
  return `<article class="capture-card ${c.pinned ? 'pinned' : ''}"><div class="capture-meta"><span>${escapeHTML(c.lane.toUpperCase())}</span><span>LOCAL DRAFT${archived ? ' · ARCHIVED' : ''}${c.pinned ? ' · YOUR ONE MOVE' : ''}</span></div><h3>${escapeHTML(c.title)}</h3><p class="footnote">Owner: ${escapeHTML(c.owner)} · ${c.due ? 'Target: '+escapeHTML(c.due) : 'No target date set'}</p><div class="capture-actions">${!archived ? `<button class="button outline" data-capture="${c.id}" data-action="pin">${c.pinned ? 'Pinned as one move' : 'Make my one move'}</button><button class="button outline" data-prepare="${c.id}">Prepare with Keystal ↗</button>` : ''}<button class="link-button" data-capture="${c.id}" data-action="${archived ? 'restore' : 'archive'}">${archived ? 'Restore draft' : 'Archive draft'}</button></div></article>`;
}
function renderCaptures() {
  if (!state) return;
  const term = $('#capture-search').value.toLowerCase();
  const archived = $('#show-archived').checked;
  const rows = state.captures.filter(c => (archived || c.status !== 'archived') && `${c.title} ${c.lane} ${c.owner}`.toLowerCase().includes(term));
  $('#capture-list').innerHTML = rows.length ? rows.map(captureCard).join('') : '<div class="empty-desk"><strong>No captures here yet.</strong><p>Save an idea or next action. It stays local until explicitly transferred to the right source system.</p></div>';
}
function renderToday() {
  const active = state.captures.filter(c => c.status !== 'archived');
  const focus = active.find(c => c.pinned);
  $('#capture-badge').textContent = String(active.length).padStart(2,'0');
  $('#focus-content').innerHTML = focus ? `<h2 class="focus-title">${escapeHTML(focus.title)}</h2><p class="focus-description">${escapeHTML(focus.lane)} · Owner: ${escapeHTML(focus.owner)}${focus.due ? ' · Target: '+escapeHTML(focus.due) : ''}</p><div class="focus-footer"><span>Chosen by you · local draft</span><button class="button gold" data-prepare="${focus.id}">Prepare with Keystal ↗</button></div>` : '<h2 class="focus-title">Choose the one thing<br>worth moving today.</h2><p class="focus-description">Capture a real next action. Pin it here. No guessed priorities, no pretend progress.</p><div class="focus-footer"><span>Nothing selected yet</span><button class="button gold" data-new-capture="Sell">＋ Capture your first move</button></div>';
  $('#desk-list').innerHTML = active.length ? active.slice(0,3).map(c => `<div class="desk-row"><span class="desk-icon">${c.pinned ? '✦' : '↗'}</span><div class="desk-main"><strong>${escapeHTML(c.title)}</strong><small>${escapeHTML(c.lane)} · ${escapeHTML(c.owner)} · LOCAL DRAFT</small></div><button class="link-button" data-prepare="${c.id}">Prepare ↗</button></div>`).join('') : '<div class="empty-desk"><strong>Your desk is clear.</strong><p>Add a capture, or use Ask Keystal to prepare your next conversation.</p></div>';
}
function renderConnections() {
  const chat = state.checks.chat;
  const vault = state.checks.dropbox;
  const row = (title, detail, status, style, button = '') => `<div class="connection-row"><div><strong>${title}</strong><p>${escapeHTML(detail)}</p><span class="badge ${style}">${escapeHTML(status)}</span></div>${button}</div>`;
  $('#connection-list').innerHTML =
    row('Local workspace', 'Captures, conversations and activity are stored in SQLite on this Mac. No external task updates.', 'RUNNING LOCALLY', 'good') +
    row('Hermes / Keystal', chat ? `${chat.detail} Checked ${dateLabel(chat.checked_at)}.` : 'CLI detected; a completed turn is required to verify model access.', chat ? chat.status.toUpperCase() : 'NOT YET TESTED IN THIS APP', chat?.status === 'verified' ? 'good' : 'pending', '<button class="button outline" data-chat-test="true">Test real reply ↗</button>') +
    row('Dropbox / Obsidian', vault ? `${vault.detail} Checked ${dateLabel(vault.checked_at)}.` : 'Existing Mac connector available for a read-only test. Saved OS documents are separate from a live check.', vault ? vault.status.toUpperCase() : 'LIVE READ UNCHECKED', vault?.status === 'verified' ? 'good' : 'pending', '<button class="button outline" id="check-dropbox">Check live read ↗</button>') +
    row('ClickUp', 'Execution authority. This OS has no ClickUp adapter enabled; local captures are not tasks in ClickUp.', 'NOT CONNECTED IN THIS OS', 'pending', '<a class="button outline" href="https://app.clickup.com/" target="_blank" rel="noopener noreferrer">Open ClickUp ↗</a>') +
    row('Airtable / Calendar', 'No live data adapters enabled in this OS. Pipeline and calendar status remain unknown.', 'NOT CONNECTED IN THIS OS', 'pending') +
    row('Telegram / scheduled jobs', 'Existing runtime ownership has not been audited here. Nothing moved, enabled or duplicated.', 'UNCHANGED · UNCHECKED', 'pending') +
    row('Cloud hosting', 'No hosting selected. This local URL is not reachable from your phone or another computer.', 'NOT DEPLOYED', 'pending');
}
function renderDocuments() {
  $('#document-list').innerHTML = state.documents.map((d,i) => `<button class="document-row" data-doc="${d.id}" ${d.available ? '' : 'disabled'}><span class="document-num">${String(i+1).padStart(2,'0')}</span><div><strong>${escapeHTML(d.title)}</strong><small>${escapeHTML(d.description)} · ${d.available ? 'Saved document' : 'Unavailable'}</small></div><span>↗</span></button>`).join('');
}
function renderEvents() {
  $('#event-list').innerHTML = state.events.length ? state.events.map(e => `<div class="event-row"><span>${e.kind === 'error' ? '!' : '↗'}</span><div><strong>${escapeHTML(e.label)}</strong><time>${escapeHTML(dateLabel(e.created))}</time></div></div>`).join('') : '<div class="empty-desk"><strong>No activity recorded yet.</strong><p>The trail starts when you capture work or ask Keystal.</p></div>';
}
function prepare(id) {
  const c = state.captures.find(c => c.id === id);
  if (!c) return;
  $('#prompt').value = `Help me prepare this next action. Draft only; do not save or send anything externally.\n\nAction: ${c.title}\nLane: ${c.lane}\nOwner: ${c.owner}${c.due ? '\nTarget date: '+c.due : ''}\n\nGive me the smallest actionable plan and a draft where useful. Ask for missing context rather than inventing it.`;
  $('#prompt').focus();
  if (window.innerWidth <= 980) $('.chat-panel').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderChat() {
  const old = $('#threads').value;
  $('#threads').innerHTML = '<option value="">New conversation</option>' + state.threads.map(t => `<option value="${t.id}">${escapeHTML(t.title)}</option>`).join('');
  if (currentThread && !state.threads.some(t => t.id === currentThread)) currentThread = '';
  $('#threads').value = currentThread;
  const messages = state.messages.filter(m => m.thread_id === currentThread);
  const key = JSON.stringify([currentThread, messages.map(m => m.id)]);
  if (key !== lastMessages) {
    lastMessages = key;
    const target = $('#messages');
    target.replaceChildren();
    if (!messages.length) {
      target.innerHTML = '<div class="welcome"><span class="eyebrow">YOUR THINKING PARTNER</span><h3>Less juggling.<br>More forward motion.</h3><p>Ask for a plan, a draft or a second opinion. This is a real Hermes conversation—not a staged command.</p><button class="suggestion" data-suggestion="focus">Help me choose today’s focus <span>↗</span></button><button class="suggestion" data-suggestion="meeting">Prepare a discovery call <span>↗</span></button><button class="suggestion" data-suggestion="followup">Draft a follow-up <span>↗</span></button></div>';
    } else for (const m of messages) {
      const card = document.createElement('article'); card.className = 'message '+m.role;
      const label = document.createElement('div'); label.className='message-label'; label.textContent = m.role === 'user' ? 'YOU' : 'KEYSTAL';
      const body = document.createElement('div'); body.className='message-body'; richText(body,m.body);
      card.append(label,body);
      if (m.role === 'assistant') {const b = document.createElement('button'); b.className='message-copy'; b.textContent='Copy response'; b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(m.body);toast('Response copied. Nothing sent.');}catch{toast('Clipboard unavailable. Select and copy the text.');}});card.append(b);}
      target.append(card);
    }
    target.scrollTop = target.scrollHeight;
  }
  const run = state.runs.find(r => r.thread_id === currentThread);
  const progress = $('#run-status');
  const busy = state.runtime.busy;
  $('#send-message').disabled = busy;
  $('#send-message').textContent = busy ? 'Working…' : 'Ask Keystal ↗';
  progress.classList.toggle('error', run && ['failed','interrupted'].includes(run.status));
  if (run?.status === 'running') {progress.textContent='Keystal is working. You can navigate or reload; this run stays recorded.';progress.hidden=false;}
  else if (run && ['failed','interrupted'].includes(run.status)) {progress.textContent=run.error || 'Turn did not complete.';progress.hidden=false;}
  else {progress.hidden=true;}
  $('#chat-status').textContent = busy ? 'Working through the local bridge' : state.checks.chat?.status === 'verified' ? 'Real replies verified · draft / research' : 'Local bridge · ready to test';
}
async function refresh() {
  if (pollBusy) return;
  pollBusy = true;
  try {
    state = await api('/api/state');
    renderToday(); renderCaptures(); renderDocuments(); renderEvents(); renderConnections(); renderChat();
    $('#server-status').textContent = 'Local workspace connected';
  } catch (error) {
    $('#server-status').textContent = 'Local server unavailable — reload after restarting';
    $('#chat-status').textContent = 'Server unavailable';
    $('#send-message').disabled = true;
  } finally {pollBusy=false;}
}
async function sendPrompt(prompt) {
  if (!state) return toast('Local workspace is not connected.');
  const idKey = `${currentThread}\0${prompt}`;
  if (!pendingRequest || pendingRequest.content !== idKey) pendingRequest = {content:idKey, key:crypto.randomUUID()};
  $('#send-message').disabled = true;
  try {
    const result = await api('/api/chat',{prompt,thread_id:currentThread,request_key:pendingRequest.key});
    currentThread = result.thread_id;
    localStorage.setItem('keystal.thread',currentThread);
    $('#prompt').value=''; pendingRequest=null;
    await refresh();
  } catch(error) {toast(error.message); $('#send-message').disabled=false;}
}
async function showDocument(id) {
  try {const doc=await api('/api/doc/'+encodeURIComponent(id)); $('#document-title').textContent=doc.title; $('#document-source').textContent=doc.scope+' · '+doc.source; richText($('#document-content'),doc.content); $('#document-dialog').showModal();} catch(error){toast(error.message);}
}
document.addEventListener('click', async event => {
  const b = event.target.closest('button'); if(!b) return;
  if (b.dataset.view) setView(b.dataset.view);
  if (b.dataset.go) setView(b.dataset.go);
  if (b.dataset.close) document.getElementById(b.dataset.close).close();
  if (b.dataset.lane || b.dataset.newCapture) openCapture(b.dataset.lane || b.dataset.newCapture);
  if (b.dataset.prepare) prepare(b.dataset.prepare);
  if (b.dataset.doc) showDocument(b.dataset.doc);
  if (b.dataset.capture) {try{await api('/api/captures/update',{id:b.dataset.capture,action:b.dataset.action});await refresh();toast('Local draft updated. No external record changed.');}catch(error){toast(error.message);}}
  if (b.dataset.suggestion) {
    const suggestions = {focus:'Help me choose one revenue action for today across my ventures. Ask me for the minimum current context first; do not invent my pipeline.', meeting:'Draft a concise discovery-call structure for an AI-calling service for a clinic. Use [CLIENT] placeholders, make no unsupported claims, and do not send anything.', followup:'Help me draft a follow-up. First ask what the last conversation was and what next step I want. Use [CLIENT] placeholders. Draft only.'};
    $('#prompt').value=suggestions[b.dataset.suggestion];$('#prompt').focus();
  }
  if (b.dataset.chatTest) {$('#prompt').value='Connectivity test: reply in one sentence explaining that this is the local Keystal drafting and research bridge, with external execution disabled.';$('#prompt').focus();toast('Test prompt ready. Press Ask Keystal to run it.');}
  if (b.id === 'check-dropbox') {b.disabled=true;b.textContent='Checking…';try{const r=await api('/api/check/dropbox',{});toast(r.detail);await refresh();}catch(error){toast(error.message);}finally{b.disabled=false;}}
});
$('#open-capture').addEventListener('click',()=>openCapture());
$('#capture-add').addEventListener('click',()=>openCapture());
$('#capture-search').addEventListener('input',renderCaptures);
$('#show-archived').addEventListener('change',renderCaptures);
$('#capture-form').addEventListener('submit',async event=>{event.preventDefault();const b=event.submitter;b.disabled=true;try{await api('/api/captures',Object.fromEntries(new FormData(event.target)));$('#capture-dialog').close();await refresh();toast('Saved on this Mac. Not sent to ClickUp.');}catch(error){toast(error.message);}finally{b.disabled=false;}});
$('#chat-form').addEventListener('submit',event=>{event.preventDefault();const prompt=$('#prompt').value.trim();if(prompt)sendPrompt(prompt);});
$('#prompt').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();$('#chat-form').requestSubmit();}});
$('#threads').addEventListener('change',event=>{currentThread=event.target.value;localStorage.setItem('keystal.thread',currentThread);renderChat();});
$('#new-thread').addEventListener('click',()=>{currentThread='';pendingRequest=null;localStorage.removeItem('keystal.thread');renderChat();$('#prompt').focus();});
$('#export-workspace').addEventListener('click',async()=>{try{const data=await api('/api/export');const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='keystal-local-workspace.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Local export downloaded. Keep it private.');}catch(error){toast(error.message);}});
$('#today-date').textContent=new Intl.DateTimeFormat('en-SG',{weekday:'long',day:'numeric',month:'long',timeZone:'Asia/Singapore'}).format(new Date()).toUpperCase();
setView(localStorage.getItem('keystal.view') || 'today');
refresh();setInterval(refresh,4000);
