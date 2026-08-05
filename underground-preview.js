import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, doc, getDoc, onSnapshot, orderBy, query } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const feed = document.querySelector('.feed');
const showsPanel = [...document.querySelectorAll('.right .panel')].find(panel => panel.querySelector('h3')?.textContent.trim() === 'Upcoming Shows');
const profilePanel = document.querySelector('.left .menu');
const profileLink = profilePanel?.querySelector('a[href="profile.html"]');
const sponsorGrid = document.querySelector('.left .sponsors');

const initialsFor = name => (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'BT';
const formatDate = stamp => {
  if (!stamp?.toDate) return 'Just now';
  return new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }).format(stamp.toDate());
};
function safeText(value='') { return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch])); }
function normalizeDate(value){ if(!value) return null; const d=new Date(`${value}T12:00:00`); return Number.isNaN(d.getTime())?null:d; }

function renderSponsors(){
  if(!sponsorGrid) return;
  const sponsors=[
    {name:'Rock Rage Radio',image:'ff796046372b48681a359daff6375626.jpeg',url:'http://www.rockrageradio.com'},
    {name:'The Plowzone Radio Show',image:'IMG_0908.jpeg',url:'sponsors.html'},
    {name:'Gone Rogue Records',image:'IMG_0699.jpeg',url:'sponsors.html'},
    {name:'New Leaf Painting Company',image:'9A3AD6D7-8C0C-4C27-BE09-A19C2F0834AE.png',url:'https://www.newleafpaintingco.com'},
    {name:'Woodies Drumsticks',image:'Logo.jpeg',url:'https://woodiesdrumsticks.com/bandtroductions'}
  ];
  sponsorGrid.replaceChildren();
  sponsors.forEach(s=>{
    const a=document.createElement('a');
    a.className='sponsor';
    a.href=s.url;
    if(/^https?:/i.test(s.url)){a.target='_blank';a.rel='noopener';}
    a.title=s.name;
    a.style.cssText='padding:4px;overflow:hidden;text-decoration:none';
    const img=document.createElement('img');
    img.src=s.image; img.alt=s.name; img.loading='lazy';
    img.style.cssText='display:block;width:100%;height:100%;max-height:82px;object-fit:contain';
    a.appendChild(img); sponsorGrid.appendChild(a);
  });
  const more=document.createElement('a'); more.className='sponsor'; more.href='sponsors.html'; more.textContent='VIEW ALL / BECOME A SPONSOR'; more.style.textDecoration='none'; sponsorGrid.appendChild(more);
}

function renderFeed(posts) {
  if (!feed) return;
  const heading = feed.querySelector('h3');
  feed.replaceChildren();
  if (heading) feed.appendChild(heading);
  const visible = posts.filter(p => p.published !== false).slice(0, 6);
  if (!visible.length) { const empty=document.createElement('div');empty.className='post';empty.innerHTML='<p>No community posts yet.</p>';feed.appendChild(empty);return; }
  visible.forEach(post => {
    const article = document.createElement('article'); article.className='post';
    article.innerHTML = `<div class="post-head"><div class="post-avatar">${safeText(initialsFor(post.authorName))}</div><div><div class="post-name">${safeText(post.authorName || 'BANDtroductions Member')}</div><div class="post-meta">${safeText(formatDate(post.createdAt))}${post.category ? ` · ${safeText(post.category)}` : ''}</div></div></div>${post.content ? `<p>${safeText(post.content)}</p>` : ''}${post.imageUrl ? `<img src="${safeText(post.imageUrl)}" alt="" style="display:block;width:100%;margin-top:12px;border:1px solid #333;max-height:420px;object-fit:cover">` : ''}${post.linkUrl ? `<a class="btn" href="${safeText(post.linkUrl)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px">OPEN LINK</a>` : ''}<div class="post-actions"><span>ROCK ON</span><span>COMMENT</span><span>SHARE</span></div>`;
    feed.appendChild(article);
  });
}

