'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let state = null, openTaskId = '', currentThread = localStorage.getItem('keystal.thread') || '', lastMessages = '', pendingRequest = null, pollBusy = false, toastTimer;
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
  $('#page-name').textContent = ({today:'Today', captures:'Capture inbox', agents:'Agents & tasks', knowledge:'Knowledge', activity:'Activity', connections:'Connections'})[view];
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
    row('ClickUp', 'Owns business commitments. This OS has no ClickUp adapter: tasks here can carry a ClickUp reference, but nothing is read from or written to ClickUp, and local captures are not ClickUp tasks.', 'NOT CONNECTED IN THIS OS', 'pending', '<a class="button outline" href="https://app.clickup.com/" target="_blank" rel="noopener noreferrer">Open ClickUp ↗</a>') +
    row('Hermes Kanban', kanbanSummary(state.kanban), kanbanBadge(state.kanban)[0], kanbanBadge(state.kanban)[1], '<button class="button outline" data-go="agents">Open Agents & tasks ↗</button>') +
    row('ChatGPT · Claude · Codex · Gemini', 'No API or adapter is enabled and no paid API is used. Work for these agents is tracked by hand on the Agents & tasks page; their activity is never observed here.', 'NOT CONNECTED · MANUAL TRACKING', 'pending', '<button class="button outline" data-go="agents">Open Agents & tasks ↗</button>') +
    row('Airtable / Calendar', 'No live data adapters enabled in this OS. Pipeline and calendar status remain unknown.', 'NOT CONNECTED IN THIS OS', 'pending') +
    row('Telegram / scheduled jobs', 'Existing runtime ownership has not been audited here. Nothing moved, enabled or duplicated.', 'UNCHANGED · UNCHECKED', 'pending') +
    row('Cloud hosting', 'No hosting selected. This local URL is not reachable from your phone or another computer.', 'NOT DEPLOYED', 'pending');
}
function kanbanBadge(k) {
  if (k.status === 'connected') return k.stale ? ['CONNECTED · DATA STALE', 'failed'] : ['CONNECTED · READ-ONLY', 'good'];
  return ({not_connected:['NOT CONNECTED', 'pending'], failed:['READ FAILED', 'failed'], unchecked:['NOT READ YET', 'pending']})[k.status] || [String(k.status).toUpperCase(), 'pending'];
}
function kanbanSummary(k) {
  const success = k.last_success_at ? `Last successful read ${ageText(k.age_seconds)} (${dateLabel(k.last_success_at)})${k.stale ? ', STALE' : ''}.` : 'No successful read yet.';
  const attempt = k.last_attempt_at ? ` Last attempt ${dateLabel(k.last_attempt_at)}: ${k.status.replace('_', ' ')}.` : '';
  return `${success}${attempt}${k.error ? ' ' + k.error : ''} Read-only; a board state is a record, not proof of a live worker.`;
}
function renderDocuments() {
  $('#document-list').innerHTML = state.documents.map((d,i) => `<button class="document-row" data-doc="${d.id}" ${d.available ? '' : 'disabled'}><span class="document-num">${String(i+1).padStart(2,'0')}</span><div><strong>${escapeHTML(d.title)}</strong><small>${escapeHTML(d.description)} · ${d.available ? 'Saved document' : 'Unavailable'}</small></div><span>↗</span></button>`).join('');
}
function renderEvents() {
  $('#event-list').innerHTML = state.events.length ? state.events.map(e => `<div class="event-row"><span>${e.kind === 'error' ? '!' : '↗'}</span><div><strong>${escapeHTML(e.label)}</strong><time>${escapeHTML(dateLabel(e.created))}</time></div></div>`).join('') : '<div class="empty-desk"><strong>No activity recorded yet.</strong><p>The trail starts when you capture work or ask Keystal.</p></div>';
}
const STATUS = {queued:'Queued', running:'Running', awaiting_review:'Awaiting review', blocked:'Blocked', failed:'Failed', paused:'Paused', completed:'Completed', stale:'Stale'};
const SOURCE = {observed:'OBSERVED', manual:'MANUAL', agent_reported:'AGENT-REPORTED'};
const SOURCE_HINT = {observed:'Read directly by this OS', manual:'Typed in by you', agent_reported:'Relayed from the agent; not verified by this OS'};
const REVIEW = {pending:'REVIEW PENDING', approved:'APPROVED BY YOU', rejected:'REJECTED · REWORK'};
const ago = (s) => { if (!s) return 'never'; const m = Math.max(0, Math.round((Date.now() - new Date(s)) / 60000)); return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago'; };
const srcBadge = (source) => `<span class="src src-${escapeHTML(source)}" title="${escapeHTML(SOURCE_HINT[source] || '')}">${escapeHTML(SOURCE[source] || source)}</span>`;
const statusBadge = (status) => `<span class="badge st-${escapeHTML(status)}">${escapeHTML((STATUS[status] || status).toUpperCase())}</span>`;
const options = (pairs, selected) => pairs.map(([v, l]) => `<option value="${escapeHTML(v)}" ${v === selected ? 'selected' : ''}>${escapeHTML(l)}</option>`).join('');
const ageText = (sec) => sec == null ? 'never' : sec < 60 ? 'just now' : sec < 3600 ? Math.round(sec / 60) + 'm ago' : sec < 86400 ? Math.round(sec / 3600) + 'h ago' : Math.round(sec / 86400) + 'd ago';
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const rendered = new WeakMap();
function setHTML(target, html) { if (rendered.get(target) !== html) { target.innerHTML = html; rendered.set(target, html); } }
function boardNote(b) {
  if (!b) return '';
  if (!b.has_snapshot) return `<p class="agent-live"><small>Kanban: ${b.status === 'unchecked' ? 'not read yet' : 'NOT CONNECTED. Counts are tracked tasks only.'}</small></p>`;
  const flags = [b.stale ? 'STALE' : '', b.status !== 'connected' ? 'latest read did not succeed' : '', b.truncated ? 'TRUNCATED' : ''].filter(Boolean);
  const outside = [b.done ? `${b.done} done` : '', b.scheduled ? `${b.scheduled} scheduled` : '', b.unknown ? `${b.unknown} with an unknown state` : ''].filter(Boolean);
  return `<p class="agent-live"><small>Includes ${plural(b.board_only, 'unlinked board record')} (observed ${ageText(b.age_seconds)}${flags.length ? ' · ' + flags.join(' · ') : ''}): ${b.in_tiles} in the tiles${outside.length ? ', ' + outside.join(', ') + ' (not in the tiles)' : ''}. ${plural(b.linked, 'linked card')} counted once, through ${b.linked === 1 ? 'its' : 'their'} task.${b.ambiguous ? ` ${plural(b.ambiguous, 'card')} not counted: the board is not pinned, so ${b.ambiguous === 1 ? 'it' : 'they'} may be already-linked work.` : ''} A board state is a record, not proof of a live worker.${b.drift ? ` ${plural(b.drift, 'linked task')} differ from the board.` : ''}</small></p>`;
}
function agentCard(a) {
  const c = a.counts, o = a.observation;
  let live;
  if (o) {
    const run = o.last_chat_run;
    live = `<p class="agent-live">${srcBadge('observed')} ${o.working_now ? 'Working on a chat turn now' : run ? `Last chat turn ${escapeHTML(run.status)} ${ago(run.ended || run.created)}` : 'No chat turns recorded yet'}</p>${boardNote(a.board)}`;
  } else live = '<p class="agent-live muted">No direct observation. Tracked tasks only.</p>';
  const stat = (key, label) => `<div class="${c[key] ? 'has' : ''}"><b>${c[key]}</b><span>${label}</span></div>`;
  const extra = [['failed', 'Failed'], ['stale', 'Stale'], ['paused', 'Paused']].filter(([k]) => c[k]).map(([k, l]) => `${c[k]} ${l.toLowerCase()}`).join(' · ');
  const running = a.running.length ? `<ul class="agent-running">${a.running.map(t => `<li><button class="link-button" data-task-open="${t.id}">${escapeHTML(t.title)}</button>${srcBadge(t.status_source)}</li>`).join('')}</ul>` : '';
  return `<article class="agent-card"><div class="agent-head"><div><h3>${escapeHTML(a.name)}</h3><small>${escapeHTML(a.role)}</small></div><span class="badge ${a.connection.status === 'observed' ? 'good' : 'pending'}" title="${escapeHTML(a.connection.detail)}">${escapeHTML(a.connection.label)}</span></div>${live}<div class="agent-stats">${stat('queued', 'QUEUED')}${stat('running', 'RUNNING')}${stat('awaiting_review', 'REVIEW')}${stat('blocked', 'BLOCKED')}</div>${extra ? `<p class="footnote">${extra}</p>` : ''}${running}<p class="agent-last">${a.last_update ? `Last recorded update ${ago(a.last_update.at)} ${srcBadge(a.last_update.source)}` : 'No updates recorded yet'}</p><div class="capture-actions"><button class="link-button" data-agent-filter="${a.id}">View tasks${a.open ? ' (' + a.open + ')' : ''} ↗</button><button class="link-button" data-new-task="${a.id}">＋ Track a task</button></div></article>`;
}
function attentionStrip() {
  const t = state.agents.totals, total = Object.values(t).reduce((x, y) => x + y, 0), k = state.kanban;
  const bt = state.agents.board_totals;
  const bparts = [['awaiting_review', 'awaiting review'], ['blocked', 'blocked'], ['running', 'running'], ['queued', 'queued']].filter(([key]) => bt[key]).map(([key, label]) => `${bt[key]} ${label}`);
  const hb = (state.agents.agents.find(a => a.board) || {}).board || {};
  const others = [hb.scheduled ? `${hb.scheduled} scheduled` : '', hb.unknown ? `${hb.unknown} unknown state` : '', hb.ambiguous ? `${hb.ambiguous} possibly linked (board not pinned, not counted)` : ''].filter(Boolean);
  const board = k.tasks.length ? `<p class="footnote attention">Hermes board, unlinked records (observed ${ageText(k.age_seconds)}${k.stale ? ' · STALE' : ''}${k.status !== 'connected' ? ' · latest read did not succeed' : ''}): ${[...bparts, ...others].join(' · ') || 'nothing active'}. Board states are records, not proof of a live worker.</p>` : '';
  if (!total) return `<p class="footnote attention">No tasks tracked yet. Agent cards show real connection status only; activity appears here once you track work.</p>${board}`;
  const chips = ['awaiting_review', 'blocked', 'failed', 'stale'].filter(key => t[key]).map(key => `<button class="attn st-${key}" data-task-filter="${key}"><b>${t[key]}</b> ${STATUS[key].toLowerCase()}</button>`).join('');
  const un = state.agents.unassigned_open ? `<span class="attn-note">${state.agents.unassigned_open} unassigned</span>` : '';
  return `<div class="attention">${chips || '<span class="attn-note">Nothing is waiting on you.</span>'}${un}</div>${board}`;
}
function taskCard(t) {
  const extra = [t.evidence_count ? `EVIDENCE ${t.evidence_count}` : 'NO EVIDENCE', t.completed_without_approval ? 'COMPLETED BEFORE THE APPROVAL GATE · NOT APPROVED' : REVIEW[t.review_state], t.requires_review ? '' : 'NO REVIEW REQUIRED (YOUR CHOICE)', t.link_count ? `LINKED ${t.link_count}` : ''].filter(Boolean).map(x => `<span>${x}</span>`).join('');
  return `<article class="task-card"><div class="capture-meta"><span>${escapeHTML(t.lane.toUpperCase())} · ${escapeHTML(t.priority.toUpperCase())}</span>${statusBadge(t.status)}</div><h3>${escapeHTML(t.title)}</h3><p class="footnote">${t.agent_name ? escapeHTML(t.agent_name) : 'Unassigned'}${t.project ? ' · ' + escapeHTML(t.project) : ''}${t.due ? ' · Target: ' + escapeHTML(t.due) : ''} · Updated ${ago(t.updated)}</p><div class="task-flags"><span>Status from</span>${srcBadge(t.status_source)}${extra}</div><div class="capture-actions"><button class="button outline" data-task-open="${t.id}">${t.status === 'awaiting_review' ? 'Review output ↗' : 'Open task ↗'}</button></div></article>`;
}
function renderAgents() {
  if (!state) return;
  const agents = state.agents.agents;
  const cards = agents.map(agentCard).join('');
  setHTML($('#agent-overview'), attentionStrip() + `<div class="agent-grid">${cards}</div><p class="footnote">Counts come from tasks you track. Only Hermes has directly observed facts; the others are not connected.</p>`);
  setHTML($('#agent-grid'), cards);
  const open = state.agent_tasks.filter(t => t.status !== 'completed').length;
  $('#agent-badge').textContent = String(open).padStart(2, '0');
  const agentOptions = agents.map(a => [a.id, a.name]);
  const key = JSON.stringify(agentOptions);
  if ($('#task-agent-filter').dataset.key !== key) {
    const af = $('#task-agent-filter'), sf = $('#task-status-filter');
    af.innerHTML = options([['', 'All agents'], ...agentOptions, ['__none', 'Unassigned']], af.value); af.dataset.key = key;
    sf.innerHTML = options([['', 'Open tasks'], ...Object.entries(STATUS)], sf.value);
    $('#agent-task-agent').innerHTML = options([['', 'Unassigned'], ...agentOptions], '');
  }
  const projects = state.projects.map(p => [p.name, p.name]), pf = $('#task-project-filter'), pkey = JSON.stringify(projects);
  if (pf.dataset.key !== pkey) { pf.innerHTML = options([['', 'All projects'], ...projects, ['__none', 'No project']], pf.value); pf.dataset.key = pkey; $('#project-list').innerHTML = projects.map(([n]) => `<option value="${escapeHTML(n)}"></option>`).join(''); }
  const term = $('#task-search').value.toLowerCase(), agent = $('#task-agent-filter').value, status = $('#task-status-filter').value, done = $('#show-completed').checked, project = pf.value;
  const rows = state.agent_tasks.filter(t => (status ? t.status === status : done || t.status !== 'completed') && (!agent || (agent === '__none' ? !t.agent_id : t.agent_id === agent)) && (!project || (project === '__none' ? !t.project : t.project === project)) && `${t.title} ${t.description} ${t.agent_name || ''} ${t.lane} ${t.project || ''}`.toLowerCase().includes(term));
  setHTML($('#agent-task-list'), rows.length ? rows.map(taskCard).join('') : `<div class="empty-desk"><strong>${state.agent_tasks.length ? 'No tasks match these filters.' : 'No agent tasks yet.'}</strong><p>${state.agent_tasks.length ? 'Clear a filter or include completed tasks.' : 'Track a task to record who should do it, what they reported and the evidence. Nothing is sent to the agent.'}</p></div>`);
  renderKanban();
}
let kanbanShowAll = false;
const KANBAN_LIST_LIMIT = 100;
function renderKanban() {
  const k = state.kanban, c = k.counts;
  const conn = ({connected:['CONNECTED · READ-ONLY', 'good'], not_connected:['NOT CONNECTED', 'pending'], failed:['READ FAILED', 'failed'], unchecked:['NOT READ YET', 'pending']})[k.status];
  const attemptAge = k.last_attempt_at ? ageText(Math.max(0, Math.round((Date.now() - new Date(k.last_attempt_at)) / 1000))) : 'never';
  const facts = `<div class="kanban-facts"><div><span class="eyebrow">LAST ATTEMPT</span><p>${attemptAge}</p><span class="badge ${conn[1]}">${conn[0]}</span></div><div><span class="eyebrow">LAST SUCCESSFUL READ</span><p>${k.last_success_at ? `${ageText(k.age_seconds)} · ${escapeHTML(dateLabel(k.last_success_at))}` : 'None yet'}</p>${k.stale ? '<span class="badge failed">STALE</span>' : k.last_success_at ? '<span class="badge good">FRESH</span>' : ''}</div><div><span class="eyebrow">BOARD</span><p>${escapeHTML(k.board.label)}</p>${k.board.changed ? '<span class="badge failed">CONFIG CHANGED SINCE THIS READ</span>' : ''}</div></div>`;
  const error = k.error ? `<p class="kanban-error" role="status">${escapeHTML(k.error)}</p>` : '';
  const keep = k.showing_last_success ? `<p class="kanban-keep">Showing the last successful read from ${escapeHTML(dateLabel(k.last_success_at))}. The latest attempt did not succeed, so these records may be out of date.</p>` : '';
  const bits = k.last_success_at ? [`received ${c.received}`, `shown ${c.stored}`, c.duplicates ? `${c.duplicates} duplicate${c.duplicates === 1 ? '' : 's'} merged` : '', c.archived_skipped ? `${c.archived_skipped} archived skipped` : '', c.rejected ? `${c.rejected} not recognised` : ''].filter(Boolean).join(' · ') : '';
  const trunc = c.truncated ? `<p class="kanban-error">TRUNCATED: ${c.dropped} more record${c.dropped === 1 ? '' : 's'} were not stored (limit ${c.stored}). Counts below cover stored records only.</p>` : '';
  const raw = Object.keys(k.state_counts).length ? `<p class="footnote">Hermes states as reported: ${Object.entries(k.state_counts).map(([s, n]) => `${escapeHTML(s)} ${n}`).join(' · ')}</p>` : '';
  const cadence = k.refresh_seconds ? `Read automatically every ${Math.max(1, Math.round(k.refresh_seconds / 60))} min while this server runs; ` : 'Automatic reads are off; ';
  const shown = kanbanShowAll ? k.tasks : k.tasks.slice(0, KANBAN_LIST_LIMIT);
  const rows = shown.map(t => `<div class="kanban-row"><div><strong>${escapeHTML(t.title)}</strong><small>#${escapeHTML(t.external_id)} · ${t.assignee ? escapeHTML(t.assignee) : 'Unassigned in Hermes'} · Hermes state: ${escapeHTML(t.status_raw)}${t.state_class && !['open', 'active', 'attention', 'closed'].includes(t.state_class) ? ' · ' + escapeHTML(t.state_class.toUpperCase()) : ''}</small></div><div class="kanban-tail">${t.linked_task_id ? `<button class="link-button" data-task-open="${t.linked_task_id}">LINKED · open task ↗</button>` : ''}${t.status ? statusBadge(t.status) : `<span class="badge">${escapeHTML(t.status_raw.toUpperCase())}</span>`}</div></div>`).join('');
  const more = k.tasks.length > KANBAN_LIST_LIMIT ? `<button class="button outline small" data-kanban-toggle="1">${kanbanShowAll ? 'Show fewer' : `Show all ${k.tasks.length}`}</button><p class="footnote">Listing ${shown.length} of ${k.tasks.length} stored records.</p>` : '';
  const empty = k.last_success_at && !k.tasks.length ? '<div class="empty-desk"><strong>The last successful read found no active records.</strong><p>Archived records are not shown.</p></div>' : '';
  setHTML($('#kanban-panel'), `<div class="connection-row kanban-head"><div><strong>Hermes Kanban board</strong>${facts}${error}${keep}${trunc}${bits ? `<p class="footnote">${bits}</p>` : ''}${raw}<p class="footnote">${cadence}this is a read-only copy: nothing here changes Hermes. A board state such as running is an observed record, not proof that a worker is live. ${k.last_success_at ? srcBadge('observed') : ''}</p></div></div>${rows}${more}${empty}`);
}
let createKey = '';
function openTaskForm(agent = '') {
  createKey = crypto.randomUUID().replace(/-/g, '');
  $('#agent-task-form').reset(); $('#agent-task-agent').value = agent; $('#agent-task-dialog').showModal(); $('#agent-task-title').focus();
}
function allowedStatuses(t) {
  if (t.status === 'completed') return ['queued'];
  return Object.keys(STATUS).filter(k => k !== t.status && (k !== 'completed' || !t.requires_review));
}
const historyText = (h) => ({created:'Task created', status:`Status: ${STATUS[h.from_value] || h.from_value} → ${STATUS[h.to_value] || h.to_value}`, assigned:`Assigned: ${h.from_value} → ${h.to_value}`, edited:`Edited ${h.field}: ${h.from_value || '(empty)'} → ${h.to_value || '(empty)'}`, note:'Note added', evidence:`Evidence added: ${h.to_value}`, review:`Review: ${h.to_value}`})[h.kind] || h.kind;
const safeLink = (url) => /^https?:\/\//i.test(url) ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(url)} ↗</a>` : escapeHTML(url);
function renderTaskDialog(detail) {
  const t = detail.task, id = t.id, evidence = detail.evidence;
  const agents = state.agents.agents.map(a => [a.id, a.name]);
  const review = t.status === 'awaiting_review' ? `<div class="review-panel"><strong>Your review</strong><p>${evidence.length ? `${evidence.length} evidence item${evidence.length === 1 ? '' : 's'} attached. Links are recorded, not fetched or verified by this OS.` : 'No evidence attached yet. Add a link or a note below before you can approve.'}</p><label>Review note <span class="optional">required to reject</span><textarea id="review-note" rows="2" maxlength="2000"></textarea></label><div class="capture-actions"><button class="button gold" data-review="approve" data-task="${id}" ${evidence.length ? '' : 'disabled'}>Approve output ✓</button><button class="button outline" data-review="reject" data-task="${id}">Reject · send back</button></div></div>` : '';
  const evidenceRows = evidence.length ? evidence.map(e => `<div class="evidence-row"><div><strong>${escapeHTML(e.label)}</strong>${e.url ? `<p>${safeLink(e.url)}</p>` : ''}${e.note ? `<p>${escapeHTML(e.note)}</p>` : ''}<small>${escapeHTML(dateLabel(e.at))}</small></div>${srcBadge(e.source)}</div>`).join('') : '<p class="footnote">No evidence recorded yet.</p>';
  const history = [...detail.history].reverse().map(h => `<div class="history-row"><span class="history-dot" aria-hidden="true"></span><div><strong>${escapeHTML(historyText(h))}</strong>${h.note ? `<p>${escapeHTML(h.note)}</p>` : ''}<small>${escapeHTML(dateLabel(h.at))} · ${escapeHTML(h.actor)} ${srcBadge(h.source)}</small></div></div>`).join('');
  const refRows = detail.refs.length ? detail.refs.map(r => {
    const br = r.board_record;
    const board = !br ? '' : !br.comparable ? '<p>The last read is from a different board, so this card cannot be compared.</p>' : !br.in_last_read ? (br.snapshot_truncated ? `<p>This card is not among the stored records of the last read, which was TRUNCATED (${br.snapshot_dropped} not stored). It may still be on the board.</p>` : '<p>This card is not in the last successful read (finished, archived, removed or the board changed).</p>') : `<p>${srcBadge('observed')} Board record: ${escapeHTML(br.record.status_raw)} (${escapeHTML(br.record.state_class || 'unknown')}), read ${ageText(state.kanban.age_seconds)}. A board state is a record, not proof of a live worker.${br.drift ? ' <b>This differs from the status tracked here.</b>' : ''}</p>`;
    return `<div class="evidence-row"><div><strong>${r.provider === 'hermes_kanban' ? 'Hermes Kanban card' : 'ClickUp task'}${r.label ? ' · ' + escapeHTML(r.label) : ''}</strong><p>${escapeHTML(r.instance)} / ${escapeHTML(r.scope)} / ${escapeHTML(r.external_id)}${r.context ? ' · list ' + escapeHTML(r.context) : ''}${r.url ? ' · ' + safeLink(r.url) : ''}</p>${board}<small>Linked ${escapeHTML(dateLabel(r.created))} · nothing was changed in the other system</small></div><button class="link-button" data-unlink="${r.id}" data-task="${id}">Unlink</button></div>`;
  }).join('') : '<p class="footnote">Not linked to a Hermes card or a ClickUp task. ClickUp owns business commitments; Hermes Kanban owns internal agent execution. Links point to them; they do not copy or replace them.</p>';
  const free = state.kanban.tasks.filter(x => !x.linked_task_id).slice(0, 200);
  const hermesForm = state.kanban.link.enabled ? (free.length ? `<form class="task-form" data-task-form="link-hermes" data-task="${id}"><label>Link a Hermes Kanban card <span class="optional">from the last read of ${escapeHTML(state.kanban.board.name)}</span><select name="external_id">${options(free.map(x => [x.external_id, `${x.title} · ${x.status_raw}`]), '')}</select></label><div class="dialog-actions"><span>Records the link here only. The task must be Hermes's (or unassigned).</span><button class="button outline" type="submit">Link card ↗</button></div></form>` : '<p class="footnote">No unlinked cards in the last read.</p>') : `<p class="footnote">${escapeHTML(state.kanban.link.reason)}</p>`;
  const clickForm = `<form class="task-form" data-task-form="link-clickup" data-task="${id}"><div class="form-grid"><label>ClickUp workspace id<input name="scope" maxlength="64" required></label><label>ClickUp task id<input name="external_id" maxlength="128" required></label></div><div class="form-grid"><label>List id <span class="optional">optional · where you found it</span><input name="context" maxlength="64"></label><label>Link <span class="optional">optional · http(s)</span><input name="url" type="url" maxlength="500" placeholder="https://"></label></div><div class="dialog-actions"><span>Reference only. This OS has no ClickUp adapter and changes nothing there.</span><button class="button outline" type="submit">Reference task ↗</button></div></form>`;
  const linkForms = hermesForm + clickForm;
  const sessionRows = detail.sessions.length ? detail.sessions.map(x => `<div class="evidence-row"><div><strong>${escapeHTML(x.agent_name)} · ${escapeHTML(x.session_ref)}${x.run_ref ? ' · run ' + escapeHTML(x.run_ref) : ''}</strong>${x.note ? `<p>${escapeHTML(x.note)}</p>` : ''}<small>${escapeHTML(dateLabel(x.created))}</small></div>${srcBadge(x.source)}</div>`).join('') : '<p class="footnote">No session or run identifiers recorded yet.</p>';
  $('#task-dialog-body').innerHTML = `<div class="dialog-top"><span class="eyebrow">AGENT TASK · ${escapeHTML(t.lane.toUpperCase())} · ${escapeHTML(t.priority.toUpperCase())}</span><button class="icon-button" data-close="task-dialog" aria-label="Close task">×</button></div>
<h2>${escapeHTML(t.title)}</h2>
<div class="task-flags">${statusBadge(t.status)}<span>Status from</span>${srcBadge(t.status_source)}${REVIEW[t.review_state] ? `<span>${REVIEW[t.review_state]}</span>` : ''}</div>
<p class="footnote">${t.agent_name ? escapeHTML(t.agent_name) : 'Unassigned'}${t.project ? ' · ' + escapeHTML(t.project) : ''}${t.due ? ' · Target: ' + escapeHTML(t.due) : ''} · Created ${escapeHTML(dateLabel(t.created))} · Last update ${ago(t.updated)}</p>
${t.description ? `<p class="task-desc">${escapeHTML(t.description)}</p>` : ''}
${t.completed_without_approval ? '<p class="kanban-keep">Completed before the approval gate existed, without an approved review and evidence. It is shown as completed because that is what was recorded; reopen it to put it through review.</p>' : ''}
${review}
<h3 class="task-sub">Record an update</h3>
<form class="task-form" data-task-form="update" data-task="${id}"><div class="form-grid"><label>Status<select name="status">${options([[t.status, STATUS[t.status] + ' (current)'], ...allowedStatuses(t).map(k => [k, STATUS[k]])], t.status)}</select></label><label>Where did this come from?<select name="source"><option value="manual">Manual · I am recording it</option><option value="agent_reported">Agent-reported · the agent told me</option></select></label></div><label>Note <span class="optional">required for blocked, failed or reopening</span><textarea name="note" rows="2" maxlength="2000"></textarea></label>${t.requires_review && t.status !== 'completed' ? '<p class="footnote">Completion goes through review: choose Awaiting review, attach evidence, then approve.</p>' : ''}<div class="dialog-actions"><span>Saved to history. No agent is contacted.</span><button class="button gold" type="submit">Record update ↗</button></div></form>
<h3 class="task-sub">Output evidence (${evidence.length})</h3>${evidenceRows}
<form class="task-form" data-task-form="evidence" data-task="${id}"><div class="form-grid"><label>Label<input name="label" maxlength="120" placeholder="e.g. Draft in shared folder" required></label><label>Link <span class="optional">optional · http(s)</span><input name="url" type="url" maxlength="500" placeholder="https://"></label></div><div class="form-grid"><label>Note <span class="optional">optional</span><input name="note" maxlength="1000"></label><label>Where did this come from?<select name="source"><option value="manual">Manual · I found it</option><option value="agent_reported">Agent-reported · the agent gave it</option></select></label></div><div class="dialog-actions"><span>Recorded, not fetched or verified.</span><button class="button outline" type="submit">Add evidence ↗</button></div></form>
<h3 class="task-sub">Linked records (${detail.refs.length})</h3>${refRows}${linkForms}
<h3 class="task-sub">Session and run identifiers (${detail.sessions.length})</h3>${sessionRows}
<form class="task-form" data-task-form="session" data-task="${id}"><div class="form-grid"><label>Agent<select name="agent_id">${options(agents, t.agent_id || (agents[0] || [''])[0])}</select></label><label>Session id<input name="session_ref" maxlength="128" placeholder="the id the agent's own system shows" required></label></div><div class="form-grid"><label>Run id <span class="optional">optional</span><input name="run_ref" maxlength="128"></label><label>Where did this come from?<select name="source"><option value="manual">Manual · I copied it</option><option value="agent_reported">Agent-reported · the agent gave it</option></select></label></div><label>Note <span class="optional">optional</span><input name="note" maxlength="300"></label><div class="dialog-actions"><span>Identifiers only: never paste transcripts or secrets.</span><button class="button outline" type="submit">Add identifier ↗</button></div></form>
<h3 class="task-sub">Details</h3>
<form class="task-form" data-task-form="edit" data-task="${id}"><label>Title<input name="title" maxlength="200" value="${escapeHTML(t.title)}" required></label><label>Details<textarea name="description" rows="3" maxlength="4000">${escapeHTML(t.description)}</textarea></label><label>Project <span class="optional">optional</span><input name="project" list="project-list" maxlength="80" value="${escapeHTML(t.project || '')}"></label><div class="form-grid"><label>Assigned to<select name="agent_id">${options([['', 'Unassigned'], ...agents], t.agent_id || '')}</select></label><label>Priority<select name="priority">${options([['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['urgent', 'Urgent']], t.priority)}</select></label></div><div class="form-grid"><label>Work lane<select name="lane">${options(['Sell', 'Serve', 'Operate', 'Build', 'Personal'].map(l => [l, l]), t.lane)}</select></label><label>Target date <span class="optional">optional</span><input name="due" type="date" value="${escapeHTML(t.due)}"></label></div><label class="check-line"><input type="checkbox" name="requires_review" ${t.requires_review ? 'checked' : ''}> I must approve the output before this counts as complete</label><div class="dialog-actions"><span>Reassigning does not notify the agent.</span><button class="button outline" type="submit">Save details ↗</button></div></form>
<h3 class="task-sub">History</h3><div class="history">${history}</div>`;
}
async function openTask(id) {
  try {
    const detail = await api('/api/agent-tasks/' + encodeURIComponent(id));
    openTaskId = id; renderTaskDialog(detail);
    if (!$('#task-dialog').open) $('#task-dialog').showModal();
  } catch (error) { toast(error.message); }
}
async function taskAction(id, path, body, message) {
  try { await api(path, {id, ...body}); await refresh(); await openTask(id); toast(message); }
  catch (error) { toast(error.message); }
}
function showTasks(agent, status) {
  $('#task-agent-filter').value = agent; $('#task-status-filter').value = status; $('#task-search').value = '';
  setView('agents'); renderAgents();
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
    renderToday(); renderCaptures(); renderAgents(); renderDocuments(); renderEvents(); renderConnections(); renderChat();
    $('#server-status').textContent = 'Local workspace connected';
    const label = state.runtime.preview_label || ''; $('#preview-banner').textContent = label; $('#preview-banner').hidden = !label;
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
  if (b.dataset.taskOpen) openTask(b.dataset.taskOpen);
  if (b.dataset.kanbanToggle) { kanbanShowAll = !kanbanShowAll; renderKanban(); }
  if (b.dataset.unlink) taskAction(b.dataset.task, '/api/agent-tasks/unlink', {ref_id: Number(b.dataset.unlink)}, 'Link removed here only. Nothing changed in the other system.');
  if (b.dataset.newTask !== undefined) openTaskForm(b.dataset.newTask);
  if (b.dataset.agentFilter) showTasks(b.dataset.agentFilter, '');
  if (b.dataset.taskFilter) showTasks('', b.dataset.taskFilter);
  if (b.dataset.review) {
    const note = $('#review-note').value;
    if (b.dataset.review === 'reject' && !note.trim()) { toast('Say what needs to change before rejecting.'); return; }
    taskAction(b.dataset.task, '/api/agent-tasks/review', {decision: b.dataset.review, note}, b.dataset.review === 'approve' ? 'Approved. Recorded locally; nothing sent.' : 'Rejected and sent back to the queue.');
  }
  if (b.id === 'kanban-refresh') {b.disabled=true;b.textContent='Reading…';try{const r=await api('/api/kanban/refresh',{});toast(r.detail);await refresh();}catch(error){toast(error.message);}finally{b.disabled=false;b.textContent='Refresh from Hermes ↗';}}
  if (b.dataset.capture) {try{await api('/api/captures/update',{id:b.dataset.capture,action:b.dataset.action});await refresh();toast('Local draft updated. No external record changed.');}catch(error){toast(error.message);}}
  if (b.dataset.suggestion) {
    const suggestions = {focus:'Help me choose one revenue action for today across my ventures. Ask me for the minimum current context first; do not invent my pipeline.', meeting:'Draft a concise discovery-call structure for an AI-calling service for a clinic. Use [CLIENT] placeholders, make no unsupported claims, and do not send anything.', followup:'Help me draft a follow-up. First ask what the last conversation was and what next step I want. Use [CLIENT] placeholders. Draft only.'};
    $('#prompt').value=suggestions[b.dataset.suggestion];$('#prompt').focus();
  }
  if (b.dataset.chatTest) {$('#prompt').value='Connectivity test: reply in one sentence explaining that this is the local Keystal drafting and research bridge, with external execution disabled.';$('#prompt').focus();toast('Test prompt ready. Press Ask Keystal to run it.');}
  if (b.id === 'check-dropbox') {b.disabled=true;b.textContent='Checking…';try{const r=await api('/api/check/dropbox',{});toast(r.detail);await refresh();}catch(error){toast(error.message);}finally{b.disabled=false;}}
});
$('#task-add').addEventListener('click',()=>openTaskForm(''));
['#task-search','#task-agent-filter','#task-status-filter','#task-project-filter','#show-completed'].forEach(s=>$(s).addEventListener(s==='#task-search'?'input':'change',renderAgents));
$('#agent-task-form').addEventListener('submit',async event=>{event.preventDefault();const b=event.submitter;b.disabled=true;try{const body=Object.fromEntries(new FormData(event.target));body.requires_review=event.target.requires_review.checked;body.request_key=createKey;await api('/api/agent-tasks',body);createKey=crypto.randomUUID().replace(/-/g,'');$('#agent-task-dialog').close();await refresh();toast('Task saved on this Mac. No agent was contacted.');}catch(error){toast(error.message);}finally{b.disabled=false;}});
$('#task-dialog').addEventListener('submit',event=>{
  event.preventDefault();
  const f = event.target, id = f.dataset.task, body = Object.fromEntries(new FormData(f));
  if (f.dataset.taskForm === 'update') {
    const current = f.status.options[0].value;
    if (body.status === current) taskAction(id, '/api/agent-tasks/note', {note: body.note, source: body.source}, 'Note recorded. No agent contacted.');
    else taskAction(id, '/api/agent-tasks/status', {...body, expected_status: current}, 'Status recorded. No agent contacted.');
  } else if (f.dataset.taskForm === 'evidence') taskAction(id, '/api/agent-tasks/evidence', body, 'Evidence recorded. Not fetched or verified.');
  else if (f.dataset.taskForm === 'link-hermes') taskAction(id, '/api/agent-tasks/link', {provider: 'hermes_kanban', external_id: body.external_id}, 'Linked here only. Nothing was changed in Hermes.');
  else if (f.dataset.taskForm === 'link-clickup') taskAction(id, '/api/agent-tasks/link', {provider: 'clickup', ...body}, 'Referenced here only. Nothing was changed in ClickUp.');
  else if (f.dataset.taskForm === 'session') taskAction(id, '/api/agent-tasks/session', body, 'Identifier recorded. Nothing was contacted.');
  else if (f.dataset.taskForm === 'edit') taskAction(id, '/api/agent-tasks/update', {...body, requires_review: f.requires_review.checked}, 'Details saved locally. No agent contacted.');
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
