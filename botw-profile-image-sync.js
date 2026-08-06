import { db } from './firebase-dev.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const normalize=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const FALLBACK='IMG_9383.jpeg';
const directory=new Map();

function addEntry(name,image,url,meta=''){
  const key=normalize(name);
  if(!key||!image)return;
  directory.set(key,{name:String(name||'').trim(),image,url:url||'#',meta});
}

async function loadStaticDirectory(){
  for(const page of ['bands.html','musicians.html']){
    try{
      const html=await fetch(page).then(r=>r.ok?r.text():Promise.reject(new Error(page)));
      const doc=new DOMParser().parseFromString(html,'text/html');
      doc.querySelectorAll('.profile-card').forEach(card=>{
        const name=card.querySelector('h3')?.textContent?.trim();
        const image=card.querySelector('img')?.getAttribute('src');
        const url=card.querySelector('a.button')?.getAttribute('href');
        if(name&&image)addEntry(name,image,url);
      });
    }catch(error){console.warn('BOTW static directory skipped',page,error);}
  }
}

async function loadLiveDirectory(){
  try{
    const snap=await getDocs(query(collection(db,'profiles'),where('published','==',true)));
    snap.docs.forEach(d=>{
      const p=d.data()||{};
      const type=String(p.accountType||p.profileType||'').toLowerCase();
      if(type!=='band'&&type!=='musician')return;
      const name=p.displayName||p.bandName||p.name;
      const image=p.imageUrl||p.avatarUrl||p.photoURL||p.profileImageUrl;
      if(name&&image)addEntry(name,image,`profile.html?id=${encodeURIComponent(d.id)}`,[p.location,p.genre||p.instruments].filter(Boolean).join(' • '));
    });
  }catch(error){console.warn('BOTW live directory unavailable',error);}
}

function cleanRankedName(text=''){
  return String(text).replace(/^#\s*\d+\s*/,'').trim();
}

function apply(){
  const winnerName=document.getElementById('currentWinnerName');
  const winnerImage=document.getElementById('currentWinnerImage');
  const winnerLink=document.getElementById('currentWinnerLink');
  if(winnerName&&winnerImage){
    const match=directory.get(normalize(cleanRankedName(winnerName.textContent)));
    if(match){winnerImage.src=match.image||FALLBACK;winnerImage.alt=match.name;if(winnerLink&&match.url)winnerLink.href=match.url;}
  }
  document.querySelectorAll('#botwLeaderboard .botw-winner').forEach(row=>{
    const title=row.querySelector('h3');
    const img=row.querySelector('img');
    if(!title||!img)return;
    const match=directory.get(normalize(cleanRankedName(title.textContent)));
    if(!match)return;
    img.src=match.image||FALLBACK;img.alt=match.name;
    const link=row.querySelector('a.button');if(link&&match.url)link.href=match.url;
  });
}

await Promise.all([loadStaticDirectory(),loadLiveDirectory()]);
apply();
const target=document.getElementById('botwLeaderboard');
if(target){const observer=new MutationObserver(()=>apply());observer.observe(target,{childList:true,subtree:true,characterData:true});setTimeout(()=>observer.disconnect(),15000);}
[250,700,1500,3000].forEach(ms=>setTimeout(apply,ms));
