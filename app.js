const pages = ['today','pipeline','activity','settings'];
const pageContext = document.getElementById('page-context');
const toast = document.getElementById('toast');
let toastTimer;
function showToast(message){clearTimeout(toastTimer);toast.textContent=message;toast.classList.add('show');toastTimer=setTimeout(()=>toast.classList.remove('show'),2800)}
function activatePage(page){
  pages.forEach(name=>{
    document.querySelector(`[data-page-view="${name}"]`)?.classList.toggle('page-active',name===page);
    document.querySelectorAll(`[data-page="${name}"]`).forEach(button=>button.classList.toggle('active',name===page));
  });
  pageContext.textContent=page[0].toUpperCase()+page.slice(1);
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('.nav-item').forEach(button=>button.addEventListener('click',()=>activatePage(button.dataset.page)));
const mobileNav=document.createElement('nav');mobileNav.className='bottom-nav';mobileNav.setAttribute('aria-label','Mobile navigation');
[['today','◒','Today'],['pipeline','⌁','Pipeline'],['activity','↗','Activity'],['settings','◌','Settings']].forEach(([page,icon,label])=>{const b=document.createElement('button');b.dataset.page=page;b.innerHTML=`<span>${icon}</span><span>${label}</span>`;if(page==='today')b.classList.add('active');b.addEventListener('click',()=>activatePage(page));mobileNav.appendChild(b)});document.body.appendChild(mobileNav);

document.querySelectorAll('[data-action="open-pipeline"]').forEach(button=>button.addEventListener('click',()=>activatePage('pipeline')));
const sprintButton=document.getElementById('sprint-button');
sprintButton.addEventListener('click',()=>{sprintButton.innerHTML='<span class="button-dot"></span> Sprint active · 02:00:00';showToast('Sales sprint started. First move: call Atlas Group.');});
document.querySelectorAll('.action-row input').forEach(input=>input.addEventListener('change',()=>{const remaining=[...document.querySelectorAll('.action-row input')].filter(item=>!item.checked).length;document.getElementById('action-count').textContent=String(remaining).padStart(2,'0');showToast(input.checked?'Action marked complete.':'Action reopened.')}));
const modal=document.getElementById('modal');const modalTitle=document.getElementById('modal-title');const modalCopy=document.getElementById('modal-copy');
document.querySelectorAll('.pipeline-row').forEach(row=>row.addEventListener('click',()=>{modalTitle.textContent=row.dataset.deal;modalCopy.textContent=row.querySelector('small').textContent+' · '+row.querySelector('.deal-value').textContent;modal.classList.add('open');modal.setAttribute('aria-hidden','false')}));
function closeModal(){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}document.getElementById('modal-close').addEventListener('click',closeModal);modal.addEventListener('click',e=>{if(e.target===modal)closeModal()});document.getElementById('modal-action').addEventListener('click',()=>{closeModal();showToast('Next action queued in the draft workspace.')});document.getElementById('modal-draft').addEventListener('click',()=>{closeModal();activatePage('today');document.getElementById('command-input').value='Prep me for '+modalTitle.textContent;showToast('Prep request staged for Keystal.')});
const commandInput=document.getElementById('command-input');document.getElementById('command-submit').addEventListener('click',()=>{const value=commandInput.value.trim();if(!value){commandInput.focus();showToast('Type a command for Keystal first.');return}showToast('Draft request staged: '+value);commandInput.value=''});commandInput.addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('command-submit').click()});
function installHint(){showToast('In Safari: Share → Add to Home Screen. The live URL becomes your Keystal app.')}document.getElementById('install-button').addEventListener('click',installHint);document.getElementById('install-settings').addEventListener('click',installHint);
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}))}
