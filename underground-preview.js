import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, doc, getDoc, onSnapshot, orderBy, query } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const feed = document.querySelector('.feed');
const showsPanel = [...document.querySelectorAll('.right .panel')].find(panel => panel.querySelector('h3')?.textContent.trim() === 'Upcoming Shows');
const profilePanel = document.querySelector('.left .menu');
const profileLink = profilePanel?.querySelector('a[href="profile.html"]');
const sponsorGrid = document.querySelector('.left .sponsors');
const onlineGrid = document.querySelector('.left .online');
const menuLinks = profilePanel ? [...profilePanel.querySelectorAll('a')] : [];
const linkByText = text => menuLinks.find(a => a.textContent.trim().toLowerCase() === text.toLowerCase());
const messagesLink = document.getElementById('messages-link') || linkByText('Messages');
const logoutLink = linkByText('Log Out');

function syncHeaderLogo(){
  const logo=document.querySelector('.header-logo'),brand=document.querySelector('.brand');
  if(!logo||!brand)return;
  const size=parseFloat(getComputedStyle(brand).fontSize)||34;
  logo.style.width=`${size}px`;
  logo.style.height=`${size}px`;
}
syncHeaderLogo();
window.addEventListener('resize',syncHeaderLogo);

const initialsFor = name => (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'BT';
const formatDate = stamp => !stamp?.toDate ? 'Just now' : new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(stamp.toDate());
function safeText(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[ch]));}
function normalizeDate(value){if(!value)return null;const d=new Date(`${value}T12:00:00`);return Number.isNaN(d.getTime())?null:d;}
function profileHref(post){
  const direct=post.profileUrl||post.authorProfileUrl||post.authorUrl;
  if(direct) return direct;
  const id=post.authorId||post.authorUid||post.uid||post.userId;
  return id?`profile.html?id=${encodeURIComponent(id)}`:'community.html';
}
function renderPostContent(post){
  const text=String(post.content||'');
  if(!text)return '';
  const targetUrl=post.linkUrl||post.sharedProfile?.url||(post.sharedProfile?.id?`profile.html?id=${encodeURIComponent(post.sharedProfile.id)}`:'');
  if(targetUrl){
    const match=text.match(/^(.*?\bWelcome\s+)(.+?)(\s+[—–-]\s+.*)$/i);
    if(match){
      return `<p>${safeText(match[1])}<a class="inline-profile-link" style="color:#25c7c1;font-weight:900;text-decoration:underline;text-underline-offset:2px" href="${safeText(targetUrl)}">${safeText(match[2])}</a>${safeText(match[3])}</p>`;
    }
  }
  return `<p>${safeText(text)}</p>`;
}

function ensureProfileSummary(){
  if(!profilePanel)return null;
  let summary=profilePanel.querySelector('.dashboard-profile-summary');
  if(summary)return summary;
  summary=document.createElement('a');
  summary.className='dashboard-profile-summary';
  summary.hidden=true;
  const heading=profilePanel.querySelector('h3');
  heading?.insertAdjacentElement('afterend',summary);
  const style=document.createElement('style');
  style.textContent=`
    .dashboard-profile-summary{display:grid;grid-template-columns:54px minmax(0,1fr);gap:9px;align-items:center;padding:10px 12px;border-bottom:1px solid #333;color:#eee;text-decoration:none;background:#0c0e0e}
    .dashboard-profile-summary[hidden]{display:none}
    .dashboard-profile-avatar{width:54px;height:54px;border:1px solid #466;border-radius:4px;overflow:hidden;background:#171a1a;display:grid;place-items:center;color:var(--teal);font-weight:900}
    .dashboard-profile-avatar img{width:100%;height:100%;object-fit:cover;display:block}
    .dashboard-profile-name{font-weight:900;color:var(--teal);font-size:13px;line-height:1.2;overflow-wrap:anywhere}
    .dashboard-profile-type{margin-top:3px;color:#8f9999;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
    .dashboard-profile-view{margin-top:5px;color:#ddd;font-size:9px}
    @media(max-width:650px){.dashboard-profile-summary{grid-template-columns:24px minmax(0,1fr);gap:3px;padding:5px 4px}.dashboard-profile-avatar{width:24px;height:24px}.dashboard-profile-name{font-size:7px}.dashboard-profile-type{font-size:5px;margin-top:1px}.dashboard-profile-view{font-size:5px;margin-top:2px}}
  `;
  document.head.appendChild(style);
  return summary;
}

