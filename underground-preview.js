import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

// Keep the dashboard user's Online Now heartbeat active while they remain on the homepage.
import('./presence.js').catch(error=>console.warn('Presence heartbeat unavailable.',error));
import { injectShowEvents } from './show-events-jsonld.js?v=1';

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
let authResolved=false;
let latestDashboardPosts=[];
let dashboardTagProfiles=[];
let dashboardTaggedProfiles=[];
const adminAvatarFallback='bt-admin-avatar.svg?v=1';

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
function linkifyText(value='',mentions=[]){
  const source=String(value||'');
  const normalizedMentions=(Array.isArray(mentions)?mentions:[])
    .filter(m=>m&&m.profileId&&m.displayName)
    .map(m=>({profileId:String(m.profileId),displayName:String(m.displayName)}));
  const lower=source.toLowerCase();
  let html='',cursor=0;
  const urlPattern=/(?:https?:\/\/|www\.)[^\s<>]+/gi;
  const urls=[...source.matchAll(urlPattern)].map(match=>({index:match.index,raw:match[0],type:'url'}));
  const mentionTokens=[];
  normalizedMentions.forEach(m=>{
    const token='@'+m.displayName,needle=token.toLowerCase();
    let start=0;
    while((start=lower.indexOf(needle,start))!==-1){
      mentionTokens.push({index:start,raw:source.slice(start,start+token.length),type:'mention',mention:m});
      start+=token.length;
    }
  });
  const tokens=[...urls,...mentionTokens].sort((a,b)=>a.index-b.index||(a.type==='mention'?-1:1));
  for(const token of tokens){
    if(token.index<cursor)continue;
    html+=safeText(source.slice(cursor,token.index));
    if(token.type==='mention'){
      html+=`<a class="inline-profile-link community-tag-link" href="profile.html?id=${encodeURIComponent(token.mention.profileId)}">${safeText(token.raw)}</a>`;
      cursor=token.index+token.raw.length;
      continue;
    }
    let url=token.raw,trailing='';
    while(url&&/[.,!?;:)}\]]$/.test(url)){trailing=url.slice(-1)+trailing;url=url.slice(0,-1);}
    const href=/^www\./i.test(url)?`https://${url}`:url;
    html+=`<a class="community-inline-link" href="${safeText(href)}" target="_blank" rel="noopener noreferrer">${safeText(url)}</a>${safeText(trailing)}`;
    cursor=token.index+token.raw.length;
  }
  return html+safeText(source.slice(cursor));
}
function normalizeDate(value){if(!value)return null;const d=new Date(`${value}T12:00:00`);return Number.isNaN(d.getTime())?null:d;}
function safeHttpUrl(value){const t=String(value||'').trim();if(!t||/\s/.test(t))return'';try{const u=new URL(t);if(!/^https?:$/.test(u.protocol))return'';const h=u.hostname;if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(h))return'';return u.href;}catch{return'';}}
function nyToday(){const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const g=t=>p.find(x=>x.type===t).value;return new Date(`${g('year')}-${g('month')}-${g('day')}T00:00:00`);}
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
      return `<p>${linkifyText(match[1],post.mentions)}<a class="inline-profile-link" style="color:#25c7c1;font-weight:900;text-decoration:underline;text-underline-offset:2px" href="${safeText(targetUrl)}">${safeText(match[2])}</a>${linkifyText(match[3],post.mentions)}</p>`;
    }
  }
  return text?`<p>${linkifyText(text,post.mentions)}</p>`:'';
}

