import { db } from './firebase-dev.js';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

let publishedProfilesPromise=null;
let adminProfilePromise=null;
const cache=new Map();

const authorId=p=>p.authorId||p.authorUid||p.uid||p.userId||p.ownerId||p.createdBy||'';
const imageFor=p=>p?.imageUrl||p?.profileImageUrl||p?.profilePhotoUrl||p?.avatarUrl||p?.photoURL||p?.photoUrl||p?.profileImage||p?.profilePhoto||p?.profilePic||p?.profilePicture||p?.avatar||p?.bandLogo||p?.logoUrl||p?.logoURL||p?.logo||p?.image||'';
const stampMs=stamp=>stamp?.toMillis?stamp.toMillis():(stamp?.seconds?stamp.seconds*1000:0);
const postMs=post=>stampMs(post.createdAt)||stampMs(post.updatedAt)||stampMs(post.publishedAt)||stampMs(post.submittedAt)||0;
const isWelcomePost=post=>Boolean(post?.systemPost||post?.welcomedProfileId||String(post?.id||'').startsWith('welcome_'));
const normalized=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
const namesFor=p=>[p?.displayName,p?.name,p?.bandName,p?.musicianName,p?.venueName,p?.artistName,p?.profileName].map(normalized).filter(Boolean);
const idsFor=p=>[p?.id,p?.ownerId,p?.userId,p?.uid,p?.authorId,p?.createdBy].map(v=>String(v||'').trim()).filter(Boolean);

async function publishedProfiles(){
  if(publishedProfilesPromise)return publishedProfilesPromise;
  publishedProfilesPromise=(async()=>{
    try{
      const snap=await getDocs(query(collection(db,'profiles'),where('published','==',true)));
      return snap.docs.map(d=>({id:d.id,...d.data()}));
    }catch(error){
      console.warn('Published profile directory unavailable for dashboard avatars.',error);
      return [];
    }
  })();
  return publishedProfilesPromise;
}

async function adminProfile(){
  if(adminProfilePromise)return adminProfilePromise;
  adminProfilePromise=(async()=>{
    const profiles=await publishedProfiles();
    return profiles.find(p=>p.isAdmin===true||normalized(p.role)==='admin'||normalized(p.displayName)==='bandtroductions admin')||null;
  })();
  return adminProfilePromise;
}

async function directProfile(uid){
  if(!uid)return null;
  try{
    const snap=await getDoc(doc(db,'profiles',uid));
    if(snap.exists()){
      const data={id:snap.id,...snap.data()};
      if(data.published===true)return data;
    }
  }catch(error){
    console.warn('Direct dashboard avatar profile lookup skipped.',error);
  }
  return null;
}

async function profile(uid,name=''){
  const key=uid?`uid:${uid}`:`name:${normalized(name)}`;
  if(cache.has(key))return cache.get(key);

  let data=uid?await directProfile(uid):null;
  if(!data){
    const profiles=await publishedProfiles();
    if(uid)data=profiles.find(p=>idsFor(p).includes(String(uid)))||null;
    if(!data&&name){
      const wanted=normalized(name);
      data=profiles.find(p=>namesFor(p).includes(wanted))||null;
    }
  }

  cache.set(key,data);
  return data;
}

function setImage(avatar,src,alt,profileId){
  if(!avatar||!src)return;
  const img=new Image();
  img.alt=alt||'Profile avatar';
  img.loading='lazy';
  img.style.cssText='width:100%;height:100%;object-fit:cover;display:block;border-radius:50%';
  img.onload=()=>{
    avatar.replaceChildren(img);
    avatar.style.padding='0';
    avatar.style.overflow='hidden';
    avatar.dataset.avatarDone='1';
    if(profileId){
      avatar.style.cursor='pointer';
      avatar.onclick=()=>location.href=`profile.html?id=${encodeURIComponent(profileId)}`;
    }
  };
  img.onerror=()=>console.warn('Dashboard avatar image failed to load:',src);
  img.src=src;
}

async function apply(posts){
  const cards=[...document.querySelectorAll('.feed .post')];
  const visible=posts.filter(p=>p.published!==false);
  await Promise.all(visible.map(async(post,index)=>{
    const card=cards[index];
    if(!card)return;
    const avatar=card.querySelector('.post-avatar');
    const nameEl=card.querySelector('.post-name');
    if(!avatar)return;

    if(isWelcomePost(post)){
      const admin=await adminProfile();
      if(nameEl)nameEl.textContent='BANDtroductions Admin';
      const src=imageFor(admin)||post.authorAvatarUrl||post.authorImageUrl||post.avatarUrl||post.imageUrlAuthor||'';
      if(src)setImage(avatar,src,'BANDtroductions Admin',admin?.id||'');
      else{avatar.textContent='BT';avatar.dataset.avatarDone='1';}
      return;
    }

    if(avatar.dataset.avatarDone==='1')return;
    const uid=authorId(post);
    const data=await profile(uid,post.authorName||'');
    const src=imageFor(data)||post.authorAvatarUrl||post.authorImageUrl||post.authorPhotoUrl||post.authorPhotoURL||post.avatarUrl||post.imageUrlAuthor||'';
    if(!src)return;
    setImage(avatar,src,post.authorName||'Profile avatar',data?.id||uid);
  }));
}

function scheduleApply(posts){[80,250,700,1500,2400].forEach(delay=>setTimeout(()=>apply(posts),delay));}

onSnapshot(collection(db,'posts'),snap=>{
  const posts=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{const diff=postMs(b)-postMs(a);return diff||String(a.id).localeCompare(String(b.id));});
  scheduleApply(posts);
},error=>console.warn('Could not enhance dashboard post avatars.',error));
