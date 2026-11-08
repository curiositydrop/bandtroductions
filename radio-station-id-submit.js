import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {collection,addDoc,doc,getDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import {ref,uploadBytes} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';
import {auth,db,storage} from './firebase-dev.js';
const form=document.getElementById('stationSubmitForm'),gate=document.getElementById('memberGate'),status=document.getElementById('stationStatus'),send=document.getElementById('stationSend');
let user=null;
const preview=/(?:\\.pages\\.dev|\\.vercel\\.app|--[a-z0-9-]+\\.web\\.app)$/i.test(location.hostname)||new URLSearchParams(location.search).has('radioPreview');
const allowedTypes={mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',aac:'audio/aac'};
function duration(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),audio=new Audio();const clean=()=>URL.revokeObjectURL(url);audio.onloadedmetadata=()=>{const d=audio.duration;clean();Number.isFinite(d)&&d>0?resolve(d):reject(Error('Audio duration could not be read'))};audio.onerror=()=>{clean();reject(Error('Cannot read this audio file'))};audio.src=url;});}
onAuthStateChanged(auth,async u=>{
 if(preview){gate.textContent='Read-only preview: Station ID uploads are disabled.';return;}
 user=null;form.classList.add('hidden');
 if(!u){gate.innerHTML='Please <a href="login.html?returnTo=radio-station-id-submit.html">log in</a> or <a href="signup.html?returnTo=radio-station-id-submit.html">create a free account</a>.';return;}
 try{const member=await getDoc(doc(db,'users',u.uid));if(!member.exists()){gate.textContent='Complete your BANDtroductions account before submitting.';return;}
 user=u;document.getElementById('personName').value=member.data().displayName||u.displayName||'';
 document.getElementById('bandName').value=member.data().bandName||member.data().displayName||'';
 gate.textContent='Signed in. Your song eligibility will be verified during admin review.';form.classList.remove('hidden');
 }catch(e){gate.textContent='Could not verify your account and approved radio song. Please try again.';console.error(e);}
});
form.addEventListener('submit',async e=>{
 e.preventDefault();if(preview||!user)return;
 const name=document.getElementById('personName').value.trim(),band=document.getElementById('bandName').value.trim(),title=document.getElementById('stationTitle').value.trim(),file=document.getElementById('stationAudio').files[0];
 if(!name||!band||!title||!file||!document.getElementById('stationRights').checked){status.textContent='Complete all fields and the permission checkbox.';return;}
 const ext=file.name.split('.').pop().toLowerCase();
 if(!allowedTypes[ext]||file.size===0||file.size>25*1024*1024){status.textContent='Choose an MP3, M4A, WAV or AAC file under 25 MB.';return;}
 let seconds;try{seconds=await duration(file);}catch(err){status.textContent=err.message;return;}
 if(seconds>60){status.textContent='Station IDs must be 60 seconds or shorter.';return;}
 send.disabled=true;status.textContent='Uploading for review…';
 try{const uid=user.uid,nonce=Date.now()+'-'+Math.random().toString(36).slice(2,10);
 const path='station-id-submissions/'+uid+'/station-id-'+nonce+'.'+ext;
 await uploadBytes(ref(storage,path),file,{contentType:allowedTypes[ext]});
 await addDoc(collection(db,'radioStationIdSubmissions'),{submittedByUid:uid,personName:name,artist:band,title:title==='Station ID'?'Station ID - '+name+' - '+band:title,customTitle:title,durationSeconds:Math.round(seconds*100)/100,audioStoragePath:path,status:'pending',submittedAt:serverTimestamp()});
 form.reset();status.textContent='Station ID submitted! It will appear in the admin approval queue.';document.getElementById('stationTitle').value='Station ID';
 }catch(err){console.error(err);status.textContent='Submission not completed: '+err.message;}finally{send.disabled=false;}
});
