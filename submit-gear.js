import { auth, db, storage } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getDownloadURL, ref, uploadBytesResumable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';

const form=document.getElementById('gear-form'),authNote=document.getElementById('gear-auth-note'),submit=document.getElementById('gear-submit'),status=document.getElementById('gear-submit-status'),photo=document.getElementById('gear-photo'),photoName=document.getElementById('gear-photo-name'),preview=document.getElementById('gear-photo-preview');
let currentUser=null,currentProfile={};
const val=id=>document.getElementById(id)?.value.trim()||'';
const cleanFile=value=>String(value||'gear-photo').replace(/[^a-z0-9._-]+/gi,'-').slice(-100);
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(value||0));
const normalizeUrl=value=>{const text=String(value||'').trim();return !text?'':(/^https?:\/\//i.test(text)?text:`https://${text}`)};
function authorName(){return currentProfile.displayName||currentProfile.name||currentProfile.bandName||currentProfile.venueName||currentUser?.displayName||'BANDtroductions Member';}
function selectedTier(){return form.querySelector('input[name="tier"]:checked')?.value||'standard';}
function syncTier(){submit.textContent=selectedTier()==='featured'?'PUBLISH & CONTINUE TO $5 FEATURE':'PUBLISH FREE LISTING';}
form.querySelectorAll('input[name="tier"]').forEach(input=>input.addEventListener('change',syncTier));
if(new URLSearchParams(location.search).get('tier')==='featured'){form.querySelector('input[value="featured"]').checked=true;syncTier();}

photo.addEventListener('change',()=>{const file=photo.files?.[0];if(!file){photoName.textContent='JPG, PNG, WEBP or GIF';preview.hidden=true;return}photoName.textContent=file.name;preview.src=URL.createObjectURL(file);preview.hidden=false;});
async function resolveProfile(user){const direct=await getDoc(doc(db,'profiles',user.uid));if(direct.exists())return{id:direct.id,...direct.data()};const owned=await getDocs(query(collection(db,'profiles'),where('ownerId','==',user.uid)));if(!owned.empty)return{id:owned.docs[0].id,...owned.docs[0].data()};const account=await getDoc(doc(db,'users',user.uid));return account.exists()?account.data():{};}
function uploadPhoto(file,listingId){return new Promise((resolve,reject)=>{const path=`users/${currentUser.uid}/gear-listings/${listingId}-${Date.now()}-${cleanFile(file.name)}`;const task=uploadBytesResumable(ref(storage,path),file,{contentType:file.type,customMetadata:{ownerId:currentUser.uid,listingId}});task.on('state_changed',snapshot=>{const percent=Math.round(snapshot.bytesTransferred/snapshot.totalBytes*100);status.textContent=`Uploading photo… ${percent}%`;},reject,async()=>resolve({imageUrl:await getDownloadURL(task.snapshot.ref),storagePath:path}));});}

form.addEventListener('submit',async event=>{
  event.preventDefault();if(!currentUser)return;const file=photo.files?.[0];if(!file)return;
  if(!file.type.startsWith('image/')||file.size>20*1024*1024){status.textContent='Choose an image smaller than 20 MB.';return;}
  submit.disabled=true;status.textContent='Preparing your listing…';const tier=selectedTier();const listingRef=doc(collection(db,'gearListings'));
  try{
    const uploaded=await uploadPhoto(file,listingRef.id);const expires=new Date();expires.setDate(expires.getDate()+30);
    const listing={sellerId:currentUser.uid,sellerProfileId:currentProfile.id||currentUser.uid,sellerName:authorName(),title:val('gear-title'),category:val('gear-category-input'),condition:val('gear-condition-input'),price:Number(val('gear-price')),saleType:val('gear-sale-type'),city:val('gear-city'),state:val('gear-state'),description:val('gear-description'),pickupNotes:val('gear-pickup'),videoUrl:normalizeUrl(val('gear-video')),imageUrl:uploaded.imageUrl,storagePath:uploaded.storagePath,status:'active',published:true,featured:false,premiumRequested:tier==='featured',expiresAt:Timestamp.fromDate(expires),createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
    await setDoc(listingRef,listing);status.textContent='Sharing your listing with the Community…';
    let communityPostId='';
    try{const postRef=await addDoc(collection(db,'posts'),{authorId:currentUser.uid,authorName:authorName(),accountType:currentProfile.accountType||currentProfile.profileType||'member',category:'gear',postTitle:listing.title,content:`🎸 NEW GEAR LISTING\n${listing.title} — ${money(listing.price)}\n${listing.city}, ${listing.state} · ${listing.condition}\nView the listing or message the seller on BANDtroductions.`,imageUrl:listing.imageUrl,linkUrl:`gear-detail.html?id=${encodeURIComponent(listingRef.id)}`,gearListingId:listingRef.id,gearStatus:'active',published:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});communityPostId=postRef.id;await updateDoc(listingRef,{communityPostId});}catch(error){console.warn('Listing published; Community share unavailable.',error);}
    sessionStorage.setItem('newGearListing',listingRef.id);location.href=tier==='featured'?`gear-payment.html?listing=${encodeURIComponent(listingRef.id)}`:`gear-detail.html?id=${encodeURIComponent(listingRef.id)}&created=1`;
  }catch(error){console.error(error);status.textContent=error?.code?.startsWith('storage/')?'Photo upload was blocked. Check Gear Exchange storage permissions.':error?.code==='permission-denied'?'Gear Exchange database permissions need to be enabled.':'The listing could not be published. Please try again.';submit.disabled=false;}
});

onAuthStateChanged(auth,async user=>{currentUser=user;if(!user){authNote.innerHTML=`You must be signed in to list gear. <a href="login.html?returnTo=${encodeURIComponent('submit-gear.html'+location.search)}">Log in or create an account →</a>`;form.hidden=true;return}authNote.textContent='Loading your seller profile…';try{currentProfile=await resolveProfile(user);authNote.textContent=`Listing as ${authorName()}`;form.hidden=false;}catch(error){console.error(error);authNote.textContent='Your profile could not be loaded. Please refresh and try again.';}});
