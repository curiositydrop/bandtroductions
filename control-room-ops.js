import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { isAdminAccount } from './admin-access.js';

const css=document.createElement('style');
css.textContent=`
.cr-section{margin:14px 0;border:1px solid #343b3a;border-radius:16px;background:linear-gradient(145deg,#171a1a,#0c0e0e);padding:14px}.cr-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}.cr-head h2{margin:2px 0;color:#fff}.cr-kicker{margin:0;color:#0ccfbd;font-size:.72rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.cr-muted{color:#929b9a;font-size:.82rem;line-height:1.4}.cr-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.cr-stat{border:1px solid #2f5551;border-radius:12px;background:#0a0d0d;padding:11px;text-align:center}.cr-stat strong{display:block;color:#0ccfbd;font-size:1.45rem}.cr-stat span{font-size:.68rem;color:#9aa3a2;font-weight:900;text-transform:uppercase}.cr-attention{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.cr-alert{border:1px solid #51462f;border-radius:12px;background:#15120b;padding:11px}.cr-alert strong{display:block;color:#ffd166;font-size:1.25rem}.cr-alert span{color:#c7b98d;font-size:.74rem}.cr-tools{display:flex;gap:7px;flex-wrap:wrap;margin:9px 0}.cr-tools input,.cr-tools select,.cr-tools textarea{min-width:0;box-sizing:border-box;border:1px solid #414847;border-radius:10px;background:#070909;color:#fff;padding:9px;font:inherit}.cr-tools input{flex:1 1 220px}.cr-tools select{flex:0 1 180px}.cr-list{display:grid;gap:8px}.cr-row{border:1px solid #2e3333;border-radius:12px;background:#0d1010;padding:11px;display:grid;gap:7px}.cr-row-top{display:flex;gap:9px;align-items:center}.cr-avatar{width:44px;height:44px;flex:0 0 44px;border:1px solid #416b67;border-radius:10px;background:#090b0b;display:grid;place-items:center;overflow:hidden;color:#0ccfbd;font-weight:900;position:relative}.cr-avatar img{width:100%;height:100%;object-fit:cover}.cr-dot{position:absolute;right:2px;bottom:2px;width:10px;height:10px;border-radius:50%;background:#2cff9a;border:2px solid #111}.cr-copy{min-width:0;flex:1}.cr-copy b{color:#fff}.cr-copy small{display:block;color:#899190;margin-top:3px;overflow-wrap:anywhere}.cr-badge{border:1px solid #4a5453;border-radius:999px;padding:4px 7px;color:#b9c0bf;font-size:.65rem;font-weight:900;text-transform:uppercase}.cr-badge.warn{border-color:#705d2e;color:#ffd166}.cr-badge.good{border-color:#28675f;color:#5cf5df}.cr-badge.bad{border-color:#713939;color:#ffaaa8}.cr-actions{display:flex;gap:6px;flex-wrap:wrap}.cr-actions a,.cr-actions button{border:1px solid #397a74;border-radius:999px;background:#0b1110;color:#0ccfbd;padding:6px 9px;text-decoration:none;font:inherit;font-size:.72rem;font-weight:900;cursor:pointer}.cr-actions .danger{border-color:#7a3b3b;color:#ff9999;background:#140b0b}.cr-comment{margin-left:12px;border-left:2px solid #2b4d49;padding:6px 9px;color:#d1d5d4;font-size:.78rem}.cr-comment b{color:#0ccfbd}.cr-form{display:grid;gap:8px}.cr-form textarea{width:100%;min-height:80px;resize:vertical}.cr-form input,.cr-form select,.cr-form textarea{box-sizing:border-box;border:1px solid #414847;border-radius:10px;background:#070909;color:#fff;padding:10px;font:inherit}.cr-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cr-status{min-height:1.2em;color:#9aa3a2;font-size:.78rem}.cr-shortcuts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.cr-shortcut{border:1px solid #314745;border-radius:12px;background:#0c0f0f;padding:12px;color:#fff;text-decoration:none}.cr-shortcut b{display:block;color:#0ccfbd;margin-bottom:4px}.cr-shortcut span{color:#929998;font-size:.72rem}.cr-empty{padding:15px;border:1px dashed #3b4241;border-radius:11px;color:#8e9695;text-align:center}.cr-inline-count{color:#0ccfbd;font-weight:900}
@media(max-width:700px){.cr-grid,.cr-shortcuts{grid-template-columns:1fr 1fr}.cr-attention{grid-template-columns:1fr}.cr-form-grid{grid-template-columns:1fr}.cr-row-top{align-items:flex-start}.cr-badge{margin-left:auto}}
`;
document.head.appendChild(css);

