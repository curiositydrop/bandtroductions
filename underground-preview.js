import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, serverTimestamp, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

// Keep the dashboard user's Online Now heartbeat active while they remain on the homepage.
import('./presence.js').catch(error=>console.warn('Presence heartbeat unavailable.',error));

// Slightly increase the ticker height without making the fixed header bulky.
const tickerPolish=document.createElement('style');
tickerPolish.textContent=`
  .news-scroller-card{height:62px}
  @media(max-width:1000px){.news-scroller-card{height:46px}}
  @media(max-width:650px){.news-scroller-card{height:36px}}
`;
document.head.appendChild(tickerPolish);

const feed = document.querySelector('.feed');
const centerColumn=document.querySelector('.center');
const heroPanel=centerColumn?.querySelector('.hero');
const showsPanel = [...document.querySelectorAll('.right .panel')].find(panel => panel.querySelector('h3')?.textContent.trim() === 'Upcoming Shows');
const profilePanel = document.querySelector('.left .menu');
const profileLink = profilePanel?.querySelector('a[href="profile.html"]');
const sponsorGrid = document.querySelector('.left .sponsors');
const onlineGrid = document.querySelector('.left .online');
const menuLinks = profilePanel ? [...profilePanel.querySelectorAll('a')] : [];
const linkByText = text => menuLinks.find(a => a.textContent.trim().toLowerCase() === text.toLowerCase());
const messagesLink = document.getElementById('messages-link') || linkByText('Messages');
const logoutLink = linkByText('Log Out');
let signedInUser=null;
let signedInProfile=null;

function syncHeaderLogo(){
  const logo=document.querySelector('.header-logo'),brand=document.querySelector('.brand');
  if(!logo||!brand)return;
  const size=(parseFloat(getComputedStyle(brand).fontSize)||34)*1.35;
  logo.style.width=`${size}px`;
  logo.style.height=`${size}px`;
}
syncHeaderLogo();
window.addEventListener('resize',syncHeaderLogo);