function renderProfileSummary(user, profile={}){
  const summary=ensureProfileSummary();
  if(!summary)return;
  const name=profile.displayName||profile.name||profile.bandName||profile.venueName||user?.displayName||'My Profile';
  const type=profile.profileType||profile.type||profile.role||profile.category||'Member';
  const image=profile.avatarUrl||profile.photoURL||profile.imageUrl||profile.profileImage||profile.avatar||user?.photoURL||'';
  summary.href=`profile.html?id=${encodeURIComponent(user.uid)}`;
  summary.innerHTML=`<span class="dashboard-profile-avatar">${image?`<img src="${safeText(image)}" alt="${safeText(name)}">`:safeText(initialsFor(name))}</span><span><span class="dashboard-profile-name">${safeText(name)}</span><span class="dashboard-profile-type">${safeText(type)}</span><span class="dashboard-profile-view">View profile →</span></span>`;
  summary.hidden=false;
}

function clearProfileSummary(){
  const summary=profilePanel?.querySelector('.dashboard-profile-summary');
  if(summary)summary.hidden=true;
}

function renderSponsors(){
  if(!sponsorGrid)return;
  const sponsors=[
    {name:'Rock Rage Radio',image:'ff796046372b48681a359daff6375626.jpeg',url:'http://www.rockrageradio.com'},
    {name:'The Plowzone Radio Show',image:'IMG_0908.jpeg',url:'sponsors.html'},
    {name:'Gone Rogue Records',image:'IMG_0699.jpeg',url:'sponsors.html'},
    {name:'New Leaf Painting Company',image:'9A3AD6D7-8C0C-4C27-BE09-A19C2F0834AE.png',url:'https://www.newleafpaintingco.com'},
    {name:'Woodies Drumsticks',image:'Logo.jpeg',url:'https://woodiesdrumsticks.com/bandtroductions'}
  ];
  sponsorGrid.replaceChildren();
  sponsors.forEach(s=>{const a=document.createElement('a');a.className='sponsor';a.href=s.url;if(/^https?:/i.test(s.url)){a.target='_blank';a.rel='noopener';}a.title=s.name;a.style.cssText='padding:4px;overflow:hidden;text-decoration:none';const img=document.createElement('img');img.src=s.image;img.alt=s.name;img.loading='lazy';img.style.cssText='display:block;width:100%;height:100%;max-height:82px;object-fit:contain';a.appendChild(img);sponsorGrid.appendChild(a);});
  const more=document.createElement('a');more.className='sponsor';more.href='sponsors.html';more.textContent='VIEW ALL / BECOME A SPONSOR';more.style.textDecoration='none';sponsorGrid.appendChild(more);
}

