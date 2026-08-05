import { db } from './firebase-dev.js';
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const intro=document.querySelector('.community-intro');

async function countLegacyDirectoryProfiles(){
  const cached=Number(sessionStorage.getItem('bandtroductionsLegacyProfileCount'));
  if(Number.isFinite(cached)&&cached>0)return cached;

  const pages=['bands.html','musicians.html','venues.html'];
  const counts=await Promise.all(pages.map(async page=>{
    try{
      const response=await fetch(`${page}?profileCount=3`,{cache:'no-store'});
      if(!response.ok)throw new Error(`${page} returned ${response.status}`);
      const html=await response.text();
      const documentCopy=new DOMParser().parseFromString(html,'text/html');
      return documentCopy.querySelectorAll('.profile-card').length;
    }catch(error){
      console.warn(`Could not count legacy profiles from ${page}:`,error);
      return 0;
    }
  }));
  const total=counts.reduce((sum,count)=>sum+count,0);
  if(total>0)sessionStorage.setItem('bandtroductionsLegacyProfileCount',String(total));
  return total;
}

if(intro&&!document.getElementById('community-profile-count')){
  const badge=document.createElement('div');
  badge.id='community-profile-count';
  badge.style.cssText='display:inline-flex;align-items:center;gap:8px;margin-top:8px;padding:8px 12px;border:1px solid #2f625e;border-radius:999px;background:#111;color:#ddd;font-weight:800;font-size:.86rem';
  badge.innerHTML='<span style="color:#0ccfbd">Community Profiles</span><strong>…</strong>';
  intro.appendChild(badge);

  const number=badge.querySelector('strong');
  let legacyCount=null;
  let firestoreProfiles=null;

  const render=()=>{
    // Do not expose partial totals while the two independent data sources race.
    // The badge remains an ellipsis until both values are known, then paints once.
    if(legacyCount===null||firestoreProfiles===null)return;

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
    firestoreProfiles=[];
    render();
  });
}
