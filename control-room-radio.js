import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getDatabase, ref, onValue, set, remove } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { auth } from './firebase-dev.js';
import { isAdminAccount } from './admin-access.js';

const radioQueueConfig = {
  apiKey: 'AIzaSyApLiiJsKTw1Fp8J3aQatMqiSZoP_6EycE',
  authDomain: 'bandfanwall.firebaseapp.com',
  databaseURL: 'https://bandfanwall-default-rtdb.firebaseio.com',
  projectId: 'bandfanwall',
  storageBucket: 'bandfanwall.firebasestorage.app',
  messagingSenderId: '619241154826',
  appId: '1:619241154826:web:25ddc58eef094e3c0732f3'
};

const queueApp = getApps().find(app => app.name === 'controlRoomRadioQueue') || initializeApp(radioQueueConfig, 'controlRoomRadioQueue');
const queueDb = getDatabase(queueApp);

const css = document.createElement('style');
css.textContent = `
.cr-radio-wrap{display:grid;gap:10px}.cr-radio-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.cr-radio-count{display:inline-grid;place-items:center;min-width:28px;height:28px;padding:0 8px;border:1px solid #3a6d67;border-radius:999px;background:#07100f;color:#0ccfbd;font-weight:950}.cr-radio-list{display:grid;gap:10px}.cr-radio-card{border:1px solid #343b3a;border-radius:14px;background:linear-gradient(145deg,#171a1a,#0b0d0d);padding:12px}.cr-radio-top{display:grid;grid-template-columns:76px 1fr;gap:12px;align-items:start}.cr-radio-art{width:76px;height:76px;border:1px solid #3a5a57;border-radius:11px;background:#070909;overflow:hidden;display:grid;place-items:center;color:#0ccfbd;font-weight:950}.cr-radio-art img{width:100%;height:100%;object-fit:cover}.cr-radio-title{margin:0;color:#fff;font-size:1rem}.cr-radio-artist{margin:3px 0 0;color:#0ccfbd;font-weight:900}.cr-radio-meta{margin:5px 0 0;color:#949d9c;font-size:.75rem;line-height:1.4}.cr-radio-meta a{color:#65e7da}.cr-radio-player{width:100%;margin-top:10px;height:38px}.cr-radio-details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 10px;margin-top:10px;padding-top:9px;border-top:1px solid #292e2e;color:#aeb5b4;font-size:.75rem}.cr-radio-details b{color:#e8eeee}.cr-radio-note{grid-column:1/-1;padding:8px;border:1px solid #333;border-radius:9px;background:#090b0b;color:#c5cbca;white-space:pre-wrap;overflow-wrap:anywhere}.cr-radio-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}.cr-radio-actions button,.cr-radio-actions a{border:1px solid #397a74;border-radius:999px;background:#0b1110;color:#0ccfbd;padding:8px 11px;text-decoration:none;font:inherit;font-size:.74rem;font-weight:950;cursor:pointer}.cr-radio-actions .approve{background:#0ccfbd;color:#06110f}.cr-radio-actions .reject{border-color:#825050;color:#ffaaa8;background:#170b0b}.cr-radio-actions .restore{border-color:#75622f;color:#ffd166}.cr-radio-empty{padding:14px;border:1px dashed #3a4241;border-radius:11px;color:#8e9695;text-align:center}.cr-radio-status{min-height:1.2em;margin-top:7px;color:#9ba3a2;font-size:.76rem}.cr-radio-archive summary{cursor:pointer;color:#aeb6b5;font-weight:900;padding:8px 0}.cr-radio-alert{border:1px solid #51462f;border-radius:12px;background:#15120b;padding:11px}.cr-radio-alert strong{display:block;color:#ffd166;font-size:1.25rem}.cr-radio-alert span{color:#c7b98d;font-size:.74rem}@media(max-width:520px){.cr-radio-top{grid-template-columns:58px 1fr}.cr-radio-art{width:58px;height:58px}.cr-radio-details{grid-template-columns:1fr}}
`;
document.head.appendChild(css);

let pending = {};
let rejected = {};
let stopPending = null;
let stopRejected = null;

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const yesNo = value => value ? 'Yes' : 'No';
const dateText = value => value ? new Date(value).toLocaleString() : 'Unknown';
const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'track';

