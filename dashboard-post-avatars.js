import { db } from './firebase-dev.js';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const cache=new Map();
let adminProfilePromise=null;
let allProfilesPromise=null;
let latestPosts=[];
let applyQueued=false;

const authorId=p=>p.authorId||p.authorUid||p.uid||p.userId||p.ownerId||p.createdBy||'';
const imageFor=p=>p?.imageUrl||p?.profileImageUrl||p?.profilePhotoUrl||p?.avatarUrl||p?.photoURL||p?.photoUrl||p?.profileImage||p?.profilePhoto||p?.profilePic||p?.profilePicture||p?.avatar||p?.bandLogo||p?.logoUrl||p?.logoURL||p?.logo||p?.image||'';
const stampMs=stamp=>stamp?.toMillis?stamp.toMillis():(stamp?.seconds?stamp.seconds*1000:0);
const postMs=post=>stampMs(post.createdAt)||stampMs(post.updatedAt)||stampMs(post.publishedAt)||stampMs(post.submittedAt)||0;
const isWelcomePost=post=>Boolean(post?.systemPost||post?.welcomedProfileId||String(post?.id||'').startsWith('welcome_'));
const normalized=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
const namesFor=p=>[p?.displayName,p?.name,p?.bandName,p?.musicianName,p?.venueName,p?.artistName,p?.profileName].map(normalized).filter(Boolean);
const idsFor=p=>[p?.id,p?.ownerId,p?.userId,p?.uid,p?.authorId,p?.createdBy].map(v=>String(v||'').trim()).filter(Boolean);

async function allProfiles(){
  if(allProfilesPromise)return allProfilesPromise;
  allProfilesPromise=(async()=>{
    try{
      const snap=await getDocs(collection(db,'profiles'));
      return snap.docs.map(d=>({id:d.id,...d.data()}));
    }catch(error){console.warn('Dashboard profile index unavailable',error);return [];}
  })();
  return allProfilesPromise;
}

async function adminProfile(){
  if(adminProfilePromise)return adminProfilePromise;
  adminProfilePromise=(async()=>{
    try{
      const snap=await getDocs(query(collection(db,'profiles'),where('isAdmin','==',true)));
      if(!snap.empty){const picked=snap.docs[0];return {id:picked.id,...picked.data()};}
      const profiles=await allProfiles();
      return profiles.find(p=>p.isAdmin===true||normalized(p.role)==='admin')||null;
    }catch(error){console.warn('Admin profile lookup failed',error);return null;}
  })();
  return adminProfilePromise;
}

async function profile(uid,name=''){
  const key=uid?`uid:${uid}`:`name:${normalized(name)}`;
  if(cache.has(key))return cache.get(key);
  try{
    let data=null;
    if(uid){
      const direct=await getDoc(doc(db,'profiles',uid));
      if(direct.exists())data={id:direct.id,...direct.data()};
    }
    const profiles=await allProfiles();
    if(!data&&uid)data=profiles.find(p=>idsFor(p).includes(String(uid)))||null;
    if(!data&&name){const wanted=normalized(name);data=profiles.find(p=>namesFor(p).includes(wanted))||null;}
    if(!data&&uid){
      const user=await getDoc(doc(db,'users',uid));
      if(user.exists())data={id:user.id,...user.data()};
    }
    cache.set(key,data);return data;
  }catch(error){console.warn('Dashboard avatar lookup failed',error);cache.set(key,null);return null;}
}

function initials(name){return String(name||'BT').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'BT';}
function setFallback(avatar,post,data){
  if(!avatar)return;
  const name=post.authorName||data?.displayName||data?.bandName||data?.musicianName||data?.venueName||data?.name||'BT';
  avatar.textContent=initials(name);
  avatar.dataset.avatarDone='1';
  const profileId=data?.id||authorId(post);
  if(profileId){avatar.style.cursor='pointer';avatar.onclick=()=>location.href=`profile.html?id=${encodeURIComponent(profileId)}`;}
}
function setImage(avatar,src,alt,profileId,onFailure){
  if(!avatar||!src)return onFailure?.();
  const img=new Image();
  img.alt=alt||'Profile avatar';img.decoding='async';img.style.cssText='width:100%;height:100%;object-fit:cover;display:block;border-radius:50%';
  img.onload=()=>{
    avatar.replaceChildren(img);avatar.style.padding='0';avatar.style.overflow='hidden';avatar.dataset.avatarDone='1';
    if(profileId){avatar.style.cursor='pointer';avatar.onclick=()=>location.href=`profile.html?id=${encodeURIComponent(profileId)}`;}
  };
  img.onerror=()=>onFailure?.();
  img.src=src;
}

