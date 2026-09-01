import { db } from './firebase-dev.js';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const cache=new Map();
const adminCache={value:undefined};
const authorId=p=>p.authorId||p.authorUid||p.uid||p.userId||p.ownerId||p.createdBy||'';
const imageFor=p=>p?.imageUrl||p?.profileImageUrl||p?.profilePhotoUrl||p?.avatarUrl||p?.photoURL||p?.photoUrl||p?.profileImage||p?.profilePhoto||p?.profilePic||p?.profilePicture||p?.avatar||p?.bandLogo||p?.logoUrl||p?.logoURL||p?.logo||p?.image||'';
const stampMs=stamp=>stamp?.toMillis?stamp.toMillis():(stamp?.seconds?stamp.seconds*1000:0);
const postMs=post=>stampMs(post.createdAt)||stampMs(post.updatedAt)||stampMs(post.publishedAt)||stampMs(post.submittedAt)||0;
const isWelcomePost=post=>Boolean(post?.systemPost||post?.welcomedProfileId||String(post?.id||'').startsWith('welcome_'));
const normalized=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');

async function queryFirst(field,value){
  if(!value)return null;
  try{
    const snap=await getDocs(query(collection(db,'profiles'),where(field,'==',value)));
    if(snap.empty)return null;
    const picked=snap.docs.find(d=>d.data()?.published===true)||snap.docs[0];
    return {id:picked.id,...picked.data()};
  }catch(error){
    console.warn(`Dashboard profile lookup skipped for ${field}.`,error);
    return null;
  }
}

async function profile(uid,name=''){
  const key=uid?`uid:${uid}`:`name:${normalized(name)}`;
  if(cache.has(key))return cache.get(key);
  let data=null;
  if(uid){
    try{
      const direct=await getDoc(doc(db,'profiles',uid));
      if(direct.exists())data={id:direct.id,...direct.data()};
    }catch(error){console.warn('Direct dashboard profile lookup skipped.',error);}
    if(!data)data=await queryFirst('ownerId',uid);
    if(!data)data=await queryFirst('userId',uid);
    if(!data)data=await queryFirst('uid',uid);
  }
  if(!data&&name){
    for(const field of ['displayName','name','bandName','musicianName','venueName','artistName','profileName','username','handle']){
      data=await queryFirst(field,name);
      if(data)break;
    }
  }
  if(!data&&uid){
    try{
      const user=await getDoc(doc(db,'users',uid));
      if(user.exists())data={id:user.id,...user.data()};
    }catch(error){console.warn('Dashboard user-avatar fallback skipped.',error);}
  }
  cache.set(key,data);
  return data;
}

async function adminProfile(){
  if(adminCache.value!==undefined)return adminCache.value;
  let data=await queryFirst('displayName','BANDtroductions Admin');
  if(!data)data=await queryFirst('name','BANDtroductions Admin');
  adminCache.value=data||null;
  return adminCache.value;
}

function findCard(post,index){
  const byId=[...document.querySelectorAll('.feed .post')].find(card=>card.dataset.postId===post.id||card.dataset.actionsFor===post.id);
  if(byId)return byId;
  return document.querySelectorAll('.feed .post')[index]||null;
}

function setImage(avatar,src,alt,profileId){
  if(!avatar||!src||avatar.dataset.avatarDone==='1')return;
  const img=new Image();
  img.alt=alt||'Profile avatar';
  img.loading='eager';
  img.style.cssText='width:100%;height:100%;object-fit:cover;display:block;border-radius:50%';
  img.onload=()=>{
    avatar.replaceChildren(img);
    avatar.style.padding='0';
    avatar.style.overflow='hidden';
    avatar.dataset.avatarDone='1';
    if(profileId){avatar.style.cursor='pointer';avatar.onclick=()=>location.href=`profile.html?id=${encodeURIComponent(profileId)}`;}
  };
  img.onerror=()=>console.warn('Dashboard avatar image failed to load:',src);
  img.src=src;
}

