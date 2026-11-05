// Dedicated Upcoming Shows page. Same source as the home Upcoming Shows panel
// (dashboard-shows-admin.js): Firestore `posts` where category==='show', published!==false, date >= today (NY).
import { db } from './firebase-dev.js';
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { injectShowEvents } from './show-events-jsonld.js?v=1';

const list=document.getElementById('list');const q=document.getElementById('q');
let posts=[];let range='all';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const first=(...v)=>v.find(x=>x!==undefined&&x!==null&&String(x).trim()!=='')||'';
function normalizeDate(value){if(!value)return null;const raw=String(value).trim();const d=/^\d{4}-\d{2}-\d{2}$/.test(raw)?new Date(`${raw}T12:00:00`):new Date(raw);return Number.isNaN(d.getTime())?null:d;}
function safeHttpUrl(value){const t=String(value||'').trim();if(!t||/\s/.test(t))return'';try{const u=new URL(t);if(!/^https?:$/.test(u.protocol))return'';if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(u.hostname))return'';return u.href;}catch{return'';}}
function nyToday(){const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const g=t=>p.find(x=>x.type===t).value;return new Date(`${g('year')}-${g('month')}-${g('day')}T00:00:00`);}
function fmtTime(t){const m=String(t||'').match(/^(\d{1,2}):(\d{2})$/);if(!m)return t||'';let h=+m[1];const ap=h>=12?'PM':'AM';h=h%12||12;return `${h}:${m[2]} ${ap}`;}
function eventData(post){const e=post.event||{};return{
  title:first(e.title,post.eventTitle,post.showTitle,post.title),date:first(e.date,post.eventDate,post.showDate,post.date),
  time:first(e.time,post.eventTime,post.showTime,post.time),venue:first(e.venue,post.eventVenue,post.venue),
  location:first(e.location,post.eventLocation,post.location),price:first(e.price,post.eventPrice,post.price),age:first(e.age,post.eventAge,post.age),
  ticketUrl:first(e.ticketUrl,post.ticketUrl,post.linkUrl),donateUrl:first(e.donateUrl,post.donateUrl),
  profileUrl:first(e.profileUrl,post.profileUrl,post.authorProfileUrl,post.authorUrl),
  details:first(e.details,post.eventDetails,post.details,post.description,post.caption,post.content),imageUrl:first(e.imageUrl,post.imageUrl)};}
function profileHref(post,e){const custom=safeHttpUrl(e.profileUrl)||(/^[\w.-]+\.html(?:[?#]\S*)?$/i.test(String(e.profileUrl||'').trim())?String(e.profileUrl).trim():'');if(custom)return custom;const id=post.authorId||post.authorUid||post.uid||post.userId;return id?`profile.html?id=${encodeURIComponent(id)}`:'index.html';}

function render(){
  const today=nyToday();const day=86400000;
  const term=q.value.trim().toLowerCase();
  let shows=posts.filter(p=>p.published!==false&&p.category==='show').map(p=>({post:p,e:eventData(p)}))
    .map(x=>({...x,d:normalizeDate(x.e.date)})).filter(x=>x.d&&x.d>=today).sort((a,b)=>a.d-b.d);
  injectShowEvents(shows.map(({post,e})=>({band:first(post.authorName,e.title),title:e.title,date:e.date,time:e.time,venue:e.venue,location:e.location,ticketUrl:e.ticketUrl,profileUrl:profileHref(post,e),image:e.imageUrl})));
  if(range==='week')shows=shows.filter(x=>x.d-today<7*day);
  if(range==='month')shows=shows.filter(x=>x.d-today<30*day);
  if(term)shows=shows.filter(({post,e})=>[post.authorName,e.title,e.venue,e.location].join(' ').toLowerCase().includes(term));
  if(!shows.length){list.innerHTML=`<div class="empty">No upcoming shows ${term||range!=='all'?'match that yet':'posted yet'}.<br><br><a href="show-event.html">Playing out? Post your show →</a></div>`;return;}
  let html='',lastMonth='';
  shows.forEach(({post,e,d})=>{
    const mk=d.toLocaleString('en-US',{month:'long',year:'numeric'});if(mk!==lastMonth){html+=`<h2 class="month">${esc(mk)}</h2>`;lastMonth=mk;}
    const band=first(post.authorName,e.title,'Upcoming Show');const diff=Math.round((d-today)/day);
    const tag=diff<=0?'TONIGHT':diff===1?'TOMORROW':'';
    let details=String(e.details||'');const summary=[e.title,e.venue&&`at ${e.venue}`,e.location&&`in ${e.location}`].filter(Boolean).join(' ');if(summary&&details.startsWith(summary))details=details.slice(summary.length).trim();
    const tix=safeHttpUrl(e.ticketUrl),don=safeHttpUrl(e.donateUrl),img=safeHttpUrl(e.imageUrl);
    const mapQ=[e.venue,e.location].filter(Boolean).join(', ');
    html+=`<article class="card${img?' has-img':''}"><div class="ticket"><div class="dow">${d.toLocaleString('en-US',{weekday:'short'}).toUpperCase()}</div><div class="mon">${d.toLocaleString('en-US',{month:'short'}).toUpperCase()}</div><div class="day">${d.getDate()}</div>${tag?`<div class="tag">${tag}</div>`:''}</div>
<div class="body"><h3 class="band">${esc(band)}</h3>${e.title&&e.title!==band?`<p class="title">${esc(e.title)}</p>`:''}
<div class="meta">${e.venue?`<span><b>@</b> ${esc(e.venue)}</span>`:''}${e.location?`<span>📍 ${esc(e.location)}</span>`:''}${e.time?`<span>🕒 ${esc(fmtTime(e.time))}</span>`:''}</div>
${e.price||e.age?`<div class="pills">${e.price?`<span>${esc(e.price)}</span>`:''}${e.age?`<span>${esc(e.age)}</span>`:''}</div>`:''}
${details?`<details><summary>DETAILS +</summary><div class="details-text">${esc(details)}</div></details>`:''}
<div class="acts">${tix?`<a class="btn primary" href="${esc(tix)}" target="_blank" rel="noopener">TICKETS</a>`:''}${don?`<a class="btn" href="${esc(don)}" target="_blank" rel="noopener">SUPPORT</a>`:''}<a class="btn" href="${esc(profileHref(post,e))}">PROFILE</a>${mapQ?`<a class="btn" href="https://maps.google.com/?q=${encodeURIComponent(mapQ)}" target="_blank" rel="noopener">MAP</a>`:''}</div></div>
${img?`<div class="img" style="background-image:url('${esc(img)}')" role="img" aria-label="${esc(band)} show image"></div>`:''}</article>`;
  });
  list.innerHTML=html;
}
document.querySelectorAll('.chip').forEach(c=>c.addEventListener('click',()=>{document.querySelectorAll('.chip').forEach(x=>x.classList.toggle('on',x===c));range=c.dataset.range;render();}));
q.addEventListener('input',render);
onSnapshot(collection(db,'posts'),s=>{posts=s.docs.map(d=>({id:d.id,...d.data()}));render();},err=>{console.error(err);list.innerHTML='<div class="status">Shows are temporarily unavailable. Please refresh.</div>';});
