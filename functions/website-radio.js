// Public website player: read-only, approved tracks only, no submission/contact fields.
const { getFirestore } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');

function safeUrl(value) {
  try { const u=new URL(value); return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:''; } catch { return ''; }
}
function linkedProfile(track) {
  if(track.websiteProfileId)return track.websiteProfileId;
  try { const u=new URL(track.profileUrl);return ['bandtroductions.com','www.bandtroductions.com'].includes(u.hostname)?u.searchParams.get('id'):''; } catch { return ''; }
}
function publicTrack(id,track,profileId) {
  if(track.approved!==true||linkedProfile(track)!==profileId||!safeUrl(track.audioUrl))return null;
  return {
    id, title:String(track.title||'Untitled').slice(0,200),
    artist:String(track.artist||'').slice(0,200), album:String(track.album||'').slice(0,200),
    audioUrl:safeUrl(track.audioUrl), coverUrl:safeUrl(track.coverUrl),
    durationSeconds:Number.isFinite(Number(track.durationSeconds))?Math.max(0,Number(track.durationSeconds)):0,
    dateAdded:Number(track.dateAdded||track.approvedAt)||0
  };
}
exports.publicTrack=publicTrack;
exports.getWebsiteRadioTracks=onCall({region:'us-central1',maxInstances:5},async request=>{
  const profileId=request.data?.profileId;
  if(typeof profileId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(profileId))throw new HttpsError('invalid-argument','A valid profile is required.');
  const db=getFirestore(),profile=await db.collection('profiles').doc(profileId).get();
  if(!profile.exists||profile.data().published!==true)throw new HttpsError('not-found','This website is not available.');
  const urls=['https://bandtroductions.com/','https://www.bandtroductions.com/'].map(base=>base+'profile.html?id='+encodeURIComponent(profileId));
  const library=db.collection('radioApprovedTracks');
  const snapshots=await Promise.all([
    library.where('websiteProfileId','==',profileId).limit(250).get(),
    library.where('profileUrl','in',urls).limit(250).get()
  ]);
  const tracks=new Map();
  for(const snapshot of snapshots)for(const doc of snapshot.docs){const item=publicTrack(doc.id,doc.data(),profileId);if(item)tracks.set(item.id,item);}
  return {tracks:[...tracks.values()].sort((a,b)=>a.dateAdded-b.dateAdded)};
});