function setProfileLink(nameEl,profileId){
  if(!nameEl||!profileId||nameEl.dataset.profileLinked==='1')return;
  const href=`profile.html?id=${encodeURIComponent(profileId)}`;
  if(nameEl.tagName==='A'){
    nameEl.href=href;
    nameEl.dataset.profileLinked='1';
    return;
  }
  const link=document.createElement('a');
  link.className=nameEl.className;
  link.textContent=nameEl.textContent;
  link.href=href;
  link.dataset.profileLinked='1';
  nameEl.replaceWith(link);
}

function youtubeFromPost(post){
  const text=String(post?.content||'');
  const textUrl=text.match(/https?:\/\/(?:www\.)?(?:youtu\.be\/[A-Za-z0-9_-]{6,}|youtube\.com\/(?:watch\?[^\s]*v=|embed\/|shorts\/)[A-Za-z0-9_-]{6,})[^\s]*/i)?.[0]||'';
  for(const value of [post?.videoUrl,post?.mediaUrl,post?.linkUrl,textUrl].filter(Boolean)){
    const raw=String(value).trim();
    const match=raw.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?[^\s#]*?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/i);
    if(match)return {id:match[1],url:raw};
  }
  return null;
}

function ensureYouTube(card,post){
  if(!card||card.querySelector('.post-video,iframe[src*="youtube.com/embed/"]'))return;
  const youtube=youtubeFromPost(post);if(!youtube)return;
  const body=[...card.children].find(el=>el.tagName==='P')||card.querySelector('p');
  if(body&&body.textContent?.includes(youtube.url))body.textContent=body.textContent.replace(youtube.url,'').replace(/\s+$/,'');
  const box=document.createElement('div');box.className='post-video';box.style.cssText='position:relative;width:100%;aspect-ratio:16/9;margin-top:10px;background:#000;border:1px solid #333';
  const iframe=document.createElement('iframe');iframe.src=`https://www.youtube.com/embed/${youtube.id}?playsinline=1`;iframe.title='Post video';iframe.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';iframe.allowFullscreen=true;iframe.style.cssText='position:absolute;inset:0;width:100%;height:100%;border:0';
  box.appendChild(iframe);
  const actions=card.querySelector('.post-actions');
  if(actions)actions.insertAdjacentElement('beforebegin',box);else card.appendChild(box);
}

async function decorateCard(post,index){
  const card=findCard(post,index);if(!card||card.dataset.profileDecorated==='1')return false;
  ensureYouTube(card,post);
  const avatar=card.querySelector('.post-avatar');const nameEl=card.querySelector('.post-name');if(!avatar)return false;
  if(isWelcomePost(post)){
    if(nameEl)nameEl.textContent='BANDtroductions Admin';
    const admin=await adminProfile();
    const src=imageFor(admin)||post.adminAvatarUrl||'';
    if(src)setImage(avatar,src,'BANDtroductions Admin',admin?.id||'');
    else if(!avatar.querySelector('img'))avatar.textContent='BT';
    setProfileLink(nameEl,admin?.id||'');
    card.dataset.profileDecorated='1';
    return true;
  }
  const uid=authorId(post);const data=await profile(uid,post.authorName||'');
  const profileId=data?.id||uid;
  const src=imageFor(data)||post.authorAvatarUrl||post.authorImageUrl||post.authorPhotoUrl||post.authorPhotoURL||post.avatarUrl||post.imageUrlAuthor||'';
  if(src)setImage(avatar,src,post.authorName||'Profile avatar',profileId);
  setProfileLink(nameEl,profileId);
  card.dataset.profileDecorated='1';
  return true;
}

async function apply(posts){
  const visible=posts.filter(p=>p.published!==false);
  await Promise.all(visible.map((post,index)=>decorateCard(post,index)));
}

let latestPosts=[];
let applyQueued=false;
function queueApply(){
  if(applyQueued)return;
  applyQueued=true;
  requestAnimationFrame(()=>{
    applyQueued=false;
    apply(latestPosts).catch(error=>console.warn('Dashboard post decoration skipped.',error));
  });
}

const feed=document.querySelector('.feed');
if(feed){
  const observer=new MutationObserver(queueApply);
  observer.observe(feed,{childList:true,subtree:true});
}

onSnapshot(collection(db,'posts'),snap=>{
  latestPosts=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{const diff=postMs(b)-postMs(a);return diff||String(a.id).localeCompare(String(b.id));});
  queueApply();
},error=>console.warn('Could not decorate dashboard posts.',error));
