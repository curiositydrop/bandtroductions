import { auth, db, storage } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';

const ADMIN_EMAIL='newleafpaintingcompany@gmail.com';
const params=new URLSearchParams(location.search);
const requestedOwner=params.get('owner');
const grid=document.getElementById('media-grid');
const pageStatus=document.getElementById('media-status');
const uploadCard=document.getElementById('media-upload-card');
const uploadStatus=document.getElementById('upload-status');
const fileInput=document.getElementById('media-file');
const captionInput=document.getElementById('media-caption');
const progress=document.querySelector('.upload-progress');
const progressBar=document.getElementById('upload-progress-bar');
let currentUser=null,ownerId=requestedOwner||'',profile={},items=[],activeFilter='all',currentUserIsAdmin=false;

const canManage=()=>Boolean(currentUser&&(currentUser.uid===ownerId||currentUserIsAdmin));
const safeName=name=>String(name||'media').replace(/[^a-z0-9._-]+/gi,'-').replace(/-+/g,'-');
const formatDate=value=>value?.toDate?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(value.toDate()):'Just now';

async function checkAdmin(user){
  if(!user)return false;
  if(String(user.email||'').toLowerCase()===ADMIN_EMAIL)return true;
  try{return (await getDoc(doc(db,'admins',user.uid))).exists();}
  catch(error){console.error('Could not check media-admin status:',error);return false;}
}

async function setProfileImage(field,item){
  if(item.mediaType!=='image')return;
  const label=field==='imageUrl'?'avatar':'banner';
  if(!confirm(`Use this image as the profile ${label}?`))return;
  try{
    await updateDoc(doc(db,'profiles',ownerId),{[field]:item.downloadUrl,[`${field}StoragePath`]:item.storagePath||'',updatedAt:serverTimestamp()});
    profile[field]=item.downloadUrl;
    alert(`Profile ${label} updated.`);
  }catch(error){console.error(error);alert(`The profile ${label} could not be updated.`);}
}

async function togglePublished(item){
  const next=item.published===false;
  try{await updateDoc(doc(db,'media',item.id),{published:next,updatedAt:serverTimestamp()});}
  catch(error){console.error(error);alert('The media visibility could not be changed.');}
}

function render(){
  const visible=items.filter(item=>(item.published!==false||canManage())&&(activeFilter==='all'||item.mediaType===activeFilter));
  grid.replaceChildren();
  pageStatus.hidden=visible.length>0;
  pageStatus.textContent=items.length?'No media matches this filter.':'No media has been uploaded yet.';
  visible.forEach(item=>{
    const card=document.createElement('article');card.className='media-card';
    const preview=document.createElement('div');preview.className='media-preview';
    const media=item.mediaType==='video'?document.createElement('video'):document.createElement('img');
    media.src=item.downloadUrl;media.alt=item.caption||'';media.loading='lazy';
    if(item.mediaType==='video'){media.controls=true;media.preload='metadata'}
    preview.appendChild(media);
    const copy=document.createElement('div');copy.className='media-card-copy';
    const caption=document.createElement('strong');caption.textContent=item.caption||item.fileName||'Untitled media';
    const meta=document.createElement('p');meta.textContent=`${item.mediaType==='video'?'Video':'Image'} • ${formatDate(item.createdAt)}${item.published===false?' • Hidden':''}`;
    copy.append(caption,meta);
    const actions=document.createElement('div');actions.className='media-actions';
    const share=document.createElement('a');share.className='auth-button';share.href=`community.html?media=${encodeURIComponent(item.id)}`;share.textContent='Share to Community';actions.appendChild(share);
    if(canManage()){
      if(item.mediaType==='image'){
        const avatar=document.createElement('button');avatar.className='auth-button auth-button-secondary';avatar.type='button';avatar.textContent='Use as Avatar';avatar.addEventListener('click',()=>setProfileImage('imageUrl',item));
        const banner=document.createElement('button');banner.className='auth-button auth-button-secondary';banner.type='button';banner.textContent='Use as Banner';banner.addEventListener('click',()=>setProfileImage('bannerImageUrl',item));
        actions.append(avatar,banner);
      }
      const visibility=document.createElement('button');visibility.className='auth-button auth-button-secondary';visibility.type='button';visibility.textContent=item.published===false?'Show Media':'Hide Media';visibility.addEventListener('click',()=>togglePublished(item));actions.appendChild(visibility);
      const remove=document.createElement('button');remove.className='auth-button auth-button-secondary';remove.type='button';remove.textContent=currentUserIsAdmin&&currentUser.uid!==ownerId?'Admin Delete':'Delete Permanently';
      remove.addEventListener('click',async()=>{
        if(!confirm('Permanently delete this file from the Media Library? Any community posts using it may lose the media.'))return;
        remove.disabled=true;
        try{if(item.storagePath)await deleteObject(ref(storage,item.storagePath));await deleteDoc(doc(db,'media',item.id));}
        catch(error){console.error(error);alert(error.code==='storage/object-not-found'?'The stored file was already missing.':'This media could not be deleted.');remove.disabled=false;}
      });actions.appendChild(remove);
    }
    copy.appendChild(actions);card.append(preview,copy);grid.appendChild(card);
  });
}

