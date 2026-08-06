import { auth, db, storage } from './firebase-dev.js';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getDownloadURL, ref, uploadBytesResumable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';

let currentUser=auth.currentUser||null;
auth.onAuthStateChanged?.(user=>{currentUser=user||null;});

const MB=1024*1024;
const cleanName=name=>String(name||'upload').replace(/[^a-z0-9._-]+/gi,'-').slice(-100);
const safeUrl=value=>{const t=String(value||'').trim();return t?( /^https?:\/\//i.test(t)?t:`https://${t}`):'';};

function setStatus(composer,text){const el=composer?.querySelector('#dash-compose-status');if(el)el.textContent=text||'';}
function bytesLabel(bytes){return bytes>=MB?`${(bytes/MB).toFixed(1)} MB`:`${Math.max(1,Math.round(bytes/1024))} KB`;}

async function loadImage(file){
  if('createImageBitmap' in window){try{return await createImageBitmap(file,{imageOrientation:'from-image'});}catch{}}
  return await new Promise((resolve,reject)=>{const img=new Image();const url=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=e=>{URL.revokeObjectURL(url);reject(e)};img.src=url;});
}

async function compressImage(file){
  if(file.type==='image/gif')return {blob:file,fileName:file.name,contentType:file.type,compressed:false};
  const image=await loadImage(file);
  const iw=image.width||image.naturalWidth,ih=image.height||image.naturalHeight;
  const maxSide=1600,scale=Math.min(1,maxSide/Math.max(iw,ih));
  const w=Math.max(1,Math.round(iw*scale)),h=Math.max(1,Math.round(ih*scale));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{alpha:false});ctx.drawImage(image,0,0,w,h);
  image.close?.();
  const makeBlob=(type,quality)=>new Promise(resolve=>canvas.toBlob(resolve,type,quality));
  let blob=await makeBlob('image/webp',.82);
  let type='image/webp',ext='webp';
  if(!blob){blob=await makeBlob('image/jpeg',.84);type='image/jpeg';ext='jpg';}
  if(!blob||blob.size>=file.size*.96)return {blob:file,fileName:file.name,contentType:file.type,compressed:false};
  const base=cleanName(file.name).replace(/\.[^.]+$/,'')||'image';
  return {blob,fileName:`${base}.${ext}`,contentType:type,compressed:true};
}

function supportedRecorderType(){
  if(!window.MediaRecorder)return'';
  return ['video/mp4;codecs=h264,aac','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported?.(t))||'';
}

async function compressVideo(file,composer){
  // Small phone videos are already hardware-compressed; avoid a second lossy encode.
  if(file.size<=15*MB)return {blob:file,fileName:file.name,contentType:file.type,compressed:false};
  const mime=supportedRecorderType();
  if(!mime||!HTMLCanvasElement.prototype.captureStream)return {blob:file,fileName:file.name,contentType:file.type,compressed:false};
  const video=document.createElement('video');video.playsInline=true;video.preload='auto';video.src=URL.createObjectURL(file);
  await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=reject;});
  if(!Number.isFinite(video.duration)||video.duration<=0){URL.revokeObjectURL(video.src);return {blob:file,fileName:file.name,contentType:file.type,compressed:false};}
  const maxW=720,maxH=720;const scale=Math.min(1,maxW/video.videoWidth,maxH/video.videoHeight);
  const width=Math.max(2,Math.round(video.videoWidth*scale/2)*2),height=Math.max(2,Math.round(video.videoHeight*scale/2)*2);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
  const visual=canvas.captureStream(24);let audioContext=null,source=null,destination=null;
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(AC){audioContext=new AC();source=audioContext.createMediaElementSource(video);destination=audioContext.createMediaStreamDestination();source.connect(destination);await audioContext.resume();destination.stream.getAudioTracks().forEach(t=>visual.addTrack(t));}
  }catch(error){console.warn('Video audio compression path unavailable.',error);}
  const recorder=new MediaRecorder(visual,{mimeType:mime,videoBitsPerSecond:1200000,audioBitsPerSecond:96000});
  const chunks=[];recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
  const done=new Promise((resolve,reject)=>{recorder.onerror=e=>reject(e.error||e);recorder.onstop=resolve;});
  let drawing=true;const draw=()=>{if(!drawing)return;try{ctx.drawImage(video,0,0,width,height);}catch{}requestAnimationFrame(draw)};
  video.onended=()=>{drawing=false;if(recorder.state!=='inactive')recorder.stop();};
  setStatus(composer,`Compressing video to 720p… this takes about the length of the clip.`);
  recorder.start(1000);draw();
  try{await video.play();await done;}catch(error){drawing=false;try{recorder.stop();}catch{}URL.revokeObjectURL(video.src);audioContext?.close?.();throw error;}
  URL.revokeObjectURL(video.src);audioContext?.close?.();
  const blob=new Blob(chunks,{type:mime.split(';')[0]});
  if(!blob.size||blob.size>=file.size*.96)return {blob:file,fileName:file.name,contentType:file.type,compressed:false};
  const ext=mime.startsWith('video/mp4')?'mp4':'webm';const base=cleanName(file.name).replace(/\.[^.]+$/,'')||'video';
  return {blob,fileName:`${base}-compressed.${ext}`,contentType:mime.split(';')[0],compressed:true};
}