function ensureShowModal(){
  let modal=document.getElementById('show-detail-modal'); if(modal) return modal;
  modal=document.createElement('div'); modal.id='show-detail-modal';
  modal.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.86);z-index:99999;align-items:center;justify-content:center;padding:18px';
  modal.innerHTML='<div id="show-detail-card" style="width:min(560px,96vw);max-height:88vh;overflow:auto;background:#101212;border:1px solid #25c7c1;padding:18px;position:relative"><button id="show-detail-close" style="position:absolute;right:8px;top:6px;background:none;border:0;color:#aaa;font-size:28px">×</button><div id="show-detail-content"></div></div>';
  document.body.appendChild(modal); modal.querySelector('#show-detail-close').onclick=()=>modal.style.display='none'; modal.addEventListener('click',e=>{if(e.target===modal)modal.style.display='none'}); return modal;
}
function openShow(post){
  const e=post.event||{},modal=ensureShowModal(),content=modal.querySelector('#show-detail-content');
  const when=[e.date,e.time].filter(Boolean).join(' · '),where=[e.venue,e.location].filter(Boolean).join(' · ');
  const buttons=[];
  if(e.ticketUrl)buttons.push(`<a class="btn primary" href="${safeText(e.ticketUrl)}" target="_blank" rel="noopener">BUY TICKETS</a>`);
  if(e.donateUrl)buttons.push(`<a class="btn" href="${safeText(e.donateUrl)}" target="_blank" rel="noopener">SUPPORT BAND</a>`);
  if(e.profileUrl)buttons.push(`<a class="btn" href="${safeText(e.profileUrl)}">VIEW PROFILE</a>`);
  content.innerHTML=`${e.imageUrl?`<img src="${safeText(e.imageUrl)}" alt="" style="width:100%;max-height:300px;object-fit:cover;border:1px solid #333;margin-bottom:12px">`:''}<div style="color:#25c7c1;font-size:12px;font-weight:900">UPCOMING SHOW</div><h2 style="margin:5px 0 10px;color:#fff">${safeText(e.title||post.authorName||'Show / Event')}</h2>${when?`<p><b>${safeText(when)}</b></p>`:''}${where?`<p>${safeText(where)}</p>`:''}${e.price?`<p>Price: ${safeText(e.price)}</p>`:''}${e.age?`<p>Age: ${safeText(e.age)}</p>`:''}${e.details?`<p style="line-height:1.5">${safeText(e.details)}</p>`:`<p style="line-height:1.5">${safeText(post.content||'')}</p>`}<div class="btns" style="justify-content:flex-start;margin-top:14px">${buttons.join('')}</div>`;
  modal.style.display='flex';
}

function renderShows(posts) {
  if (!showsPanel) return;
  const heading = showsPanel.querySelector('h3'); showsPanel.replaceChildren(); if (heading) showsPanel.appendChild(heading);
  const create=document.createElement('a'); create.href='show-event.html'; create.className='btn primary'; create.textContent='POST A SHOW'; create.style.cssText='display:block;text-align:center;margin:8px'; showsPanel.appendChild(create);
  const shows = posts.filter(p => p.published !== false && p.category === 'show').sort((a,b)=>{const ad=normalizeDate(a.event?.date),bd=normalizeDate(b.event?.date);if(ad&&bd)return ad-bd;if(ad)return -1;if(bd)return 1;return 0}).slice(0, 5);
  if (!shows.length) { const empty=document.createElement('div');empty.style.padding='12px';empty.style.color='#9ca3a3';empty.textContent='Show/Event posts will appear here automatically.';showsPanel.appendChild(empty);return; }
  shows.forEach(post => {
    const eventDate=normalizeDate(post.event?.date); const d=eventDate || (post.createdAt?.toDate ? post.createdAt.toDate() : new Date());
    const title=post.event?.title||post.authorName||'Upcoming Show'; const location=[post.event?.venue,post.event?.location].filter(Boolean).join(' · ') || (post.content||'View show details').slice(0,70);
    const row=document.createElement('button'); row.type='button';row.className='show';row.style.cssText='width:100%;text-align:left;color:inherit;background:transparent;border-left:0;border-right:0;border-top:0;font:inherit';
    row.innerHTML=`<div class="date">${d.toLocaleString('en-US',{month:'short'}).toUpperCase()}<span>${d.getDate()}</span></div><div><b>${safeText(title)}</b><div>${safeText(location)}</div><small>${post.event?'Tap for event details':'Tap for community post'}</small></div>`;
    row.onclick=()=>post.event?openShow(post):(window.location.href='community.html'); showsPanel.appendChild(row);
  });
}

renderSponsors();

onAuthStateChanged(auth, async user => {
  if (!profilePanel) return;
  const title = profilePanel.querySelector('h3');
  if (!user) { if (title) title.textContent='My Profile'; if (profileLink){profileLink.textContent='Log In / Create Account';profileLink.href='login.html';} return; }
  try { const profileSnap=await getDoc(doc(db,'profiles',user.uid)),userSnap=await getDoc(doc(db,'users',user.uid)); const profile=profileSnap.exists()?profileSnap.data():(userSnap.exists()?userSnap.data():{}); const name=profile.displayName||user.displayName||'My Profile'; if(title)title.textContent=name;if(profileLink){profileLink.textContent='View / Edit Profile';profileLink.href=`profile.html?id=${encodeURIComponent(user.uid)}`;} } catch(error){console.warn('Could not load profile for preview dashboard.',error);}
});

const postsQuery=query(collection(db,'posts'),orderBy('createdAt','desc'));
onSnapshot(postsQuery,snapshot=>{const posts=snapshot.docs.map(docSnap=>({id:docSnap.id,...docSnap.data()}));renderFeed(posts);renderShows(posts);},error=>{console.error('Could not load live posts into dashboard preview.',error);});