document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
  activeFilter=button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('is-active',x===button));render();
}));

document.getElementById('upload-media').addEventListener('click',async()=>{
  const file=fileInput.files?.[0];if(!currentUser||!canManage())return;
  if(!file){uploadStatus.textContent='Choose an image or video first.';return;}
  const mediaType=file.type.startsWith('video/')?'video':file.type.startsWith('image/')?'image':'';
  if(!mediaType){uploadStatus.textContent='Only image and video files are supported.';return;}
  const max=mediaType==='video'?100*1024*1024:12*1024*1024;
  if(file.size>max){uploadStatus.textContent=mediaType==='video'?'Videos are currently limited to 100 MB.':'Images are currently limited to 12 MB.';return;}
  const button=document.getElementById('upload-media');button.disabled=true;progress.hidden=false;progressBar.style.width='0%';uploadStatus.textContent='Connecting to Firebase Storage…';
  const storagePath=`profile-media/${ownerId}/${Date.now()}-${safeName(file.name)}`;
  let task=null;
  try{
    task=uploadBytesResumable(ref(storage,storagePath),file,{contentType:file.type,customMetadata:{ownerId}});
    const snapshot=await new Promise((resolve,reject)=>{
      let lastBytes=0,idleTimer;
      const stopTimer=()=>clearTimeout(idleTimer);
      const restartTimer=()=>{stopTimer();idleTimer=setTimeout(()=>{task.cancel();const error=new Error('Storage upload timed out before any data could be transferred.');error.code='storage/setup-required';reject(error);},15000);};
      restartTimer();
      task.on('state_changed',s=>{progressBar.style.width=`${Math.round((s.bytesTransferred/s.totalBytes)*100)}%`;uploadStatus.textContent=s.bytesTransferred>0?'Uploading…':'Connecting to Firebase Storage…';if(s.bytesTransferred!==lastBytes){lastBytes=s.bytesTransferred;restartTimer();}},error=>{stopTimer();reject(error);},()=>{stopTimer();resolve(task.snapshot);});
    });
    const downloadUrl=await getDownloadURL(snapshot.ref);
    await addDoc(collection(db,'media'),{ownerId,ownerName:profile.displayName||currentUser.displayName||'BANDtroductions Member',mediaType,downloadUrl,storagePath,fileName:file.name,contentType:file.type,sizeBytes:file.size,caption:captionInput.value.trim(),published:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    fileInput.value='';captionInput.value='';uploadStatus.textContent='Uploaded to your Media Library.';
  }catch(error){
    console.error(error);
    const setupNeeded=['storage/unauthorized','storage/unknown','storage/setup-required','storage/canceled'].includes(error.code);
    uploadStatus.textContent=setupNeeded?'Firebase Storage is not active yet, or its Storage rules still need to be published. No file was uploaded.':'The upload could not be completed.';
    progressBar.style.width='0%';progress.hidden=true;
  }finally{button.disabled=false;}
});

onAuthStateChanged(auth,async user=>{
  currentUser=user;currentUserIsAdmin=await checkAdmin(user);ownerId=requestedOwner||user?.uid||'';
  if(!ownerId){location.href='login.html';return;}
  document.getElementById('back-profile').href=`profile.html?id=${encodeURIComponent(ownerId)}`;
  try{const snap=await getDoc(doc(db,'profiles',ownerId));profile=snap.exists()?snap.data():{};document.getElementById('media-title').textContent=`${profile.displayName||'Profile'} Media`;}
  catch(error){console.error(error);}
  uploadCard.hidden=!canManage();
  const q=query(collection(db,'media'),where('ownerId','==',ownerId),orderBy('createdAt','desc'));
  onSnapshot(q,snapshot=>{items=snapshot.docs.map(d=>({id:d.id,...d.data()}));render();},error=>{console.error(error);pageStatus.hidden=false;pageStatus.textContent=error.code==='permission-denied'?'Media-library Firestore rules are not enabled yet.':'The media library could not be loaded.';});
});