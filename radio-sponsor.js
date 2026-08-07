import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getDatabase, ref as dbRef, push } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';
import { sendAdminApprovalEmail } from './admin-approval-email.js?v=3';

const firebaseConfig={
  apiKey:'AIzaSyApLiiJsKTw1Fp8J3aQatMqiSZoP_6EycE',
  authDomain:'bandfanwall.firebaseapp.com',
  databaseURL:'https://bandfanwall-default-rtdb.firebaseio.com',
  projectId:'bandfanwall',
  storageBucket:'bandfanwall.firebasestorage.app',
  messagingSenderId:'619241154826',
  appId:'1:619241154826:web:25ddc58eef094e3c0732f3'
};

const app=getApps().find(a=>a.options?.projectId===firebaseConfig.projectId)||initializeApp(firebaseConfig,'radio-sponsor-form');
const db=getDatabase(app);
const storage=getStorage(app);

const form=document.getElementById('radioSponsorForm');
const button=document.getElementById('submitButton');
const message=document.getElementById('submitMessage');

const setMessage=(text,ok=false)=>{message.textContent=text;message.style.color=ok?'#00c8b4':'#ff7777'};
const slugify=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'sponsor';

function getAudioDuration(file){
  return new Promise((resolve,reject)=>{
    const audio=document.createElement('audio');
    const url=URL.createObjectURL(file);
    audio.preload='metadata';
    audio.onloadedmetadata=()=>{const duration=audio.duration;URL.revokeObjectURL(url);resolve(duration)};
    audio.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Could not read audio duration'))};
    audio.src=url;
  });
}

form.addEventListener('submit',async event=>{
  event.preventDefault();

  const businessName=document.getElementById('businessName').value.trim();
  const contactName=document.getElementById('contactName').value.trim();
  const contactEmail=document.getElementById('contactEmail').value.trim();
  const phone=document.getElementById('phone').value.trim();
  const website=document.getElementById('website').value.trim();
  const notes=document.getElementById('notes').value.trim();
  const logoFile=document.getElementById('logoFile').files?.[0];
  const audioFile=document.getElementById('audioFile').files?.[0];
  const assetPermission=document.getElementById('assetPermission').checked;
  const reviewAcknowledgment=document.getElementById('reviewAcknowledgment').checked;

  if(!logoFile||!audioFile||!assetPermission||!reviewAcknowledgment){setMessage('Please complete all required fields, uploads, and permissions.');return}

  const logoAllowed=['image/jpeg','image/png','image/webp'].includes(logoFile.type)||/\.(jpe?g|png|webp)$/i.test(logoFile.name);
  if(!logoAllowed){setMessage('Logo must be a JPG, PNG, or WebP image.');return}
  if(logoFile.size>10*1024*1024){setMessage('Logo must be 10 MB or smaller.');return}

  const audioAllowed=['audio/mpeg','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav'].includes(audioFile.type)||/\.(mp3|m4a|wav)$/i.test(audioFile.name);
  if(!audioAllowed){setMessage('Audio spot must be MP3, M4A, or WAV.');return}
  if(audioFile.size>15*1024*1024){setMessage('Audio spot must be 15 MB or smaller.');return}

  let duration;
  try{duration=await getAudioDuration(audioFile)}catch(error){console.error(error);setMessage('We could not read the audio clip. Please try another file.');return}
  if(duration<20||duration>30.5){setMessage(`Your audio spot is ${Math.round(duration)} seconds. Please submit a clip between 20 and 30 seconds.`);return}

  button.disabled=true;
  setMessage('Uploading your sponsor materials…',true);

  try{
    const base=`${Date.now()}-${slugify(businessName)}`;
    const logoExt=(logoFile.name.split('.').pop()||'png').toLowerCase();
    const audioExt=(audioFile.name.split('.').pop()||'mp3').toLowerCase();
    const logoPath=`radio-sponsor-submissions/${base}-logo.${logoExt}`;
    const audioPath=`radio-sponsor-submissions/${base}-spot.${audioExt}`;

    const logoRef=storageRef(storage,logoPath);
    const audioRef=storageRef(storage,audioPath);
    await uploadBytes(logoRef,logoFile,{contentType:logoFile.type||'image/png'});
    await uploadBytes(audioRef,audioFile,{contentType:audioFile.type||'audio/mpeg'});
    const [logoUrl,audioUrl]=await Promise.all([getDownloadURL(logoRef),getDownloadURL(audioRef)]);

    const submission={
      businessName,contactName,contactEmail,phone,website,notes,
      logoUrl,logoStoragePath:logoPath,originalLogoFileName:logoFile.name,
      audioUrl,audioStoragePath:audioPath,originalAudioFileName:audioFile.name,audioDurationSeconds:Math.round(duration*10)/10,
      assetPermission,reviewAcknowledgment,approved:false,status:'pending',submittedAt:Date.now()
    };

    await push(dbRef(db,'RadioSponsorSubmissions'),submission);

    sendAdminApprovalEmail({
      kind:'radio-sponsor',
      name:businessName,
      submittedBy:contactEmail,
      details:`Radio sponsor request from ${contactName}. Audio: ${Math.round(duration)} seconds. Website: ${website}`
    }).catch(()=>{});

    form.reset();
    setMessage('Thank you! We received your BANDtroductions Radio sponsorship request. We’ll review your materials and contact you before any sponsorship placement begins.',true);
  }catch(error){
    console.error('Radio sponsor submission failed',error);
    if(String(error?.code||'').includes('storage/unauthorized')){
      setMessage('Your form is ready, but file uploads are currently blocked by storage permissions. Please contact BANDtroductions and we’ll get your sponsor materials submitted.');
    }else{
      setMessage('Something went wrong while submitting your sponsor request. Please try again.');
    }
  }finally{button.disabled=false}
});
