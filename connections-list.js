import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, doc, getDoc, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const mode=document.body.dataset.connectionMode||'favorites';
const list=document.getElementById('connections-list');
const status=document.getElementById('connections-status');
const imageFor=p=>p?.imageUrl||p?.profileImageUrl||p?.avatarUrl||p?.photoURL||p?.profileImage||'';

function render(items){
  list.replaceChildren();
  status.hidden=items.length>0;
  if(!items.length){
    status.hidden=false;
    status.textContent=mode==='following'?'You are not following any profiles yet.':mode==='followers'?'No followers yet.':'You have not favorited any profiles yet.';
    return;
  }
  items.forEach(item=>{
    const id=item.targetId||item.profileId||item.id;
    const a=document.createElement('a');a.className='connection-card';a.href=`profile.html?id=${encodeURIComponent(id)}`;
    if(item.targetImage){const img=document.createElement('img');img.src=item.targetImage;img.alt='';img.loading='lazy';a.appendChild(img)}
    const copy=document.createElement('div');const name=document.createElement('strong');name.textContent=item.targetName||'BANDtroductions Profile';
    const meta=document.createElement('span');meta.textContent=[item.targetType==='fan'?'Scene Supporter':item.targetType,item.targetLocation].filter(Boolean).join(' • ');
    copy.append(name,meta);a.appendChild(copy);list.appendChild(a);
  });
}

async function enrichFollowerDocs(docs){
  return Promise.all(docs.map(async row=>{
    const uid=row.followerId;
    if(!uid)return null;
    try{
      const [p,u]=await Promise.all([getDoc(doc(db,'profiles',uid)),getDoc(doc(db,'users',uid))]);
      const data=p.exists()?p.data():(u.exists()?u.data():{});
      return {profileId:uid,targetName:data.displayName||data.name||'BANDtroductions Member',targetType:data.accountType||data.type||'member',targetLocation:data.location||'',targetImage:imageFor(data)};
    }catch{return {profileId:uid,targetName:'BANDtroductions Member',targetType:'member'};}
  })).then(rows=>rows.filter(Boolean));
}

onAuthStateChanged(auth,user=>{
  if(!user){location.href=`login.html?returnTo=${encodeURIComponent(location.pathname.split('/').pop())}`;return;}
  if(mode==='followers'){
    onSnapshot(query(collection(db,'follows'),where('targetId','==',user.uid)),async snap=>{
      const rows=await enrichFollowerDocs(snap.docs.map(d=>({id:d.id,...d.data()})));
      rows.sort((a,b)=>String(a.targetName||'').localeCompare(String(b.targetName||'')));
      render(rows);
    },error=>{console.error(error);status.hidden=false;status.textContent='Followers could not be loaded.'});
    return;
  }
  const field=mode==='following'?'followerId':'userId';
  const source=mode==='following'?'follows':'favorites';
  onSnapshot(query(collection(db,source),where(field,'==',user.uid)),snap=>{
    const items=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.targetName||'').localeCompare(String(b.targetName||'')));
    render(items);
  },error=>{console.error(error);status.hidden=false;status.textContent=error?.code==='permission-denied'?'These saved profiles are not available with the current permissions.':'Saved profiles could not be loaded.'});
});