function installShell(){
  const body = document.getElementById('cr-radio-body');
  if(!body || document.getElementById('cr-radio-review')) return;
  body.innerHTML = `
    <section id="cr-radio-review" class="cr-radio-wrap">
      <div class="cr-radio-head"><div><strong style="color:#fff">Song Submissions</strong><div style="color:#8f9897;font-size:.78rem;margin-top:3px">Listen, review, approve or ixnay submitted tracks.</div></div><span id="cr-radio-pending-count" class="cr-radio-count">0</span></div>
      <div id="cr-radio-pending-list" class="cr-radio-list"><div class="cr-radio-empty">Loading submissions…</div></div>
      <details class="cr-radio-archive"><summary>Rejected Archive <span id="cr-radio-rejected-count">(0)</span></summary><div id="cr-radio-rejected-list" class="cr-radio-list"></div></details>
      <div><a href="radio-admin.html" style="color:#0ccfbd;font-size:.78rem;font-weight:900">Open legacy Radio Admin →</a></div>
    </section>`;

  const attention = document.getElementById('cr-attention-body');
  if(attention && !document.getElementById('cr-radio-attention')){
    const alert = document.createElement('div');
    alert.id='cr-radio-attention';
    alert.className='cr-radio-alert';
    alert.innerHTML='<strong id="cr-radio-attention-count">0</strong><span>Song submissions awaiting review</span>';
    attention.appendChild(alert);
  }
}

function cardMarkup(key, song, mode='pending'){
  const art = song.coverUrl ? `<img src="${esc(song.coverUrl)}" alt="${esc(song.artist || 'Artist')} cover art">` : '♪';
  const profile = song.profileUrl ? `<a href="${esc(song.profileUrl)}" target="_blank" rel="noopener">View BANDtroductions profile</a>` : 'No profile link';
  const audio = song.audioUrl ? `<audio class="cr-radio-player" controls preload="none" src="${esc(song.audioUrl)}"></audio>` : '<div class="cr-radio-empty">No playable MP3 attached.</div>';
  const actions = mode === 'pending'
    ? `<button class="approve" data-radio-action="approve" data-key="${esc(key)}">✓ APPROVE</button><button class="reject" data-radio-action="reject" data-key="${esc(key)}">✕ IXNAY / REJECT</button>`
    : `<button class="restore" data-radio-action="restore" data-key="${esc(key)}">↩ Restore to Review</button><button class="reject" data-radio-action="delete-rejected" data-key="${esc(key)}">Delete Permanently</button>`;
  return `<article class="cr-radio-card" data-radio-card="${esc(key)}">
    <div class="cr-radio-top"><div class="cr-radio-art">${art}</div><div><h3 class="cr-radio-title">${esc(song.title || 'Untitled Song')}</h3><p class="cr-radio-artist">${esc(song.artist || 'Unknown Artist')}</p><p class="cr-radio-meta">Submitted ${esc(dateText(song.submittedAt))}<br>${profile}</p></div></div>
    ${audio}
    <div class="cr-radio-details">
      <div><b>Genre:</b> ${esc(song.genre || '—')}</div><div><b>Album:</b> ${esc(song.album || 'Single')}</div>
      <div><b>Location:</b> ${esc(song.location || '—')}</div><div><b>Signed to label:</b> ${yesNo(song.signedToLabel)}</div>
      <div><b>Contact:</b> ${esc(song.contactName || song.memberDisplayName || '—')}</div><div><b>Email:</b> ${esc(song.contactEmail || '—')}</div>
      <div><b>Rights confirmed:</b> ${yesNo(song.permissionConfirmed)}</div><div><b>Broadcast permission:</b> ${yesNo(song.broadcastPermission)}</div>
      <div><b>Agreement accepted:</b> ${yesNo(song.agreementAccepted)}</div><div><b>Label info:</b> ${esc(song.labelContact || '—')}</div>
      ${song.notes ? `<div class="cr-radio-note"><b>Submission notes:</b><br>${esc(song.notes)}</div>` : ''}
      ${mode === 'rejected' && song.rejectionReason ? `<div class="cr-radio-note"><b>Rejection note:</b><br>${esc(song.rejectionReason)}</div>` : ''}
    </div>
    <div class="cr-radio-actions">${actions}${song.audioUrl ? `<a href="${esc(song.audioUrl)}" target="_blank" rel="noopener">Open MP3</a>` : ''}</div>
    <div class="cr-radio-status" data-radio-status="${esc(key)}"></div>
  </article>`;
}

