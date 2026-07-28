import { db } from './firebase-dev.js';
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const intro=document.querySelector('.community-intro');

async function countLegacyDirectoryProfiles(){
  const pages=['bands.html','musicians.html','venues.html'];
  const counts=await Promise.all(pages.map(async page=>{
    try{
      const response=await fetch(`${page}?profileCount=2`,{cache:'no-store'});
      if(!response.ok)throw new Error(`${page} returned ${response.status}`);
      const html=await response.text();
      const documentCopy=new DOMParser().parseFromString(html,'text/html');
      return documentCopy.querySelectorAll('.profile-card').length;
    }catch(error){
      console.warn(`Could not count legacy profiles from ${page}:`,error);
      return 0;
    }
  }));
  return counts.reduce((total,count)=>total+count,0);
}

if(intro&&!document.getElementById('community-profile-count')){
  const badge=document.createElement('div');
  badge.id='community-profile-count';
  badge.style.cssText='display:inline-flex;align-items:center;gap:8px;margin-top:8px;padding:8px 12px;border:1px solid #2f625e;border-radius:999px;background:#111;color:#ddd;font-weight:800;font-size:.86rem';
  badge.innerHTML='<span style="color:#0ccfbd">Community Profiles</span><strong>…</strong>';
  intro.appendChild(badge);

  const number=badge.querySelector('strong');
  let legacyCount=0;
  let firestoreProfiles=[];

  const render=()=>{
    // Claimed legacy profiles already exist among the static directory cards,
    // so only genuinely new Firestore profiles are added to the legacy total.
    const newProfileCount=firestoreProfiles.filter(profile=>{
      return !profile.claimedLegacyProfile&&!String(profile.legacyPage||'').trim();
    }).length;
    number.textContent=String(legacyCount+newProfileCount);
    badge.title=`${legacyCount} legacy directory profiles + ${newProfileCount} newer community profiles`;
  };

  countLegacyDirectoryProfiles().then(count=>{legacyCount=count;render()});

  onSnapshot(collection(db,'profiles'),snapshot=>{
    firestoreProfiles=snapshot.docs.map(doc=>doc.data());
    render();
  },error=>{
    console.warn('New profile count unavailable:',error);
    render();
  });
}
