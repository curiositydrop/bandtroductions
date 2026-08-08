import { db } from './firebase-dev.js';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const cache=new Map();
const authorId=p=>p.authorId||p.authorUid||p.uid||p.userId||'';
const imageFor=p=>p?.imageUrl||p?.profileImageUrl||p?.avatarUrl||p?.photoURL||p?.profileImage||p?.avatar||p?.logoUrl||p?.logo||'';
const stampMs=stamp=>stamp?.toMillis?stamp.toMillis():(stamp?.seconds?stamp.seconds*1000:0);
const postMs=post=>stampMs(post.createdAt)||stampMs(post.updatedAt)||stampMs(post.publishedAt)||stampMs(post.submittedAt)||0;

async function profile(uid,name=''){
  const key=uid||`name:${String(name).toLowerCase()}`;
  if(cache.has(key))return cache.get(key);
  try{
    let data=null;
    if(uid){
      const direct=await getDoc(doc(db,'profiles',uid));
      if(direct.exists())data={id:direct.id,...direct.data()};
      if(!data){
        const owned=await getDocs(query(collection(db,'profiles'),where('ownerId','==',uid)));
        if(!owned.empty){const picked=owned.docs.find(d=>d.data().published===true)||owned.docs[0];data={id:picked.id,...picked.data()};}
      }
    }
    if(!data&&name){
      for(const field of ['displayName','name','bandName','venueName']){
        const named=await getDocs(query(collection(db,'profiles'),where(field,'==',name)));
        if(!named.empty){const picked=named.docs.find(d=>d.data().published===true)||named.docs[0];data={id:picked.id,...picked.data()};break;}
      }
    }
    if(!data&&uid){const user=await getDoc(doc(db,'users',uid));if(user.exists())data={id:user.id,...user.data()};}
    cache.set(key,data);return data;
  }catch(error){console.warn('Dashboard avatar lookup failed',error);return null;}
}

async function apply(posts){
  const cards=[...document.querySelectorAll('.feed .post')];
  const visible=posts.filter(p=>p.published!==false);
  await Promise.all(visible.map(async(post,index)=>{
    const card=cards[index];if(!card)return;
    const avatar=card.querySelector('.post-avatar');if(!avatar||avatar.dataset.avatarDone==='1')return;
    const uid=authorId(post);const data=await profile(uid,post.authorName||'');
    const src=imageFor(data)||post.authorAvatarUrl||post.authorImageUrl||post.avatarUrl||post.imageUrlAuthor||'';
    if(!src)return;
    const img=new Image();
    img.alt=post.authorName||'Profile avatar';img.loading='lazy';img.style.cssText='width:100%;height:100%;object-fit:cover;display:block;border-radius:50%';
    img.onload=()=>{
      avatar.replaceChildren(img);avatar.style.padding='0';avatar.style.overflow='hidden';avatar.dataset.avatarDone='1';
      const profileId=data?.id||uid;if(profileId){avatar.style.cursor='pointer';avatar.onclick=()=>location.href=`profile.html?id=${encodeURIComponent(profileId)}`;}
    };
    img.onerror=()=>console.warn('Dashboard avatar image failed to load:',src);
    img.src=src;
  }));
}

function scheduleApply(posts){
  [80,250,700,1500,2400].forEach(delay=>setTimeout(()=>apply(posts),delay));
}

onSnapshot(collection(db,'posts'),snap=>{
  const posts=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{const diff=postMs(b)-postMs(a);return diff||String(a.id).localeCompare(String(b.id));});
  scheduleApply(posts);
},error=>console.warn('Could not enhance dashboard post avatars.',error));