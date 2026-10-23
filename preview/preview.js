'use strict';
const names={today:'Today',captures:'Capture inbox',agents:'Agents & tasks',knowledge:'Knowledge',activity:'Activity',connections:'Connections'};
function view(name){if(!names[name])return;document.querySelectorAll('[data-page]').forEach(e=>e.hidden=e.dataset.page!==name);document.querySelectorAll('.nav').forEach(e=>e.classList.toggle('active',e.dataset.view===name));document.querySelector('#page-name').textContent=names[name];}
document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.view||button.dataset.go)view(button.dataset.view||button.dataset.go);if(button.dataset.lane)view('captures');});
document.querySelector('#today-date').textContent='KEYSTAL OS · PUBLIC PREVIEW';
