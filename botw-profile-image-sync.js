import { db } from './firebase-dev.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const normalize=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const slug=value=>normalize(value).replace(/\s+/g,'-');
const FALLBACK='IMG_9367.png';
const directory=new Map();

function addEntry(name,image,url,meta=''){
  const cleanName=String(name||'').trim();
  const key=normalize(cleanName);
  if(!key||!image)return;
  const entry={name:cleanName,image,url:url||'#',meta};
  directory.set(key,entry);
  directory.set(slug(cleanName),entry);
}

async function loadStaticDirectory(){
  for(const page of ['bands.html','musicians.html']){
    try{
      const html=await fetch(`${page}?botw=${Date.now()}`,{cache:'no-store'}).then(r=>r.ok?r.text():Promise.reject(new Error(page)));
      const doc=new DOMParser().parseFromString(html,'text/html');
      doc.querySelectorAll('.profile-card').forEach(card=>{
        const name=card.querySelector('h3')?.textContent?.trim();
        const image=card.querySelector('img')?.getAttribute('src')||card.querySelector('img')?.getAttribute('data-src');
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
      const image=p.imageUrl||p.avatarUrl||p.photoURL||p.profileImageUrl||p.profileImage||p.avatar;
      if(name&&image)addEntry(name,image,`profile.html?id=${encodeURIComponent(d.id)}`,[p.location,p.genre||p.instruments].filter(Boolean).join(' • '));
    });
  }catch(error){console.warn('BOTW live directory unavailable',error);}
}

function cleanRankedName(text=''){
  return String(text).replace(/^#\s*\d+\s*/,'').trim();
}

function findMatch(name,row){
  const keys=[
    normalize(name),
    slug(name),
    normalize(row?.dataset?.bandId||''),
    slug(row?.dataset?.bandId||'')
  ].filter(Boolean);
  for(const key of keys){if(directory.has(key))return directory.get(key);}
  return null;
}

function setArtwork(img,match,name){
  if(!img)return;
  const desired=match?.image||FALLBACK;
  if(img.getAttribute('src')!==desired)img.src=desired;
  img.alt=match?.name||name||'BANDtroductions artist';
  img.onerror=()=>{img.onerror=null;img.src=FALLBACK;};
}

function apply(){
  const winnerName=document.getElementById('currentWinnerName');
  const winnerImage=document.getElementById('currentWinnerImage');
  const winnerLink=document.getElementById('currentWinnerLink');
  if(winnerName&&winnerImage){
    const name=cleanRankedName(winnerName.textContent);
    const match=findMatch(name,null);
    setArtwork(winnerImage,match,name);
    if(match&&winnerLink&&match.url)winnerLink.href=match.url;
  }

  document.querySelectorAll('#botwLeaderboard .botw-winner').forEach(row=>{
    const title=row.querySelector('h3');
    const img=row.querySelector('img');
    if(!title||!img)return;
    const name=cleanRankedName(title.textContent);
    const match=findMatch(name,row);
    setArtwork(img,match,name);
    const link=row.querySelector('a.button');
    if(match&&link&&match.url)link.href=match.url;
  });
}

await Promise.all([loadStaticDirectory(),loadLiveDirectory()]);
apply();

const target=document.getElementById('botwLeaderboard');
if(target){
  const observer=new MutationObserver(()=>apply());
  observer.observe(target,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['src']});
}

[100,300,700,1500,3000,6000,10000].forEach(ms=>setTimeout(apply,ms));
