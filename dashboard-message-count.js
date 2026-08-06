import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const link=document.getElementById('messages-link');
let unsub=null;

function ensureBadge(){
  if(!link)return null;
  let badge=link.querySelector('.menu-count');
  if(!badge){
    badge=document.createElement('span');
    badge.className='menu-count';
    badge.style.cssText='float:right;min-width:18px;padding:1px 4px;border:1px solid #25c7c1;color:#25c7c1;text-align:center;font-size:.85em;font-weight:900;line-height:1.2';
    link.appendChild(badge);
  }
  return badge;
}

function stampMs(stamp){return stamp?.toMillis?stamp.toMillis():(stamp?.seconds?stamp.seconds*1000:0);}

onAuthStateChanged(auth,user=>{
  if(unsub){unsub();unsub=null;}
  const badge=ensureBadge();
  if(!user){if(badge)badge.remove();return;}
  unsub=onSnapshot(collection(db,'messageInboxes',user.uid,'items'),snap=>{
    let unread=0;
    snap.docs.forEach(d=>{
      const row=d.data();
      const updated=stampMs(row.updatedAt);
      const read=stampMs(row.readAt);
      const sender=row.lastSenderId||'';
      if(updated>read&&sender&&sender!==user.uid)unread++;
    });
    if(!badge)return;
    badge.textContent=String(unread);
    badge.style.display=unread?'inline-block':'none';
    link.title=unread?`${unread} unread conversation${unread===1?'':'s'}`:'Messages';
  },error=>{console.warn('Unread message count unavailable.',error);if(badge)badge.style.display='none';});
});

// Production dashboard hotfix: keep feed/events independent from any ordered query failure.
const feed=document.querySelector('.feed');
const showsPanel=[...document.querySelectorAll('.right .panel')].find(p=>p.querySelector('h3')?.textContent.trim()==='Upcoming Shows');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const initials=n=>String(n||'BT').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'BT';
const createdMs=p=>p?.createdAt?.toMillis?.()||p?.createdAt?.seconds*1000||0;
const fmt=stamp=>stamp?.toDate?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(stamp.toDate()):'Just now';
const dateFrom=value=>{if(!value)return null;const d=new Date(`${value}T12:00:00`);return Number.isNaN(d.getTime())?null:d;};

function profileUrl(p){return p.profileUrl||p.authorProfileUrl||p.authorUrl||p.event?.profileUrl||(p.authorId?`profile.html?id=${encodeURIComponent(p.authorId)}`:'community.html');}

function renderFeedHotfix(posts){
  if(!feed)return;
  const heading=feed.querySelector('h3');
  feed.replaceChildren();if(heading)feed.appendChild(heading);
  const visible=posts.filter(p=>p.published!==false).sort((a,b)=>createdMs(b)-createdMs(a)).slice(0,6);
  if(!visible.length){const e=document.createElement('div');e.className='post';e.innerHTML='<p>No community posts yet.</p>';feed.appendChild(e);return;}
  visible.forEach(p=>{
    const article=document.createElement('article');article.className='post';article.dataset.postId=p.id||'';
    const name=p.authorName||'BANDtroductions Member';
    const content=String(p.content||'');
    article.innerHTML=`<div class="post-head"><div class="post-avatar">${esc(initials(name))}</div><div><a class="post-name" href="${esc(profileUrl(p))}">${esc(name)}</a><div class="post-meta">${esc(fmt(p.createdAt))}${p.category?` · ${esc(p.category)}`:''}</div></div></div>${content?`<p>${esc(content)}</p>`:''}${p.imageUrl?`<img src="${esc(p.imageUrl)}" alt="" style="display:block;width:100%;margin-top:12px;border:1px solid #333;max-height:520px;object-fit:cover">`:''}<div class="post-actions"><span>ROCK ON</span><span>COMMENT</span><span>SHARE</span></div>`;
    feed.appendChild(article);
  });
}

