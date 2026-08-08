import { db } from './firebase-dev.js';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

let posts=[];
let profilesPromise=null;
const profileCache=new Map();

const stampMs=s=>s?.toMillis?s.toMillis():(s?.seconds?s.seconds*1000:0);
const postMs=p=>stampMs(p.createdAt)||stampMs(p.updatedAt)||stampMs(p.publishedAt)||stampMs(p.submittedAt)||0;
const norm=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
const imageFor=p=>p?.imageUrl||p?.profileImageUrl||p?.profilePhotoUrl||p?.avatarUrl||p?.photoURL||p?.photoUrl||p?.profileImage||p?.profilePhoto||p?.profilePic||p?.profilePicture||p?.avatar||p?.bandLogo||p?.logoUrl||p?.logoURL||p?.logo||p?.image||'';
const idsFor=p=>[p?.id,p?.ownerId,p?.userId,p?.uid,p?.authorId,p?.createdBy].map(v=>String(v||'').trim()).filter(Boolean);
const namesFor=p=>[p?.displayName,p?.name,p?.bandName,p?.musicianName,p?.venueName,p?.artistName,p?.profileName,p?.username,p?.userName,p?.handle,p?.slug,p?.accountName].map(norm).filter(Boolean);
const postAuthorId=p=>p.authorId||p.authorUid||p.uid||p.userId||p.ownerId||p.createdBy||'';
const isWelcome=p=>Boolean(p?.systemPost||p?.welcomedProfileId||String(p?.id||'').startsWith('welcome_'));

async function publicProfiles(){
  if(profilesPromise)return profilesPromise;
  profilesPromise=(async()=>{
    try{
      const snap=await getDocs(query(collection(db,'profiles'),where('published','==',true)));
      return snap.docs.map(d=>({id:d.id,...d.data()}));
    }catch(error){
      console.warn('Stable post profile directory unavailable.',error);
      return [];
    }
  })();
  return profilesPromise;
}

function fuzzyProfile(list,name){
  const wanted=norm(name);
  if(!wanted)return null;
  const exact=list.find(p=>namesFor(p).includes(wanted));
  if(exact)return exact;
  const close=list.filter(p=>namesFor(p).some(n=>n.length>=4&&wanted.length>=4&&(n.startsWith(wanted)||wanted.startsWith(n))));
  return close.length===1?close[0]:null;
}

async function profileFor(post){
  const uid=postAuthorId(post);
  const key=uid?`id:${uid}`:`name:${norm(post.authorName)}`;
  if(profileCache.has(key))return profileCache.get(key);
  let found=null;
  if(uid){
    try{
      const snap=await getDoc(doc(db,'profiles',uid));
      if(snap.exists()&&snap.data()?.published===true)found={id:snap.id,...snap.data()};
    }catch{}
  }
  const list=await publicProfiles();
  if(!found&&uid)found=list.find(p=>idsFor(p).includes(String(uid)))||null;
  if(!found)found=fuzzyProfile(list,post.authorName||'');
  profileCache.set(key,found);
  return found;
}

function youtubeInfo(text=''){
  const url=String(text).match(/https?:\/\/(?:www\.)?(?:youtu\.be\/[A-Za-z0-9_-]{6,}(?:\?[^\s]*)?|youtube\.com\/(?:watch\?[^\s]*v=[A-Za-z0-9_-]{6,}|embed\/[A-Za-z0-9_-]{6,}|shorts\/[A-Za-z0-9_-]{6,})(?:[^\s]*)?)/i)?.[0]||'';
  if(!url)return null;
  const id=url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i)?.[1]||url.match(/[?&]v=([A-Za-z0-9_-]{6,})/i)?.[1]||url.match(/\/(?:embed|shorts)\/([A-Za-z0-9_-]{6,})/i)?.[1]||'';
  return id?{url,id}:null;
}

function setAvatar(card,src,name,profileId){
  const avatar=card.querySelector('.post-avatar');
  if(!avatar||!src||avatar.querySelector('img'))return;
  const img=new Image();
  img.alt=name||'Profile avatar';
  img.style.cssText='width:100%;height:100%;object-fit:cover;display:block;border-radius:50%';
  img.onload=()=>{
    avatar.replaceChildren(img);
    avatar.style.padding='0';
    avatar.style.overflow='hidden';
    if(profileId){avatar.style.cursor='pointer';avatar.onclick=()=>location.href=`profile.html?id=${encodeURIComponent(profileId)}`;}
  };
  img.src=src;
}

function embedYoutube(card,post){
  if(card.querySelector('.post-video iframe'))return;
  const candidates=[post.videoUrl,post.mediaUrl,post.linkUrl,post.content].filter(Boolean);
  let info=null;
  for(const candidate of candidates){info=youtubeInfo(candidate);if(info)break;}
  if(!info)return;
  const body=[...card.children].find(el=>el.tagName==='P')||card.querySelector('p');
  if(body&&body.textContent.includes(info.url))body.textContent=body.textContent.replace(info.url,'').trim();
  const existing=card.querySelector('.post-video');
  const wrap=existing||document.createElement('div');
  wrap.className='post-video';
  wrap.style.cssText='position:relative;width:100%;aspect-ratio:16/9;margin-top:10px;background:#000;border:1px solid #333';
  if(!existing){
    const actions=card.querySelector('.post-actions');
    if(actions)actions.insertAdjacentElement('beforebegin',wrap);else card.appendChild(wrap);
  }
  wrap.replaceChildren();
  const iframe=document.createElement('iframe');
  iframe.src=`https://www.youtube.com/embed/${encodeURIComponent(info.id)}?playsinline=1`;
  iframe.title='Post video';
  iframe.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.allowFullscreen=true;
  iframe.style.cssText='position:absolute;inset:0;width:100%;height:100%;border:0';
  wrap.appendChild(iframe);
}

async function enhance(){
  const visible=posts.filter(p=>p.published!==false);
  const cards=[...document.querySelectorAll('.feed .post')];
  if(cards.length<visible.length)return;
  await Promise.all(visible.map(async(post,index)=>{
    const card=cards[index];if(!card)return;
    embedYoutube(card,post);
    if(isWelcome(post)){
      const list=await publicProfiles();
      const admin=list.find(p=>p.isAdmin===true||norm(p.role)==='admin'||norm(p.displayName)==='bandtroductionsadmin');
      const src=imageFor(admin)||post.authorAvatarUrl||post.authorImageUrl||'';
      if(src)setAvatar(card,src,'BANDtroductions Admin',admin?.id||'');
      return;
    }
    const data=await profileFor(post);
    const src=imageFor(data)||post.authorAvatarUrl||post.authorImageUrl||post.authorPhotoUrl||post.authorPhotoURL||post.avatarUrl||'';
    if(src)setAvatar(card,src,post.authorName||'Profile avatar',data?.id||postAuthorId(post));
  }));
}

function schedule(){[120,350,800,1600,3000].forEach(ms=>setTimeout(enhance,ms));}

onSnapshot(collection(db,'posts'),snap=>{
  posts=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{const diff=postMs(b)-postMs(a);return diff||String(a.id).localeCompare(String(b.id));});
  schedule();
},error=>console.warn('Stable post enhancement unavailable.',error));
