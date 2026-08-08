import { db } from './firebase-dev.js';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const cache=new Map();
let adminProfilePromise=null;
let allProfilesPromise=null;
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
    if(!data){
      const profiles=await allProfiles();
      if(uid)data=profiles.find(p=>idsFor(p).includes(String(uid)))||null;
      if(!data&&name){const wanted=normalized(name);data=profiles.find(p=>namesFor(p).includes(wanted))||null;}
    }
    if(!data&&uid){
      const user=await getDoc(doc(db,'users',uid));
      if(user.exists())data={id:user.id,...user.data()};
    }
    cache.set(key,data);return data;
  }catch(error){console.warn('Dashboard avatar lookup failed',error);cache.set(key,null);return null;}
}

function setFallback(avatar,post,data){
  if(!avatar)return;
  const name=post.authorName||data?.displayName||data?.bandName||data?.musicianName||data?.venueName||data?.name||'BT';
  const initials=String(name).trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'BT';
  avatar.textContent=initials;
  avatar.dataset.avatarDone='1';
  const profileId=data?.id||authorId(post);
  if(profileId){avatar.style.cursor='pointer';avatar.onclick=()=>location.href=`profile.html?id=${encodeURIComponent(profileId)}`;}
}

function setImage(avatar,src,alt,profileId,onFailure){
  const img=new Image();
  img.alt=alt||'Profile avatar';img.loading='lazy';img.style.cssText='width:100%;height:100%;object-fit:cover;display:block;border-radius:50%';
  img.onload=()=>{
    avatar.replaceChildren(img);avatar.style.padding='0';avatar.style.overflow='hidden';avatar.dataset.avatarDone='1';
    if(profileId){avatar.style.cursor='pointer';avatar.onclick=()=>location.href=`profile.html?id=${encodeURIComponent(profileId)}`;}
  };
  img.onerror=()=>{console.warn('Dashboard avatar image failed to load:',src);onFailure?.();};
  img.src=src;
}

async function apply(posts){
  const cards=[...document.querySelectorAll('.feed .post')];
  const visible=posts.filter(p=>p.published!==false);
  await Promise.all(visible.map(async(post,index)=>{
    const card=cards[index];if(!card)return;
    const avatar=card.querySelector('.post-avatar');
    const nameEl=card.querySelector('.post-name');
    if(isWelcomePost(post)){
      const admin=await adminProfile();
      if(nameEl)nameEl.textContent='BANDtroductions Admin';
      if(!avatar)return;
      const src=imageFor(admin);
      if(src)setImage(avatar,src,'BANDtroductions Admin',admin?.id,()=>{avatar.textContent='BT';avatar.dataset.avatarDone='1';});
      else{avatar.textContent='BT';avatar.dataset.avatarDone='1';}
      return;
    }
    if(!avatar||avatar.dataset.avatarDone==='1')return;
    const uid=authorId(post);
    const data=await profile(uid,post.authorName||'');
    const src=imageFor(data)||post.authorAvatarUrl||post.authorImageUrl||post.authorPhotoUrl||post.authorPhotoURL||post.avatarUrl||post.imageUrlAuthor||'';
    const profileId=data?.id||uid;
    if(src)setImage(avatar,src,post.authorName||'Profile avatar',profileId,()=>setFallback(avatar,post,data));
    else setFallback(avatar,post,data);
  }));
}

function scheduleApply(posts){[80,250,700,1500,2400].forEach(delay=>setTimeout(()=>apply(posts),delay));}

onSnapshot(collection(db,'posts'),snap=>{
  const posts=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{const diff=postMs(b)-postMs(a);return diff||String(a.id).localeCompare(String(b.id));});
  scheduleApply(posts);
},error=>console.warn('Could not enhance dashboard post avatars.',error));
