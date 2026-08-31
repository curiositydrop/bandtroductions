import { auth, db, storage } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getDownloadURL, ref, uploadBytesResumable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';
import { sendAdminApprovalEmail } from './admin-approval-email.js?v=3';

const gate=document.getElementById('memberGate');
const area=document.getElementById('submissionArea');
const form=document.getElementById('auditionForm');
const typeSelect=document.getElementById('submissionType');
const musicianType=document.getElementById('musicianType');
const bandType=document.getElementById('bandType');
const displayName=document.getElementById('displayName');
const profileType=document.getElementById('profileType');
const city=document.getElementById('city');
const state=document.getElementById('state');
const genre=document.getElementById('genre');
const role=document.getElementById('role');
const roleLabel=document.getElementById('roleLabel');
const lookingLabel=document.getElementById('lookingLabel');
const notes=document.getElementById('notes');
const videoFile=document.getElementById('videoFile');
const videoName=document.getElementById('videoName');
const videoSize=document.getElementById('videoSize');
const submitButton=document.getElementById('submitButton');
const status=document.getElementById('submitStatus');

let currentUser=null;
let currentProfile=null;
let currentProfileId='';
let canSubmitBandOpening=false;

const clean=v=>String(v||'').trim();
const safeName=name=>String(name||'video').replace(/[^a-z0-9._-]+/gi,'-').replace(/-+/g,'-').replace(/^-|-$/g,'')||'video';
const formatBytes=bytes=>bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1)} MB`:`${Math.ceil(bytes/1024)} KB`;

function splitLocation(raw){
  const parts=clean(raw).split(',').map(v=>v.trim()).filter(Boolean);
  return {city:parts[0]||'',state:parts[1]||''};
}
function setStatus(message,error=false){status.textContent=message;status.classList.toggle('error',error)}
function setType(type){
  if(type==='band'&&!canSubmitBandOpening){
    type='musician';
    setStatus('Band openings can only be submitted from a BANDtroductions Band profile.',true);
  }else if(status?.textContent?.includes('Band openings can only')){
    setStatus('');
  }
  typeSelect.value=type;
  musicianType.classList.toggle('active',type==='musician');
  bandType.classList.toggle('active',type==='band');
  roleLabel.firstChild.textContent=type==='band'?'Position Needed ':'Instrument / Vocals ';
  lookingLabel.firstChild.textContent=type==='band'?'Tell musicians what you are looking for ':'What are you looking for? ';
  notes.placeholder=type==='band'?'Style, influences, rehearsal expectations, goals, availability, etc.':'Availability, influences, goals, what kind of band you want to join, etc.';
}
async function findOwnedProfile(user){
  const direct=await getDoc(doc(db,'profiles',user.uid));
  if(direct.exists()&&(!direct.data().ownerId||direct.data().ownerId===user.uid))return {id:direct.id,data:direct.data()};
  const owned=await getDocs(query(collection(db,'profiles'),where('ownerId','==',user.uid)));
  if(owned.empty)return null;
  const preferred=owned.docs.find(d=>d.data().published===true)||owned.docs[0];
  return {id:preferred.id,data:preferred.data()};
}
function populate(profile){
  currentProfile=profile.data;currentProfileId=profile.id;
  displayName.value=clean(currentProfile.displayName||currentUser.displayName||'');
  profileType.value=clean(currentProfile.accountType||'Member');
  const loc=splitLocation(currentProfile.location);
  city.value=clean(currentProfile.city||currentProfile.town||loc.city);
  state.value=clean(currentProfile.state||loc.state);
  genre.value=clean(currentProfile.genre||currentProfile.style);
  const accountType=clean(currentProfile.accountType).toLowerCase();
  canSubmitBandOpening=accountType==='band';
  const bandOption=typeSelect.querySelector('option[value="band"]');
  if(bandOption)bandOption.disabled=!canSubmitBandOpening;
  bandType.disabled=!canSubmitBandOpening;
  bandType.setAttribute('aria-disabled',String(!canSubmitBandOpening));
  bandType.title=canSubmitBandOpening?'Submit a band opening':'Band openings require a Band profile';
  bandType.style.opacity=canSubmitBandOpening?'':'0.45';
  bandType.style.cursor=canSubmitBandOpening?'':'not-allowed';
  setType(canSubmitBandOpening?'band':'musician');
  gate.innerHTML=`<strong>Verified BANDtroductions member:</strong> ${displayName.value||currentUser.email}<br><span style="color:#9ca7a7">${canSubmitBandOpening?'You can submit either a personal musician audition or a band opening.':'You can submit a personal musician audition. Band openings require a Band profile.'}</span>`;
  area.hidden=false;
}

musicianType.addEventListener('click',()=>setType('musician'));
bandType.addEventListener('click',()=>{if(canSubmitBandOpening)setType('band');else setStatus('Band openings can only be submitted from a BANDtroductions Band profile.',true)});
typeSelect.addEventListener('change',()=>setType(typeSelect.value));
videoFile.addEventListener('change',()=>{const file=videoFile.files?.[0];videoName.textContent=file?file.name:'No video selected';videoSize.textContent=file?formatBytes(file.size):''});

onAuthStateChanged(auth,async user=>{
  currentUser=user;currentProfile=null;currentProfileId='';canSubmitBandOpening=false;area.hidden=true;
  if(!user){gate.innerHTML='<strong>Members only.</strong><br>You must be logged into BANDtroductions to post in the Audition Room.<div style="margin-top:10px"><a href="login.html?returnTo=submit-audition.html">Log in</a> · <a href="signup.html?returnTo=submit-audition.html">Create a free profile</a></div>';return}
  try{
    const userSnap=await getDoc(doc(db,'users',user.uid));
    if(!userSnap.exists()){gate.innerHTML='<strong>Your login is valid, but your BANDtroductions member record is incomplete.</strong><br>Please finish setting up your profile before submitting.';return}
    const profile=await findOwnedProfile(user);
    if(!profile){gate.innerHTML='<strong>No BANDtroductions profile was found for this account.</strong><br>Please complete your profile before using the Audition Room.';return}
    populate(profile);
  }catch(error){console.error(error);gate.textContent='We could not verify your member profile right now. Please refresh and try again.'}
});

form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!currentUser||!currentProfile||!currentProfileId){setStatus('A verified BANDtroductions profile is required.',true);return}
  const file=videoFile.files?.[0];
  if(!file){setStatus('Please choose a performance video.',true);return}
  if(!file.type.startsWith('video/')){setStatus('The audition upload must be a video file.',true);return}
  if(file.size>=150*1024*1024){setStatus('That video is over the 150 MB limit. Please choose a smaller clip.',true);return}
  const type=typeSelect.value;
  if(type==='band'&&!canSubmitBandOpening){setStatus('Band openings can only be submitted from a BANDtroductions Band profile.',true);setType('musician');return}
  if(type!=='musician'&&type!=='band'){setStatus('Please choose a valid Audition Room submission type.',true);return}
  submitButton.disabled=true;
  try{
    setStatus('Uploading your audition video…');
    const path=`auditions/${currentUser.uid}/${Date.now()}-${safeName(file.name)}`;
    const objectRef=ref(storage,path);
    const task=uploadBytesResumable(objectRef,file,{contentType:file.type,customMetadata:{ownerId:currentUser.uid,profileId:currentProfileId,submissionType:type}});
    await new Promise((resolve,reject)=>task.on('state_changed',snap=>{const pct=Math.round((snap.bytesTransferred/snap.totalBytes)*100);setStatus(`Uploading your audition video… ${pct}%`)},reject,resolve));
    const videoUrl=await getDownloadURL(objectRef);
    setStatus('Video uploaded. Creating your review submission…');
    const record={
      type,
      ownerId:currentUser.uid,
      submittedByUid:currentUser.uid,
      submittedByEmail:currentUser.email||'',
      profileId:currentProfileId,
      displayName:displayName.value.trim(),
      profileAccountType:currentProfile.accountType||'',
      imageUrl:currentProfile.imageUrl||currentProfile.avatarUrl||currentProfile.profileImage||'',
      city:city.value.trim(),
      state:state.value.trim(),
      genre:genre.value.trim(),
      role:role.value,
      notes:notes.value.trim(),
      videoUrl,
      videoStoragePath:path,
      videoContentType:file.type,
      originalVideoFileName:file.name,
      videoBytes:file.size,
      approved:false,
      published:false,
      reviewStatus:'pending',
      createdAt:serverTimestamp(),
      submittedAt:Date.now()
    };
    await addDoc(collection(db,'auditions'),record);
    await sendAdminApprovalEmail({kind:'audition',name:record.displayName,accountType:type,submittedBy:currentUser.email||'',details:`${type==='band'?'Looking for':'Auditioning as'} ${record.role}. Review in The Control Room.`});
    setStatus('Submitted! Your Audition Room listing is waiting for admin approval.');
    form.reset();populate({id:currentProfileId,data:currentProfile});videoName.textContent='No video selected';videoSize.textContent='';
  }catch(error){
    console.error('Audition submission failed:',error);
    const code=String(error?.code||'');
    if(code.includes('storage/unauthorized'))setStatus('The video upload is blocked by Firebase Storage permissions. The Audition Room storage rule still needs to be deployed.',true);
    else if(code.includes('permission-denied'))setStatus('Your video uploaded, but the Audition Room review collection is not allowed by the current Firestore rules yet.',true);
    else setStatus(error?.message||'The audition could not be submitted. Please try again.',true);
  }finally{submitButton.disabled=false}
});