async function renderOnline(users){
  if(!onlineGrid)return;
  const cutoff=Date.now()-150000;
  const active=users.filter(u=>u.lastActiveAt?.toDate&&u.lastActiveAt.toDate().getTime()>=cutoff).sort((a,b)=>b.lastActiveAt.toDate()-a.lastActiveAt.toDate()).slice(0,8);
  if(!active.length){onlineGrid.innerHTML='<div class="online-empty">No one is active right now.</div>';return;}
  const enriched=await Promise.all(active.map(async user=>{
    try{
      const snap=await getDoc(doc(db,'profiles',user.id));
      return {id:user.id,...user,...(snap.exists()?snap.data():{})};
    }catch{return user;}
  }));
  onlineGrid.replaceChildren();
  enriched.forEach(person=>{
    const name=person.displayName||person.name||person.bandName||person.venueName||'Member';
    const image=person.avatarUrl||person.photoURL||person.imageUrl||person.profileImage||person.avatar||'';
    const a=document.createElement('a');
    a.className='online-card';
    a.href=`profile.html?id=${encodeURIComponent(person.id)}`;
    a.title=`${name} is online`;
    if(image){const img=document.createElement('img');img.src=image;img.alt=name;img.loading='lazy';a.appendChild(img);}else{const f=document.createElement('span');f.className='online-fallback';f.textContent=initialsFor(name);a.appendChild(f);}
    const label=document.createElement('span');label.className='online-label';label.textContent=name;a.appendChild(label);
    const dot=document.createElement('span');dot.className='online-dot';dot.setAttribute('aria-label','Online');a.appendChild(dot);
    onlineGrid.appendChild(a);
  });
}

function renderFeed(posts){
  if(!feed)return;const heading=feed.querySelector('h3');feed.replaceChildren();if(heading)feed.appendChild(heading);
  const visible=posts.filter(p=>p.published!==false).slice(0,6);
  if(!visible.length){const empty=document.createElement('div');empty.className='post';empty.innerHTML='<p>No community posts yet.</p>';feed.appendChild(empty);return;}
  visible.forEach(post=>{
    const article=document.createElement('article');article.className='post';const name=safeText(post.authorName||'BANDtroductions Member');
    article.innerHTML=`<div class="post-head"><div class="post-avatar">${safeText(initialsFor(post.authorName))}</div><div><div class="post-name">${name}</div><div class="post-meta">${safeText(formatDate(post.createdAt))}${post.category?` · ${safeText(post.category)}`:''}</div></div></div>${renderPostContent(post)}${post.imageUrl?`<img src="${safeText(post.imageUrl)}" alt="" style="display:block;width:100%;margin-top:12px;border:1px solid #333;max-height:420px;object-fit:cover">`:''}<div class="post-actions"><span>ROCK ON</span><span>COMMENT</span><span>SHARE</span></div>`;
    feed.appendChild(article);
  });
}