function youtubeId(value=''){
  const raw=String(value||'').trim();if(!raw)return'';
  const match=raw.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/i);
  return match?.[1]||'';
}
function youtubeFromText(value=''){
  const match=String(value||'').match(/https?:\/\/(?:www\.)?(?:youtu\.be\/[A-Za-z0-9_-]{6,}(?:\?[^\s<]*)?|youtube\.com\/(?:watch\?[^\s<]*v=[A-Za-z0-9_-]{6,}[^\s<]*|shorts\/[A-Za-z0-9_-]{6,}[^\s<]*))/i);
  return match?.[0]||'';
}
function addInlineYoutube(card,post){
  if(!card||card.querySelector('.bt-inline-youtube'))return;
  const raw=String(post.videoUrl||'').trim()||youtubeFromText(post.content||'');
  const id=youtubeId(raw);if(!id)return;
  const p=card.querySelector('p');
  if(p&&post.content&&youtubeFromText(post.content||'')){
    const clean=String(post.content).replace(youtubeFromText(post.content),'').replace(/\s{2,}/g,' ').trim();
    p.textContent=clean;
    if(!clean)p.remove();
  }
  const existing=[...card.querySelectorAll('iframe')].find(frame=>frame.src.includes('youtube.com/embed/'));
  if(existing){existing.closest('div')?.classList.add('bt-inline-youtube');return;}
  const wrap=document.createElement('div');wrap.className='bt-inline-youtube';wrap.style.cssText='position:relative;width:100%;aspect-ratio:16/9;margin-top:10px;background:#000;border:1px solid #333;overflow:hidden';
  const frame=document.createElement('iframe');frame.src=`https://www.youtube.com/embed/${encodeURIComponent(id)}`;frame.title='Post video';frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';frame.allowFullscreen=true;frame.style.cssText='position:absolute;inset:0;width:100%;height:100%;border:0';
  wrap.appendChild(frame);
  const actions=card.querySelector('.post-actions');
  if(actions)card.insertBefore(wrap,actions);else card.appendChild(wrap);
}

async function apply(posts=latestPosts){
  const cards=[...document.querySelectorAll('.feed .post')];
  const visible=posts.filter(p=>p.published!==false);
  visible.forEach((post,index)=>addInlineYoutube(cards[index],post));
  await Promise.all(visible.map(async(post,index)=>{
    const card=cards[index];if(!card)return;
    const avatar=card.querySelector('.post-avatar');const nameEl=card.querySelector('.post-name');if(!avatar)return;
    if(isWelcomePost(post)){
      const admin=await adminProfile();if(nameEl)nameEl.textContent='BANDtroductions Admin';
      const src=imageFor(admin);if(src)setImage(avatar,src,'BANDtroductions Admin',admin?.id,()=>setFallback(avatar,{...post,authorName:'BANDtroductions Admin'},admin));else setFallback(avatar,{...post,authorName:'BANDtroductions Admin'},admin);return;
    }
    if(avatar.dataset.avatarDone==='1'&&avatar.querySelector('img'))return;
    const uid=authorId(post);const data=await profile(uid,post.authorName||'');
    const src=imageFor(data)||post.authorAvatarUrl||post.authorImageUrl||post.authorPhotoUrl||post.authorPhotoURL||post.avatarUrl||post.imageUrlAuthor||'';
    const profileId=data?.id||uid;
    if(src)setImage(avatar,src,post.authorName||'Profile avatar',profileId,()=>setFallback(avatar,post,data));else setFallback(avatar,post,data);
  }));
}
function queueApply(){
  if(applyQueued)return;applyQueued=true;
  queueMicrotask(()=>{applyQueued=false;apply(latestPosts);});
}

const feed=document.querySelector('.feed');
if(feed)new MutationObserver(queueApply).observe(feed,{childList:true,subtree:true});

onSnapshot(collection(db,'posts'),snap=>{
  latestPosts=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{const diff=postMs(b)-postMs(a);return diff||String(a.id).localeCompare(String(b.id));});
  queueApply();
},error=>console.warn('Could not enhance dashboard posts.',error));