let currentUser=null,profiles=[],users=[],claims=[],posts=[];
let legacyRows=[];
const state={postCommentStops:new Map()};
const qs=s=>document.querySelector(s);
const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const initials=n=>String(n||'BT').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'BT';
const ownerId=p=>p?.ownerId||p?.userId||p?.uid||p?.id||'';
const millis=t=>t?.toMillis?.()||0;
const onlineUser=u=>Boolean(u?.lastActiveAt?.toMillis&&Date.now()-u.lastActiveAt.toMillis()<150000&&u.isOnline!==false);
const profileForUid=uid=>profiles.find(p=>p.id===uid||ownerId(p)===uid)||null;
const userForUid=uid=>users.find(u=>u.id===uid)||null;
const normalizePage=value=>{try{const u=new URL(String(value||''),location.href);return u.pathname.replace(/^\//,'').toLowerCase()}catch{return String(value||'').replace(/^\//,'').toLowerCase()}};
const eventData=p=>p?.event||{};
const eventDate=p=>{const raw=eventData(p).date||p.eventDate||p.showDate||'';if(!raw)return null;const d=new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw)?`${raw}T12:00:00`:raw);return Number.isNaN(d.getTime())?null:d};

function install(){
  const room=qs('#control-room');if(!room||qs('#cr-operations'))return;
  const anchor=qs('.control-nav')||room.firstElementChild;
  const wrap=document.createElement('div');wrap.id='cr-operations';
  wrap.innerHTML=`
  <section class="cr-section" id="cr-needs-attention"><div class="cr-head"><div><p class="cr-kicker">Priority Queue</p><h2>Needs Attention</h2><div class="cr-muted">Anything that may need an admin decision lands here.</div></div></div><div class="cr-attention"><div class="cr-alert"><strong id="cr-incomplete">0</strong><span>Profile setup incomplete</span></div><div class="cr-alert"><strong id="cr-pending-prof">0</strong><span>Profiles awaiting approval</span></div><div class="cr-alert"><strong id="cr-pending-claim">0</strong><span>Legacy claims awaiting review</span></div></div></section>
  <section class="cr-section" id="cr-pulse"><div class="cr-head"><div><p class="cr-kicker">Live Platform Data</p><h2>Site Pulse</h2></div><small id="cr-pulse-time" class="cr-muted"></small></div><div class="cr-grid"><div class="cr-stat"><strong id="cr-members">0</strong><span>Member Accounts</span></div><div class="cr-stat"><strong id="cr-online">0</strong><span>Online Now</span></div><div class="cr-stat"><strong id="cr-post-count">0</strong><span>Community Posts</span></div><div class="cr-stat"><strong id="cr-show-count">0</strong><span>Upcoming Shows</span></div><div class="cr-stat"><strong id="cr-band-count">0</strong><span>Bands</span></div><div class="cr-stat"><strong id="cr-musician-count">0</strong><span>Musicians</span></div><div class="cr-stat"><strong id="cr-venue-count">0</strong><span>Venues</span></div><div class="cr-stat"><strong id="cr-fan-count">0</strong><span>Fans</span></div></div></section>
  <section class="cr-section" id="cr-unclaimed"><div class="cr-head"><div><p class="cr-kicker">Legacy Outreach</p><h2>Unclaimed Profiles</h2><div class="cr-muted">Legacy bands, musicians and venues that have not been claimed yet.</div></div><span class="cr-inline-count" id="cr-unclaimed-count">Scanning…</span></div><div class="cr-tools"><input id="cr-unclaimed-search" type="search" placeholder="Search unclaimed profiles…"><select id="cr-unclaimed-type"><option value="all">All Types</option><option value="band">Bands</option><option value="musician">Musicians</option><option value="venue">Venues</option></select></div><div id="cr-unclaimed-list" class="cr-list"><div class="cr-empty">Scanning legacy directories…</div></div></section>
  <section class="cr-section" id="cr-community"><div class="cr-head"><div><p class="cr-kicker">Moderation</p><h2>Community Moderation</h2><div class="cr-muted">Newest posts, comment counts and direct admin removal.</div></div><a class="auth-button auth-button-secondary" href="community.html">Open Community</a></div><div id="cr-post-list" class="cr-list"></div></section>
  <section class="cr-section" id="cr-shows"><div class="cr-head"><div><p class="cr-kicker">Shows & Events</p><h2>Event Control</h2><div class="cr-muted">Upcoming show posts from the community.</div></div><a class="auth-button" href="show-event.html">Post a Show</a></div><div id="cr-show-list" class="cr-list"></div></section>
  <section class="cr-section" id="cr-broadcast"><div class="cr-head"><div><p class="cr-kicker">Broadcast</p><h2>Notify Members</h2><div class="cr-muted">Send an internal BANDtroductions notification to a selected member group.</div></div></div><form id="cr-broadcast-form" class="cr-form"><div class="cr-form-grid"><select id="cr-broadcast-audience"><option value="all">All Members</option><option value="band">Bands</option><option value="musician">Musicians</option><option value="venue">Venues</option><option value="fan">Fans</option></select><input id="cr-broadcast-link" type="text" placeholder="Optional link, e.g. index.html"></div><textarea id="cr-broadcast-message" maxlength="500" placeholder="Announcement or update…" required></textarea><button class="auth-button" type="submit">Send Notification</button><div id="cr-broadcast-status" class="cr-status"></div></form></section>
  <section class="cr-section" id="cr-platform"><div class="cr-head"><div><p class="cr-kicker">Platform Controls</p><h2>Content, Sponsors & Systems</h2><div class="cr-muted">Fast access to the other areas used to run BANDtroductions.</div></div></div><div class="cr-shortcuts"><a class="cr-shortcut" href="sponsors.html"><b>Sponsors</b><span>Review current sponsor presentation.</span></a><a class="cr-shortcut" href="radio-admin.html"><b>Radio Admin</b><span>Radio submissions and approvals.</span></a><a class="cr-shortcut" href="bandfeed1.html"><b>BandTube</b><span>Review BandTube video content.</span></a><a class="cr-shortcut" href="band-of-the-week.html"><b>Featured / BOTW</b><span>Review current featured band.</span></a><a class="cr-shortcut" href="messages.html"><b>Messages</b><span>Open private platform messaging.</span></a><a class="cr-shortcut" href="notifications.html"><b>Notifications</b><span>Review admin activity.</span></a><a class="cr-shortcut" href="index.html"><b>Live Homepage</b><span>Open the public Social dashboard.</span></a><a class="cr-shortcut" href="https://www.githubstatus.com" target="_blank" rel="noopener"><b>System Status</b><span>GitHub service status.</span></a></div></section>`;
  anchor.insertAdjacentElement('afterend',wrap);
  qs('#cr-unclaimed-search')?.addEventListener('input',renderLegacy);
  qs('#cr-unclaimed-type')?.addEventListener('change',renderLegacy);
  qs('#cr-broadcast-form')?.addEventListener('submit',sendBroadcast);
  scanLegacyDirectories();
}

function renderAttentionAndPulse(){
  if(!qs('#cr-operations'))return;
  const profileOwners=new Set(profiles.map(ownerId).filter(Boolean));
  const incomplete=users.filter(u=>u.profileComplete!==true&&!profileOwners.has(u.id)).length;
  const pendingProf=profiles.filter(p=>p.approvalStatus==='pending'&&p.published!==true).length;
  const pendingClaim=claims.filter(c=>c.status==='pending').length;
  qs('#cr-incomplete').textContent=incomplete;qs('#cr-pending-prof').textContent=pendingProf;qs('#cr-pending-claim').textContent=pendingClaim;
  qs('#cr-members').textContent=users.length;qs('#cr-online').textContent=users.filter(onlineUser).length;qs('#cr-post-count').textContent=posts.filter(p=>p.published!==false).length;
  const now=new Date();now.setHours(0,0,0,0);const shows=posts.filter(p=>p.published!==false&&p.category==='show').filter(p=>{const d=eventDate(p);return !d||d>=now});qs('#cr-show-count').textContent=shows.length;
  const counts={band:0,musician:0,venue:0,fan:0};users.forEach(u=>{const p=profileForUid(u.id),type=p?.accountType||u.accountType||'fan';if(type in counts)counts[type]++});
  Object.entries(counts).forEach(([k,v])=>{const el=qs(`#cr-${k}-count`);if(el)el.textContent=v});
  qs('#cr-pulse-time').textContent=`Updated ${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`;
}

async function scanLegacyDirectories(){
  try{
    const defs=[['bands.html','band'],['musicians.html','musician'],['venues.html','venue']];
    const rows=[];
    for(const [url,type] of defs){
      const html=await fetch(`${url}?cr=${Date.now()}`).then(r=>r.text());const docu=new DOMParser().parseFromString(html,'text/html');
      docu.querySelectorAll('.profile-card').forEach(card=>{
        if(card.classList.contains('firebase-profile-card'))return;
        const view=card.querySelector('a.button[href],a[href$=".html"]');const name=card.querySelector('h3')?.textContent?.trim();if(!view||!name)return;
        const page=view.getAttribute('href')||'';if(!page||page.startsWith('profile.html')||page.startsWith('claim-profile.html'))return;
        const image=card.querySelector('img')?.getAttribute('src')||'';const text=card.textContent||'';
        rows.push({type,name,page,image,search:`${name} ${text}`.toLowerCase()});
      });
    }
    const claimed=new Set(profiles.filter(p=>p.claimedLegacyProfile&&p.legacyPage).map(p=>normalizePage(p.legacyPage)));
    const pending=new Set(claims.filter(c=>c.status==='pending'&&c.legacyPage).map(c=>normalizePage(c.legacyPage)));
    legacyRows=rows.map(r=>({...r,status:claimed.has(normalizePage(r.page))?'claimed':pending.has(normalizePage(r.page))?'pending':'unclaimed'}));renderLegacy();
  }catch(error){console.warn('Legacy directory scan failed',error);if(qs('#cr-unclaimed-list'))qs('#cr-unclaimed-list').innerHTML='<div class="cr-empty">Legacy directory scan could not be completed.</div>'}
}

function renderLegacy(){
  const list=qs('#cr-unclaimed-list');if(!list)return;const term=qs('#cr-unclaimed-search')?.value.trim().toLowerCase()||'';const type=qs('#cr-unclaimed-type')?.value||'all';
  const unclaimed=legacyRows.filter(r=>r.status==='unclaimed');qs('#cr-unclaimed-count').textContent=`${unclaimed.length} unclaimed`;
  const visible=unclaimed.filter(r=>(type==='all'||r.type===type)&&(!term||r.search.includes(term))).sort((a,b)=>a.name.localeCompare(b.name));list.replaceChildren();
  if(!visible.length){list.innerHTML='<div class="cr-empty">No unclaimed legacy profiles match those filters.</div>';return}
  visible.slice(0,100).forEach(r=>{const row=document.createElement('div');row.className='cr-row';const claim=`claim-profile.html?${new URLSearchParams({page:r.page,name:r.name,type:r.type})}`;row.innerHTML=`<div class="cr-row-top"><div class="cr-avatar">${r.image?`<img src="${esc(r.image)}" alt="">`:esc(initials(r.name))}</div><div class="cr-copy"><b>${esc(r.name)}</b><small>${esc(r.type)} · legacy profile</small></div><span class="cr-badge warn">UNCLAIMED</span></div><div class="cr-actions"><a href="${esc(r.page)}">View Legacy Profile</a><a href="${esc(claim)}">Open Claim Link</a></div>`;list.appendChild(row)});
}

function renderPosts(){
  const list=qs('#cr-post-list');if(!list)return;state.postCommentStops.forEach(fn=>fn());state.postCommentStops.clear();list.replaceChildren();const recent=[...posts].sort((a,b)=>millis(b.createdAt)-millis(a.createdAt)).slice(0,12);
  if(!recent.length){list.innerHTML='<div class="cr-empty">No community posts yet.</div>';return}
  recent.forEach(p=>{const row=document.createElement('div');row.className='cr-row';row.innerHTML=`<div class="cr-row-top"><div class="cr-avatar">${esc(initials(p.authorName))}</div><div class="cr-copy"><b>${esc(p.authorName||'Member')}</b><small>${esc(p.category||'general')} · ${esc(String(p.content||'').slice(0,140))}</small></div><span class="cr-badge ${p.published===false?'bad':'good'}">${p.published===false?'HIDDEN':'LIVE'}</span></div><div class="cr-actions"><a href="index.html?post=${encodeURIComponent(p.id)}">Open Post</a><button class="danger" type="button">Delete Post</button><span class="cr-muted">Comments: <b class="cr-comment-count">0</b></span></div><div class="cr-comments"></div>`;
    row.querySelector('.danger').addEventListener('click',async()=>{if(!confirm('Delete this post permanently?'))return;try{await deleteDoc(doc(db,'posts',p.id))}catch(e){alert('The post could not be deleted.');console.error(e)}});
    const commentsBox=row.querySelector('.cr-comments'),count=row.querySelector('.cr-comment-count');
    const stop=onSnapshot(collection(db,'posts',p.id,'comments'),snap=>{count.textContent=snap.size;commentsBox.replaceChildren();snap.docs.slice(-3).forEach(cdoc=>{const c=cdoc.data()||{};const cRow=document.createElement('div');cRow.className='cr-comment';cRow.innerHTML=`<b>${esc(c.authorName||'Member')}</b> ${esc(c.text||c.content||c.comment||'')} <button class="danger" type="button" style="float:right;border:1px solid #713939;background:#140b0b;color:#ff9999;border-radius:999px;font-size:.65rem">DELETE</button>`;cRow.querySelector('button').addEventListener('click',async()=>{if(!confirm('Delete this comment?'))return;try{await deleteDoc(doc(db,'posts',p.id,'comments',cdoc.id))}catch(e){alert('Comment could not be deleted.');console.error(e)}});commentsBox.appendChild(cRow)})},()=>{});state.postCommentStops.set(p.id,stop);list.appendChild(row)});
}

function renderShows(){
  const list=qs('#cr-show-list');if(!list)return;const now=new Date();now.setHours(0,0,0,0);const shows=posts.filter(p=>p.category==='show'&&p.published!==false).filter(p=>{const d=eventDate(p);return !d||d>=now}).sort((a,b)=>(eventDate(a)?.getTime()||9e15)-(eventDate(b)?.getTime()||9e15));list.replaceChildren();
  if(!shows.length){list.innerHTML='<div class="cr-empty">No upcoming show posts.</div>';return}
  shows.slice(0,20).forEach(p=>{const e=eventData(p),d=eventDate(p);const title=e.title||p.eventTitle||p.authorName||'Show / Event';const row=document.createElement('div');row.className='cr-row';row.innerHTML=`<div class="cr-row-top"><div class="cr-copy"><b>${esc(title)}</b><small>${d?esc(d.toLocaleDateString()):'Date not set'} · ${esc(e.venue||p.eventVenue||'Venue not set')} · ${esc(e.location||p.location||'')}</small></div><span class="cr-badge good">UPCOMING</span></div><div class="cr-actions"><a href="index.html?post=${encodeURIComponent(p.id)}">Open</a><a href="show-event.html">Post / Edit Tools</a><button class="danger" type="button">Delete Event</button></div>`;row.querySelector('.danger').addEventListener('click',async()=>{if(!confirm('Delete this show/event post?'))return;try{await deleteDoc(doc(db,'posts',p.id))}catch(e){alert('Event could not be deleted.');console.error(e)}});list.appendChild(row)});
}

async function sendBroadcast(event){
  event.preventDefault();if(!currentUser)return;const status=qs('#cr-broadcast-status'),message=qs('#cr-broadcast-message').value.trim(),audience=qs('#cr-broadcast-audience').value,link=qs('#cr-broadcast-link').value.trim()||'index.html';if(!message)return;
  const recipients=users.filter(u=>{if(audience==='all')return true;const p=profileForUid(u.id);return (p?.accountType||u.accountType||'fan')===audience});if(!recipients.length){status.textContent='No matching members found.';return}if(!confirm(`Send this notification to ${recipients.length} member${recipients.length===1?'':'s'}?`))return;
  const button=event.submitter;button.disabled=true;status.textContent=`Sending to ${recipients.length} members…`;
  try{for(let i=0;i<recipients.length;i+=400){const batch=writeBatch(db);recipients.slice(i,i+400).forEach(u=>{const ref=doc(collection(db,'notifications'));batch.set(ref,{recipientId:u.id,actorId:currentUser.uid,actorName:'BANDtroductions Admin',message,linkUrl:link,read:false,type:'admin-broadcast',createdAt:serverTimestamp()})});await batch.commit()}status.textContent=`Sent to ${recipients.length} members.`;qs('#cr-broadcast-message').value=''}catch(error){console.error(error);status.textContent=error?.code==='permission-denied'?'Firestore blocked the broadcast. Admin notification permissions need updating.':'Broadcast could not be sent.'}finally{button.disabled=false}
}

function refresh(){renderAttentionAndPulse();renderPosts();renderShows();if(legacyRows.length)scanLegacyDirectories();}

onAuthStateChanged(auth,user=>{currentUser=user;if(!isAdminAccount(user))return;install();
  onSnapshot(collection(db,'profiles'),s=>{profiles=s.docs.map(d=>({id:d.id,...d.data()}));refresh()},()=>{});
  onSnapshot(collection(db,'users'),s=>{users=s.docs.map(d=>({id:d.id,...d.data()}));renderAttentionAndPulse()},()=>{});
  onSnapshot(collection(db,'profileClaims'),s=>{claims=s.docs.map(d=>({id:d.id,...d.data()}));renderAttentionAndPulse();if(legacyRows.length)scanLegacyDirectories()},()=>{});
  onSnapshot(collection(db,'posts'),s=>{posts=s.docs.map(d=>({id:d.id,...d.data()}));renderAttentionAndPulse();renderPosts();renderShows()},()=>{});
});