function renderShowsHotfix(posts){
  if(!showsPanel)return;
  const heading=showsPanel.querySelector('h3');showsPanel.replaceChildren();if(heading)showsPanel.appendChild(heading);
  const create=document.createElement('a');create.href='show-event.html';create.className='btn primary';create.textContent='POST A SHOW';create.style.cssText='display:block;text-align:center;margin:8px';showsPanel.appendChild(create);
  const today=new Date();today.setHours(0,0,0,0);
  const shows=posts.filter(p=>p.published!==false&&String(p.category||'').toLowerCase()==='show').filter(p=>{const d=dateFrom(p.event?.date);return !d||d>=today;}).sort((a,b)=>(dateFrom(a.event?.date)?.getTime()||Number.MAX_SAFE_INTEGER)-(dateFrom(b.event?.date)?.getTime()||Number.MAX_SAFE_INTEGER)).slice(0,5);
  if(!shows.length){const e=document.createElement('div');e.style.cssText='padding:12px;color:#9ca3a3';e.textContent='No upcoming shows posted yet.';showsPanel.appendChild(e);return;}
  shows.forEach(p=>{
    const ev=p.event||{},d=dateFrom(ev.date)||(p.createdAt?.toDate?.()||new Date());
    const artist=p.authorName||ev.artist||ev.band||ev.title||'Upcoming Show';
    const row=document.createElement('div');row.className='show';
    row.innerHTML=`<div class="date">${d.toLocaleString('en-US',{month:'short'}).toUpperCase()}<span>${d.getDate()}</span></div><div class="show-summary"><b>${esc(artist)}</b>${ev.venue?`<div class="show-venue">${esc(ev.venue)}</div>`:''}${ev.time?`<div class="show-time">${esc(ev.time)}</div>`:''}<button type="button" class="show-details-btn">DETAILS +</button><div class="show-extra">${ev.title&&ev.title!==artist?`<div><b>Event:</b> ${esc(ev.title)}</div>`:''}${ev.location?`<div><b>Location:</b> ${esc(ev.location)}</div>`:''}${ev.price?`<div><b>Price:</b> ${esc(ev.price)}</div>`:''}${ev.age?`<div><b>Age:</b> ${esc(ev.age)}</div>`:''}${ev.details?`<div style="margin-top:5px">${esc(ev.details)}</div>`:''}${ev.ticketUrl?`<a class="btn primary" href="${esc(ev.ticketUrl)}" target="_blank" rel="noopener">TICKETS</a>`:''}${ev.donateUrl?`<a class="btn" href="${esc(ev.donateUrl)}" target="_blank" rel="noopener">SUPPORT</a>`:''}<a class="btn" href="${esc(profileUrl(p))}">PROFILE</a></div></div>`;
    const btn=row.querySelector('.show-details-btn');btn.addEventListener('click',()=>{const open=row.classList.toggle('is-open');btn.textContent=open?'DETAILS −':'DETAILS +';});showsPanel.appendChild(row);
  });
}

// Make the header icon visually match the title height instead of appearing tiny.
function enlargeHeaderLogo(){
  const frame=document.querySelector('.header-logo-frame'),logo=document.querySelector('.header-logo'),brand=document.querySelector('.brand');
  if(!frame||!logo||!brand)return;
  const brandSize=parseFloat(getComputedStyle(brand).fontSize)||24;
  const size=Math.max(44,Math.min(66,brandSize*1.6));
  frame.style.width=`${size}px`;frame.style.height=`${size}px`;frame.style.overflow='visible';
  logo.style.width=`${size}px`;logo.style.height=`${size}px`;logo.style.objectFit='contain';
}
enlargeHeaderLogo();window.addEventListener('resize',enlargeHeaderLogo,{passive:true});

onSnapshot(collection(db,'posts'),snap=>{
  const posts=snap.docs.map(d=>({id:d.id,...d.data()}));
  renderFeedHotfix(posts);renderShowsHotfix(posts);
},error=>{
  console.error('Live dashboard posts unavailable.',error);
  if(feed){const h=feed.querySelector('h3');feed.replaceChildren();if(h)feed.appendChild(h);const e=document.createElement('div');e.className='post';e.innerHTML='<p>Community feed is temporarily unavailable.</p>';feed.appendChild(e);}
  if(showsPanel){const h=showsPanel.querySelector('h3');showsPanel.replaceChildren();if(h)showsPanel.appendChild(h);const e=document.createElement('div');e.style.cssText='padding:12px;color:#9ca3a3';e.textContent='Upcoming shows are temporarily unavailable.';showsPanel.appendChild(e);}
});