const initialsFor = name => (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'BT';
const stampMs = stamp => stamp?.toMillis ? stamp.toMillis() : (stamp?.seconds ? stamp.seconds*1000 : 0);
const postMs = post => stampMs(post.createdAt)||stampMs(post.updatedAt)||stampMs(post.publishedAt)||stampMs(post.submittedAt)||0;
const formatDate = stamp => !stamp?.toDate ? 'Just now' : new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(stamp.toDate());
function safeText(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));}
function normalizeDate(value){if(!value)return null;const d=new Date(`${value}T12:00:00`);return Number.isNaN(d.getTime())?null:d;}
function normalizeUrl(value=''){const t=String(value||'').trim();if(!t)return'';return /^https?:\/\//i.test(t)?t:`https://${t}`;}
function profileHref(post){
  const direct=post.profileUrl||post.authorProfileUrl||post.authorUrl;
  if(direct) return direct;
  const id=post.authorId||post.authorUid||post.uid||post.userId;
  return id?`profile.html?id=${encodeURIComponent(id)}`:'index.html';
}
function youtubeFromPost(post){
  const candidates=[post.videoUrl,post.mediaUrl,post.linkUrl,String(post.content||'').match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?[^\s]*v=[A-Za-z0-9_-]{6,}|youtu\.be\/[A-Za-z0-9_-]{6,}|youtube\.com\/(?:embed|shorts)\/[A-Za-z0-9_-]{6,})[^\s]*/i)?.[0]].filter(Boolean);
  for(const rawValue of candidates){
    const raw=String(rawValue).trim();
    const match=raw.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?[^\s#]*?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/i);
    if(match)return {id:match[1],url:raw};
  }
  return null;
}
function renderPostContent(post){
  let text=String(post.content||'');
  if(!text)return '';
  const youtube=youtubeFromPost(post);
  if(youtube&&youtube.url&&text.includes(youtube.url))text=text.replace(youtube.url,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  const targetUrl=post.linkUrl||post.sharedProfile?.url||(post.sharedProfile?.id?`profile.html?id=${encodeURIComponent(post.sharedProfile.id)}`:'');
  if(targetUrl){
    const match=text.match(/^(.*?\bWelcome\s+)(.+?)(\s+[—–-]\s+.*)$/i);
    if(match){
      return `<p>${safeText(match[1])}<a class="inline-profile-link" style="color:#25c7c1;font-weight:900;text-decoration:underline;text-underline-offset:2px" href="${safeText(targetUrl)}">${safeText(match[2])}</a>${safeText(match[3])}</p>`;
    }
  }
  return text?`<p>${safeText(text)}</p>`:'';
}
function renderVideo(post){
  const youtube=youtubeFromPost(post);
  if(youtube)return `<div class="post-video" style="position:relative;width:100%;aspect-ratio:16/9;margin-top:10px;background:#000;border:1px solid #333"><iframe src="https://www.youtube.com/embed/${safeText(youtube.id)}?playsinline=1" title="Post video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe></div>`;
  const raw=String(post.videoUrl||'').trim();
  return raw?`<a href="${safeText(raw)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px;color:#25c7c1;font-weight:900">WATCH VIDEO →</a>`:'';
}

function ensureComposer(){
  if(!centerColumn||!heroPanel)return null;
  let composer=document.getElementById('dashboard-composer');
  if(composer)return composer;
  const style=document.createElement('style');
  style.textContent=`
    #dashboard-composer{display:none;border:2px solid var(--teal);box-shadow:0 0 0 1px rgba(37,199,193,.25),0 0 24px rgba(37,199,193,.12);background:linear-gradient(160deg,#12201f,#0b1111)}
    #dashboard-composer.is-open{display:block}
    .dash-compose-body{padding:12px}.dash-compose-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:9px}.dash-compose-tab{border:1px solid #3c6663;background:#0b0f0f;color:#b8c8c7;padding:7px 10px;font-weight:900;cursor:pointer}.dash-compose-tab.is-active{background:var(--teal);color:#051111;border-color:var(--teal)}
    .dash-compose-body textarea,.dash-compose-body input{width:100%;box-sizing:border-box;border:1px solid #3b5553;background:#080b0b;color:#eee;padding:10px;font:inherit}.dash-compose-body textarea{min-height:96px;resize:vertical}.dash-compose-extra{display:none;margin-top:8px}.dash-compose-extra.is-active{display:block}.dash-compose-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:9px}.dash-compose-status{min-height:1.1em;color:var(--teal);font-size:11px;margin-top:7px}.dash-compose-close{background:transparent;color:#aaa}
    @media(max-width:650px){.dash-compose-body{padding:6px}.dash-compose-tab{font-size:6px;padding:4px}.dash-compose-body textarea,.dash-compose-body input{font-size:8px;padding:6px}.dash-compose-body textarea{min-height:62px}.dash-compose-actions .btn{font-size:6px;padding:5px}.dash-compose-status{font-size:6px}}
  `;
  document.head.appendChild(style);
  composer=document.createElement('section');
  composer.id='dashboard-composer';composer.className='panel';
  composer.innerHTML=`<h3>Create a Post</h3><div class="dash-compose-body"><div class="dash-compose-tabs"><button type="button" class="dash-compose-tab is-active" data-mode="text">COMMENT</button><button type="button" class="dash-compose-tab" data-mode="image">IMAGE</button><button type="button" class="dash-compose-tab" data-mode="video">VIDEO</button></div><textarea id="dash-post-text" maxlength="3000" placeholder="What do you want to share with the scene?"></textarea><div id="dash-image-field" class="dash-compose-extra"><input id="dash-image-url" type="url" maxlength="500" placeholder="Paste image URL"></div><div id="dash-video-field" class="dash-compose-extra"><input id="dash-video-url" type="url" maxlength="500" placeholder="Paste YouTube or video URL"></div><div class="dash-compose-actions"><button type="button" class="btn dash-compose-close">CANCEL</button><button type="button" class="btn primary" id="dash-publish-post">POST</button></div><div class="dash-compose-status" id="dash-compose-status"></div></div>`;
  heroPanel.insertAdjacentElement('afterend',composer);
  const tabs=[...composer.querySelectorAll('.dash-compose-tab')];
  const imageField=composer.querySelector('#dash-image-field'),videoField=composer.querySelector('#dash-video-field');
  tabs.forEach(tab=>tab.addEventListener('click',()=>{tabs.forEach(x=>x.classList.toggle('is-active',x===tab));const mode=tab.dataset.mode;imageField.classList.toggle('is-active',mode==='image');videoField.classList.toggle('is-active',mode==='video');}));
  composer.querySelector('.dash-compose-close').addEventListener('click',()=>{composer.classList.remove('is-open');composer.querySelector('#dash-compose-status').textContent='';});
  composer.querySelector('#dash-publish-post').addEventListener('click',publishDashboardPost);
  return composer;
}
function openComposer(event){
  if(event)event.preventDefault();
  if(!signedInUser){location.href='login.html?returnTo=index.html';return;}
  const composer=ensureComposer();if(!composer)return;
  composer.classList.add('is-open');composer.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>composer.querySelector('#dash-post-text')?.focus(),250);
}
async function notifyNewPost(postId,content,authorName){
  try{
    const followers=await getDocs(query(collection(db,'follows'),where('targetId','==',signedInUser.uid)));
    for(const followerDoc of followers.docs){const followerId=followerDoc.data()?.followerId;if(!followerId||followerId===signedInUser.uid)continue;await setDoc(doc(db,'notifications',`newpost_${postId}_${followerId}`),{recipientId:followerId,actorId:signedInUser.uid,actorName:authorName,type:'new-post',message:`${authorName} posted something new.`,linkUrl:`index.html?post=${encodeURIComponent(postId)}`,postId,read:false,createdAt:serverTimestamp()},{merge:true});}
    if(content.includes('@')){const profiles=await getDocs(query(collection(db,'profiles'),where('published','==',true))),lower=content.toLowerCase();for(const profileDoc of profiles.docs){const profile=profileDoc.data()||{},name=String(profile.displayName||'').trim(),recipientId=profile.ownerId||profileDoc.id;if(!name||!recipientId||recipientId===signedInUser.uid||!lower.includes(`@${name.toLowerCase()}`))continue;await setDoc(doc(db,'notifications',`tag_${postId}_${recipientId}`),{recipientId,actorId:signedInUser.uid,actorName:authorName,type:'tag',message:`${authorName} tagged you in a post.`,linkUrl:`index.html?post=${encodeURIComponent(postId)}`,postId,read:false,createdAt:serverTimestamp()},{merge:true});}}
  }catch(error){console.warn('Post notifications unavailable',error);}
}
async function publishDashboardPost(){
  const composer=ensureComposer();if(!composer)return;
  const status=composer.querySelector('#dash-compose-status'),button=composer.querySelector('#dash-publish-post');
  if(!signedInUser){openComposer();return;}
  const content=composer.querySelector('#dash-post-text').value.trim();
  const activeMode=composer.querySelector('.dash-compose-tab.is-active')?.dataset.mode||'text';
  const imageUrl=activeMode==='image'?normalizeUrl(composer.querySelector('#dash-image-url').value):'';
  const videoUrl=activeMode==='video'?normalizeUrl(composer.querySelector('#dash-video-url').value):'';
  if(!content&&!imageUrl&&!videoUrl){status.textContent='Add a comment, image URL, or video URL first.';return;}
  button.disabled=true;status.textContent='Posting…';
  try{
    const profile=signedInProfile||{};
    const authorName=profile.displayName||profile.name||profile.bandName||profile.venueName||signedInUser.displayName||'BANDtroductions Member';
    const postRef=await addDoc(collection(db,'posts'),{
      authorId:signedInUser.uid,
      authorName,
      accountType:profile.accountType||profile.profileType||'member',
      category:activeMode==='text'?'general':activeMode,
      content,
      imageUrl,
      videoUrl,
      published:true,
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    });
    await notifyNewPost(postRef.id,content,authorName);
    composer.querySelector('#dash-post-text').value='';composer.querySelector('#dash-image-url').value='';composer.querySelector('#dash-video-url').value='';
    status.textContent='Posted.';setTimeout(()=>{composer.classList.remove('is-open');status.textContent='';},650);
  }catch(error){console.error(error);status.textContent=error.code==='permission-denied'?'Post permissions blocked this post.':'Post could not be published.';}
  finally{button.disabled=false;}
}

