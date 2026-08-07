import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { deleteDoc, doc, getDoc, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { isAdminAccount } from './admin-access.js';

const profileId=new URLSearchParams(location.search).get('id');

const style=document.createElement('style');
style.textContent=`
  .admin-profile-panel{border-color:#356b66!important;background:linear-gradient(145deg,#111918,#0d1111)!important}
  .admin-profile-panel h2{color:#0ccfbd}.admin-profile-actions{display:flex;gap:8px;flex-wrap:wrap}
  .admin-profile-actions .auth-button{width:auto!important}.admin-danger{border-color:#8a3d3d!important;color:#ffc0c0!important;background:#180d0d!important}
  .control-room-button{border-color:#0ccfbd!important;background:#0ccfbd!important;color:#06110f!important;font-weight:1000!important;box-shadow:0 0 18px rgba(12,207,189,.12)}
`;
document.head.appendChild(style);

function waitForContent(){
  return new Promise(resolve=>{
    const content=document.getElementById('profile-content');
    if(content&&!content.hidden){resolve(content);return;}
    const observer=new MutationObserver(()=>{if(content&&!content.hidden){observer.disconnect();resolve(content);}});
    if(content)observer.observe(content,{attributes:true,attributeFilter:['hidden']});
    setTimeout(()=>{observer.disconnect();resolve(content);},8000);
  });
}

onAuthStateChanged(auth,async user=>{
  if(!user||!profileId||!isAdminAccount(user))return;
  const content=await waitForContent();
  if(!content)return;
  const snap=await getDoc(doc(db,'profiles',profileId));
  if(!snap.exists())return;
  const profile=snap.data();
  const dedicatedEditUrl=`profile-setup.html?adminProfile=${encodeURIComponent(profileId)}&editor=3`;

  const ordinaryEdit=document.getElementById('edit-profile');
  if(ordinaryEdit){
    ordinaryEdit.href=dedicatedEditUrl;
    ordinaryEdit.hidden=false;
    ordinaryEdit.style.setProperty('display','inline-flex','important');
  }

  if(document.getElementById('admin-profile-panel'))return;
  const panel=document.createElement('section');
  panel.id='admin-profile-panel';panel.className='profile-card admin-profile-panel';
  const heading=document.createElement('h2');heading.textContent='Admin Controls';
  const note=document.createElement('p');note.className='profile-side-note';note.textContent='These controls are visible only to the BANDtroductions administrator.';
  const actions=document.createElement('div');actions.className='admin-profile-actions';

  if(profileId===user.uid){
    const room=document.createElement('a');room.className='auth-button control-room-button';room.href='admin.html';room.textContent='🎛️ The Control Room';actions.append(room);
  }

  const edit=document.createElement('a');edit.className='auth-button';edit.href=dedicatedEditUrl;edit.textContent='Admin Edit';
  const media=document.createElement('a');media.className='auth-button auth-button-secondary';media.href=`media.html?owner=${encodeURIComponent(profileId)}`;media.textContent='Manage Media';
  const publish=document.createElement('button');publish.type='button';publish.className='auth-button auth-button-secondary';publish.textContent=profile.published===false?'Publish Profile':'Unpublish Profile';
  publish.addEventListener('click',async()=>{
    const next=profile.published===false;
    if(!confirm(`${next?'Publish':'Unpublish'} this profile?`))return;
    publish.disabled=true;
    try{await updateDoc(doc(db,'profiles',profileId),{published:next,moderatedAt:serverTimestamp(),moderatedBy:user.uid});location.reload();}
    catch(error){console.error(error);alert('The profile status could not be changed.');publish.disabled=false;}
  });
  const remove=document.createElement('button');remove.type='button';remove.className='auth-button admin-danger';remove.textContent='Delete Profile Listing';
  remove.addEventListener('click',async()=>{
    if(!confirm('Delete this profile listing permanently? This does not delete the person’s Firebase login, but their public profile will be removed.'))return;
    remove.disabled=true;
    try{await deleteDoc(doc(db,'profiles',profileId));location.href='community.html';}
    catch(error){console.error(error);alert('The profile could not be deleted.');remove.disabled=false;}
  });
  actions.append(edit,media,publish,remove);panel.append(heading,note,actions);content.appendChild(panel);
});