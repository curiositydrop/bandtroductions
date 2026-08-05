import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const cache=new Map();
const authorId=p=>p.authorId||p.authorUid||p.uid||p.userId||'';
const imageFor=p=>p?.imageUrl||p?.profileImageUrl||p?.avatarUrl||p?.photoURL||p?.profileImage||p?.avatar||p?.logoUrl||'';

async function resolveProfile(uid,name=''){
  const key=`${uid}|${name}`;
  if(cache.has(key))return cache.get(key);
  try{
    if(uid){
      const direct=await getDoc(doc(db,'profiles',uid));
      if(direct.exists()){
        const result={id:direct.id,...direct.data()};
        cache.set(key,result);return result;
      }
      const owned=await getDocs(query(collection(db,'profiles'),where('ownerId','==',uid)));
      if(!owned.empty){
        const d=owned.docs.find(x=>x.data().published===true)||owned.docs[0];
        const result={id:d.id,...d.data()};
        cache.set(key,result);return result;
      }
    }
    if(name){
      const named=await getDocs(query(collection(db,'profiles'),where('displayName','==',name)));
      if(!named.empty){
        const d=named.docs.find(x=>x.data().published===true)||named.docs[0];
        const result={id:d.id,...d.data()};
        cache.set(key,result);return result;
      }
    }
    if(uid){
      const user=await getDoc(doc(db,'users',uid));
      if(user.exists()){
        const result={id:uid,...user.data()};
        cache.set(key,result);return result;
      }
    }
  }catch(error){console.warn('Dashboard avatar lookup failed',error);}
  cache.set(key,null);return null;
}

async function applyAvatars(posts){
  const cards=[...document.querySelectorAll('.feed .post')];
  const visible=posts.filter(p=>p.published!==false).slice(0,6);
  await Promise.all(visible.map(async(post,index)=>{
    const card=cards[index];if(!card)return;
    const avatar=card.querySelector('.post-avatar');if(!avatar)return;
    const uid=authorId(post);const data=await resolveProfile(uid,post.authorName||'');
    const src=imageFor(data)||post.authorAvatarUrl||post.authorImageUrl||'';
    if(!src)return;
    avatar.textContent='';avatar.style.padding='0';avatar.style.overflow='hidden';
    const img=document.createElement('img');img.src=src;img.alt=post.authorName||'Profile avatar';img.loading='lazy';img.style.cssText='width:100%;height:100%;object-fit:cover;display:block;border-radius:50%';
    img.addEventListener('error',()=>{avatar.replaceChildren();avatar.textContent=(post.authorName||'BT').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();});
    avatar.replaceChildren(img);
    const targetId=data?.id||uid;
    if(targetId){avatar.style.cursor='pointer';avatar.onclick=()=>location.href=`profile.html?id=${encodeURIComponent(targetId)}`;}
  }));
}

function installBadgeStyles(){
  if(document.getElementById('dashboard-menu-badge-style'))return;
  const style=document.createElement('style');style.id='dashboard-menu-badge-style';style.textContent=`
    .menu-count{float:right;min-width:18px;padding:1px 5px;border:1px solid #25c7c1;color:#25c7c1;font-size:10px;font-weight:900;text-align:center;line-height:1.2}
    @media(max-width:650px){.menu-count{min-width:10px;padding:0 2px;font-size:5px}}
  `;document.head.appendChild(style);
}
function setCount(label,count){
  const link=[...document.querySelectorAll('.left .menu a')].find(a=>a.childNodes[0]?.textContent?.trim()===label||a.textContent.trim().startsWith(label));
  if(!link)return;let badge=link.querySelector('.menu-count');if(!badge){badge=document.createElement('span');badge.className='menu-count';link.appendChild(badge);}badge.textContent=count>99?'99+':String(count);
}

function wireDashboardCounts(user){
  installBadgeStyles();
  onSnapshot(query(collection(db,'notifications'),where('recipientId','==',user.uid),where('read','==',false)),snap=>setCount('Notifications',snap.size),()=>{});
  onSnapshot(query(collection(db,'follows'),where('followerId','==',user.uid)),snap=>setCount('Following',snap.size),()=>{});
  resolveProfile(user.uid,user.displayName||'').then(profile=>{
    const targetId=profile?.id||user.uid;
    onSnapshot(query(collection(db,'follows'),where('targetId','==',targetId)),snap=>setCount('Followers',snap.size),()=>{});
  });
}

const postsQuery=query(collection(db,'posts'),orderBy('createdAt','desc'));
onSnapshot(postsQuery,snap=>{
  const posts=snap.docs.map(d=>({id:d.id,...d.data()}));
  const run=()=>applyAvatars(posts);
  setTimeout(run,120);
  const feed=document.querySelector('.feed');
  if(feed){let timer;const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(run,80)});observer.observe(feed,{childList:true,subtree:true});}
},error=>console.warn('Could not enhance dashboard post avatars.',error));

onAuthStateChanged(auth,user=>{if(user)wireDashboardCounts(user);});