function wireCommunityActions(){
  document.querySelectorAll('a').forEach(a=>{
    const text=a.textContent.trim().toLowerCase();
    if(text==='create post'||text==='create a post'){a.href='#create-post';a.addEventListener('click',openComposer);}
    if(text==='community'&&a.closest('.nav')){a.href='index.html';}
  });
}
wireCommunityActions();

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
    {name:'Rock Rage Radio',image:'ff796046372b48681a359daff6375626.jpeg',url:'https://rockrageradio.com'},
    {name:'The Plowzone Radio Show',image:'IMG_0908.jpeg',url:'https://www.facebook.com/theplowzoneshow'},
    {name:'Gone Rogue Records',image:'IMG_9474.png',url:'https://www.facebook.com/GoneRogueRecords'},
    {name:'New Leaf Painting Company',image:'IMG_9782.png',url:'https://www.facebook.com/newleafpaintingcompany'}
  ];
  sponsorGrid.replaceChildren();
  sponsors.forEach(sponsor=>{const a=document.createElement('a');a.className='sponsor';a.href=sponsor.url;a.target='_blank';a.rel='noopener noreferrer';a.title=sponsor.name;const img=document.createElement('img');img.src=sponsor.image;img.alt=sponsor.name;img.loading='lazy';img.style.cssText='display:block;width:100%;height:100%;max-height:110px;object-fit:contain';a.appendChild(img);sponsorGrid.appendChild(a);});
}
renderSponsors();

