import { auth, db, storage } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, getDocs, doc, updateDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { ref, deleteObject } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';
import { isAdminAccount } from './admin-access.js';

const accessStatus=document.getElementById('accessStatus');
const reviewArea=document.getElementById('reviewArea');
const reviewGrid=document.getElementById('reviewGrid');

const clean=v=>String(v||'').trim();

function render(items){
  reviewGrid.replaceChildren();
  const sorted=[...items].sort((a,b)=>(b.submittedAt||0)-(a.submittedAt||0));
  if(!sorted.length){reviewGrid.innerHTML='<div class="empty"><strong>No Audition Room submissions.</strong><br>Nothing has been submitted yet.</div>';return}

  sorted.forEach(item=>{
    const card=document.createElement('article');card.className='card';
    const video=document.createElement('div');video.className='video';
    if(item.videoUrl){const el=document.createElement('video');el.src=item.videoUrl;el.controls=true;el.playsInline=true;el.preload='metadata';video.appendChild(el)}

    const meta=document.createElement('div');meta.className='meta';
    const title=document.createElement('h2');title.textContent=clean(item.displayName)||'Unnamed submission';meta.appendChild(title);

    const tag=document.createElement('span');tag.className='tag';tag.textContent=item.type==='band'?'BAND LOOKING FOR MEMBER':'MUSICIAN LOOKING FOR BAND';meta.appendChild(tag);
    const role=document.createElement('span');role.className='tag';role.textContent=item.type==='band'?`NEEDS: ${clean(item.role)||'Not listed'}`:clean(item.role)||'Not listed';meta.appendChild(role);

    const statusTag=document.createElement('span');statusTag.className='tag';
    const statusText=item.reviewStatus==='approved'&&item.published===true?'LIVE':item.reviewStatus==='rejected'?'REJECTED':'PENDING';
    statusTag.textContent=statusText;meta.appendChild(statusTag);

    const details=document.createElement('p');details.textContent=[clean(item.genre),[clean(item.city),clean(item.state)].filter(Boolean).join(', '),clean(item.notes)].filter(Boolean).join(' • ')||'No additional details.';meta.appendChild(details);

    const actions=document.createElement('div');actions.className='actions';
    const profile=document.createElement('a');profile.className='button';profile.href=`profile.html?id=${encodeURIComponent(item.profileId||'')}`;profile.target='_blank';profile.textContent='View Profile';
    actions.appendChild(profile);

    const approve=document.createElement('button');approve.className='button approve';approve.type='button';approve.textContent='Approve & Publish';
    const reject=document.createElement('button');reject.className='button reject';reject.type='button';reject.textContent='Reject';
    const remove=document.createElement('button');remove.className='button reject';remove.type='button';remove.textContent='Delete';

    if(statusText==='PENDING'){
      approve.addEventListener('click',async()=>{
        approve.disabled=true;reject.disabled=true;remove.disabled=true;
        try{
          await updateDoc(doc(db,'auditions',item.id),{approved:true,published:true,reviewStatus:'approved',reviewedAt:serverTimestamp()});
          await load();
        }catch(error){
          console.error(error);alert('Could not approve this audition.');approve.disabled=false;reject.disabled=false;remove.disabled=false;
        }
      });

      reject.addEventListener('click',async()=>{
        if(!confirm(`Reject ${clean(item.displayName)||'this submission'}?`))return;
        approve.disabled=true;reject.disabled=true;remove.disabled=true;
        try{
          await updateDoc(doc(db,'auditions',item.id),{approved:false,published:false,reviewStatus:'rejected',reviewedAt:serverTimestamp()});
          await load();
        }catch(error){
          console.error(error);alert('Could not reject this audition.');approve.disabled=false;reject.disabled=false;remove.disabled=false;
        }
      });
      actions.append(approve,reject);
    }

    remove.addEventListener('click',async()=>{
      const name=clean(item.displayName)||'this submission';
      if(!confirm(`Permanently delete ${name}? This will remove the audition listing and uploaded video.`))return;
      remove.disabled=true;approve.disabled=true;reject.disabled=true;
      try{
        if(item.videoStoragePath){
          try{
            await deleteObject(ref(storage,item.videoStoragePath));
          }catch(error){
            if(error?.code!=='storage/object-not-found')throw error;
          }
        }
        await deleteDoc(doc(db,'auditions',item.id));
        await load();
      }catch(error){
        console.error('Audition delete failed:',error);
        alert(error?.code==='storage/unauthorized'?'The audition record was not deleted because Firebase Storage blocked the admin video deletion. Update the Audition Room Storage delete rule for the admin account, then try again.':'Could not permanently delete this audition.');
        remove.disabled=false;approve.disabled=statusText!=='PENDING';reject.disabled=statusText!=='PENDING';
      }
    });

    actions.appendChild(remove);meta.appendChild(actions);card.append(video,meta);reviewGrid.appendChild(card);
  });
}

async function load(){
  try{const snap=await getDocs(collection(db,'auditions'));render(snap.docs.map(d=>({id:d.id,...d.data()})))}catch(error){console.error(error);reviewGrid.innerHTML='<div class="empty">Audition submissions could not be loaded. Check Firestore permissions.</div>'}
}

onAuthStateChanged(auth,user=>{
  if(!isAdminAccount(user)){reviewArea.hidden=true;accessStatus.textContent=user?'Administrator access is required.':'Log in with the BANDtroductions administrator account to review auditions.';return}
  accessStatus.textContent='ADMIN VERIFIED · AUDITION REVIEW QUEUE';reviewArea.hidden=false;load();
});
