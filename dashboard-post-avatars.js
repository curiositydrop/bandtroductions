import './dashboard-botw.js';
import { db } from './firebase-dev.js';
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const cache=new Map();
const authorId=p=>p.authorId||p.authorUid||p.uid||p.userId||'';
const imageFor=p=>p?.imageUrl||p?.profileImageUrl||p?.avatarUrl||p?.photoURL||p?.profileImage||p?.avatar||p?.logoUrl||p?.logo||'';

async function profile(uid,name=''){
  const key=uid||`name:${String(name).toLowerCase()}`;
  if(cache.has(key))return cache.get(key);
  try{
    let data=null;
    if(uid){
      const direct=await getDoc(doc(db,'profiles',uid));
      if(direct.exists())data=direct.data();
      if(!data){
        const owned=await getDocs(query(collection(db,'profiles'),where('ownerId','==',uid)));
        if(!owned.empty)data=owned.docs.find(d=>d.data().published===true)?.data()||owned.docs[0].data();
      }
    }
    if(!data&&name){
      const named=await getDocs(query(collection(db,'profiles'),where('displayName','==',name)));
      if(!named.empty)data=named.docs.find(d=>d.data().published===true)?.data()||named.docs[0].data();
    }
    if(!data&&uid){const user=await getDoc(doc(db,'users',uid));if(user.exists())data=user.data();}
    cache.set(key,data);return data;
  }catch(error){console.warn('Dashboard avatar lookup failed',error);cache.set(key,null);return null;}
}

async function apply(posts){
  const cards=[...document.querySelectorAll('.feed .post')];
  const visible=posts.filter(p=>p.published!==false).slice(0,6);
  await Promise.all(visible.map(async(post,index)=>{
    const card=cards[index];if(!card)return;
    const avatar=card.querySelector('.post-avatar');if(!avatar)return;
    const uid=authorId(post);const data=await profile(uid,post.authorName||'');
    const src=imageFor(data)||post.authorAvatarUrl||post.authorImageUrl||post.avatarUrl||post.imageUrlAuthor||'';
    if(!src)return;
    avatar.textContent='';
    avatar.style.padding='0';avatar.style.overflow='hidden';
    let img=avatar.querySelector('img');
    if(!img){img=document.createElement('img');avatar.appendChild(img);}
    img.src=src;img.alt=post.authorName||'Profile avatar';img.loading='lazy';
    img.style.cssText='width:100%;height:100%;object-fit:cover;display:block;border-radius:50%';
    const profileId=data?.id||uid;
    if(profileId){avatar.style.cursor='pointer';avatar.onclick=()=>location.href=`profile.html?id=${encodeURIComponent(profileId)}`;}
  }));
}

const postsQuery=query(collection(db,'posts'),orderBy('createdAt','desc'));
onSnapshot(postsQuery,snap=>{
  const posts=snap.docs.map(d=>({id:d.id,...d.data()}));
  setTimeout(()=>apply(posts),80);
  const feed=document.querySelector('.feed');
  if(feed){const observer=new MutationObserver(()=>apply(posts));observer.observe(feed,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),2500);}
},error=>console.warn('Could not enhance dashboard post avatars.',error));