function renderOnlineProfiles(rows=[]){
  if(!onlineGrid)return;
  onlineGrid.replaceChildren();
  if(!rows.length){onlineGrid.innerHTML='<div class="online-empty">No active profiles yet.</div>';return;}
  rows.slice(0,8).forEach(row=>{const a=document.createElement('a');a.className='online-card';a.href=`profile.html?id=${encodeURIComponent(row.profileId||row.uid)}`;a.title=row.name||'BANDtroductions member';if(row.imageUrl)a.innerHTML=`<img src="${safeText(row.imageUrl)}" alt="${safeText(row.name||'Profile')}"><span class="online-dot"></span><span class="online-label">${safeText(row.name||'Online')}</span>`;else a.innerHTML=`<span class="online-fallback">${safeText(initialsFor(row.name||'BT'))}</span><span class="online-dot"></span><span class="online-label">${safeText(row.name||'Online')}</span>`;onlineGrid.appendChild(a);});
}

function loadOnlineNow(){
  if(!onlineGrid)return;
  onSnapshot(collection(db,'presence'),async snap=>{
    const cutoff=Date.now()-3*60*1000;
    const active=snap.docs.map(d=>({uid:d.id,...d.data()})).filter(p=>(p.lastSeen?.toMillis?.()||0)>=cutoff).sort((a,b)=>(b.lastSeen?.toMillis?.()||0)-(a.lastSeen?.toMillis?.()||0));
    const rows=[];
    for(const p of active.slice(0,8)){try{const ps=await getDoc(doc(db,'profiles',p.uid));const data=ps.exists()?ps.data():{};rows.push({uid:p.uid,profileId:ps.exists()?ps.id:p.uid,name:data.displayName||data.name||data.bandName||data.venueName||'Member',imageUrl:data.imageUrl||data.avatarUrl||data.photoURL||''});}catch{rows.push({uid:p.uid,profileId:p.uid,name:'Member',imageUrl:''});}}
    renderOnlineProfiles(rows);
  },error=>{console.warn('Online profiles unavailable',error);renderOnlineProfiles([]);});
}
loadOnlineNow();

