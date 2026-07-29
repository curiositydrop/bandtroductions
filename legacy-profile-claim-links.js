import { db } from './firebase-dev.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const path=location.pathname.toLowerCase();
const directoryType=path.endsWith('/bands.html')?'band':path.endsWith('/musicians.html')?'musician':path.endsWith('/venues.html')?'venue':'';
let statusByPage=new Map();
let installQueued=false;

function fieldText(card,label){
  const paragraphs=[...card.querySelectorAll('p')];
  const match=paragraphs.find(p=>String(p.textContent||'').toLowerCase().startsWith(label.toLowerCase()));
  if(!match)return '';
  return String(match.textContent||'').replace(new RegExp(`^${label}`,'i'),'').trim();
}

function absoluteAsset(src){
  if(!src)return '';
  try{return new URL(src,location.href).href}catch{return src}
}

function pageKeys(raw){
  const value=String(raw||'').trim();
  if(!value)return [];
  const keys=new Set([value]);
  try{
    const url=new URL(value,location.href);
    keys.add(url.href);
    keys.add(`${url.pathname.replace(/^\//,'')}${url.search}`);
    keys.add(url.pathname.replace(/^\//,''));
    keys.add(url.pathname.split('/').pop()||'');
  }catch{}
  return [...keys].filter(Boolean);
}

function statusFor(href){
  for(const key of pageKeys(href)){
    if(statusByPage.has(key))return statusByPage.get(key);
  }
  return 'unclaimed';
}

function applyStatus(link,status){
  link.dataset.claimStatus=status;
  link.style.display='block';
  link.style.marginTop='10px';
  link.style.fontSize='.85rem';
  link.style.fontWeight='800';
  if(status==='claimed'){
    link.removeAttribute('href');
    link.textContent='✓ Claimed Profile';
    link.style.color='#9ed7a7';
    link.style.cursor='default';
    link.style.textDecoration='none';
    link.setAttribute('aria-label','This profile has been claimed');
  }else if(status==='pending'){
    link.removeAttribute('href');
    link.textContent='Ownership claim pending';
    link.style.color='#e5c56f';
    link.style.cursor='default';
    link.style.textDecoration='none';
    link.setAttribute('aria-label','An ownership claim is pending review');
  }else{
    link.textContent='Is this yours? Claim this profile';
    link.style.color='#0ccfbd';
    link.style.cursor='pointer';
    link.style.textDecoration='underline';
  }
}

function claimHref(card,view,name){
  const href=view.getAttribute('href')||'';
  const image=card.querySelector('img')?.getAttribute('src')||'';
  const params=new URLSearchParams({
    page:href,
    name,
    type:directoryType,
    image:absoluteAsset(image),
    location:fieldText(card,directoryType==='venue'?'Town:':'Location:'),
    genre:fieldText(card,'Genre:')||fieldText(card,'Style:'),
    instruments:fieldText(card,'Instrument:'),
    venueType:fieldText(card,'Type:')
  });
  return `claim-profile.html?${params.toString()}`;
}

function addClaimLink(card){
  if(!directoryType||card.classList.contains('firebase-profile-card'))return;
  const view=card.querySelector('a.button[href],a[href$=".html"]');
  const name=card.querySelector('h3')?.textContent?.trim();
  if(!view||!name)return;
  const href=view.getAttribute('href')||'';
  if(!href||href.startsWith('profile.html')||href.startsWith('claim-profile.html'))return;

  let claim=card.querySelector('.claim-profile-link');
  if(!claim){
    claim=document.createElement('a');
    claim.className='claim-profile-link';
    card.appendChild(claim);
  }

  const status=statusFor(href);
  if(status==='unclaimed')claim.href=claimHref(card,view,name);
  applyStatus(claim,status);
}

function install(){
  installQueued=false;
  document.querySelectorAll('.profile-card').forEach(addClaimLink);
}

function queueInstall(){
  if(installQueued)return;
  installQueued=true;
  requestAnimationFrame(install);
}

function withTimeout(promise,ms){
  return Promise.race([
    promise,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('Claim status lookup timed out')),ms))
  ]);
}

async function loadStatuses(){
  const next=new Map();
  const results=await Promise.allSettled([
    withTimeout(getDocs(collection(db,'profiles')),8000),
    withTimeout(getDocs(collection(db,'profileClaims')),8000)
  ]);

  const profilesSnap=results[0].status==='fulfilled'?results[0].value:null;
  const claimsSnap=results[1].status==='fulfilled'?results[1].value:null;

  claimsSnap?.forEach(docSnap=>{
    const claim=docSnap.data();
    if(claim.status!=='pending'||!claim.legacyPage)return;
    pageKeys(claim.legacyPage).forEach(key=>next.set(key,'pending'));
  });

  profilesSnap?.forEach(docSnap=>{
    const profile=docSnap.data();
    if(!profile.claimedLegacyProfile||!profile.legacyPage)return;
    pageKeys(profile.legacyPage).forEach(key=>next.set(key,'claimed'));
  });

  statusByPage=next;
  results.forEach(result=>{
    if(result.status==='rejected')console.warn('Could not load part of the legacy claim status data:',result.reason);
  });
  queueInstall();
}

// Build every legacy claim link immediately. Status checks happen afterward and
// can no longer block the directory or leave the user staring at a spinner.
install();
loadStatuses().catch(error=>console.warn('Could not load legacy profile claim statuses:',error));
new MutationObserver(queueInstall).observe(document.documentElement,{childList:true,subtree:true});
