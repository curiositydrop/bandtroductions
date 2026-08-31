import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, getDocs, doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { isAdminAccount } from './admin-access.js';

const accessStatus=document.getElementById('accessStatus');
const reviewArea=document.getElementById('reviewArea');
const reviewGrid=document.getElementById('reviewGrid');

const clean=v=>String(v||'').trim();

function render(items){
  reviewGrid.replaceChildren();
  const pending=items.filter(item=>item.reviewStatus==='pending'||item.published!==true).sort((a,b)=>(b.submittedAt||0)-(a.submittedAt||0));
  if(!pending.length){reviewGrid.innerHTML='<div class="empty"><strong>No Audition Room submissions waiting.</strong><br>Everything is caught up.</div>';return}
  pending.forEach(item=>{
    const card=document.createElement('article');card.className='card';
    const video=document.createElement('div');video.className='video';
    if(item.videoUrl){const el=document.createElement('video');el.src=item.videoUrl;el.controls=true;el.playsInline=true;el.preload='metadata';video.appendChild(el)}
    const meta=document.createElement('div');meta.className='meta';
    const title=document.createElement('h2');title.textContent=clean(item.displayName)||'Unnamed submission';meta.appendChild(title);
    const tag=document.createElement('span');tag.className='tag';tag.textContent=item.type==='band'?'BAND LOOKING FOR MEMBER':'MUSICIAN LOOKING FOR BAND';meta.appendChild(tag);
    const role=document.createElement('span');role.className='tag';role.textContent=item.type==='band'?`NEEDS: ${clean(item.role)||'Not listed'}`:clean(item.role)||'Not listed';meta.appendChild(role);
    const details=document.createElement('p');details.textContent=[clean(item.genre),[clean(item.city),clean(item.state)].filter(Boolean).join(', '),clean(item.notes)].filter(Boolean).join(' • ')||'No additional details.';meta.appendChild(details);
    const actions=document.createElement('div');actions.className='actions';
    const profile=document.createElement('a');profile.className='button';profile.href=`profile.html?id=${encodeURIComponent(item.profileId||'')}`;profile.target='_blank';profile.textContent='View Profile';
    const approve=document.createElement('button');approve.className='button approve';approve.type='button';approve.textContent='Approve & Publish';
    const reject=document.createElement('button');reject.className='button reject';reject.type='button';reject.textContent='Reject';
    approve.addEventListener('click',async()=>{approve.disabled=true;reject.disabled=true;try{await updateDoc(doc(db,'auditions',item.id),{approved:true,published:true,reviewStatus:'approved',reviewedAt:serverTimestamp()});card.remove();if(!reviewGrid.children.length)render([])}catch(error){console.error(error);alert('Could not approve this audition.')}});
    reject.addEventListener('click',async()=>{if(!confirm(`Reject ${clean(item.displayName)||'this submission'}?`))return;approve.disabled=true;reject.disabled=true;try{await updateDoc(doc(db,'auditions',item.id),{approved:false,published:false,reviewStatus:'rejected',reviewedAt:serverTimestamp()});card.remove();if(!reviewGrid.children.length)render([])}catch(error){console.error(error);alert('Could not reject this audition.')}});
    actions.append(profile,approve,reject);meta.appendChild(actions);card.append(video,meta);reviewGrid.appendChild(card);
  });
}

async function load(){
  try{const snap=await getDocs(collection(db,'auditions'));render(snap.docs.map(d=>({id:d.id,...d.data()})))}catch(error){console.error(error);reviewGrid.innerHTML='<div class="empty">Audition submissions could not be loaded. Check Firestore permissions.</div>'}
}

onAuthStateChanged(auth,user=>{
  if(!isAdminAccount(user)){reviewArea.hidden=true;accessStatus.textContent=user?'Administrator access is required.':'Log in with the BANDtroductions administrator account to review auditions.';return}
  accessStatus.textContent='ADMIN VERIFIED · AUDITION REVIEW QUEUE';reviewArea.hidden=false;load();
});