function render(){
  installShell();
  const pendingList=document.getElementById('cr-radio-pending-list');
  const rejectedList=document.getElementById('cr-radio-rejected-list');
  if(!pendingList || !rejectedList) return;
  const pendingEntries=Object.entries(pending).sort((a,b)=>(b[1]?.submittedAt||0)-(a[1]?.submittedAt||0));
  const rejectedEntries=Object.entries(rejected).sort((a,b)=>(b[1]?.rejectedAt||0)-(a[1]?.rejectedAt||0));
  pendingList.innerHTML=pendingEntries.length?pendingEntries.map(([key,song])=>cardMarkup(key,song,'pending')).join(''):'<div class="cr-radio-empty">No songs waiting for review. 🤘</div>';
  rejectedList.innerHTML=rejectedEntries.length?rejectedEntries.map(([key,song])=>cardMarkup(key,song,'rejected')).join(''):'<div class="cr-radio-empty">Rejected archive is empty.</div>';
  document.getElementById('cr-radio-pending-count').textContent=String(pendingEntries.length);
  document.getElementById('cr-radio-rejected-count').textContent=`(${rejectedEntries.length})`;
  const attention=document.getElementById('cr-radio-attention-count'); if(attention) attention.textContent=String(pendingEntries.length);
}

function setStatus(key,text){ const el=document.querySelector(`[data-radio-status="${CSS.escape(key)}"]`); if(el) el.textContent=text; }

async function approve(key){
  const song=pending[key]; if(!song) return;
  if(!confirm(`Approve “${song.title || 'this song'}” by ${song.artist || 'this artist'} and add it to RadioTracks?`)) return;
  setStatus(key,'Approving and adding to radio library…');
  const trackKey=`${slug(song.artist)}-${slug(song.title)}`;
  await set(ref(queueDb,`RadioTracks/${trackKey}`),{...song,approved:true,reviewStatus:'approved',approvedAt:Date.now()});
  await remove(ref(queueDb,`RadioSubmissions/${key}`));
}

async function reject(key){
  const song=pending[key]; if(!song) return;
  const reason=prompt(`Optional note for the rejected archive:\n\n“${song.title || 'Untitled'}” by ${song.artist || 'Unknown Artist'}`,'') ;
  if(reason===null) return;
  if(!confirm(`Ixnay this submission? It will be archived, not permanently deleted.`)) return;
  setStatus(key,'Moving submission to rejected archive…');
  await set(ref(queueDb,`RadioRejected/${key}`),{...song,approved:false,reviewStatus:'rejected',rejectedAt:Date.now(),rejectionReason:String(reason||'').trim()});
  await remove(ref(queueDb,`RadioSubmissions/${key}`));
}

async function restore(key){
  const song=rejected[key]; if(!song) return;
  if(!confirm(`Restore “${song.title || 'this song'}” to the review queue?`)) return;
  setStatus(key,'Restoring to review queue…');
  const restored={...song,approved:false,reviewStatus:'pending'};
  delete restored.rejectedAt; delete restored.rejectionReason;
  await set(ref(queueDb,`RadioSubmissions/${key}`),restored);
  await remove(ref(queueDb,`RadioRejected/${key}`));
}

async function deleteRejected(key){
  const song=rejected[key]; if(!song) return;
  if(!confirm(`Permanently delete the rejected record for “${song.title || 'this song'}”? This cannot be undone.`)) return;
  setStatus(key,'Deleting rejected record…');
  await remove(ref(queueDb,`RadioRejected/${key}`));
}

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-radio-action]'); if(!button) return;
  const key=button.dataset.key; const action=button.dataset.radioAction;
  button.disabled=true;
  try{
    if(action==='approve') await approve(key);
    if(action==='reject') await reject(key);
    if(action==='restore') await restore(key);
    if(action==='delete-rejected') await deleteRejected(key);
  }catch(error){ console.error('Control Room radio action failed',error); setStatus(key,'Action failed. Check Firebase permissions and try again.'); button.disabled=false; }
});

onAuthStateChanged(auth,user=>{
  if(!isAdminAccount(user)){
    if(stopPending){stopPending();stopPending=null;} if(stopRejected){stopRejected();stopRejected=null;}
    return;
  }
  installShell();
  if(!stopPending) stopPending=onValue(ref(queueDb,'RadioSubmissions'),snap=>{pending=snap.val()||{};render();},error=>console.error('Could not load radio submissions',error));
  if(!stopRejected) stopRejected=onValue(ref(queueDb,'RadioRejected'),snap=>{rejected=snap.val()||{};render();},error=>console.error('Could not load rejected radio submissions',error));
});
