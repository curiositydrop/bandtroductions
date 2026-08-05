import { db } from './firebase-dev.js';
import { collection, doc, getDoc, onSnapshot, orderBy, query } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const cache=new Map();
const authorId=p=>p.authorId||p.authorUid||p.uid||p.userId||'';
const imageFor=p=>p?.avatarUrl||p?.photoURL||p?.imageUrl||p?.profileImage||p?.avatar||p?.logoUrl||'';

async function profile(uid){
  if(!uid)return null;
  if(cache.has(uid))return cache.get(uid);
  try{
    const [a,b]=await Promise.all([getDoc(doc(db,'profiles',uid)),getDoc(doc(db,'users',uid))]);
    const data=a.exists()?a.data():(b.exists()?b.data():null);
    cache.set(uid,data);return data;
  }catch(error){console.warn('Dashboard avatar lookup failed',error);cache.set(uid,null);return null;}
}

async function apply(posts){
  const cards=[...document.querySelectorAll('.feed .post')];
  const visible=posts.filter(p=>p.published!==false).slice(0,6);
  await Promise.all(visible.map(async(post,index)=>{
    const card=cards[index];if(!card)return;
    const avatar=card.querySelector('.post-avatar');if(!avatar)return;
    const uid=authorId(post);const data=await profile(uid);
    const src=imageFor(data)||post.authorAvatarUrl||post.authorImageUrl||'';
    if(!src)return;
    avatar.textContent='';
    avatar.style.padding='0';avatar.style.overflow='hidden';
    let img=avatar.querySelector('img');
    if(!img){img=document.createElement('img');avatar.appendChild(img);}
    img.src=src;img.alt=post.authorName||'Profile avatar';img.loading='lazy';
    img.style.cssText='width:100%;height:100%;object-fit:cover;display:block;border-radius:50%';
    if(uid){avatar.style.cursor='pointer';avatar.onclick=()=>location.href=`profile.html?id=${encodeURIComponent(uid)}`;}
  }));
}

const postsQuery=query(collection(db,'posts'),orderBy('createdAt','desc'));
onSnapshot(postsQuery,snap=>{
  const posts=snap.docs.map(d=>({id:d.id,...d.data()}));
  setTimeout(()=>apply(posts),80);
  const feed=document.querySelector('.feed');
  if(feed){const observer=new MutationObserver(()=>apply(posts));observer.observe(feed,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),2500);}
},error=>console.warn('Could not enhance dashboard post avatars.',error));