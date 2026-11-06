import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { doc, onSnapshot, setDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';
import { isAdminAccount } from './admin-access.js';

const DEFAULT={active:true,sponsorName:'New Leaf Painting Co.',clickUrl:'https://newleafpaintingco.com',videoUrl:'/assets/ads/new-leaf-ad.mp4',audioUrl:'/assets/ads/new-leaf-ad.m4a',durationSeconds:18};
const PREVIEW=/pages\.dev$|grok\.bot$|vercel\.app$|--.*\.web\.app$/.test(location.hostname)||new URLSearchParams(location.search).has('adPreview');
const host=document.getElementById('cr-radio-body');
if(host){
const panel=document.createElement('section');
panel.className='crr-panel';panel.id='between-show-ad-manager';
panel.style.cssText='border:1px solid #315650;border-radius:14px;background:#0b0e0e;padding:14px;margin-bottom:12px;color:#eee';
panel.innerHTML=`<h3 style="color:#0ccfbd;margin:0 0 5px">Between-Show Advertisement</h3>
<p style="color:#aab;margin:0 0 12px;font-size:.85rem">Manage the video or image and separate radio audio. Does not modify playlists or the station switch.</p>
<form id="bt-ad-form" style="display:grid;gap:10px">
<label>Sponsor name<input name="sponsorName" maxlength="100" required></label>
<label>Website link<input name="clickUrl" type="url" required placeholder="https://example.com"></label>
<label>Visual <select name="visualType"><option value="video">Muted video</option><option value="image" disabled>Static image (pending player support)</option></select></label>
<label>Replacement video or image<input name="visual" type="file" accept="video/mp4,image/jpeg,image/png,image/webp"></label>
<label>Replacement audio<input name="audio" type="file" accept="audio/mp4,audio/x-m4a,audio/m4a,audio/mpeg"></label>
<label>Ad duration (seconds, max 60)<input name="durationSeconds" type="number" min="1" max="60" step="1" required></label>
<label style="display:flex;align-items:center;gap:8px"><input name="active" type="checkbox" style="width:auto"> Enable between-show ad</label>
<div id="bt-ad-preview" style="border:1px solid #315650;padding:10px;border-radius:10px"><div id="bt-ad-visual"></div><audio id="bt-ad-audio" controls preload="metadata" style="width:100%"></audio></div>
<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" id="bt-ad-preview-button" class="crr-btn">Preview selected media</button><button type="submit" id="bt-ad-save" class="crr-btn primary">Save advertisement</button></div>
<p id="bt-ad-status" role="status" aria-live="polite" style="color:#aab;font-size:.85rem"></p></form>`;
host.parentElement.append(panel);
const form=panel.querySelector('form'),status=panel.querySelector('#bt-ad-status'),visual=panel.querySelector('#bt-ad-visual'),audio=panel.querySelector('#bt-ad-audio');
panel.querySelectorAll('input,select').forEach(el=>{el.style.maxWidth='100%';if(el.type!=='checkbox'&&el.type!=='file')el.style.cssText='display:block;box-sizing:border-box;width:100%;padding:10px;margin-top:4px;border-radius:8px;background:#101717;color:white;border:1px solid #456';});
let current={...DEFAULT},unsub=()=>{},objectUrls=[];
function revoke(){objectUrls.forEach(u=>URL.revokeObjectURL(u));objectUrls=[];}
function mediaUrl(file,fallback){if(!file)return fallback;const url=URL.createObjectURL(file);objectUrls.push(url);return url;}
function fill(c){current={...DEFAULT,...c};form.elements.sponsorName.value=current.sponsorName||'';form.elements.clickUrl.value=current.clickUrl||'';form.elements.durationSeconds.value=current.durationSeconds||18;form.elements.active.checked=current.active===true;form.elements.visualType.value=current.posterUrl&&!current.videoUrl?'image':'video';showPreview();}
function showPreview(){revoke();visual.replaceChildren();const vf=form.elements.visual.files[0],af=form.elements.audio.files[0];const src=mediaUrl(vf,current.videoUrl||current.posterUrl);const image=(vf&&vf.type.startsWith('image/'))||(!vf&&!current.videoUrl);if(src){const el=document.createElement(image?'img':'video');el.src=src;el.style.cssText='display:block;width:100%;max-height:240px;object-fit:contain;background:black;margin-bottom:8px';if(!image){el.muted=true;el.controls=true;el.playsInline=true;}visual.append(el);}audio.src=mediaUrl(af,current.audioUrl||'');}
panel.querySelector('#bt-ad-preview-button').onclick=showPreview;
const metadata=file=>new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),el=document.createElement(file.type.startsWith('video/')?'video':'audio');el.preload='metadata';el.onloadedmetadata=()=>{const n=el.duration;URL.revokeObjectURL(url);resolve(n);};el.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Cannot read media duration'));};el.src=url;});
onAuthStateChanged(auth,user=>{unsub();if(!isAdminAccount(user)){panel.hidden=true;return;}panel.hidden=false;unsub=onSnapshot(doc(db,'radioPlaylists','__stationControl'),s=>fill(s.data()?.sponsorBreak||DEFAULT),e=>status.textContent='Unable to load ad settings: '+e.message);});
if(PREVIEW){status.textContent='Preview mode: uploads and saving are disabled to protect the live station.';panel.querySelector('#bt-ad-save').disabled=true;}
form.onsubmit=async e=>{e.preventDefault();if(PREVIEW)return;const user=auth.currentUser;if(!isAdminAccount(user)||!user.emailVerified){status.textContent='Verified administrator sign-in required.';return;}const vf=form.elements.visual.files[0],af=form.elements.audio.files[0];const type=form.elements.visualType.value;
if(vf&&!(type==='image'?/^image\/(jpeg|png|webp)$/.test(vf.type):vf.type==='video/mp4')){status.textContent='Visual type does not match selected file.';return;}
if(af&&!['audio/mp4','audio/x-m4a','audio/m4a','audio/mpeg'].includes(af.type)){status.textContent='Audio must be MP3 or M4A.';return;}
if(vf&&vf.size>40*1024*1024||af&&af.size>15*1024*1024){status.textContent='Max file sizes: video 40 MB, audio 15 MB.';return;}
const duration=Number(form.elements.durationSeconds.value);if(!Number.isInteger(duration)||duration<1||duration>60){status.textContent='Duration must be 1–60 seconds.';return;}
try{if(vf&&vf.type==='video/mp4'&&(await metadata(vf))>duration+1)throw Error('Video exceeds configured duration.');if(af&&(await metadata(af))>duration+1)throw Error('Audio exceeds configured duration.');
const button=panel.querySelector('#bt-ad-save');button.disabled=true;status.textContent='Uploading and saving…';
const next={...current,sponsorName:form.elements.sponsorName.value.trim(),clickUrl:form.elements.clickUrl.value.trim(),durationSeconds:duration,active:form.elements.active.checked};
if(!/^https:\/\//i.test(next.clickUrl))throw Error('Sponsor link must use HTTPS.');
const storage=getStorage();async function upload(file){const name=Date.now()+'-'+Math.random().toString(36).slice(2)+'-'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path='between-show-ads/'+user.uid+'/'+name;const reference=ref(storage,path);await uploadBytes(reference,file,{contentType:file.type});return getDownloadURL(reference);}
if(vf){const url=await upload(vf);if(type==='image'){next.posterUrl=url;next.videoUrl='';}else{next.videoUrl=url;next.posterUrl='';}}
if(af)next.audioUrl=await upload(af);
if(!next.videoUrl&&!next.posterUrl)throw Error('Select a video or image.');
await setDoc(doc(db,'radioPlaylists','__stationControl'),{sponsorBreak:next,type:'stationControl',updatedAt:Date.now()},{merge:true});
status.textContent='Saved. New settings will be picked up by connected players; check the next eligible break.';
}catch(err){status.textContent='Not saved: '+err.message;}finally{panel.querySelector('#bt-ad-save').disabled=PREVIEW;}}
}
