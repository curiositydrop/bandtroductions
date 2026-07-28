import { db } from './firebase-dev.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const path=location.pathname.toLowerCase();
const directoryType=path.endsWith('/bands.html')?'band':path.endsWith('/musicians.html')?'musician':path.endsWith('/venues.html')?'venue':'';
let statusByPage=new Map();

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
  }catch{}
  return [...keys];
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

function addClaimLink(card){
  if(!directoryType||card.classList.contains('firebase-profile-card'))return;
  const view=card.querySelector('a.button[href]');
  const name=card.querySelector('h3')?.textContent?.trim();
  if(!view||!name)return;
  const href=view.getAttribute('href')||'';
  if(!href||href.startsWith('profile.html'))return;

  let claim=card.querySelector('.claim-profile-link');
  if(!claim){
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
    claim=document.createElement('a');
    claim.className='claim-profile-link';
    claim.href=`claim-profile.html?${params.toString()}`;
    card.appendChild(claim);
  }
  const status=statusFor(href);
  if(status==='unclaimed'&&!claim.getAttribute('href')){
    const params=new URLSearchParams({page:href,name,type:directoryType});
    claim.href=`claim-profile.html?${params.toString()}`;
  }
  applyStatus(claim,status);
}

function install(){
  document.querySelectorAll('.profile-grid .profile-card').forEach(addClaimLink);
}

async function loadStatuses(){
  try{
    const [profilesSnap,claimsSnap]=await Promise.all([
      getDocs(collection(db,'profiles')),
      getDocs(collection(db,'profileClaims'))
    ]);
    const next=new Map();
    claimsSnap.forEach(docSnap=>{
      const claim=docSnap.data();
      if(claim.status!=='pending'||!claim.legacyPage)return;
      pageKeys(claim.legacyPage).forEach(key=>next.set(key,'pending'));
    });
    profilesSnap.forEach(docSnap=>{
      const profile=docSnap.data();
      if(!profile.claimedLegacyProfile||!profile.legacyPage)return;
      pageKeys(profile.legacyPage).forEach(key=>next.set(key,'claimed'));
    });
    statusByPage=next;
  }catch(error){
    console.warn('Could not load legacy profile claim statuses:',error);
  }
  install();
}

install();
loadStatuses();
new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});