// Unmistakable show card for category==='show' posts in the community feed.
const showCardStyle=document.createElement('style');
showCardStyle.textContent=`
.post.post-is-show{border-color:#ff5a3c!important;box-shadow:inset 4px 0 0 #ff5a3c}
.feed-show{display:grid;grid-template-columns:64px 1fr;margin-top:10px;border:1px solid #5a2b22;background:#140d0c}
.feed-show-date{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 2px;border-right:2px dashed #5a2b22;background:repeating-linear-gradient(0deg,#1a0f0d 0 6px,#1d1110 6px 12px);text-align:center}
.feed-show-date small{font-size:9px;font-weight:900;color:#9ca3a3;letter-spacing:1px}.feed-show-date em{font-style:normal;font-size:11px;font-weight:900;color:#ff5a3c}.feed-show-date strong{font-size:26px;line-height:1;color:#fff}
.feed-show-body{padding:9px 10px;min-width:0}.feed-show-kicker{font-size:9px;font-weight:900;letter-spacing:1.5px;color:#ff5a3c}
.feed-show-band{font-size:16px;font-weight:900;color:#fff;margin:2px 0}.feed-show-meta{font-size:12px;color:#ddd;display:flex;flex-wrap:wrap;gap:2px 10px}.feed-show-meta b{color:#25c7c1}
.feed-show-acts{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.feed-show-acts a{font-size:10px;font-weight:900;text-decoration:none;border:1px solid #444;padding:5px 7px;color:#eee}.feed-show-acts a.primary{background:#25c7c1;border-color:#25c7c1;color:#041010}
.feed-show-note{margin:8px 0 0;font-size:12px;color:#bbb;white-space:pre-line}
@media(max-width:650px){.feed-show{grid-template-columns:44px 1fr}.feed-show-date strong{font-size:18px}.feed-show-date em,.feed-show-date small{font-size:7px}.feed-show-band{font-size:11px}.feed-show-meta{font-size:8px}.feed-show-kicker{font-size:7px}.feed-show-acts a{font-size:7px;padding:3px 5px}.feed-show-note{font-size:8px}}
`;
document.head.appendChild(showCardStyle);
function renderShowCard(post){
  const e=post.event||{};const pick=(...v)=>v.find(x=>x!==undefined&&x!==null&&String(x).trim()!=='')||'';
  const date=pick(e.date,post.eventDate,post.showDate,post.date);const d=normalizeDate(date);
  const band=pick(post.authorName,e.artist,e.band,e.title,'Live Show');const title=pick(e.title,post.eventTitle);
  const venue=pick(e.venue,post.eventVenue,post.venue);const loc=pick(e.location,post.eventLocation,post.location);const time=pick(e.time,post.eventTime,post.showTime);
  const past=d&&d<nyToday();
  const tix=safeHttpUrl(pick(e.ticketUrl,post.ticketUrl,post.linkUrl));
  let note=String(pick(e.details,post.content));const summary=[title,venue&&`at ${venue}`,loc&&`in ${loc}`].filter(Boolean).join(' ');if(summary&&note.startsWith(summary))note=note.slice(summary.length).trim();
  const dateBox=d?`<small>${d.toLocaleString('en-US',{weekday:'short'}).toUpperCase()}</small><em>${d.toLocaleString('en-US',{month:'short'}).toUpperCase()}</em><strong>${d.getDate()}</strong>`:'<em>LIVE</em><strong>🎸</strong>';
  return `<div class="feed-show"><div class="feed-show-date">${dateBox}</div><div class="feed-show-body"><div class="feed-show-kicker">${past?'PAST SHOW':'🎟 LIVE SHOW'}</div><div class="feed-show-band">${safeText(band)}</div>${title&&title!==band?`<div class="feed-show-meta">${safeText(title)}</div>`:''}<div class="feed-show-meta">${venue?`<span><b>@</b> ${safeText(venue)}</span>`:''}${loc?`<span>📍 ${safeText(loc)}</span>`:''}${time?`<span>🕒 ${safeText(time)}</span>`:''}</div><div class="feed-show-acts">${tix&&!past?`<a class="primary" href="${safeText(tix)}" target="_blank" rel="noopener">TICKETS</a>`:''}<a href="shows.html">ALL SHOWS →</a><a href="#bt-upcoming-shows">UPCOMING →</a><a href="${safeText(profileHref(post))}">PROFILE</a></div></div></div>${note?`<p class="feed-show-note">${safeText(note)}</p>`:''}`;
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
    .dash-compose-body textarea,.dash-compose-body input{width:100%;box-sizing:border-box;border:1px solid #3b5553;background:#080b0b;color:#eee;padding:10px;font:inherit}.dash-compose-body textarea{min-height:96px;resize:vertical}.dash-tag-wrap{position:relative}.dash-tag-help{display:block;margin-top:5px;color:#879594;font-size:10px}.dash-tag-suggestions{display:grid;gap:5px;margin-top:6px;padding:7px;border:1px solid #315d59;background:#080b0b;max-height:210px;overflow:auto}.dash-tag-suggestions[hidden]{display:none!important}.dash-tag-option{border:1px solid #294b48;background:#111;color:#ddd;padding:8px;text-align:left;font:inherit;cursor:pointer}.dash-tag-option strong{color:var(--teal)}.community-tag-link{color:var(--teal)!important;font-weight:900;text-decoration:underline;text-underline-offset:2px}.dash-compose-extra{display:none;margin-top:8px}.dash-compose-extra.is-active{display:block}.dash-compose-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:9px}.dash-compose-status{min-height:1.1em;color:var(--teal);font-size:11px;margin-top:7px}.dash-compose-close{background:transparent;color:#aaa}
    @media(max-width:650px){.dash-compose-body{padding:6px}.dash-compose-tab{font-size:6px;padding:4px}.dash-compose-body textarea,.dash-compose-body input{font-size:8px;padding:6px}.dash-compose-body textarea{min-height:62px}.dash-compose-actions .btn{font-size:6px;padding:5px}.dash-compose-status{font-size:6px}}
  `;
  document.head.appendChild(style);
  composer=document.createElement('section');
  composer.id='dashboard-composer';composer.className='panel';
  composer.innerHTML=`<h3>Create a Post</h3><div class="dash-compose-body"><div class="dash-compose-tabs"><button type="button" class="dash-compose-tab is-active" data-mode="text">COMMENT</button><button type="button" class="dash-compose-tab" data-mode="image">IMAGE</button><button type="button" class="dash-compose-tab" data-mode="video">VIDEO</button></div><div class="dash-tag-wrap"><textarea id="dash-post-text" maxlength="3000" placeholder="What do you want to share with the scene?"></textarea><small class="dash-tag-help">Type @ followed by a profile name to tag a band, musician, venue, or fan.</small><div id="dash-tag-suggestions" class="dash-tag-suggestions" hidden></div></div><div id="dash-image-field" class="dash-compose-extra"><input id="dash-image-url" type="url" maxlength="500" placeholder="Paste image URL"></div><div id="dash-video-field" class="dash-compose-extra"><input id="dash-video-url" type="url" maxlength="500" placeholder="Paste YouTube or video URL"></div><div class="dash-compose-actions"><button type="button" class="btn dash-compose-close">CANCEL</button><button type="button" class="btn primary" id="dash-publish-post">POST</button></div><div class="dash-compose-status" id="dash-compose-status"></div></div>`;
  heroPanel.insertAdjacentElement('afterend',composer);
  const tabs=[...composer.querySelectorAll('.dash-compose-tab')];
  const imageField=composer.querySelector('#dash-image-field'),videoField=composer.querySelector('#dash-video-field');
  tabs.forEach(tab=>tab.addEventListener('click',()=>{tabs.forEach(x=>x.classList.toggle('is-active',x===tab));const mode=tab.dataset.mode;imageField.classList.toggle('is-active',mode==='image');videoField.classList.toggle('is-active',mode==='video');}));
  const tagInput=composer.querySelector('#dash-post-text'),tagSuggestions=composer.querySelector('#dash-tag-suggestions');
  const refreshTagSuggestions=()=>{
    const before=tagInput.value.slice(0,tagInput.selectionStart);
    const match=before.match(/(?:^|\s)@([^@\n]{0,40})$/);
    tagSuggestions.replaceChildren();
    if(!match){tagSuggestions.hidden=true;return;}
    const term=match[1].trim().toLowerCase();
    const matches=dashboardTagProfiles.filter(p=>p.recipientId!==signedInUser?.uid&&String(p.displayName||'').toLowerCase().includes(term)).slice(0,8);
    if(!matches.length){tagSuggestions.hidden=true;return;}
    matches.forEach(p=>{
      const button=document.createElement('button');button.type='button';button.className='dash-tag-option';
      const strong=document.createElement('strong');strong.textContent=p.displayName||'Profile';
      const meta=document.createElement('span');meta.textContent=` · ${p.accountType||'member'}`;
      button.append(strong,meta);
      button.addEventListener('click',()=>{
        const full=match[0],leading=full.startsWith(' ')?' ':'',start=tagInput.selectionStart-full.length;
        const beforeTag=tagInput.value.slice(0,start),after=tagInput.value.slice(tagInput.selectionStart);
        const inserted=`${leading}@${p.displayName} `;
        tagInput.value=beforeTag+inserted+after;
        const caret=beforeTag.length+inserted.length;tagInput.focus();tagInput.setSelectionRange(caret,caret);
        if(!dashboardTaggedProfiles.some(item=>item.profileId===p.profileId))dashboardTaggedProfiles.push(p);
        tagSuggestions.hidden=true;
      });
      tagSuggestions.appendChild(button);
    });
    tagSuggestions.hidden=false;
  };
  tagInput.addEventListener('input',refreshTagSuggestions);tagInput.addEventListener('keyup',refreshTagSuggestions);tagInput.addEventListener('click',refreshTagSuggestions);
  composer.querySelector('.dash-compose-close').addEventListener('click',()=>{composer.classList.remove('is-open');composer.querySelector('#dash-compose-status').textContent='';tagSuggestions.hidden=true;});
  composer.querySelector('#dash-publish-post').addEventListener('click',publishDashboardPost);
  return composer;
}
function openComposer(event){
  if(event)event.preventDefault();
  if(!auth.currentUser){location.href='login.html?returnTo=index.html';return;}
  const composer=ensureComposer();if(!composer)return;
  composer.classList.add('is-open');composer.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>composer.querySelector('#dash-post-text')?.focus(),250);
}
async function notifyPostAudience(postId,content,authorName,mentions=[]){
  try{
    const follows=await getDocs(query(collection(db,'follows'),where('targetId','==',signedInUser.uid)));
    for(const followDoc of follows.docs){const followerId=followDoc.data()?.followerId;if(!followerId||followerId===signedInUser.uid)continue;await setDoc(doc(db,'notifications',`newpost_${postId}_${followerId}`),{recipientId:followerId,actorId:signedInUser.uid,actorName:authorName,type:'new-post',message:`${authorName} posted something new.`,linkUrl:`index.html?post=${encodeURIComponent(postId)}`,postId,read:false,createdAt:serverTimestamp()},{merge:true});}
    const lower=String(content||'').toLowerCase();
    const resolved=[...(Array.isArray(mentions)?mentions:[])];
    if(lower.includes('@')){
      for(const profile of dashboardTagProfiles){
        const name=String(profile?.displayName||'').trim();
        if(!name||!lower.includes(`@${name.toLowerCase()}`))continue;
        if(!resolved.some(x=>(x.profileId||'')===profile.profileId))resolved.push(profile);
      }
    }
    for(const mention of resolved){const recipientId=mention?.recipientId||mention?.profileId;if(!recipientId||recipientId===signedInUser.uid)continue;await setDoc(doc(db,'notifications',`tag_${postId}_${recipientId}`),{recipientId,actorId:signedInUser.uid,actorName:authorName,type:'tag',message:`${authorName} tagged you in a post.`,linkUrl:`index.html?post=${encodeURIComponent(postId)}`,postId,profileId:mention.profileId||'',read:false,createdAt:serverTimestamp()},{merge:true});}
  }catch(error){console.warn('Post notifications unavailable',error);}
}
async function publishDashboardPost(){
  const composer=ensureComposer();if(!composer)return;
  const status=composer.querySelector('#dash-compose-status'),button=composer.querySelector('#dash-publish-post');
  if(!signedInUser){openComposer();return;}
  const content=composer.querySelector('#dash-post-text').value.trim();
  const lowerContent=content.toLowerCase();
  const mentionSource=[...dashboardTagProfiles,...dashboardTaggedProfiles];
  const mentions=[];
  const seenMentionIds=new Set();
  for(const m of mentionSource){
    const displayName=String(m?.displayName||'').trim();
    const profileId=String(m?.profileId||'').trim();
    const recipientId=String(m?.recipientId||profileId).trim();
    if(!displayName||!profileId||!lowerContent.includes(`@${displayName.toLowerCase()}`)||seenMentionIds.has(profileId))continue;
    seenMentionIds.add(profileId);
    mentions.push({profileId,recipientId,displayName,accountType:m.accountType||'member'});
  }
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
      mentions,
      published:true,
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    });
    await notifyPostAudience(postRef.id,content,authorName,mentions);
    dashboardTaggedProfiles=[];
    composer.querySelector('#dash-post-text').value='';composer.querySelector('#dash-image-url').value='';composer.querySelector('#dash-video-url').value='';
    status.textContent='Posted.';setTimeout(()=>{composer.classList.remove('is-open');status.textContent='';},650);
  }catch(error){console.error(error);status.textContent=error.code==='permission-denied'?'Post permissions blocked this post.':'Post could not be published.';}
  finally{button.disabled=false;}
}

function wireCommunityActions(){
  document.querySelectorAll('a').forEach(a=>{
    const text=a.textContent.trim().toLowerCase();
    if((text==='create post'||text==='create a post')&&!a.closest('.hero')){a.href='#create-post';a.addEventListener('click',openComposer);}
    if(text==='community'&&a.closest('.nav')){a.href='index.html';}
  });
}
wireCommunityActions();

function ensureProfileSummary(){
  if(!profilePanel)return null;
  let summary=profilePanel.querySelector('.dashboard-profile-summary');
  if(summary)return summary;
  summary=document.createElement('div');
  summary.className='dashboard-profile-summary';
  summary.hidden=true;
  const heading=profilePanel.querySelector('h3');
  heading?.insertAdjacentElement('afterend',summary);
  const style=document.createElement('style');
  style.textContent=`
    .dashboard-profile-summary{display:grid;grid-template-columns:54px minmax(0,1fr);gap:9px;align-items:center;padding:10px 12px;border-bottom:1px solid #333;color:#eee;text-decoration:none;background:#0c0e0e}
    .dashboard-profile-summary[hidden]{display:none}
    .dashboard-profile-summary{grid-template-columns:minmax(0,1fr)!important}
    .left .menu a.dashboard-profile-main{display:grid;grid-template-columns:54px minmax(0,1fr);gap:9px;align-items:center;padding:0;margin:0;border:0;background:none;color:inherit;text-decoration:none;min-width:0}
    .dashboard-profile-main>span:last-child{min-width:0}
    .dashboard-profile-name,.dashboard-profile-type,.dashboard-profile-view{display:block;word-break:normal;overflow-wrap:break-word}
    @media(max-width:650px){.left .menu a.dashboard-profile-main{grid-template-columns:minmax(0,1fr);gap:3px;justify-items:start}}
    .dashboard-account-actions{display:grid;gap:0;border-bottom:1px solid #333}.dashboard-account-actions[hidden]{display:none}
    .left .menu .dashboard-account-actions a.dashboard-action-primary{margin:8px 10px;padding:9px 10px;border-radius:8px;background:#25c7c1;color:#031212;font-weight:900;text-align:center;border:0}
    .left .menu .dashboard-account-actions a.dashboard-action-upgrade{color:#25c7c1;font-weight:800}
    @media(max-width:650px){.left .menu .dashboard-account-actions a.dashboard-action-primary{margin:5px 4px;padding:6px 4px}}
    .dashboard-profile-main{display:contents;color:inherit;text-decoration:none}
    .dashboard-profile-upgrade{display:inline-block;margin-top:5px;color:#25c7c1;font-weight:800;font-size:11px;text-decoration:underline;text-underline-offset:2px}
    @media(max-width:650px){.dashboard-profile-upgrade{font-size:8px;margin-top:3px}}
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
  const accountType=String(profile.accountType||profile.profileType||profile.type||profile.role||'').toLowerCase();
  const typeLabels={band:'Band',musician:'Musician',venue:'Venue',fan:'Fan'};
  const type=typeLabels[accountType]||profile.profileType||profile.type||profile.role||profile.category||'Member';
  const image=profile.avatarUrl||profile.photoURL||profile.imageUrl||profile.profileImage||profile.avatar||user?.photoURL||'';
  const isAdmin=String(name||'').trim().toLowerCase()==='bandtroductions admin';
  const effectiveImage=image||(isAdmin?adminAvatarFallback:'');
  const uid=encodeURIComponent(user.uid);
  const profileUrl=`profile.html?id=${uid}`;
  const planStatus=String(profile.websitePlanStatus||profile.artistPlan?.status||'').toLowerCase();
  const isUpgraded=profile.websiteEnabled===true&&['active','trialing','comped'].includes(planStatus);
  const isArtist=accountType==='band'||accountType==='musician';
  const isSiteOwner=user.uid==='19MH0ZzVlPVN4ediF4PesZR5TY13';
  // One profile link: the whole card (avatar + name + type) opens the profile.
  summary.innerHTML=`<a class="dashboard-profile-main" href="${profileUrl}" aria-label="View or edit my profile"><span class="dashboard-profile-avatar">${effectiveImage?`<img src="${safeText(effectiveImage)}" alt="${safeText(name)}">`:safeText(initialsFor(name))}</span><span><span class="dashboard-profile-name">${safeText(name)}</span><span class="dashboard-profile-type">${safeText(type)}</span><span class="dashboard-profile-view">View / edit profile →</span></span></a>`;
  // Account-specific actions (no extra database reads: uses the profile already loaded).
  let actions=profilePanel.querySelector('.dashboard-account-actions');
  if(!actions){actions=document.createElement('div');actions.className='dashboard-account-actions';summary.insertAdjacentElement('afterend',actions);}
  let html='';
  if(isArtist){
    html+='<a class="dashboard-action-primary" href="radio-submit.html">⬆ Upload a Song</a>';
    if(isUpgraded)html+=`<a href="website.html?id=${uid}">My Website</a>`;
    else if(!isSiteOwner)html+='<a class="dashboard-action-upgrade" href="plans.html">Upgrade: Get Your Website</a>';
  }else if(accountType==='venue'){
    html+='<a class="dashboard-action-primary" href="show-event.html">📅 Post a Show / Event</a>';
  }else if(accountType==='fan'){
    html+='<a class="dashboard-action-primary" href="bands.html">🎸 Discover Bands</a>';
  }
  actions.innerHTML=html;actions.hidden=!html;
  const avatarImg=summary.querySelector('.dashboard-profile-avatar img');
  if(avatarImg&&isAdmin){
    avatarImg.addEventListener('error',()=>{if(!avatarImg.src.endsWith('bt-admin-avatar.svg?v=1'))avatarImg.src=adminAvatarFallback;},{once:true});
  }
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


function ensureGuestCommunityStyle(){
  if(document.getElementById('bt-home-community-gate-style'))return;
  const style=document.createElement('style');
  style.id='bt-home-community-gate-style';
  style.textContent=`
    .feed.bt-community-taste{position:relative}
    .bt-community-taste-note{margin:0;padding:10px 14px 4px;color:#9fdad6;font-size:12px;font-weight:800;letter-spacing:.02em}
    .bt-community-taste-card .post-actions a{color:#aaa;text-decoration:none;font-weight:700}
    .bt-community-taste-card .post-actions a:hover{color:#25c7c1}
    .bt-community-join-strip{margin:10px 12px 14px;padding:16px 14px;border:1px solid rgba(37,199,193,.72);border-radius:14px;background:linear-gradient(160deg,rgba(10,24,24,.96),rgba(5,12,13,.98));box-shadow:0 12px 32px #0008,0 0 18px rgba(37,199,193,.1);text-align:center}
    .bt-community-join-strip h4{margin:0 0 6px;color:#57ebe4;font-size:clamp(15px,2.4vw,20px)}
    .bt-community-join-strip p{margin:0;color:#d4dfde;font-size:13px;line-height:1.45}
    .bt-community-join-actions{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:12px}
    .bt-community-join-actions a{padding:9px 13px;border:1px solid #25c7c1;color:#eaffff;text-decoration:none;font-size:11px;font-weight:900}
    .bt-community-join-actions a.primary{background:#25c7c1;color:#041111}
    .bt-community-more{padding:0 12px 14px}
    .bt-community-more-label{margin:0 0 8px;color:#7f9694;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
    .bt-community-preview-cards{display:grid;gap:9px;filter:blur(4px);opacity:.42;pointer-events:none;user-select:none}
    .bt-community-preview-card{min-height:88px;border:1px solid #315a57;background:linear-gradient(160deg,#12201f,#090d0d);padding:12px}
    .bt-community-preview-line{height:9px;margin:8px 0;border-radius:999px;background:#46615f}.bt-community-preview-line.short{width:31%}.bt-community-preview-line.medium{width:67%}.bt-community-preview-line.long{width:92%}
    .bt-hero-guest-note{margin:8px auto 0;color:#e7f8f7;font-size:12px;font-weight:800}.bt-hero-guest-actions{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:10px}.bt-hero-guest-actions .btn{min-width:120px}
    @media(max-width:650px){
      .bt-community-taste-note{font-size:7px;padding:6px 8px 2px}
      .bt-community-join-strip{margin:8px 6px 10px;padding:12px 8px}
      .bt-community-join-strip h4{font-size:11px}.bt-community-join-strip p{font-size:7px}
      .bt-community-join-actions{gap:4px;margin-top:8px}.bt-community-join-actions a{font-size:6px;padding:5px 6px}
      .bt-community-more{padding:0 6px 10px}.bt-community-more-label{font-size:7px}
      .bt-community-preview-card{min-height:64px;padding:6px}
      .bt-hero-guest-note{font-size:7px}.bt-hero-guest-actions{gap:4px;margin-top:6px}.bt-hero-guest-actions .btn{min-width:0}
    }
  `;
  document.head.appendChild(style);
}
const GUEST_TASTE_LIMIT=4;
const GUEST_SHOW_TASTE=2;
function pickGuestTastePosts(posts){
  const visible=(posts||[]).filter(p=>p&&p.published!==false);
  const now=nyToday();
  const showDateOf=p=>p.event?.date||p.eventDate||p.showDate;
  const upcomingShows=visible.filter(p=>p.category==='show').filter(p=>{const d=normalizeDate(showDateOf(p));return !d||d>=now;}).sort((a,b)=>{const ad=normalizeDate(showDateOf(a)),bd=normalizeDate(showDateOf(b));if(ad&&bd)return ad-bd;if(ad)return-1;if(bd)return 1;return postMs(b)-postMs(a);});
  const picked=[];
  const seen=new Set();
  upcomingShows.slice(0,GUEST_SHOW_TASTE).forEach(p=>{picked.push(p);seen.add(p.id);});
  for(const p of visible){
    if(picked.length>=GUEST_TASTE_LIMIT)break;
    if(seen.has(p.id))continue;
    // Prefer non-show posts for the remaining slots so the taste feels like a real feed.
    if(p.category==='show'&&picked.some(x=>x.category==='show'))continue;
    picked.push(p);seen.add(p.id);
  }
  // If we still have room and unused shows, fill with more shows rather than leaving empty.
  if(picked.length<GUEST_TASTE_LIMIT){
    for(const p of upcomingShows){
      if(picked.length>=GUEST_TASTE_LIMIT)break;
      if(seen.has(p.id))continue;
      picked.push(p);seen.add(p.id);
    }
  }
  return {taste:picked,total:visible.length};
}
function buildGuestTasteCard(post){
  const name=safeText(post.authorName||'BANDtroductions Member');
  const body=post.category==='show'?renderShowCard(post):renderPostContent(post);
  const article=document.createElement('article');
  article.className=(post.category==='show'?'post post-is-show':'post')+' bt-community-taste-card';
  article.dataset.postId=post.id||'';
  article.innerHTML=`<div class="post-head"><div class="post-avatar">${safeText(initialsFor(post.authorName))}</div><div><div class="post-name">${name}</div><div class="post-meta">${safeText(formatDate(post.createdAt))}${post.category?` · ${safeText(post.category)}`:''}</div></div></div>${body}${post.imageUrl?`<img src="${safeText(post.imageUrl)}" alt="" style="display:block;width:100%;margin-top:12px;border:1px solid #333;max-height:420px;object-fit:cover">`:''}${post.category==='show'?'':renderVideo(post)}<div class="post-actions"><a href="signup.html?returnTo=index.html">ROCK ON</a><a href="signup.html?returnTo=index.html">COMMENT</a><a href="signup.html?returnTo=index.html">JOIN TO SHARE</a></div>`;
  window.btApplyCachedAvatar?.(article,post);
  return article;
}
function renderGuestCommunity(posts=latestDashboardPosts){
  if(!feed)return;
  ensureGuestCommunityStyle();
  feed.classList.remove('bt-community-locked');
  feed.classList.add('bt-community-taste');
  const heading=document.createElement('h3');heading.textContent='Community Feed';
  const {taste,total}=pickGuestTastePosts(posts);
  feed.replaceChildren(heading);
  const note=document.createElement('p');
  note.className='bt-community-taste-note';
  note.textContent=taste.length?'A taste of the scene — shows stay public. Join free for the full feed.':'The scene is warming up. Join free to be part of the first posts.';
  feed.appendChild(note);
  taste.forEach(post=>feed.appendChild(buildGuestTasteCard(post)));
  const strip=document.createElement('div');
  strip.className='bt-community-join-strip';
  strip.innerHTML=`<h4>Want the full underground?</h4><p>Create a free account to see every post, rock on, comment, follow, message, and post your own updates.${total>taste.length?` ${total-taste.length}+ more posts waiting inside.`:''}</p><div class="bt-community-join-actions"><a href="login.html?returnTo=index.html">LOG IN</a><a class="primary" href="signup.html?returnTo=index.html">JOIN THE SCENE — FREE</a></div>`;
  feed.appendChild(strip);
  if(total>taste.length){
    const more=document.createElement('div');
    more.className='bt-community-more';
    more.innerHTML=`<p class="bt-community-more-label">Members see the rest of the feed</p><div class="bt-community-preview-cards" aria-hidden="true"><div class="bt-community-preview-card"><div class="bt-community-preview-line short"></div><div class="bt-community-preview-line long"></div><div class="bt-community-preview-line medium"></div></div><div class="bt-community-preview-card"><div class="bt-community-preview-line medium"></div><div class="bt-community-preview-line long"></div><div class="bt-community-preview-line short"></div></div></div>`;
    feed.appendChild(more);
  }
}
function renderMemberCommunity(){
  feed?.classList.remove('bt-community-locked');
  feed?.classList.remove('bt-community-taste');
  renderFeed(latestDashboardPosts);
}
function setHeroButtons(user){
  const links=[...(heroPanel?.querySelectorAll('.btns a')||[])];if(links.length<2)return;
  const labels=user?[['CREATE POST','#create-post'],['MY PROFILE','profile.html']]:[['JOIN FREE','signup.html'],['EXPLORE BANDS','bands.html']];
  labels.forEach(([t,h],i)=>{links[i].textContent=t;links[i].setAttribute('href',h);});
  if(user)links[0].addEventListener('click',openComposer);else links[0].removeEventListener('click',openComposer);
  try{if(user)localStorage.setItem('bt_member','1');else localStorage.removeItem('bt_member');}catch(e){}
}
function syncHeroCommunityState(user){
  setHeroButtons(user);
  if(!heroPanel)return;
  const guest=heroPanel.querySelector('.bt-hero-guest');
  const normal=heroPanel.querySelector('.btns');
  const copy=heroPanel.querySelector('p');
  if(user){
    guest?.remove();
    if(normal)normal.hidden=false;
    if(copy){copy.innerHTML='No algorithms. No politics. No bullshit.<br>Just people connecting through music.';copy.style.fontSize='clamp(11px,1.2vw,14px)';copy.style.fontWeight='400';copy.style.lineHeight='1.35';}
    return;
  }
  guest?.remove();
  if(copy){copy.innerHTML='Discover independent music.<br><strong style="color:#eaffff">Join the scene for free.</strong>';copy.style.fontSize='clamp(13px,1.5vw,17px)';copy.style.fontWeight='900';copy.style.lineHeight='1.3';}
}

function renderFeed(posts){
  if(!feed)return;const heading=feed.querySelector(':scope > h3');
  const visible=posts.filter(p=>p.published!==false);
  if(!visible.length){feed.replaceChildren();if(heading)feed.appendChild(heading);const empty=document.createElement('div');empty.className='post';empty.innerHTML='<p>No community posts yet.</p>';feed.appendChild(empty);return;}
  // Keep existing post cards (keyed by post id) and rebuild only cards whose content changed,
  // so Rock On / Comment rows and open comments are not wiped on every Firestore update.
  const existing=new Map();
  [...feed.children].forEach(el=>{if(el._btFeedPostId)existing.set(el._btFeedPostId,el);});
  const wanted=visible.map(post=>{
    const name=safeText(post.authorName||'BANDtroductions Member');
    const html=`<div class="post-head"><div class="post-avatar">${safeText(initialsFor(post.authorName))}</div><div><div class="post-name">${name}</div><div class="post-meta">${safeText(formatDate(post.createdAt))}${post.category?` · ${safeText(post.category)}`:''}</div></div></div>${post.category==='show'?renderShowCard(post):renderPostContent(post)}${post.imageUrl?`<img src="${safeText(post.imageUrl)}" alt="" style="display:block;width:100%;margin-top:12px;border:1px solid #333;max-height:420px;object-fit:cover">`:''}${post.category==='show'?'':renderVideo(post)}<div class="post-actions"><span>ROCK ON</span><span>COMMENT</span><span>SHARE</span></div>`;
    const kept=existing.get(post.id);
    if(kept&&kept._btFeedSig===html)return kept;
    const article=document.createElement('article');article.className=post.category==='show'?'post post-is-show':'post';
    article.innerHTML=html;article._btFeedSig=html;article._btFeedPostId=post.id;article.dataset.postId=post.id;
    window.btApplyCachedAvatar?.(article,post);
    return article;
  });
  const keep=new Set(wanted);
  [...feed.children].forEach(el=>{if(el!==heading&&!keep.has(el))el.remove();});
  if(heading&&feed.firstElementChild!==heading)feed.prepend(heading);
  let prev=heading||null;
  wanted.forEach(article=>{const at=prev?prev.nextElementSibling:feed.firstElementChild;if(at!==article){if(prev)prev.after(article);else feed.prepend(article);}prev=article;});
}

function renderShows(posts){
  if(!showsPanel)return;showsPanel.id='bt-upcoming-shows';const heading=showsPanel.querySelector('h3');showsPanel.replaceChildren();if(heading)showsPanel.appendChild(heading);
  const create=document.createElement('a');create.href='show-event.html';create.className='btn primary';create.textContent='POST A SHOW';create.style.cssText='display:block;text-align:center;margin:8px';showsPanel.appendChild(create);
  const now=nyToday();const showDateOf=p=>p.event?.date||p.eventDate||p.showDate;
  const shows=posts.filter(p=>p.published!==false&&p.category==='show').filter(p=>{const d=normalizeDate(showDateOf(p));return !d||d>=now;}).sort((a,b)=>{const ad=normalizeDate(showDateOf(a)),bd=normalizeDate(showDateOf(b));if(ad&&bd)return ad-bd;if(ad)return-1;if(bd)return 1;return 0;}).slice(0,5);
  injectShowEvents(shows.filter(p=>normalizeDate(showDateOf(p))).map(p=>{const e=p.event||{};return{band:p.authorName||e.artist||e.band||e.title,title:e.title,date:showDateOf(p),time:e.time,venue:e.venue,location:e.location,ticketUrl:e.ticketUrl,profileUrl:profileHref(p),image:e.imageUrl||p.imageUrl};}));
  if(!shows.length){const empty=document.createElement('div');empty.style.padding='12px';empty.style.color='#9ca3a3';empty.textContent='Show/Event posts will appear here automatically.';showsPanel.appendChild(empty);return;}
  shows.forEach(post=>{
    const e=post.event||{};const eventDate=normalizeDate(showDateOf(post));const d=eventDate||(post.createdAt?.toDate?post.createdAt.toDate():new Date());
    const artist=post.authorName||e.artist||e.band||e.title||'Upcoming Show';const venue=e.venue||'';const time=e.time||'';
    const row=document.createElement('div');row.className='show';
    const detailBits=[];if(e.title&&e.title!==artist)detailBits.push(`<div><b>Event:</b> ${safeText(e.title)}</div>`);if(e.location)detailBits.push(`<div><b>Location:</b> ${safeText(e.location)}</div>`);if(e.price)detailBits.push(`<div><b>Price:</b> ${safeText(e.price)}</div>`);if(e.age)detailBits.push(`<div><b>Age:</b> ${safeText(e.age)}</div>`);if(e.details)detailBits.push(`<div style="margin-top:5px">${safeText(e.details)}</div>`);else if(post.content)detailBits.push(`<div style="margin-top:5px">${safeText(post.content)}</div>`);
    const links=[];const ticketHref=safeHttpUrl(e.ticketUrl),donateHref=safeHttpUrl(e.donateUrl);if(ticketHref)links.push(`<a class="btn primary" href="${safeText(ticketHref)}" target="_blank" rel="noopener">TICKETS</a>`);if(donateHref)links.push(`<a class="btn" href="${safeText(donateHref)}" target="_blank" rel="noopener">SUPPORT</a>`);links.push(`<a class="btn" href="${safeText(profileHref(post))}">PROFILE</a>`);
    row.innerHTML=`<div class="date">${d.toLocaleString('en-US',{month:'short'}).toUpperCase()}<span>${d.getDate()}</span></div><div class="show-summary"><b>${safeText(artist)}</b>${venue?`<div class="show-venue">${safeText(venue)}</div>`:''}${time?`<div class="show-time">${safeText(time)}</div>`:''}<button type="button" class="show-details-btn">DETAILS +</button><div class="show-extra">${detailBits.join('')}${links.join('')}</div></div>`;
    const toggle=row.querySelector('.show-details-btn');toggle.addEventListener('click',()=>{const open=row.classList.toggle('is-open');toggle.textContent=open?'DETAILS −':'DETAILS +';});showsPanel.appendChild(row);
  });
}

renderSponsors();

if(messagesLink){
  messagesLink.addEventListener('click',event=>{
    if(messagesLink.getAttribute('href')==='#')event.preventDefault();
  });
}

if(logoutLink){
  logoutLink.addEventListener('click',async event=>{
    event.preventDefault();
    try{try{localStorage.removeItem('bt_member');}catch(e){}await signOut(auth);location.reload();}catch(error){console.warn('Could not log out.',error);}
  });
}

onAuthStateChanged(auth,async user=>{
  authResolved=true;
  signedInUser=user||null;signedInProfile=null;
  syncHeroCommunityState(user);
  if(user)renderMemberCommunity();else renderGuestCommunity();
  if(!profilePanel)return;
  const title=profilePanel.querySelector('h3');
  if(!user){
    clearProfileSummary();
    const acts=profilePanel.querySelector('.dashboard-account-actions');if(acts)acts.hidden=true;
    if(title)title.textContent='My Profile';
    if(profileLink){profileLink.textContent='Log In / Create Account';profileLink.href='login.html?returnTo=index.html';profileLink.style.display='';}
    if(logoutLink)logoutLink.style.display='none';
    return;
  }
  if(logoutLink)logoutLink.style.display='block';
  try{
    const [profileSnap,userSnap]=await Promise.all([getDoc(doc(db,'profiles',user.uid)),getDoc(doc(db,'users',user.uid))]);
    const profile=profileSnap.exists()?profileSnap.data():(userSnap.exists()?userSnap.data():{});
    signedInProfile=profile;
    try{
      const tagSnap=await getDocs(query(collection(db,'profiles'),where('published','==',true)));
      dashboardTagProfiles=tagSnap.docs.map(d=>{const p=d.data()||{};return{profileId:d.id,recipientId:p.ownerId||d.id,displayName:String(p.displayName||'').trim(),accountType:p.accountType||'member'}}).filter(p=>p.displayName);
    }catch(tagError){console.warn('Profile tagging list unavailable.',tagError);dashboardTagProfiles=[];}
    if(title)title.textContent='My Profile';
    renderProfileSummary(user,profile);
    if(profileLink){profileLink.textContent='View / Edit Profile';profileLink.href=`profile.html?id=${encodeURIComponent(user.uid)}`;profileLink.style.display='none';}
  }catch(error){
    console.warn('Could not load profile for dashboard.',error);
    renderProfileSummary(user,{});
    if(profileLink)profileLink.style.display='none';
  }
});

onSnapshot(collection(db,'posts'),snapshot=>{
  const posts=snapshot.docs.map(docSnap=>({id:docSnap.id,...docSnap.data()})).sort((a,b)=>{const diff=postMs(b)-postMs(a);return diff||String(a.id).localeCompare(String(b.id));});
  latestDashboardPosts=posts;
  if(authResolved&&signedInUser){feed?.classList.remove('bt-community-taste','bt-community-locked');renderFeed(posts);}else renderGuestCommunity(posts);
  renderShows(posts);
},error=>{
  console.error('Could not load live posts into dashboard.',error);
  if(feed){const heading=feed.querySelector('h3');feed.replaceChildren();if(heading)feed.appendChild(heading);const failed=document.createElement('div');failed.className='post';failed.innerHTML='<p>Community feed temporarily unavailable. Please refresh.</p>';feed.appendChild(failed);}
});

onSnapshot(collection(db,'users'),snapshot=>{renderOnline(snapshot.docs.map(d=>({id:d.id,...d.data()})));},error=>{console.warn('Could not load Online Now.',error);if(onlineGrid)onlineGrid.innerHTML='<div class="online-empty">Online status unavailable.</div>';});
