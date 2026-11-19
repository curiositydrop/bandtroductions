import { seedVenomousPilotMedia, installVenomousPilotPlayer, installVenomousPilotEditorHints } from './venomous-pilot-media.js?v=3';
import { websiteMerchAccess } from './botw-comp-access.mjs?v=1';

// Public website reads only. Uses existing Firestore rules; no credentials or writes.
const VENOMOUS_PILOT_PROFILE='19MH0ZzVlPVN4ediF4PesZR5TY13';
function decode(value){
 if('nullValue' in value)return null;
 for(const key of ['stringValue','booleanValue','timestampValue','referenceValue'])if(key in value)return value[key];
 for(const key of ['integerValue','doubleValue'])if(key in value)return Number(value[key]);
 if(value.arrayValue)return (value.arrayValue.values||[]).map(decode);
 if(value.mapValue)return fields(value.mapValue.fields||{});
 return null;
}
function fields(input){return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,decode(v)]));}
function deadline(promise,ms){
 let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Profile connection timed out')),ms);})]).finally(()=>clearTimeout(timer));
}
function websiteAllowed(profile,profileId){
 if(!profile||profile.published!==true)return false;
 if(profileId===VENOMOUS_PILOT_PROFILE)return true;
 const access=websiteMerchAccess(profile,profile.botwComp);
 return access==='paid'||access==='comp';
}
async function readComp(profileId,fetcher){
 try{
  const response=await fetcher('https://firestore.googleapis.com/v1/projects/bandtroductions-dev/databases/(default)/documents/botwWebsiteComps/'+encodeURIComponent(profileId),{credentials:'omit',cache:'no-store'});
  if(!response.ok)return null;
  const document=await response.json();
  return document.fields?fields(document.fields):null;
 }catch{return null;}
}
function withComp(profile,comp){return comp?{...profile,botwComp:comp}:profile;}
function withPilotMedia(snapshot,profileId){
 if(!snapshot?.exists?.())return snapshot;
 const original=snapshot.data();
 const profile=seedVenomousPilotMedia(original,profileId);
 installVenomousPilotPlayer(profileId);
 installVenomousPilotEditorHints(profileId);
 if(profile===original)return snapshot;
 return {...snapshot,exists:()=>true,data:()=>profile};
}

// The merch editor is the same storefront manager used by the public Merch Hub,
// but when it is embedded inside an artist's website editor it should look like
// part of that editor — not like a second BANDtroductions page inside the site.
function cleanEmbeddedMerchFrame(frame){
 if(!frame)return;
 const apply=()=>{
  try{
   const doc=frame.contentDocument;
   if(!doc?.head)return;
   if(!doc.getElementById('bt-embedded-merch-style')){
    const style=doc.createElement('style');
    style.id='bt-embedded-merch-style';
    style.textContent=`
      .market-header,.platform-hero,#band-marketplace,#selected-store,.seller-intro,.market-disclaimer,footer{display:none!important}
      html,body{background:#0b100f!important}
      .merch-shell{width:100%!important;max-width:none!important;margin:0!important;padding:0!important}
      main{padding:0!important}
      #sell-merch{margin:0!important;padding:10px 8px 24px!important;border:0!important;background:transparent!important;box-shadow:none!important}
      #owner-panel{margin:0!important;padding:0!important;border-top:0!important}
      #owner-panel>h3{margin-top:0!important}
      .store-form,.product-editor{background:#090c0c!important}
    `;
    doc.head.appendChild(style);
   }
   frame.style.background='#0b100f';
  }catch(error){
   console.warn('Could not simplify embedded merch manager:',error);
  }
 };
 if(frame.dataset.btMerchClean!=='1'){
  frame.dataset.btMerchClean='1';
  frame.addEventListener('load',apply);
 }
 apply();
}
function watchEmbeddedMerchManager(){
 const scan=()=>document.querySelectorAll('.editor-merch-frame').forEach(cleanEmbeddedMerchFrame);
 scan();
 const observer=new MutationObserver(scan);
 observer.observe(document.documentElement,{childList:true,subtree:true});
 window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watchEmbeddedMerchManager,{once:true});
 else watchEmbeddedMerchManager();
}

export async function loadWebsiteProfile(read,{sdkTimeout=4500,fetchTimeout=12000,profileId,fetcher=fetch}={}){
 const compPromise=deadline(readComp(profileId,fetcher),sdkTimeout).catch(()=>null);
 try{
  const snapshot=await deadline(Promise.resolve().then(read),sdkTimeout);
  if(!snapshot?.exists?.())return snapshot;
  const profile=withComp(snapshot.data(),await compPromise);
  if(!websiteAllowed(profile,profileId))return {exists:()=>false};
  return withPilotMedia({...snapshot,exists:()=>true,data:()=>profile},profileId);
 }
 catch(error){
  if(error.code==='permission-denied'||error.code==='not-found')throw error;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),fetchTimeout);
  try{
   const response=await deadline(fetcher('https://firestore.googleapis.com/v1/projects/bandtroductions-dev/databases/(default)/documents/profiles/'+encodeURIComponent(profileId),{signal:controller.signal,credentials:'omit',cache:'no-store'}),fetchTimeout);
   if(response.status===404)return {exists:()=>false};
   if(!response.ok)throw new Error('The profile connection is unavailable. Please try again.');
   const document=await deadline(response.json(),fetchTimeout);
   if(!document.fields)throw new Error('The profile response was incomplete. Please try again.');
   const comp=await deadline(readComp(profileId,fetcher),fetchTimeout).catch(()=>null);
   const profile=withComp(fields(document.fields),comp);
   if(!websiteAllowed(profile,profileId))return {exists:()=>false};
   const seeded=seedVenomousPilotMedia(profile,profileId);
   installVenomousPilotPlayer(profileId);
   installVenomousPilotEditorHints(profileId);
   return {exists:()=>true,data:()=>seeded};
  }finally{clearTimeout(timer);controller.abort();}
 }
}