function renderShows(posts){
  if(!showsPanel)return;const heading=showsPanel.querySelector('h3');showsPanel.replaceChildren();if(heading)showsPanel.appendChild(heading);
  const create=document.createElement('a');create.href='show-event.html';create.className='btn primary';create.textContent='POST A SHOW';create.style.cssText='display:block;text-align:center;margin:8px';showsPanel.appendChild(create);
  const now=new Date();now.setHours(0,0,0,0);
  const shows=posts.filter(p=>p.published!==false&&p.category==='show').filter(p=>{const d=normalizeDate(p.event?.date);return !d||d>=now;}).sort((a,b)=>{const ad=normalizeDate(a.event?.date),bd=normalizeDate(b.event?.date);if(ad&&bd)return ad-bd;if(ad)return-1;if(bd)return 1;return 0;}).slice(0,5);
  if(!shows.length){const empty=document.createElement('div');empty.style.padding='12px';empty.style.color='#9ca3a3';empty.textContent='Show/Event posts will appear here automatically.';showsPanel.appendChild(empty);return;}
  shows.forEach(post=>{
    const e=post.event||{};const eventDate=normalizeDate(e.date);const d=eventDate||(post.createdAt?.toDate?post.createdAt.toDate():new Date());
    const artist=post.authorName||e.artist||e.band||e.title||'Upcoming Show';const venue=e.venue||'';const time=e.time||'';
    const row=document.createElement('div');row.className='show';
    const detailBits=[];if(e.title&&e.title!==artist)detailBits.push(`<div><b>Event:</b> ${safeText(e.title)}</div>`);if(e.location)detailBits.push(`<div><b>Location:</b> ${safeText(e.location)}</div>`);if(e.price)detailBits.push(`<div><b>Price:</b> ${safeText(e.price)}</div>`);if(e.age)detailBits.push(`<div><b>Age:</b> ${safeText(e.age)}</div>`);if(e.details)detailBits.push(`<div style="margin-top:5px">${safeText(e.details)}</div>`);else if(post.content)detailBits.push(`<div style="margin-top:5px">${safeText(post.content)}</div>`);
    const links=[];if(e.ticketUrl)links.push(`<a class="btn primary" href="${safeText(e.ticketUrl)}" target="_blank" rel="noopener">TICKETS</a>`);if(e.donateUrl)links.push(`<a class="btn" href="${safeText(e.donateUrl)}" target="_blank" rel="noopener">SUPPORT</a>`);links.push(`<a class="btn" href="${safeText(profileHref(post))}">PROFILE</a>`);
    row.innerHTML=`<div class="date">${d.toLocaleString('en-US',{month:'short'}).toUpperCase()}<span>${d.getDate()}</span></div><div class="show-summary"><b>${safeText(artist)}</b>${venue?`<div class="show-venue">${safeText(venue)}</div>`:''}${time?`<div class="show-time">${safeText(time)}</div>`:''}<button type="button" class="show-details-btn">DETAILS +</button><div class="show-extra">${detailBits.join('')}${links.join('')}</div></div>`;
    const toggle=row.querySelector('.show-details-btn');toggle.addEventListener('click',()=>{const open=row.classList.toggle('is-open');toggle.textContent=open?'DETAILS −':'DETAILS +';});showsPanel.appendChild(row);
  });
}

renderSponsors();

if(messagesLink){
  messagesLink.title='Direct messaging is on the build list';
  messagesLink.addEventListener('click',event=>{
    if(messagesLink.getAttribute('href')==='#')event.preventDefault();
  });
}

if(logoutLink){
  logoutLink.addEventListener('click',async event=>{
    event.preventDefault();
    try{await signOut(auth);location.reload();}catch(error){console.warn('Could not log out.',error);}
  });
}

onAuthStateChanged(auth,async user=>{
  if(!profilePanel)return;
  const title=profilePanel.querySelector('h3');
  if(!user){
    clearProfileSummary();
    if(title)title.textContent='My Profile';
    if(profileLink){profileLink.textContent='Log In / Create Account';profileLink.href='login.html';}
    if(logoutLink)logoutLink.style.display='none';
    return;
  }
  if(logoutLink)logoutLink.style.display='block';
  try{
    const [profileSnap,userSnap]=await Promise.all([getDoc(doc(db,'profiles',user.uid)),getDoc(doc(db,'users',user.uid))]);
    const profile=profileSnap.exists()?profileSnap.data():(userSnap.exists()?userSnap.data():{});
    if(title)title.textContent='My Profile';
    renderProfileSummary(user,profile);
    if(profileLink){profileLink.textContent='View / Edit Profile';profileLink.href=`profile.html?id=${encodeURIComponent(user.uid)}`;}
  }catch(error){
    console.warn('Could not load profile for preview dashboard.',error);
    renderProfileSummary(user,{});
  }
});

const postsQuery=query(collection(db,'posts'),orderBy('createdAt','desc'));
onSnapshot(postsQuery,snapshot=>{const posts=snapshot.docs.map(docSnap=>({id:docSnap.id,...docSnap.data()}));renderFeed(posts);renderShows(posts);},error=>console.error('Could not load live posts into dashboard preview.',error));

onSnapshot(collection(db,'users'),snapshot=>{renderOnline(snapshot.docs.map(d=>({id:d.id,...d.data()})));},error=>{console.warn('Could not load Online Now.',error);if(onlineGrid)onlineGrid.innerHTML='<div class="online-empty">Online status unavailable.</div>';});