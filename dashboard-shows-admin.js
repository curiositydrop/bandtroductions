import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const ADMIN_EMAIL='mbergeron79@gmail.com';
const showsPanel=[...document.querySelectorAll('.right .panel')].find(panel=>panel.querySelector('h3')?.textContent.trim()==='Upcoming Shows');
let currentUser=null;
let latestPosts=[];
let midnightTimer=null;

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const normalizeUrl=value=>{const t=String(value||'').trim();return t?(/^https?:\/\//i.test(t)?t:`https://${t}`):'';};
function normalizeDate(value){if(!value)return null;const raw=String(value).trim();const d=/^\d{4}-\d{2}-\d{2}$/.test(raw)?new Date(`${raw}T12:00:00`):new Date(raw);return Number.isNaN(d.getTime())?null:d;}
function first(...values){return values.find(v=>v!==undefined&&v!==null&&String(v).trim()!=='')||'';}
function eventData(post){
  const e=post.event||{};
  return {
    title:first(e.title,post.eventTitle,post.showTitle,post.title),
    date:first(e.date,post.eventDate,post.showDate,post.date),
    time:first(e.time,post.eventTime,post.showTime,post.time),
    venue:first(e.venue,post.eventVenue,post.venue),
    location:first(e.location,post.eventLocation,post.location),
    price:first(e.price,post.eventPrice,post.price),
    age:first(e.age,post.eventAge,post.age),
    ticketUrl:first(e.ticketUrl,post.ticketUrl,post.linkUrl),
    donateUrl:first(e.donateUrl,post.donateUrl),
    profileUrl:first(e.profileUrl,post.profileUrl,post.authorProfileUrl,post.authorUrl),
    details:first(e.details,post.eventDetails,post.details,post.description,post.caption,post.content),
    imageUrl:first(e.imageUrl,post.imageUrl)
  };
}
function profileHref(post,e){
  if(e.profileUrl)return e.profileUrl;
  const id=post.authorId||post.authorUid||post.uid||post.userId;
  return id?`profile.html?id=${encodeURIComponent(id)}`:'index.html';
}
function isAdmin(){return !!currentUser&&String(currentUser.email||'').toLowerCase()===ADMIN_EMAIL;}
function localToday(){const d=new Date();d.setHours(0,0,0,0);return d;}
function scheduleMidnightRefresh(){
  if(midnightTimer)clearTimeout(midnightTimer);
  const now=new Date();
  const next=new Date(now);next.setHours(24,0,1,0);
  midnightTimer=setTimeout(()=>{renderShows();scheduleMidnightRefresh();},Math.max(1000,next-now));
}

const style=document.createElement('style');
style.textContent=`
.show-admin-edit{margin-left:5px;border:1px solid #d04b4b;background:#1a0d0d;color:#ff8a8a;padding:4px 6px;font:inherit;font-size:10px;font-weight:900;cursor:pointer}
.show-editor{grid-column:1/-1;margin:7px 0 2px;padding:8px;border:1px solid #5c3535;background:#100b0b;display:none}.show-editor.is-open{display:block}.show-editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}.show-editor input,.show-editor textarea{width:100%;box-sizing:border-box;background:#070909;color:#eee;border:1px solid #455;padding:6px;font:inherit;font-size:10px}.show-editor textarea{grid-column:1/-1;min-height:70px;resize:vertical}.show-editor-actions{display:flex;gap:5px;justify-content:flex-end;margin-top:6px}.show-editor-status{color:#25c7c1;font-size:9px;margin-top:5px}.show-extra:empty:before{content:'No additional details were provided for this show.';color:#888}
@media(max-width:650px){.show-admin-edit{font-size:5px;padding:2px 3px}.show-editor{padding:4px}.show-editor-grid{grid-template-columns:1fr}.show-editor input,.show-editor textarea{font-size:6px;padding:3px}.show-editor textarea{grid-column:1}.show-editor-actions .btn{font-size:5px!important;padding:3px!important}.show-editor-status{font-size:5px}}
`;
document.head.appendChild(style);

function buildEditor(post,e,row){
  const editor=document.createElement('div');editor.className='show-editor';
  editor.innerHTML=`<div class="show-editor-grid">
    <input data-k="title" placeholder="Event title" value="${esc(e.title)}">
    <input data-k="date" type="date" value="${esc(e.date)}">
    <input data-k="time" type="time" value="${esc(e.time)}">
    <input data-k="venue" placeholder="Venue" value="${esc(e.venue)}">
    <input data-k="location" placeholder="City / State" value="${esc(e.location)}">
    <input data-k="price" placeholder="Price" value="${esc(e.price)}">
    <input data-k="age" placeholder="Age restriction" value="${esc(e.age)}">
    <input data-k="ticketUrl" placeholder="Ticket URL" value="${esc(e.ticketUrl)}">
    <input data-k="donateUrl" placeholder="Donation URL" value="${esc(e.donateUrl)}">
    <input data-k="profileUrl" placeholder="Profile URL" value="${esc(e.profileUrl)}">
    <textarea data-k="details" placeholder="Show details">${esc(e.details)}</textarea>
  </div><div class="show-editor-actions"><button type="button" class="btn show-editor-cancel">CANCEL</button><button type="button" class="btn primary show-editor-save">SAVE</button></div><div class="show-editor-status"></div>`;
  editor.querySelector('.show-editor-cancel').addEventListener('click',()=>editor.classList.remove('is-open'));
  editor.querySelector('.show-editor-save').addEventListener('click',async()=>{
    if(!isAdmin())return;
    const save=editor.querySelector('.show-editor-save'),status=editor.querySelector('.show-editor-status');
    const val=k=>editor.querySelector(`[data-k="${k}"]`)?.value.trim()||'';
    const next={title:val('title'),date:val('date'),time:val('time'),venue:val('venue'),location:val('location'),price:val('price'),age:val('age'),ticketUrl:normalizeUrl(val('ticketUrl')),donateUrl:normalizeUrl(val('donateUrl')),profileUrl:normalizeUrl(val('profileUrl')),details:val('details'),imageUrl:e.imageUrl||''};
    if(!next.title||!next.date){status.textContent='Title and date are required.';return;}
    save.disabled=true;status.textContent='Saving…';
    try{
      const summary=[next.title,next.venue&&`at ${next.venue}`,next.location&&`in ${next.location}`].filter(Boolean).join(' ');
      const content=next.details?`${summary}\n\n${next.details}`:summary;
      await updateDoc(doc(db,'posts',post.id),{event:next,eventDate:next.date,showDate:next.date,content,linkUrl:next.ticketUrl,updatedAt:serverTimestamp()});
      status.textContent='Saved.';
    }catch(error){console.error(error);status.textContent=error.code==='permission-denied'?'Admin permission blocked this edit.':'Could not save changes.';}
    finally{save.disabled=false;}
  });
  row.appendChild(editor);return editor;
}

function renderShows(){
  if(!showsPanel)return;
  const heading=showsPanel.querySelector('h3');showsPanel.replaceChildren();if(heading)showsPanel.appendChild(heading);
  const create=document.createElement('a');create.href='show-event.html';create.className='btn primary';create.textContent='POST A SHOW';create.style.cssText='display:block;text-align:center;margin:8px';showsPanel.appendChild(create);
  const today=localToday();
  const shows=latestPosts.filter(p=>p.published!==false&&p.category==='show').map(p=>({post:p,e:eventData(p)})).filter(({e})=>{const d=normalizeDate(e.date);return d&&d>=today;}).sort((a,b)=>normalizeDate(a.e.date)-normalizeDate(b.e.date)).slice(0,5);
  if(!shows.length){const empty=document.createElement('div');empty.style.padding='12px';empty.style.color='#9ca3a3';empty.textContent='Show/Event posts will appear here automatically.';showsPanel.appendChild(empty);return;}
  shows.forEach(({post,e})=>{
    const d=normalizeDate(e.date);
    const artist=first(post.authorName,e.title,'Upcoming Show');
    const row=document.createElement('div');row.className='show';row.dataset.postId=post.id;
    const detailBits=[];
    if(e.title&&e.title!==artist)detailBits.push(`<div><b>Event:</b> ${esc(e.title)}</div>`);
    if(e.venue)detailBits.push(`<div><b>Venue:</b> ${esc(e.venue)}</div>`);
    if(e.location)detailBits.push(`<div><b>Location:</b> ${esc(e.location)}</div>`);
    if(e.time)detailBits.push(`<div><b>Time:</b> ${esc(e.time)}</div>`);
    if(e.price)detailBits.push(`<div><b>Price:</b> ${esc(e.price)}</div>`);
    if(e.age)detailBits.push(`<div><b>Age:</b> ${esc(e.age)}</div>`);
    if(e.details){let details=String(e.details);const summary=[e.title,e.venue&&`at ${e.venue}`,e.location&&`in ${e.location}`].filter(Boolean).join(' ');if(summary&&details.startsWith(summary))details=details.slice(summary.length).trim();if(details)detailBits.push(`<div style="margin-top:5px;white-space:pre-line">${esc(details)}</div>`);}
    const links=[];if(e.ticketUrl)links.push(`<a class="btn primary" href="${esc(e.ticketUrl)}" target="_blank" rel="noopener">TICKETS</a>`);if(e.donateUrl)links.push(`<a class="btn" href="${esc(e.donateUrl)}" target="_blank" rel="noopener">SUPPORT</a>`);links.push(`<a class="btn" href="${esc(profileHref(post,e))}">PROFILE</a>`);
    row.innerHTML=`<div class="date">${d.toLocaleString('en-US',{month:'short'}).toUpperCase()}<span>${d.getDate()}</span></div><div class="show-summary"><b>${esc(artist)}</b>${e.venue?`<div class="show-venue">${esc(e.venue)}</div>`:''}${e.time?`<div class="show-time">${esc(e.time)}</div>`:''}<button type="button" class="show-details-btn">DETAILS +</button>${isAdmin()?'<button type="button" class="show-admin-edit">EDIT</button>':''}<div class="show-extra">${detailBits.join('')}${links.join('')}</div></div>`;
    const toggle=row.querySelector('.show-details-btn');toggle.addEventListener('click',()=>{const open=row.classList.toggle('is-open');toggle.textContent=open?'DETAILS −':'DETAILS +';});
    if(isAdmin()){
      const editor=buildEditor(post,e,row);row.querySelector('.show-admin-edit')?.addEventListener('click',()=>editor.classList.toggle('is-open'));
    }
    showsPanel.appendChild(row);
  });
}

function forceFinalRender(){
  renderShows();
  [100,350,800,1600].forEach(delay=>setTimeout(renderShows,delay));
}

onAuthStateChanged(auth,user=>{currentUser=user||null;forceFinalRender();});
const postsQuery=query(collection(db,'posts'),orderBy('createdAt','desc'));
onSnapshot(postsQuery,snapshot=>{latestPosts=snapshot.docs.map(d=>({id:d.id,...d.data()}));forceFinalRender();},error=>console.warn('Upcoming Shows admin/details enhancer unavailable.',error));
window.addEventListener('focus',renderShows);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')renderShows();});
scheduleMidnightRefresh();