async function uploadMedia(file,mediaType,composer){
  if(!currentUser)throw new Error('not-signed-in');
  if(mediaType==='image'&&file.size>20*MB)throw new Error('image-too-large');
  if(mediaType==='video'&&file.size>250*MB)throw new Error('video-too-large');
  let prepared;
  if(mediaType==='image'){
    setStatus(composer,'Compressing image…');prepared=await compressImage(file);
  }else{
    try{prepared=await compressVideo(file,composer);}catch(error){console.warn('Video compression failed; using original file.',error);prepared={blob:file,fileName:file.name,contentType:file.type,compressed:false};}
    if(!prepared.compressed&&prepared.blob.size>100*MB)throw new Error('video-needs-compression');
  }
  const path=`profile-media/${currentUser.uid}/${Date.now()}-${cleanName(prepared.fileName)}`;
  const storageRef=ref(storage,path);
  const task=uploadBytesResumable(storageRef,prepared.blob,{contentType:prepared.contentType,customMetadata:{ownerId:currentUser.uid,source:'dashboard-post'}});
  const snap=await new Promise((resolve,reject)=>task.on('state_changed',s=>{const pct=Math.round((s.bytesTransferred/s.totalBytes)*100);setStatus(composer,`${prepared.compressed?'Compressed. ':''}Uploading ${mediaType}… ${pct}%`);},reject,()=>resolve(task.snapshot)));
  const downloadUrl=await getDownloadURL(snap.ref);
  let profile={};try{const p=await getDoc(doc(db,'profiles',currentUser.uid));if(p.exists())profile=p.data();}catch{}
  await addDoc(collection(db,'media'),{ownerId:currentUser.uid,ownerName:profile.displayName||profile.name||currentUser.displayName||'BANDtroductions Member',mediaType,downloadUrl,storagePath:path,fileName:prepared.fileName,contentType:prepared.contentType,sizeBytes:prepared.blob.size,originalSizeBytes:file.size,compressed:prepared.compressed,published:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  return {downloadUrl,prepared};
}

function addUploadUI(composer){
  if(!composer||composer.dataset.uploadEnhanced==='true')return;
  composer.dataset.uploadEnhanced='true';
  const imageField=composer.querySelector('#dash-image-field'),videoField=composer.querySelector('#dash-video-field');
  if(imageField){imageField.innerHTML=`<label style="display:block;font-size:11px;font-weight:900;color:var(--teal);margin-bottom:5px">UPLOAD IMAGE</label><input id="dash-image-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif"><div id="dash-image-preview" class="dash-upload-preview"></div><div style="font-size:9px;color:#8f9999;margin-top:5px">Photos are resized/compressed before upload. GIFs stay animated.</div>`;}
  if(videoField){videoField.innerHTML=`<label style="display:block;font-size:11px;font-weight:900;color:var(--teal);margin-bottom:5px">UPLOAD VIDEO</label><input id="dash-video-file" type="file" accept="video/mp4,video/quicktime,video/webm,video/*"><div id="dash-video-preview" class="dash-upload-preview"></div><div style="font-size:9px;color:#8f9999;margin-top:5px">Larger clips are compressed toward 720p before upload when your browser supports it.</div>`;}
  const style=document.createElement('style');style.textContent=`.dash-upload-preview{margin-top:7px}.dash-upload-preview img,.dash-upload-preview video{display:block;width:100%;max-height:260px;object-fit:contain;background:#060707;border:1px solid #355;border-radius:6px}@media(max-width:650px){.dash-upload-preview img,.dash-upload-preview video{max-height:150px}#dash-image-field label,#dash-video-field label{font-size:6px!important}#dash-image-field div,#dash-video-field div{font-size:5px!important}}`;document.head.appendChild(style);
  const bindPreview=(input,box,type)=>input?.addEventListener('change',()=>{box.replaceChildren();const f=input.files?.[0];if(!f)return;const media=document.createElement(type==='video'?'video':'img');media.src=URL.createObjectURL(f);if(type==='video'){media.controls=true;media.preload='metadata'}media.onload=media.onloadedmetadata=()=>URL.revokeObjectURL(media.src);box.appendChild(media);setStatus(composer,`${type==='video'?'Video':'Image'} selected: ${bytesLabel(f.size)}`);});
  bindPreview(composer.querySelector('#dash-image-file'),composer.querySelector('#dash-image-preview'),'image');
  bindPreview(composer.querySelector('#dash-video-file'),composer.querySelector('#dash-video-preview'),'video');

  const publish=composer.querySelector('#dash-publish-post');
  publish?.addEventListener('click',async event=>{
    event.preventDefault();event.stopImmediatePropagation();
    if(!currentUser){location.href='login.html?returnTo=index.html';return;}
    const text=composer.querySelector('#dash-post-text')?.value.trim()||'';
    const mode=composer.querySelector('.dash-compose-tab.is-active')?.dataset.mode||'text';
    const imageFile=composer.querySelector('#dash-image-file')?.files?.[0]||null;
    const videoFile=composer.querySelector('#dash-video-file')?.files?.[0]||null;
    if(!text&&mode==='text'){setStatus(composer,'Write something first.');return;}
    if(mode==='image'&&!imageFile&&!text){setStatus(composer,'Choose an image or add a comment first.');return;}
    if(mode==='video'&&!videoFile&&!text){setStatus(composer,'Choose a video or add a comment first.');return;}
    publish.disabled=true;
    try{
      let imageUrl='',videoUrl='';
      if(mode==='image'&&imageFile){const result=await uploadMedia(imageFile,'image',composer);imageUrl=result.downloadUrl;}
      if(mode==='video'&&videoFile){const result=await uploadMedia(videoFile,'video',composer);videoUrl=result.downloadUrl;}
      let profile={};try{const p=await getDoc(doc(db,'profiles',currentUser.uid));if(p.exists())profile=p.data();else{const u=await getDoc(doc(db,'users',currentUser.uid));if(u.exists())profile=u.data();}}catch{}
      setStatus(composer,'Publishing…');
      await addDoc(collection(db,'posts'),{authorId:currentUser.uid,authorName:profile.displayName||profile.name||profile.bandName||profile.venueName||currentUser.displayName||'BANDtroductions Member',accountType:profile.accountType||profile.profileType||'member',category:mode==='text'?'general':mode,content:text,imageUrl,videoUrl,published:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
      composer.querySelector('#dash-post-text').value='';
      const img=composer.querySelector('#dash-image-file');if(img)img.value='';const vid=composer.querySelector('#dash-video-file');if(vid)vid.value='';
      composer.querySelectorAll('.dash-upload-preview').forEach(x=>x.replaceChildren());
      setStatus(composer,'Posted.');setTimeout(()=>{composer.classList.remove('is-open');setStatus(composer,'');},700);
    }catch(error){console.error(error);const code=error?.code||error?.message||'';if(code==='image-too-large')setStatus(composer,'That image is over 20 MB. Choose a smaller image.');else if(code==='video-too-large')setStatus(composer,'That video is over 250 MB. Choose a shorter clip.');else if(code==='video-needs-compression')setStatus(composer,'This browser could not compress that video enough. Choose a clip under 100 MB.');else if(String(code).startsWith('storage/'))setStatus(composer,'Media upload is blocked by Firebase Storage rules.');else if(code==='permission-denied')setStatus(composer,'Post/media permissions blocked this upload.');else setStatus(composer,'Upload/post failed. Try again.');}
    finally{publish.disabled=false;}
  },true);
}

function upgradeUploadedVideos(){
  document.querySelectorAll('.feed a').forEach(a=>{
    if(a.textContent.trim()!=='WATCH VIDEO →'||a.dataset.upgradedVideo==='true')return;
    const href=a.href||'';if(!/firebasestorage\.googleapis\.com|\.mp4(?:\?|$)|\.webm(?:\?|$)|\.mov(?:\?|$)/i.test(href))return;
    const video=document.createElement('video');video.src=href;video.controls=true;video.playsInline=true;video.preload='metadata';video.style.cssText='display:block;width:100%;max-height:420px;margin-top:10px;background:#000;border:1px solid #333';a.dataset.upgradedVideo='true';a.replaceWith(video);
  });
}

const observer=new MutationObserver(()=>{addUploadUI(document.getElementById('dashboard-composer'));upgradeUploadedVideos();});
observer.observe(document.documentElement,{subtree:true,childList:true});
addUploadUI(document.getElementById('dashboard-composer'));upgradeUploadedVideos();
