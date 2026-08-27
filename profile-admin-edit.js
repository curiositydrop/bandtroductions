import { auth, db, storage } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { doc, getDoc, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getDownloadURL, ref, uploadBytes } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';
import { isAdminAccount } from './admin-access.js';

const targetId=new URLSearchParams(location.search).get('adminProfile');
if(!targetId)throw new Error('Admin profile editor loaded without a target profile.');

const form=document.getElementById('profile-form');
const title=document.getElementById('page-title');
const message=document.getElementById('setup-message');
const status=document.getElementById('setup-status');
const saveButton=document.getElementById('save-button');
const bannerFile=document.getElementById('banner-image-file');
const avatarFile=document.getElementById('image-file');
let adminUser=null;
let targetProfile=null;
let existingBannerImageUrl='';
let existingImageUrl='';

const value=id=>document.getElementById(id)?.value.trim()||'';
const normalizeUrl=raw=>{const url=(raw||'').trim();if(!url)return '';return /^https?:\/\//i.test(url)?url:`https://${url}`;};
const safeName=name=>String(name||'image').replace(/[^a-z0-9._-]+/gi,'-').replace(/-+/g,'-');

function showFields(type){
  document.querySelectorAll('.account-fields').forEach(section=>section.hidden=true);
  const section=document.getElementById(`${type}-fields`);
  if(section)section.hidden=false;
  const emoji=document.getElementById('fan-emoji-editor');
  if(emoji)emoji.hidden=type!=='fan';
}

function setPreview(id,url,fallback){
  const element=document.getElementById(id);
  if(!element)return;
  element.replaceChildren();
  if(!url){element.textContent=fallback;return;}
  const image=document.createElement('img');image.src=url;image.alt='Profile image preview';element.appendChild(image);
}

function fillProfile(data){
  const ids=['display-name','location','bio','music-type','featured-music-type','genre','year-formed','members','booking-email','instruments','experience','looking-for-band','capacity','venue-type','venue-booking','profile-emoji','favorite-genres','fan-interests','website','media-link'];
  ids.forEach(id=>{
    const element=document.getElementById(id);if(!element)return;
    const key=id.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
    if(data[key]!==undefined&&data[key]!==null)element.value=data[key];
  });
  existingBannerImageUrl=data.bannerImageUrl||data.coverImageUrl||data.bannerUrl||'';
  existingImageUrl=data.imageUrl||data.avatarUrl||data.photoURL||'';
  const bannerUrlField=document.getElementById('banner-image-url');
  const avatarUrlField=document.getElementById('image-url');
  if(bannerUrlField)bannerUrlField.value=existingBannerImageUrl;
  if(avatarUrlField)avatarUrlField.value=existingImageUrl;
  setPreview('banner-preview',existingBannerImageUrl,'No banner selected');
  setPreview('avatar-preview',existingImageUrl,'Initials will appear');
  document.getElementById('profile-emoji')?.dispatchEvent(new Event('change'));
  document.getElementById('bio')?.dispatchEvent(new Event('input'));
}

function withTimeout(promise,milliseconds,label){
  return Promise.race([
    promise,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error(`${label} timed out. Please try the image again.`)),milliseconds))
  ]);
}

async function uploadImage(file,kind){
  if(!file)return '';
  if(!file.type.startsWith('image/'))throw new Error(`${kind} must be an image file.`);
  if(file.size>=8*1024*1024)throw new Error(`${kind} must be smaller than 8 MB.`);
  if(!adminUser?.uid)throw new Error('Your login session could not be verified.');
  const filename=`${kind.toLowerCase()}-${Date.now()}-${safeName(file.name)}`;
  const path=`users/${adminUser.uid}/profile-media/${filename}`;
  const uploadPromise=uploadBytes(ref(storage,path),file,{contentType:file.type,customMetadata:{ownerId:adminUser.uid,targetProfileId:targetId,profileImageType:kind.toLowerCase()}});
  const snapshot=await withTimeout(uploadPromise,30000,`${kind} upload`);
  return withTimeout(getDownloadURL(snapshot.ref),15000,`${kind} URL`);
}

