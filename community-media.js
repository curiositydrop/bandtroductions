import { auth, db, storage } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { addDoc, collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getDownloadURL, ref, uploadBytesResumable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';

const fields=document.getElementById('composer-fields');
const originalFile=document.getElementById('post-image');
const status=document.getElementById('composer-status');
let currentUser=null,profile=null,selectedMedia=null;
if(!fields) throw new Error('Community composer not found');

const wrap=document.createElement('section');
wrap.style.cssText='padding:12px;border:1px solid #333;border-radius:12px;background:#0d0d0d';
wrap.innerHTML=`<strong style="display:block;margin-bottom:8px">Add image or video</strong><div style="display:flex;gap:8px;flex-wrap:wrap"><button id="choose-media" class="auth-button auth-button-secondary" type="button">Choose from My Media</button><button id="upload-new-media" class="auth-button auth-button-secondary" type="button">Upload New</button></div><input id="community-media-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" hidden><div id="selected-media-preview" style="margin-top:10px" hidden></div><dialog id="media-picker" style="width:min(92vw,760px);max-height:80vh;background:#111;color:#fff;border:1px solid #444;border-radius:14px;padding:14px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><h2 style="margin:0">Choose from My Media</h2><button id="close-media-picker" class="auth-button auth-button-secondary" type="button">Close</button></div><div id="media-picker-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:12px"></div><p id="media-picker-status" class="auth-message"></p></dialog>`;
originalFile?.closest('label')?.replaceWith(wrap);
const picker=wrap.querySelector('#media-picker'),pickerGrid=wrap.querySelector('#media-picker-grid'),pickerStatus=wrap.querySelector('#media-picker-status'),fileInput=wrap.querySelector('#community-media-file'),preview=wrap.querySelector('#selected-media-preview');

function showSelected(item){
  selectedMedia=item;
  preview.hidden=false;
  preview.replaceChildren();
  const media=item.mediaType==='video'?document.createElement('video'):document.createElement('img');
  media.src=item.downloadUrl;
  media.style.cssText='width:100%;max-height:260px;object-fit:contain;border-radius:10px;background:#080808';
  if(item.mediaType==='video'){media.controls=true;media.preload='metadata'}
  const clear=document.createElement('button');
  clear.type='button';clear.className='auth-button auth-button-secondary';clear.textContent='Remove from Post';clear.style.marginTop='8px';
  clear.addEventListener('click',()=>{selectedMedia=null;preview.hidden=true;preview.replaceChildren()});
  preview.append(media,clear);
}

function addPickerItem(item){
  if(!item?.downloadUrl)return;
  const button=document.createElement('button');
  button.type='button';
  button.style.cssText='padding:0;border:1px solid #333;border-radius:10px;overflow:hidden;background:#080808;aspect-ratio:1/1';
  const media=item.mediaType==='video'?document.createElement('video'):document.createElement('img');
  media.src=item.downloadUrl;media.alt=item.caption||'';media.style.cssText='width:100%;height:100%;object-fit:cover';
  if(item.mediaType==='video'){media.muted=true;media.preload='metadata'}
  button.appendChild(media);
  button.addEventListener('click',()=>{showSelected(item);picker.close()});
  pickerGrid.appendChild(button);
}

async function loadPicker(){
  if(!currentUser)return;
  picker.showModal();pickerStatus.textContent='Loading your media…';pickerGrid.replaceChildren();
  const seen=new Set();
  try{
    const profileSnap=await getDoc(doc(db,'profiles',currentUser.uid));
    const profileItems=profileSnap.exists()&&Array.isArray(profileSnap.data().mediaItems)?profileSnap.data().mediaItems:[];
    profileItems.forEach((item,index)=>{
      if(item?.type!=='image'||!item.url||seen.has(item.url))return;
      seen.add(item.url);
      addPickerItem({id:`profile-${index}`,mediaType:'image',downloadUrl:item.url,caption:item.caption||'',source:'profile'});
    });
  }catch(error){console.error('Profile media could not be loaded:',error)}
  try{
    const q=query(collection(db,'media'),where('ownerId','==',currentUser.uid),orderBy('createdAt','desc'));
    const snap=await getDocs(q);
    snap.forEach(d=>{const item={id:d.id,...d.data()};if(!item.downloadUrl||seen.has(item.downloadUrl))return;seen.add(item.downloadUrl);addPickerItem(item)});
  }catch(error){console.error('Legacy media library could not be loaded:',error)}
  pickerStatus.textContent=pickerGrid.children.length?'':'Your Media Library is empty.';
}

wrap.querySelector('#choose-media').addEventListener('click',loadPicker);
wrap.querySelector('#upload-new-media').addEventListener('click',()=>fileInput.click());
wrap.querySelector('#close-media-picker').addEventListener('click',()=>picker.close());
fileInput.addEventListener('change',async()=>{
  const file=fileInput.files?.[0];if(!file||!currentUser)return;
  const mediaType=file.type.startsWith('video/')?'video':file.type.startsWith('image/')?'image':'';
  if(!mediaType){status.textContent='Only image and video files are supported.';return}
  const max=mediaType==='video'?100*1024*1024:12*1024*1024;
  if(file.size>max){status.textContent=mediaType==='video'?'Videos are limited to 100 MB.':'Images are limited to 12 MB.';return}
  status.textContent='Uploading to your Media Library…';
  const path=`profile-media/${currentUser.uid}/${Date.now()}-${file.name.replace(/[^a-z0-9._-]+/gi,'-')}`;
  try{
    const task=uploadBytesResumable(ref(storage,path),file,{contentType:file.type,customMetadata:{ownerId:currentUser.uid}});
    const snapshot=await new Promise((resolve,reject)=>task.on('state_changed',()=>{},reject,()=>resolve(task.snapshot)));
    const downloadUrl=await getDownloadURL(snapshot.ref);
    const mediaDoc=await addDoc(collection(db,'media'),{ownerId:currentUser.uid,ownerName:profile?.displayName||currentUser.displayName||'BANDtroductions Member',mediaType,downloadUrl,storagePath:path,fileName:file.name,contentType:file.type,sizeBytes:file.size,caption:'',published:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    showSelected({id:mediaDoc.id,mediaType,downloadUrl,storagePath:path,fileName:file.name});
    status.textContent='Uploaded and added to this post.';
  }catch(error){console.error(error);status.textContent=error.code?.startsWith('storage/')?'Firebase Storage is not active or its rules are not enabled yet.':'The upload could not be completed.'}
});

window.BANDCommunityMedia={
  getSelected:()=>selectedMedia,
  clear:()=>{selectedMedia=null;preview.hidden=true;preview.replaceChildren();fileInput.value=''}
};

onAuthStateChanged(auth,async user=>{
  currentUser=user;
  if(!user){profile=null;return}
  try{const snap=await getDoc(doc(db,'profiles',user.uid));profile=snap.exists()?snap.data():{}}catch(error){console.error(error);profile={}}
  const mediaId=new URLSearchParams(location.search).get('media');
  if(mediaId){try{const snap=await getDoc(doc(db,'media',mediaId));if(snap.exists()&&snap.data().ownerId===user.uid){showSelected({id:snap.id,...snap.data()});fields.hidden=false;document.getElementById('composer-toggle').setAttribute('aria-expanded','true');document.getElementById('composer-toggle').textContent='Close'}}catch(error){console.error(error)}}
});