import './profile-media-editor.js?v=2';
import { createWelcomePost } from './welcome-profile-post.js?v=1';
import { sendAdminApprovalEmail } from './admin-approval-email.js?v=3';
import { auth, db, storage } from './firebase-dev.js';
import { onAuthStateChanged, updateProfile } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getDownloadURL, ref, uploadBytes } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';

const params=new URLSearchParams(location.search);
if(!params.has('adminProfile')){
  const form=document.getElementById('profile-form'),status=document.getElementById('setup-status'),saveButton=document.getElementById('save-button'),bannerFile=document.getElementById('banner-image-file'),avatarFile=document.getElementById('image-file');
  let currentUser=null,accountType='fan',existingProfile=null,targetProfileId='';
  const value=id=>document.getElementById(id)?.value.trim()||'';
  const normalizeUrl=raw=>{const url=(raw||'').trim();if(!url)return '';return /^https?:\/\//i.test(url)?url:`https://${url}`};
  const safeName=name=>String(name||'image').replace(/[^a-z0-9._-]+/gi,'-').replace(/-+/g,'-');
  async function upload(file,kind){if(!file)return '';if(!file.type.startsWith('image/'))throw new Error(`${kind} must be an image file.`);if(file.size>12*1024*1024)throw new Error(`${kind} must be smaller than 12 MB.`);const path=`profile-media/${currentUser.uid}/${kind}-${Date.now()}-${safeName(file.name)}`;const uploadPromise=uploadBytes(ref(storage,path),file,{contentType:file.type,customMetadata:{ownerId:currentUser.uid,profileImageType:kind}});const timeoutPromise=new Promise((_,reject)=>setTimeout(()=>reject(new Error(`${kind} upload timed out. Please try again.`)),30000));const snapshot=await Promise.race([uploadPromise,timeoutPromise]);return getDownloadURL(snapshot.ref)}

  onAuthStateChanged(auth,async user=>{currentUser=user;if(!user)return;try{targetProfileId=params.get('id')||user.uid;const [userSnap,profileSnap]=await Promise.all([getDoc(doc(db,'users',user.uid)),getDoc(doc(db,'profiles',targetProfileId))]);existingProfile=profileSnap.exists()?profileSnap.data():null;if(existingProfile?.ownerId&&existingProfile.ownerId!==user.uid){status.textContent='You do not have permission to edit this profile.';if(form)form.hidden=true;return}accountType=existingProfile?.accountType||(userSnap.exists()?(userSnap.data().accountType||'fan'):'fan')}catch(error){console.error('Could not load profile status:',error)}});

  form?.addEventListener('submit',async event=>{event.preventDefault();event.stopImmediatePropagation();if(!currentUser||!targetProfileId)return;saveButton.disabled=true;status.textContent='Saving your profile…';try{let bannerImageUrl=value('banner-image-url')||existingProfile?.bannerImageUrl||existingProfile?.coverImageUrl||'';let imageUrl=value('image-url')||existingProfile?.imageUrl||existingProfile?.avatarUrl||currentUser.photoURL||'';if(bannerFile.files?.[0]){status.textContent='Uploading optimized banner…';bannerImageUrl=await upload(bannerFile.files[0],'banner')}if(avatarFile.files?.[0]){status.textContent='Uploading optimized avatar…';imageUrl=await upload(avatarFile.files[0],'avatar')}
    const needsApproval=accountType!=='fan';
    const wasApproved=existingProfile?.approvalStatus==='approved'&&existingProfile?.published===true;
    const approvalStatus=needsApproval&&!wasApproved?'pending':'approved';
    const published=needsApproval&&!wasApproved?false:true;
    const profileData={ownerId:existingProfile?.ownerId||currentUser.uid,accountType,displayName:value('display-name'),location:value('location'),bannerImageUrl,imageUrl,bio:value('bio'),musicType:value('music-type'),featuredMusicType:value('featured-music-type'),genre:value('genre'),yearFormed:value('year-formed'),members:value('members'),bookingEmail:value('booking-email'),instruments:value('instruments'),experience:value('experience'),lookingForBand:value('looking-for-band'),capacity:value('capacity'),venueType:value('venue-type'),venueBooking:value('venue-booking'),profileEmoji:value('profile-emoji'),favoriteGenres:value('favorite-genres'),fanInterests:value('fan-interests'),website:normalizeUrl(value('website')),mediaLink:normalizeUrl(value('media-link')),approvalStatus,published,submittedAt:existingProfile?.submittedAt||serverTimestamp(),updatedAt:serverTimestamp()};
    await setDoc(doc(db,'profiles',targetProfileId),profileData,{merge:true});
    await updateDoc(doc(db,'users',currentUser.uid),{displayName:profileData.displayName,profileComplete:true,updatedAt:serverTimestamp()});
    await updateProfile(currentUser,{displayName:profileData.displayName,photoURL:imageUrl||currentUser.photoURL||null});
    if(needsApproval&&!wasApproved){
      await sendAdminApprovalEmail({kind:'profile',name:profileData.displayName||'New profile',accountType,submittedBy:currentUser.email||'',details:'Profile saved and waiting in the Control Room approval queue.'});
      location.href='profile-pending.html';
      return;
    }
    if(!existingProfile?.welcomePostCreated){await createWelcomePost({profileId:targetProfileId,displayName:profileData.displayName,accountType})}
    location.href=`profile.html?id=${encodeURIComponent(targetProfileId)}&fresh=${Date.now()}`
  }catch(error){console.error(error);status.textContent=error.message||'Your profile could not be saved.';saveButton.disabled=false}},{capture:true});
}