onAuthStateChanged(auth,async user=>{
  adminUser=user;
  if(!user){location.href='login.html';return;}
  if(!isAdminAccount(user)){status.textContent='Administrator access is required.';form.hidden=true;return;}
  try{
    const snapshot=await getDoc(doc(db,'profiles',targetId));
    if(!snapshot.exists()){status.textContent='That profile no longer exists.';form.hidden=true;return;}
    targetProfile=snapshot.data();
    const name=targetProfile.displayName||'this member';
    title.textContent=`Admin Edit: ${name}`;
    message.textContent=`You are editing ${name}'s ${targetProfile.accountType||'member'} profile. Changes save to their profile, not yours.`;
    document.title=`Admin Edit ${name} | BANDtroductions`;
    showFields(targetProfile.accountType||'fan');
    fillProfile(targetProfile);
    const security=document.querySelector('.account-tools');if(security)security.hidden=true;
    saveButton.textContent='Save Admin Changes';
    form.hidden=false;status.textContent='';
  }catch(error){console.error(error);status.textContent='The selected profile could not be loaded.';}
});

form.addEventListener('submit',async event=>{
  event.preventDefault();
  event.stopImmediatePropagation();
  if(!adminUser||!targetProfile||!isAdminAccount(adminUser))return;
  saveButton.disabled=true;status.textContent='Saving admin changes…';
  try{
    let bannerImageUrl=existingBannerImageUrl||value('banner-image-url');
    let imageUrl=existingImageUrl||value('image-url');
    if(bannerFile.files?.[0]){status.textContent='Uploading banner image…';bannerImageUrl=await uploadImage(bannerFile.files[0],'Banner');}
    if(avatarFile.files?.[0]){status.textContent='Uploading avatar image…';imageUrl=await uploadImage(avatarFile.files[0],'Avatar');}
    existingBannerImageUrl=bannerImageUrl;
    existingImageUrl=imageUrl;
    const accountType=targetProfile.accountType||'fan';
    const profileData={
      ownerId:targetProfile.ownerId||targetId,
      accountType,
      displayName:value('display-name'),location:value('location'),
      bannerImageUrl,coverImageUrl:bannerImageUrl,bannerUrl:bannerImageUrl,
      imageUrl,avatarUrl:imageUrl,photoURL:imageUrl,
      bio:value('bio'),musicType:value('music-type')||targetProfile.musicType||'',featuredMusicType:value('featured-music-type')||targetProfile.featuredMusicType||'',genre:value('genre'),yearFormed:value('year-formed'),members:value('members'),bookingEmail:value('booking-email'),
      instruments:value('instruments'),experience:value('experience'),lookingForBand:value('looking-for-band'),
      capacity:value('capacity'),venueType:value('venue-type'),venueBooking:value('venue-booking'),profileEmoji:value('profile-emoji'),
      favoriteGenres:value('favorite-genres'),fanInterests:value('fan-interests'),website:normalizeUrl(value('website')),
      mediaLink:normalizeUrl(value('media-link')),published:targetProfile.published!==false,updatedAt:serverTimestamp(),
      moderatedAt:serverTimestamp(),moderatedBy:adminUser.uid
    };
    status.textContent='Writing image URLs to profile…';
    const profileRef=doc(db,'profiles',targetId);
    await setDoc(profileRef,profileData,{merge:true});
    status.textContent='Verifying saved images…';
    const verifiedSnapshot=await getDoc(profileRef);
    if(!verifiedSnapshot.exists())throw new Error('The profile disappeared during verification.');
    const verified=verifiedSnapshot.data();
    if(bannerImageUrl&&verified.bannerImageUrl!==bannerImageUrl)throw new Error('The banner uploaded, but its URL was not saved to the profile.');
    if(imageUrl&&verified.imageUrl!==imageUrl)throw new Error('The avatar uploaded, but its URL was not saved to the profile.');
    status.textContent='Images saved and verified.';
    setTimeout(()=>{location.href=`profile.html?id=${encodeURIComponent(targetId)}&fresh=${Date.now()}`;},400);
  }catch(error){
    console.error(error);
    status.textContent=error.message||'The profile could not be updated.';
    saveButton.disabled=false;
  }
},{capture:true});
