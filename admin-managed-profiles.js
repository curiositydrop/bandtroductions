import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { isAdminAccount } from './admin-access.js';

const style=document.createElement('style');
style.textContent=`
.managed-section{margin-top:22px}.managed-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:12px 0}.managed-stat{border:1px solid #355955;border-radius:13px;background:#111;padding:12px;text-align:center}.managed-stat strong{display:block;color:#0ccfbd;font-size:1.35rem}.managed-stat span{color:#aaa;font-size:.76rem;font-weight:800}.managed-tools{display:grid;grid-template-columns:2fr 1fr 1fr;gap:9px;margin:12px 0}.managed-tools input,.managed-tools select,.managed-note{width:100%;box-sizing:border-box;border:1px solid #444;border-radius:11px;background:#090909;color:#fff;padding:10px;font:inherit}.managed-list{display:grid;gap:11px}.managed-card{border:1px solid #333;border-radius:15px;background:linear-gradient(145deg,#191919,#111);padding:14px;display:grid;gap:11px}.managed-top{display:flex;align-items:center;gap:11px}.managed-avatar{width:54px;height:54px;flex:0 0 54px;border:1px solid #0ccfbd;border-radius:12px;background:#080808;display:grid;place-items:center;overflow:hidden;color:#0ccfbd;font-weight:900}.managed-avatar img{width:100%;height:100%;object-fit:cover}.managed-copy{min-width:0;flex:1}.managed-copy h3{margin:0;color:#fff}.managed-meta{margin:4px 0 0;color:#aaa;font-size:.8rem}.managed-badge{border:1px solid #555;border-radius:999px;padding:5px 9px;font-size:.72rem;font-weight:900;text-transform:uppercase}.managed-badge.published{border-color:#0ccfbd;color:#0ccfbd}.managed-badge.pending{border-color:#c99d3d;color:#ffd36b}.managed-badge.rejected,.managed-badge.unpublished{border-color:#7a3b3b;color:#ffb4b4}.managed-actions{display:flex;gap:8px;flex-wrap:wrap}.managed-actions .auth-button{width:auto!important;padding:8px 12px!important}.managed-note-wrap{display:grid;gap:7px}.managed-note-status{min-height:18px;color:#aaa;font-size:.76rem}.managed-empty{padding:20px;border:1px dashed #444;border-radius:13px;color:#999;text-align:center}@media(max-width:650px){.managed-stats{grid-template-columns:1fr 1fr}.managed-tools{grid-template-columns:1fr}.managed-top{align-items:flex-start}.managed-badge{margin-left:auto}}
`;
document.head.appendChild(style);

let profiles=[];
let ui=null;

const initials=name=>String(name||'BT').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'BT';
const seconds=t=>t?.seconds||0;
const formatDate=t=>!t?.toDate?'Not recorded':new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(t.toDate());
const statusFor=p=>p.approvalStatus==='pending'?'pending':p.approvalStatus==='rejected'?'rejected':p.published===false?'unpublished':'published';

function inject(){
  if(document.getElementById('managed-profiles-section'))return null;
  const main=document.querySelector('.admin-shell');if(!main)return null;
  const section=document.createElement('section');section.id='managed-profiles-section';section.className='managed-section';
  section.innerHTML=`<div class="admin-head"><p class="profile-meta">PROFILE MANAGEMENT</p><h1>Managed Profiles</h1><p class="auth-subtitle">New, claimed, approved, pending, and rejected Firestore profiles. Legacy directory-only cards are not included here.</p></div><div class="managed-stats"><div class="managed-stat"><strong id="managed-total">0</strong><span>Managed</span></div><div class="managed-stat"><strong id="managed-published">0</strong><span>Published</span></div><div class="managed-stat"><strong id="managed-pending">0</strong><span>Pending</span></div><div class="managed-stat"><strong id="managed-rejected">0</strong><span>Rejected</span></div></div><div class="managed-tools"><input id="managed-search" type="search" placeholder="Search profile name, location, genre..."><select id="managed-type"><option value="all">All Types</option><option value="band">Bands</option><option value="musician">Musicians</option><option value="venue">Venues</option><option value="fan">Scene Supporters</option></select><select id="managed-status"><option value="all">All Statuses</option><option value="published">Published</option><option value="pending">Pending</option><option value="rejected">Rejected</option><option value="unpublished">Unpublished</option></select></div><div id="managed-profile-list" class="managed-list"></div><p id="managed-profile-status" class="auth-message">Loading managed profiles…</p>`;
  main.appendChild(section);
  const result={section,list:section.querySelector('#managed-profile-list'),status:section.querySelector('#managed-profile-status'),search:section.querySelector('#managed-search'),type:section.querySelector('#managed-type'),filterStatus:section.querySelector('#managed-status')};
  result.search.addEventListener('input',render);result.type.addEventListener('change',render);result.filterStatus.addEventListener('change',render);
  return result;
}

