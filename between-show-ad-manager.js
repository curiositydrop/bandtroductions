import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { doc, onSnapshot, setDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';
import { isAdminAccount } from './admin-access.js';

const DEFAULT={active:true,sponsorName:'New Leaf Painting Co.',clickUrl:'https://newleafpaintingco.com',videoUrl:'/assets/ads/new-leaf-ad.mp4',audioUrl:'/assets/ads/new-leaf-ad.m4a',durationSeconds:18};
const PREVIEW=/pages\.dev$|grok\.bot$|vercel\.app$|--.*\.web\.app$/.test(location.hostname)||new URLSearchParams(location.search).has('adPreview');
// Do not enable production publishing until Firestore and Storage authorization are verified.
const PUBLISH_ENABLED=false;
const host=document.getElementById('cr-radio-body');
if(host){
const panel=document.createElement('section');
panel.className='crr-panel';panel.id='between-show-ad-manager';
panel.style.cssText='border:1px solid #315650;border-radius:14px;background:#0b0e0e;padding:14px;margin-bottom:12px;color:#eee';
panel.innerHTML=`<h3 style="color:#0ccfbd;margin:0 0 5px">Between-Show Advertisement</h3>
<p style="color:#aab;margin:0 0 12px;font-size:.85rem">Manage the commercial video and separate radio audio. Does not modify playlists or the station switch.</p>
<form id="bt-ad-form" style="display:grid;gap:10px">
<label>Sponsor name<input name="sponsorName" maxlength="100" required></label>
<label>Website link<input name="clickUrl" type="url" required placeholder="https://example.com"></label>
<label>Visual <select name="visualType"><option value="video">Muted video</option><option value="image" disabled>Static image (pending player support)</option></select></label>
<label>Replacement MP4 commercial<input name="visual" type="file" accept="video/mp4,.mp4"></label>
<label>Optional separate audio (fallback)<input name="audio" type="file" accept="audio/mp4,audio/x-m4a,audio/m4a,audio/mpeg,audio/wav"></label>
<button type="button" id="bt-ad-extract" class="crr-btn">Extract audio from selected MP4</button>
<p class="crr-muted" style="margin:0">Automatic extraction happens on your device. If Safari cannot decode this MP4, use the separate audio option.</p>
<label>Ad duration (seconds, max 60)<input name="durationSeconds" type="number" min="1" max="60" step="1" required></label>
<label style="display:flex;align-items:center;gap:8px"><input name="active" type="checkbox" style="width:auto"> Enable between-show ad</label>
<div id="bt-ad-preview" style="border:1px solid #315650;padding:10px;border-radius:10px"><div id="bt-ad-visual"></div><audio id="bt-ad-audio" preload="metadata" style="display:none"></audio><button type="button" id="bt-ad-play" class="crr-btn" style="margin-top:8px;width:100%">▶ Play commercial preview</button><p class="crr-muted" style="margin:6px 0 0">One button plays the muted video and separate audio together. Preview only; no changes to the station.</p></div>
<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" id="bt-ad-preview-button" class="crr-btn">Preview selected media</button><button type="button" id="bt-ad-draft" class="crr-btn">Save Draft</button><button type="submit" id="bt-ad-save" class="crr-btn primary">Publish advertisement</button></div>
<p id="bt-ad-status" role="status" aria-live="polite" style="color:#aab;font-size:.85rem"></p></form>`;
// The existing Radio module replaces the body contents after admin authentication.
function placePanel(){const radio=host.querySelector('#crr');if(radio&&panel.parentElement!==radio)radio.append(panel);}
placePanel();
const placementObserver=new MutationObserver(placePanel);
placementObserver.observe(host,{childList:true});
const form=panel.querySelector('form'),status=panel.querySelector('#bt-ad-status'),visual=panel.querySelector('#bt-ad-visual'),audio=panel.querySelector('#bt-ad-audio');
panel.querySelectorAll('input,select').forEach(el=>{el.style.maxWidth='100%';if(el.type!=='checkbox'&&el.type!=='file')el.style.cssText='display:block;box-sizing:border-box;width:100%;padding:10px;margin-top:4px;border-radius:8px;background:#101717;color:white;border:1px solid #456';});
let current={...DEFAULT},unsub=()=>{},objectUrls=[],extractedAudio=null,dirty=false,extracting=false;
function revoke(){objectUrls.forEach(u=>URL.revokeObjectURL(u));objectUrls=[];}
function mediaUrl(file,fallback){if(!file)return fallback;const url=URL.createObjectURL(file);objectUrls.push(url);return url;}
function fill(c){current={...DEFAULT,...c};if(dirty)return;form.elements.sponsorName.value=current.sponsorName||'';form.elements.clickUrl.value=current.clickUrl||'';form.elements.durationSeconds.value=current.durationSeconds||18;form.elements.active.checked=current.active===true;form.elements.visualType.value=current.posterUrl&&!current.videoUrl?'image':'video';showPreview();}
function showPreview(){stopPreview();revoke();visual.replaceChildren();const vf=form.elements.visual.files[0],af=form.elements.audio.files[0]||extractedAudio;const src=mediaUrl(vf,current.videoUrl||current.posterUrl);const image=(vf&&vf.type.startsWith('image/'))||(!vf&&!current.videoUrl);if(src){const el=document.createElement(image?'img':'video');el.src=src;el.style.cssText='display:block;width:100%;max-height:240px;object-fit:contain;background:black;margin-bottom:8px';if(!image){el.muted=true;el.controls=false;el.playsInline=true;el.preload='metadata';}visual.append(el);}audio.src=mediaUrl(af,current.audioUrl||'');}
const playButton=panel.querySelector('#bt-ad-play');
let previewPlaying=false,previewToken=0;
function videoElement(){return visual.querySelector('video');}
function stopPreview(){
  previewToken++;previewPlaying=false;
  const video=videoElement();if(video){video.pause();try{video.currentTime=0;}catch{}}
  audio.pause();try{audio.currentTime=0;}catch{}
  playButton.textContent='▶ Play commercial preview';
}
playButton.onclick=()=>{
  const video=videoElement();
  if(previewPlaying){stopPreview();return;}
  if(!video){status.textContent='Choose a video to preview.';return;}
  const token=++previewToken;
  video.pause();audio.pause();
  try{video.currentTime=0;}catch{}
  try{audio.currentTime=0;}catch{}
  video.muted=true;video.playsInline=true;
  previewPlaying=true;playButton.textContent='■ Stop preview';
  // Both play() calls happen directly in this tap handler for iPhone Safari.
  const videoPlay=video.play();
  const audioPlay=audio.src?audio.play():Promise.resolve();
  Promise.all([videoPlay,audioPlay]).then(()=>{
    if(token!==previewToken)return;
    // Correct minor startup offset; keep the audio as the timing reference.
    if(audio.src&&Number.isFinite(audio.currentTime)&&Math.abs(video.currentTime-audio.currentTime)>0.25)
      try{video.currentTime=audio.currentTime;}catch{}
  }).catch(error=>{
    if(token!==previewToken)return;
    stopPreview();status.textContent='Preview could not start: '+error.message;
  });
};
audio.addEventListener('ended',()=>{if(previewPlaying)stopPreview();});
visual.addEventListener('ended',event=>{if(event.target.tagName==='VIDEO'&&previewPlaying)stopPreview();},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&previewPlaying)stopPreview();});
panel.querySelector('#bt-ad-preview-button').onclick=showPreview;
form.addEventListener('input',()=>{dirty=true;});
form.addEventListener('change',()=>{dirty=true;});
form.elements.visual.addEventListener('change',()=>{extractedAudio=null;showPreview();if(form.elements.visual.files[0]?.type==='video/mp4')extract();});
form.elements.audio.addEventListener('change',()=>{extractedAudio=null;showPreview();});
function encodeWav(buffer){
  const channels=Math.min(2,buffer.numberOfChannels),rate=buffer.sampleRate,frames=buffer.length;
  const bytes=44+frames*channels*2;
  if(bytes>15*1024*1024)throw Error('Extracted audio exceeds 15 MB. Use a smaller file or separate MP3/M4A.');
  const raw=new ArrayBuffer(bytes),v=new DataView(raw);
  const str=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
  str(0,'RIFF');v.setUint32(4,bytes-8,true);str(8,'WAVE');str(12,'fmt ');
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);
  v.setUint32(24,rate,true);v.setUint32(28,rate*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);
  str(36,'data');v.setUint32(40,bytes-44,true);
  const data=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));
  let at=44;for(let i=0;i<frames;i++)for(let ch=0;ch<channels;ch++){const n=Math.max(-1,Math.min(1,data[ch][i]));v.setInt16(at,n<0?n*32768:n*32767,true);at+=2;}
  return new File([raw],'extracted-radio-ad.wav',{type:'audio/wav'});
}
async function extract(){
  const file=form.elements.visual.files[0];
  if(!file||file.type!=='video/mp4'){status.textContent='Choose an MP4 commercial first.';return;}
  const button=panel.querySelector('#bt-ad-extract');button.disabled=true;extracting=true;status.textContent='Extracting audio locally…';
  let ctx;
  try{
    const AudioContextType=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextType)throw Error('This browser does not support local audio decoding.');
    ctx=new AudioContextType();
    const decoded=await ctx.decodeAudioData(await file.arrayBuffer());
    if(!decoded.length)throw Error('No audio track found.');
    extractedAudio=encodeWav(decoded);
    form.elements.audio.value='';
    showPreview();status.textContent='Audio extracted. Preview it, then publish when ready.';
  }catch(error){extractedAudio=null;status.textContent='Could not extract audio on this device: '+error.message+' Use a separate MP3/M4A audio file instead.';}
  finally{await ctx?.close().catch(()=>{});extracting=false;button.disabled=false;}
}
panel.querySelector('#bt-ad-extract').onclick=extract;
panel.querySelector('#bt-ad-draft').onclick=()=>{
  const draft={sponsorName:form.elements.sponsorName.value,clickUrl:form.elements.clickUrl.value,durationSeconds:form.elements.durationSeconds.value,active:form.elements.active.checked};
  sessionStorage.setItem('bt-radio-ad-draft',JSON.stringify(draft));
  status.textContent='Draft details saved in this browser tab. Media files must be reselected before publishing.';
};
function restoreDraft(){
  try{const draft=JSON.parse(sessionStorage.getItem('bt-radio-ad-draft')||'null');if(!draft)return;
    for(const key of ['sponsorName','clickUrl','durationSeconds'])if(typeof draft[key]==='string')form.elements[key].value=draft[key];
    if(typeof draft.active==='boolean')form.elements.active.checked=draft.active;
    dirty=true;status.textContent='Draft details restored. Choose media again before publishing.';
  }catch{}
}
const metadata=file=>new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),el=document.createElement(file.type.startsWith('video/')?'video':'audio');el.preload='metadata';el.onloadedmetadata=()=>{const n=el.duration;URL.revokeObjectURL(url);resolve(n);};el.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Cannot read media duration'));};el.src=url;});
onAuthStateChanged(auth,user=>{unsub();if(!isAdminAccount(user)){panel.hidden=true;return;}panel.hidden=false;unsub=onSnapshot(doc(db,'radioPlaylists','__stationControl'),s=>{fill(s.data()?.sponsorBreak||DEFAULT);if(!dirty)restoreDraft();},e=>status.textContent='Unable to load ad settings: '+e.message);});
if(PREVIEW){status.textContent='Preview mode: uploads and saving are disabled to protect the live station.';panel.querySelector('#bt-ad-save').disabled=true;}
form.onsubmit=async e=>{e.preventDefault();if(PREVIEW||!PUBLISH_ENABLED)return;if(extracting){status.textContent='Wait for audio extraction to finish.';return;}const user=auth.currentUser;if(!isAdminAccount(user)||!user.emailVerified){status.textContent='Verified administrator sign-in required.';return;}const vf=form.elements.visual.files[0],af=form.elements.audio.files[0]||extractedAudio;const type=form.elements.visualType.value;
if(vf&&!(type==='image'?/^image\/(jpeg|png|webp)$/.test(vf.type):vf.type==='video/mp4')){status.textContent='Visual type does not match selected file.';return;}
if(af&&!['audio/mp4','audio/x-m4a','audio/m4a','audio/mpeg','audio/wav'].includes(af.type)){status.textContent='Audio must be MP3, M4A, or extracted WAV.';return;}
if((vf&&vf.size>40*1024*1024)||(af&&af.size>15*1024*1024)){status.textContent='Max file sizes: video 40 MB, audio 15 MB.';return;}
const duration=Number(form.elements.durationSeconds.value);if(!Number.isInteger(duration)||duration<1||duration>60){status.textContent='Duration must be 1–60 seconds.';return;}
try{if(vf&&vf.type==='video/mp4'&&(await metadata(vf))>duration+1)throw Error('Video exceeds configured duration.');if(af&&(await metadata(af))>duration+1)throw Error('Audio exceeds configured duration.');
const button=panel.querySelector('#bt-ad-save');button.disabled=true;status.textContent='Uploading and saving…';
const next={...current,sponsorName:form.elements.sponsorName.value.trim(),clickUrl:form.elements.clickUrl.value.trim(),durationSeconds:duration,active:form.elements.active.checked};
if(!/^https:\/\//i.test(next.clickUrl))throw Error('Sponsor link must use HTTPS.');
const storage=getStorage();async function upload(file){const name=Date.now()+'-'+Math.random().toString(36).slice(2)+'-'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path='between-show-ads/'+user.uid+'/'+name;const reference=ref(storage,path);await uploadBytes(reference,file,{contentType:file.type});return getDownloadURL(reference);}
if(vf&&!af)throw Error('Extract audio first or select a separate audio file before publishing.');
if(vf){const url=await upload(vf);if(type==='image'){next.posterUrl=url;next.videoUrl='';}else{next.videoUrl=url;next.posterUrl='';}}
if(af)next.audioUrl=await upload(af);
if(!next.videoUrl&&!next.posterUrl)throw Error('Select a video or image.');
await setDoc(doc(db,'radioPlaylists','__stationControl'),{sponsorBreak:next,updatedAt:Date.now()},{merge:true});
form.elements.visual.value='';form.elements.audio.value='';extractedAudio=null;dirty=false;sessionStorage.removeItem('bt-radio-ad-draft');status.textContent='Published. New settings will be picked up by connected players; check the next eligible break.';showPreview();
}catch(err){status.textContent='Not saved: '+err.message;}finally{panel.querySelector('#bt-ad-save').disabled=PREVIEW;}}
}
