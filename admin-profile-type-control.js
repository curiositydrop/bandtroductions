import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { doc, getDoc, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { isAdminAccount } from './admin-access.js';

const typeOptions=[
  ['band','Band'],
  ['musician','Musician'],
  ['venue','Venue'],
  ['fan','Scene Supporter']
];

const style=document.createElement('style');
style.textContent=`
.managed-type-editor{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding-top:2px}.managed-type-editor select{min-width:170px;border:1px solid #3b6662;border-radius:9px;background:#090909;color:#fff;padding:8px 10px;font:inherit}.managed-type-editor button{width:auto!important;padding:8px 11px!important}.managed-type-status{font-size:.75rem;color:#aaa;min-height:1em}.managed-type-status.ok{color:#63ffa9}.managed-type-status.error{color:#ff9f9f}@media(max-width:650px){.managed-type-editor{display:grid;grid-template-columns:1fr auto}.managed-type-editor select{min-width:0;width:100%}.managed-type-status{grid-column:1/-1}}
`;
document.head.appendChild(style);

function profileIdFromCard(card){
  const direct=card.querySelector('a[href^="profile.html?id="]')?.getAttribute('href')||'';
  if(direct){try{return new URL(direct,location.href).searchParams.get('id')||''}catch{}}
  const setup=card.querySelector('a[href*="adminProfile="]')?.getAttribute('href')||'';
  if(setup){try{return new URL(setup,location.href).searchParams.get('adminProfile')||''}catch{}}
  return '';
}

async function installEditor(card,user){
  if(card.dataset.typeEditorReady==='1')return;
  const profileId=profileIdFromCard(card);if(!profileId)return;
  card.dataset.typeEditorReady='1';
  try{
    const [profileSnap,userSnap]=await Promise.all([
      getDoc(doc(db,'profiles',profileId)),
      getDoc(doc(db,'users',profileId))
    ]);
    const profile=profileSnap.exists()?profileSnap.data():{};
    let ownerId=profile.ownerId||profile.userId||profile.uid||profileId;
    let ownerSnap=userSnap;
    if(ownerId!==profileId)ownerSnap=await getDoc(doc(db,'users',ownerId));
    const userData=ownerSnap.exists()?ownerSnap.data():{};
    if(profile.isAdmin===true||userData.isAdmin===true||ownerId===user.uid)return;
    const current=profile.accountType||userData.accountType||'fan';

    const wrap=document.createElement('div');wrap.className='managed-type-editor';
    const select=document.createElement('select');select.setAttribute('aria-label','Profile type');
    typeOptions.forEach(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;if(value===current)option.selected=true;select.appendChild(option)});
    const save=document.createElement('button');save.type='button';save.className='auth-button auth-button-secondary';save.textContent='Save Type';
    const status=document.createElement('span');status.className='managed-type-status';
    save.addEventListener('click',async()=>{
      const next=select.value;
      if(next===current){status.textContent='No change needed.';return;}
      if(!confirm(`Change this profile from ${typeOptions.find(x=>x[0]===current)?.[1]||current} to ${typeOptions.find(x=>x[0]===next)?.[1]||next}?`))return;
      save.disabled=true;select.disabled=true;status.className='managed-type-status';status.textContent='Saving…';
      try{
        const updates={accountType:next,sceneSupporter:next==='fan',updatedAt:serverTimestamp()};
        if(profileSnap.exists())await updateDoc(doc(db,'profiles',profileId),updates);
        if(ownerSnap.exists())await updateDoc(doc(db,'users',ownerId),updates);
        status.className='managed-type-status ok';status.textContent='Profile type updated.';
        setTimeout(()=>{card.dataset.typeEditorReady='';wrap.remove();installEditor(card,user)},500);
      }catch(error){
        console.error('Could not change profile type:',error);status.className='managed-type-status error';status.textContent='Type change failed.';save.disabled=false;select.disabled=false;
      }
    });
    wrap.append(select,save,status);
    const actions=card.querySelector('.managed-actions');
    if(actions)actions.insertAdjacentElement('afterend',wrap);else card.appendChild(wrap);
  }catch(error){
    console.warn('Could not load profile type editor:',error);card.dataset.typeEditorReady='';
  }
}

function scan(user){document.querySelectorAll('#managed-profile-list .managed-card').forEach(card=>installEditor(card,user));}

onAuthStateChanged(auth,user=>{
  if(!isAdminAccount(user)||!document.querySelector('.admin-shell'))return;
  let tries=0;
  const start=()=>{
    const list=document.getElementById('managed-profile-list');
    if(!list){if(++tries<40)setTimeout(start,250);return;}
    scan(user);
    const observer=new MutationObserver(()=>scan(user));
    observer.observe(list,{childList:true,subtree:false});
  };
  start();
});