function updateStats(){
  document.getElementById('managed-total').textContent=profiles.length;
  document.getElementById('managed-published').textContent=profiles.filter(p=>statusFor(p)==='published').length;
  document.getElementById('managed-pending').textContent=profiles.filter(p=>statusFor(p)==='pending').length;
  document.getElementById('managed-rejected').textContent=profiles.filter(p=>statusFor(p)==='rejected').length;
}

function makeCard(profile){
  const article=document.createElement('article');article.className='managed-card';
  const state=statusFor(profile);
  const top=document.createElement('div');top.className='managed-top';
  const avatar=document.createElement('div');avatar.className='managed-avatar';avatar.textContent=initials(profile.displayName);
  if(profile.imageUrl){const img=document.createElement('img');img.src=profile.imageUrl;img.alt='';avatar.replaceChildren(img)}
  const copy=document.createElement('div');copy.className='managed-copy';
  const name=document.createElement('h3');name.textContent=profile.displayName||'Unnamed Profile';
  const meta=document.createElement('p');meta.className='managed-meta';meta.textContent=[profile.accountType||'member',profile.location,profile.genre||profile.instruments||profile.venueType,profile.claimedLegacyProfile?'Claimed legacy':'New profile'].filter(Boolean).join(' • ');
  const dates=document.createElement('p');dates.className='managed-meta';dates.textContent=`Created: ${formatDate(profile.createdAt||profile.submittedAt||profile.claimedAt)} • Updated: ${formatDate(profile.updatedAt)}`;
  copy.append(name,meta,dates);
  const badge=document.createElement('span');badge.className=`managed-badge ${state}`;badge.textContent=state;
  top.append(avatar,copy,badge);

  const actions=document.createElement('div');actions.className='managed-actions';
  const view=document.createElement('a');view.className='auth-button auth-button-secondary';view.href=`profile.html?id=${encodeURIComponent(profile.id)}`;view.textContent='View Profile';
  const edit=document.createElement('a');edit.className='auth-button auth-button-secondary';edit.href=`profile-setup.html?adminProfile=${encodeURIComponent(profile.id)}`;edit.textContent='Edit Profile';
  const publish=document.createElement('button');publish.type='button';publish.className='auth-button';publish.textContent=profile.published===false?'Publish':'Unpublish';
  publish.addEventListener('click',async()=>{const next=profile.published===false;if(!confirm(`${next?'Publish':'Unpublish'} ${profile.displayName||'this profile'}?`))return;publish.disabled=true;try{await updateDoc(doc(db,'profiles',profile.id),{published:next,approvalStatus:next?'approved':profile.approvalStatus||'approved',updatedAt:serverTimestamp()})}catch(error){console.error(error);alert('The profile status could not be changed.');publish.disabled=false}});
  actions.append(view,edit,publish);

  const noteWrap=document.createElement('div');noteWrap.className='managed-note-wrap';
  const note=document.createElement('textarea');note.className='managed-note';note.rows=2;note.maxLength=1000;note.placeholder='Private admin note — never shown publicly';note.value=profile.adminNote||'';
  const save=document.createElement('button');save.type='button';save.className='auth-button auth-button-secondary';save.textContent='Save Admin Note';
  const noteStatus=document.createElement('div');noteStatus.className='managed-note-status';
  save.addEventListener('click',async()=>{save.disabled=true;noteStatus.textContent='Saving…';try{await updateDoc(doc(db,'profiles',profile.id),{adminNote:note.value.trim(),adminNoteUpdatedAt:serverTimestamp(),updatedAt:serverTimestamp()});noteStatus.textContent='Admin note saved.'}catch(error){console.error(error);noteStatus.textContent='Admin note could not be saved.'}finally{save.disabled=false}});
  noteWrap.append(note,save,noteStatus);
  article.append(top,actions,noteWrap);return article;
}

function render(){
  if(!ui)return;updateStats();
  const term=ui.search.value.trim().toLowerCase(),type=ui.type.value,state=ui.filterStatus.value;
  const visible=profiles.filter(p=>{
    const hay=[p.displayName,p.location,p.genre,p.instruments,p.venueType,p.accountType,p.claimedByEmail].join(' ').toLowerCase();
    return(!term||hay.includes(term))&&(type==='all'||p.accountType===type)&&(state==='all'||statusFor(p)===state);
  }).sort((a,b)=>seconds(b.updatedAt||b.submittedAt||b.createdAt)-seconds(a.updatedAt||a.submittedAt||a.createdAt));
  ui.list.replaceChildren();
  if(!visible.length){ui.status.hidden=false;ui.status.textContent=profiles.length?'No managed profiles match those filters.':'No managed profiles exist yet.';return}
  ui.status.hidden=true;visible.forEach(p=>ui.list.appendChild(makeCard(p)));
}

onAuthStateChanged(auth,user=>{
  if(!isAdminAccount(user))return;
  ui=inject();if(!ui)return;
  onSnapshot(collection(db,'profiles'),snapshot=>{profiles=snapshot.docs.map(d=>({id:d.id,...d.data()}));render()},error=>{console.error(error);ui.status.hidden=false;ui.status.textContent='Managed profiles could not be loaded.'});
});
