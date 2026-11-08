import {auth,db} from './firebase-dev.js';
import {collection,doc,onSnapshot,setDoc,deleteDoc,updateDoc} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import {getStorage,ref as storageRef,uploadBytes,getDownloadURL} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';
import {isAdminAccount} from './admin-access.js';
import {validateStationId} from './radio-station-id-tools.mjs';
const preview=/(?:\.pages\.dev|\.vercel\.app|--[a-z0-9-]+\.web\.app)$/i.test(location.hostname)||new URLSearchParams(location.search).has('radioPreview');
const host=document.getElementById('cr-radio-body');
if(host){
 const panel=document.createElement('section');panel.className='crr-panel';panel.id='radio-station-id-library';panel.style.cssText='border:1px solid #315650;border-radius:14px;background:#0b0e0e;padding:14px;margin:12px 0;color:#eee';
 panel.innerHTML='<h3 style="color:#0ccfbd">Station ID Library</h3><p class="crr-muted">Store approved musician introductions for placement between songs. Audio clips must be 60 seconds or shorter.</p><form id="radio-id-form" style="display:grid;gap:8px"><label>ID name<input name="title" maxlength="100" required></label><label>Band / musician<input name="artist" maxlength="100" required></label><label>Upload approved MP3, M4A, WAV or AAC (max 25 MB)<input name="audioFile" type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/aac,.mp3,.m4a,.wav,.aac"></label><label>Or existing approved audio URL<input name="audioUrl" type="url"></label><label>Clip duration in seconds<input name="durationSeconds" type="number" min="0.01" max="60" step="0.01" required></label><button type="submit" class="crr-btn primary">Save Station ID</button></form><p id="radio-id-status" role="status" aria-live="polite"></p><h4>Pending Station IDs</h4><div id="radio-id-pending"></div><h4>Approved Station IDs</h4><div id="radio-id-list"></div>';
 const heading=panel.querySelector('h3');
 const collapse=document.createElement('button');collapse.type='button';collapse.className='crr-btn';
 collapse.textContent='− Collapse';collapse.setAttribute('aria-expanded','true');
 heading.after(collapse);
 const body=document.createElement('div');body.id='radio-id-panel-content';
 while(collapse.nextSibling)body.append(collapse.nextSibling);
 panel.append(body);
 collapse.addEventListener('click',()=>{
   const expanded=body.hidden;body.hidden=!expanded;
   collapse.textContent=expanded?'− Collapse':'+ Expand';
   collapse.setAttribute('aria-expanded',String(expanded));
 });
 const attach=()=>{const root=host.querySelector('#crr');if(root&&panel.parentElement!==root)root.append(panel);};attach();new MutationObserver(attach).observe(host,{childList:true});
 const storage=getStorage();
 const form=panel.querySelector('form'),status=panel.querySelector('#radio-id-status'),list=panel.querySelector('#radio-id-list');let library={},pending={};
 function allowed(){const u=auth.currentUser;return !preview&&!!u&&isAdminAccount(u)&&(u.emailVerified||u.uid==='PJXufsvdCCgRpfKcLtxPH3jEQN83');}
 function audioDuration(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),audio=new Audio();audio.preload='metadata';const clean=()=>{audio.removeAttribute('src');URL.revokeObjectURL(url);};audio.onloadedmetadata=()=>{const n=audio.duration;clean();Number.isFinite(n)&&n>0?resolve(n):reject(Error('Unknown audio duration'));};audio.onerror=()=>{clean();reject(Error('Cannot read audio metadata'));};audio.src=url;});}
 form.elements.audioFile.addEventListener('change',async()=>{const file=form.elements.audioFile.files[0];if(!file)return;try{const duration=await audioDuration(file);form.elements.durationSeconds.value=duration.toFixed(2);status.textContent='Detected '+duration.toFixed(2)+' seconds.';}catch(e){status.textContent=e.message;}});
 function drawPending(){
  const root=panel.querySelector('#radio-id-pending');root.replaceChildren();
  if(!Object.keys(pending).length){root.textContent='No Station IDs waiting for approval.';return;}
  for(const [key,item] of Object.entries(pending)){
   const row=document.createElement('div');row.className='crr-card';row.style.marginTop='8px';
   const label=document.createElement('strong');label.textContent=item.title||'Station ID';row.append(label);
   const info=document.createElement('p');info.className='crr-muted';info.textContent=(item.customTitle||'Station ID')+' · '+(item.durationSeconds||'?')+' sec';row.append(info);
   const player=document.createElement('audio');player.controls=true;player.preload='none';player.style.width='100%';row.append(player);
   if(allowed()&&item.audioStoragePath){getDownloadURL(storageRef(storage,item.audioStoragePath)).then(url=>{if(row.isConnected)player.src=url;}).catch(()=>{info.textContent+=' · Audio unavailable';});}
   const approve=document.createElement('button');approve.className='crr-btn primary';approve.textContent='Approve';approve.disabled=!allowed();
   approve.onclick=async()=>{
    if(!allowed()||!confirm('Approve this Station ID?'))return;
    approve.disabled=true;
    try{
     const url=await getDownloadURL(storageRef(storage,item.audioStoragePath));
     const approved={title:item.title,artist:item.artist,audioUrl:url,durationSeconds:Number(item.durationSeconds),active:true,updatedAt:Date.now(),submittedByUid:item.submittedByUid};
     const check=validateStationId(approved);if(!check.ok)throw Error(check.reason);
     await setDoc(doc(db,'radioStationIds','member-'+key),approved);
     await deleteDoc(doc(db,'radioStationIdSubmissions',key));
     status.textContent='Station ID approved and added to the library.';
    }catch(e){status.textContent='Approval failed: '+e.message;approve.disabled=false;}
   };
   const reject=document.createElement('button');reject.className='crr-btn danger';reject.textContent='Reject';reject.disabled=!allowed();
   reject.onclick=async()=>{if(!allowed()||!confirm('Reject this Station ID?'))return;try{await updateDoc(doc(db,'radioStationIdSubmissions',key),{status:'rejected',reviewedAt:Date.now()});status.textContent='Station ID rejected.';}catch(e){status.textContent=e.message;}};
   row.append(approve,reject);root.append(row);
  }
 }
 function draw(){list.replaceChildren();for(const [key,item] of Object.entries(library)){const row=document.createElement('div');row.className='crr-card';row.style.marginTop='8px';const title=document.createElement('strong');title.textContent=(item.title||'Station ID')+' — '+(item.artist||'Unknown');row.append(title);const info=document.createElement('p');info.className='crr-muted';info.textContent=(item.durationSeconds||'?')+' sec';row.append(info);const play=document.createElement('audio');play.controls=true;play.preload='none';play.src=item.audioUrl||'';play.style.width='100%';row.append(play);const toggle=document.createElement('button');toggle.className='crr-btn';toggle.textContent=item.active===false?'Enable ID':'Disable ID';toggle.disabled=!allowed();toggle.onclick=async()=>{if(!allowed())return;try{await updateDoc(doc(db,'radioStationIds',key),{active:item.active===false,updatedAt:Date.now()});}catch(e){status.textContent=e.message;}};row.append(toggle);const add=document.createElement('button');add.className='crr-btn';add.textContent='Insert into playlist';add.disabled=item.active===false;add.onclick=()=>window.dispatchEvent(new CustomEvent('bandtroductions:insert-station-id',{detail:{...item,id:key,type:'stationId'}}));row.append(add);const del=document.createElement('button');del.className='crr-btn danger';del.textContent='Delete ID';del.disabled=!allowed();del.onclick=async()=>{if(!allowed())return;if(confirm('Delete this station ID from the library? Existing playlists are not changed.'))try{await deleteDoc(doc(db,'radioStationIds',key));}catch(e){status.textContent=e.message;}};row.append(del);list.append(row);}}
 form.addEventListener('submit',async e=>{e.preventDefault();if(!allowed()){status.textContent='Read-only preview or verified admin sign-in required.';return;}const file=form.elements.audioFile.files[0];if(file&&(!(/\.(mp3|m4a|wav|aac)$/i.test(file.name)&&['audio/mpeg','audio/mp4','audio/x-m4a','audio/m4a','audio/wav','audio/x-wav','audio/wave','audio/aac','audio/x-aac',''].includes(file.type))||file.size>25*1024*1024||file.size===0)){status.textContent='Upload a valid MP3, M4A, WAV or AAC smaller than 25 MB.';return;}const item={title:form.elements.title.value.trim(),artist:form.elements.artist.value.trim(),audioUrl:form.elements.audioUrl.value.trim(),durationSeconds:Number(form.elements.durationSeconds.value),active:true,updatedAt:Date.now()};if(file){try{item.durationSeconds=Number((await audioDuration(file)).toFixed(2));form.elements.durationSeconds.value=item.durationSeconds;}catch(e){status.textContent=e.message;return;}item.audioUrl='pending-upload';}const check=validateStationId(item);if(!check.ok||!item.title||!item.artist){status.textContent='Invalid ID: '+(check.reason||'missing name');return;}const key='id-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);try{if(file){status.textContent='Uploading approved station ID…';const ext=file.name.split('.').pop().toLowerCase();const contentTypes={mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',aac:'audio/aac'};const fileRef=storageRef(storage,'radio-admin/'+auth.currentUser.uid+'/station-id-'+key+'.'+ext);await uploadBytes(fileRef,file,{contentType:contentTypes[ext]});item.audioUrl=await getDownloadURL(fileRef);}await setDoc(doc(db,'radioStationIds',key),item);form.reset();status.textContent='Station ID saved.';}catch(err){status.textContent='Not saved: '+err.message;}});
 if(preview){form.querySelector('button[type="submit"]').disabled=true;status.textContent='Read-only preview: Station ID records are not loaded, and uploads or changes are disabled. The library needs its Firestore rule before live use.';}else{onSnapshot(collection(db,'radioStationIds'),snap=>{library={};snap.forEach(d=>library[d.id]=d.data());draw();},err=>{status.textContent='Library unavailable: '+err.message;});onSnapshot(collection(db,'radioStationIdSubmissions'),snap=>{pending={};snap.forEach(d=>{if(d.data().status==='pending')pending[d.id]=d.data();});drawPending();},err=>{status.textContent='Pending submissions unavailable: '+err.message;});}
}
