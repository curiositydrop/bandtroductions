import { seedVenomousPilotMedia, installVenomousPilotPlayer, installVenomousPilotEditorHints } from './venomous-pilot-media.js?v=2';

// Public website reads only. Uses existing Firestore rules; no credentials or writes.
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
function withPilotMedia(snapshot,profileId){
 if(!snapshot?.exists?.())return snapshot;
 const original=snapshot.data();
 const profile=seedVenomousPilotMedia(original,profileId);
 installVenomousPilotPlayer(profileId);
 installVenomousPilotEditorHints(profileId);
 if(profile===original)return snapshot;
 return {...snapshot,exists:()=>true,data:()=>profile};
}
export async function loadWebsiteProfile(read,{sdkTimeout=4500,fetchTimeout=12000,profileId,fetcher=fetch}={}){
 try{return withPilotMedia(await deadline(Promise.resolve().then(read),sdkTimeout),profileId);}
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
   const profile=fields(document.fields);
   // Never render unpublished profiles through the public fallback.
   if(profile.published!==true)return {exists:()=>false};
   const seeded=seedVenomousPilotMedia(profile,profileId);
   installVenomousPilotPlayer(profileId);
   installVenomousPilotEditorHints(profileId);
   return {exists:()=>true,data:()=>seeded};
  }finally{clearTimeout(timer);controller.abort();}
 }
}
