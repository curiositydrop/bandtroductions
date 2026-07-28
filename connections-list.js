import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const mode=document.body.dataset.connectionMode||'favorites';
const list=document.getElementById('connections-list');
const status=document.getElementById('connections-status');

function render(items){
  list.replaceChildren();
  status.hidden=items.length>0;
  if(!items.length){status.hidden=false;status.textContent=mode==='following'?'You are not following any profiles yet.':'You have not favorited any profiles yet.';return;}
  items.forEach(item=>{
    const a=document.createElement('a');a.className='connection-card';a.href=`profile.html?id=${encodeURIComponent(item.targetId)}`;
    if(item.targetImage){const img=document.createElement('img');img.src=item.targetImage;img.alt='';img.loading='lazy';a.appendChild(img)}
    const copy=document.createElement('div');const name=document.createElement('strong');name.textContent=item.targetName||'BANDtroductions Profile';
    const meta=document.createElement('span');meta.textContent=[item.targetType==='fan'?'Scene Supporter':item.targetType,item.targetLocation].filter(Boolean).join(' • ');
    copy.append(name,meta);a.appendChild(copy);list.appendChild(a);
  });
}

onAuthStateChanged(auth,user=>{
  if(!user){location.href=`login.html?returnTo=${encodeURIComponent(location.pathname.split('/').pop())}`;return;}
  const field=mode==='following'?'followerId':'userId';
  const source=mode==='following'?'follows':'favorites';
  onSnapshot(query(collection(db,source),where(field,'==',user.uid)),snap=>{
    const items=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.targetName||'').localeCompare(String(b.targetName||'')));
    render(items);
  },error=>{console.error(error);status.hidden=false;status.textContent=error?.code==='permission-denied'?'These saved profiles are not available with the current permissions.':'Saved profiles could not be loaded.'});
});