function renderFeed(posts=[]){
  if(!feed)return;
  const heading=feed.querySelector('h3');
  feed.replaceChildren();
  if(heading)feed.appendChild(heading);
  if(!posts.length){const empty=document.createElement('div');empty.className='post';empty.innerHTML='<p style="color:#888">No community posts yet.</p>';feed.appendChild(empty);return;}
  posts.slice(0,6).forEach(post=>{
    const article=document.createElement('article');article.className='post';
    const authorName=post.systemPost?'BANDtroductions Admin':(post.authorName||'BANDtroductions Member');
    article.innerHTML=`<div class="post-head"><div class="post-avatar">${safeText(initialsFor(authorName))}</div><div><a class="post-name" href="${safeText(profileHref(post))}">${safeText(authorName)}</a><div class="post-meta">${safeText(formatDate(post.createdAt))}${post.category?` · ${safeText(post.category)}`:''}</div></div></div>${renderPostContent(post)}${post.imageUrl?`<img src="${safeText(post.imageUrl)}" alt="" style="display:block;width:100%;margin-top:12px;border:1px solid #333;max-height:420px;object-fit:cover">`:''}${renderVideo(post)}<div class="post-actions"><span>ROCK ON</span><span>COMMENT</span><span>SHARE</span></div>`;
    feed.appendChild(article);
  });
}

onSnapshot(collection(db,'posts'),snap=>{
  const posts=snap.docs.map(d=>({id:d.id,...d.data()})).filter(p=>p.published!==false).sort((a,b)=>postMs(b)-postMs(a));
  renderFeed(posts);
},error=>console.warn('Community feed unavailable',error));

function renderShows(posts=[]){
  if(!showsPanel)return;
  const heading=showsPanel.querySelector('h3');showsPanel.replaceChildren();if(heading)showsPanel.appendChild(heading);
  const postButton=document.createElement('div');postButton.style.padding='10px';postButton.innerHTML='<a class="btn primary" href="#create-post" style="display:block;text-align:center">POST A SHOW</a>';showsPanel.appendChild(postButton);postButton.querySelector('a').addEventListener('click',event=>{openComposer(event);setTimeout(()=>document.querySelector('.dash-compose-tab[data-mode="text"]')?.click(),0);});
  const shows=posts.filter(p=>p.category==='show'||p.postType==='show'||p.eventDate).sort((a,b)=>{const da=normalizeDate(a.eventDate)?.getTime()||Infinity,db=normalizeDate(b.eventDate)?.getTime()||Infinity;return da-db;}).slice(0,6);
  if(!shows.length){const empty=document.createElement('div');empty.style.cssText='padding:10px;color:#888;font-size:11px';empty.textContent='No upcoming shows posted yet.';showsPanel.appendChild(empty);return;}
  shows.forEach(show=>{const date=normalizeDate(show.eventDate);const div=document.createElement('div');div.className='show';div.innerHTML=`<div class="date">${safeText(date?date.toLocaleString('en-US',{month:'short'}).toUpperCase():'SHOW')}<span>${safeText(date?date.getDate():'•')}</span></div><div class="show-summary"><b>${safeText(show.eventTitle||show.title||'Live Show')}</b><div class="show-venue">${safeText(show.venueName||show.venue||show.location||'Venue TBA')}</div><div class="show-time">${safeText(show.eventTime||show.time||'')}</div></div>`;showsPanel.appendChild(div);});
}

onSnapshot(collection(db,'posts'),snap=>renderShows(snap.docs.map(d=>({id:d.id,...d.data()})).filter(p=>p.published!==false)),error=>console.warn('Shows unavailable',error));

onAuthStateChanged(auth,async user=>{
  signedInUser=user;
  signedInProfile=null;
  if(!user){clearProfileSummary();if(profileLink)profileLink.href='login.html?returnTo=profile.html';if(logoutLink)logoutLink.textContent='Log In';return;}
  try{const snap=await getDoc(doc(db,'profiles',user.uid));signedInProfile=snap.exists()?snap.data():null;}catch(error){console.warn('Could not load dashboard profile',error);}
  renderProfileSummary(user,signedInProfile||{});
  if(profileLink)profileLink.href=`profile.html?id=${encodeURIComponent(user.uid)}`;
  if(logoutLink)logoutLink.textContent='Log Out';
});

logoutLink?.addEventListener('click',async event=>{event.preventDefault();if(!auth.currentUser){location.href='login.html?returnTo=index.html';return;}try{await signOut(auth);location.reload();}catch(error){console.warn('Logout failed',error);}});
