import { db } from './firebase-dev.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { websiteMerchAccess } from './botw-comp-access.mjs?v=20261127-looking';
import {
  compareFeaturedThenName,
  isLookingForBand,
  lookingForBandLabel,
  publicListingText,
  stripPublicPhones
} from './audition-room-utils.mjs?v=20261127-looking';

const grid=document.getElementById('auditionGrid');
const bandNeedGrid=document.getElementById('bandNeedGrid');
const stateFilter=document.getElementById('stateFilter');
const cityFilter=document.getElementById('cityFilter');
const genreFilter=document.getElementById('genreFilter');
const instrumentFilter=document.getElementById('instrumentFilter');
const resultCount=document.getElementById('resultCount');
const modal=document.getElementById('auditionModal');
const modalVideo=document.getElementById('modalVideo');
const modalName=document.getElementById('modalName');
const modalInstrument=document.getElementById('modalInstrument');
const modalMeta=document.getElementById('modalMeta');
const modalProfile=document.getElementById('modalProfile');

let musicianItems=[];

const clean=value=>String(value||'').trim();
const norm=value=>clean(value).toLowerCase();
const uniqueSorted=values=>[...new Set(values.map(clean).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
const timeout=(promise,ms)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Timed out')),ms))]);

function isFeaturedProfile(profile){
  const access=websiteMerchAccess(profile||{},profile?.botwComp);
  return access==='paid'||access==='comp';
}

function splitLocation(profile){
  const city=publicListingText(profile.city||profile.town||'');
  const state=publicListingText(profile.region||profile.state||'');
  if(city||state)return {city,state};
  const parts=publicListingText(profile.location).split(',').map(v=>v.trim()).filter(Boolean);
  return {city:parts[0]||'',state:parts.slice(1).join(', ')};
}

function fillSelect(select,values){
  while(select.options.length>1)select.remove(1);
  values.forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;select.appendChild(option)});
}

function addFeaturedBadge(parent,item){
  if(!item.featured)return;
  const badge=document.createElement('span');
  badge.className='featured-badge';
  badge.textContent='FEATURED';
  parent.appendChild(badge);
}

function makeMusicianCard(item){
  const button=document.createElement('button');button.type='button';button.className='audition-card'+(item.featured?' is-featured':'');
  button.dataset.city=norm(item.city);button.dataset.state=norm(item.state);button.dataset.genre=norm(item.genre);button.dataset.instrument=norm(item.instrument);
  const thumb=document.createElement('div');thumb.className='thumb'+(item.videoUrl?'':' no-video-thumb');
  if(item.imageUrl){const img=document.createElement('img');img.src=item.imageUrl;img.alt=`${item.name} listing`;img.loading='lazy';thumb.appendChild(img)}
  if(item.videoUrl){
    const play=document.createElement('div');play.className='play';play.innerHTML='<span>▶</span>';thumb.appendChild(play);
  }
  addFeaturedBadge(thumb,item);
  const copy=document.createElement('div');copy.className='card-copy';
  const instrument=document.createElement('span');instrument.className='instrument';instrument.textContent=item.instrument;
  const name=document.createElement('span');name.className='name';name.textContent=item.name;
  const place=document.createElement('span');place.className='place';place.textContent=[item.city,item.state].filter(Boolean).join(', ')||'Location not listed';
  copy.append(instrument,name,place);button.append(thumb,copy);button.addEventListener('click',()=>openModal(item));return button;
}

function makeBandCard(item){
  const button=document.createElement('button');button.type='button';button.className='band-card'+(item.featured?' is-featured':'');button.style.padding='0';button.style.textAlign='left';button.style.cursor='pointer';
  const avatar=document.createElement('div');avatar.className='band-avatar';
  if(item.imageUrl){const img=document.createElement('img');img.src=item.imageUrl;img.alt=item.name;img.loading='lazy';avatar.appendChild(img)}else avatar.textContent='BAND';
  addFeaturedBadge(avatar,item);
  const copy=document.createElement('div');copy.className='band-copy';const name=document.createElement('strong');name.textContent=item.name;const need=document.createElement('span');need.textContent=`Looking for ${item.instrument}`;copy.append(name,need);button.append(avatar,copy);button.addEventListener('click',()=>openModal(item));return button;
}

function openModal(item){
  modalVideo.replaceChildren();
  if(item.videoUrl){
    const video=document.createElement('video');video.src=item.videoUrl;video.controls=true;video.autoplay=true;video.playsInline=true;video.preload='metadata';video.style.width='100%';video.style.height='100%';video.style.objectFit='contain';modalVideo.appendChild(video);
  }else{
    const notice=document.createElement('div');notice.className='sample-video';
    const wrap=document.createElement('div');
    const heading=document.createElement('strong');
    heading.textContent=item.type==='band'?'Band opening':'Looking for a band';
    wrap.appendChild(heading);
    const detail=document.createElement('div');
    detail.textContent=item.type==='band'
      ? `This band is looking for ${item.instrument}.`
      : (item.notes||'This musician is looking to join a band.');
    wrap.appendChild(detail);
    notice.appendChild(wrap);
    modalVideo.appendChild(notice);
  }
  if(item.profileId){
    modalProfile.href=`profile.html?id=${encodeURIComponent(item.profileId)}`;
    modalProfile.textContent=item.type==='band'?'VIEW BAND PROFILE →':'VIEW PROFILE →';
    modalProfile.style.display='inline-flex';
  }else{
    modalProfile.style.display='none';
  }
  modalName.textContent=item.name;modalInstrument.textContent=item.type==='band'?`Looking for ${item.instrument}`:item.instrument;
  modalMeta.textContent=[item.genre,[item.city,item.state].filter(Boolean).join(', '),item.notes].filter(Boolean).join(' • ');
  modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
}

function closeModal(){modal.classList.remove('open');modal.setAttribute('aria-hidden','true');modalVideo.querySelector('video')?.pause();modalVideo.replaceChildren();document.body.style.overflow=''}

function applyFilters(){
  const state=norm(stateFilter.value),city=norm(cityFilter.value),genre=norm(genreFilter.value),instrument=norm(instrumentFilter.value);let shown=0;
  grid.querySelectorAll('.audition-card').forEach(card=>{const match=(!state||card.dataset.state===state)&&(!city||card.dataset.city.includes(city))&&(!genre||card.dataset.genre.includes(genre))&&(!instrument||card.dataset.instrument.includes(instrument));card.hidden=!match;if(match)shown++});
  grid.querySelector('.filtered-empty')?.remove();
  if(!shown){const empty=document.createElement('div');empty.className='empty filtered-empty';empty.innerHTML=musicianItems.length?'<strong>No matches.</strong>Try widening one of the filters.':'<strong>No musician listings yet.</strong><br>Approved auditions and members already looking for a band will appear here.';grid.appendChild(empty)}
  resultCount.textContent=`${shown} listing${shown===1?'':'s'}`;
}

function renderMusicians(items){
  musicianItems=items;
  grid.replaceChildren();
  musicianItems.forEach(item=>grid.appendChild(makeMusicianCard(item)));
  fillSelect(stateFilter,uniqueSorted(musicianItems.map(a=>a.state)));fillSelect(genreFilter,uniqueSorted(musicianItems.map(a=>a.genre)));fillSelect(instrumentFilter,uniqueSorted(musicianItems.map(a=>a.instrument)));applyFilters();
}

function renderBands(items){
  bandNeedGrid.replaceChildren();
  if(!items.length){
    const empty=document.createElement('div');empty.className='empty';empty.innerHTML='<strong>No band openings yet.</strong><br>Approved band submissions and bands that list who they are looking for will appear here.';bandNeedGrid.appendChild(empty);return;
  }
  items.forEach(item=>bandNeedGrid.appendChild(makeBandCard(item)));
}

function sanitizeListing(item){
  return {
    ...item,
    name:publicListingText(item.name,'BANDtroductions Member'),
    instrument:publicListingText(item.instrument,item.type==='band'?'a member':'Musician'),
    genre:publicListingText(item.genre),
    city:publicListingText(item.city),
    state:publicListingText(item.state),
    notes:stripPublicPhones(item.notes)
  };
}

function listingFromAudition(item,profilesById){
  const profile=profilesById.get(item.profileId)||{};
  return sanitizeListing({
    id:item.id,
    type:item.type,
    name:clean(item.displayName)||clean(profile.displayName)||'BANDtroductions Member',
    instrument:clean(item.role)||(item.type==='band'?'a member':'Musician'),
    genre:clean(item.genre)||clean(profile.genre),
    city:clean(item.city),
    state:clean(item.state),
    notes:clean(item.notes),
    imageUrl:clean(item.imageUrl)||clean(profile.imageUrl)||clean(profile.avatarUrl),
    videoUrl:clean(item.videoUrl),
    profileId:item.profileId||'',
    featured:isFeaturedProfile(profile),
    source:'audition'
  });
}

function musicianListingFromProfile(profile){
  const loc=splitLocation(profile);
  return sanitizeListing({
    id:`profile-${profile.id}`,
    type:'musician',
    name:clean(profile.displayName)||'BANDtroductions Member',
    instrument:clean(profile.instruments)||'Musician',
    genre:clean(profile.genre),
    city:loc.city,
    state:loc.state,
    notes:lookingForBandLabel(profile.lookingForBand),
    imageUrl:clean(profile.imageUrl)||clean(profile.avatarUrl)||clean(profile.profileImage),
    videoUrl:'',
    profileId:profile.id,
    featured:isFeaturedProfile(profile),
    source:'profile-looking'
  });
}

function bandListingFromProfile(profile){
  const loc=splitLocation(profile);
  const looking=publicListingText(profile.lookingForMembers,'members');
  return sanitizeListing({
    id:`profile-${profile.id}`,
    type:'band',
    name:clean(profile.displayName)||'BANDtroductions Band',
    instrument:looking,
    genre:clean(profile.genre),
    city:loc.city,
    state:loc.state,
    notes:looking,
    imageUrl:clean(profile.imageUrl)||clean(profile.avatarUrl)||clean(profile.profileImage),
    videoUrl:'',
    profileId:profile.id,
    featured:isFeaturedProfile(profile),
    source:'profile-looking'
  });
}

async function loadLiveAuditions(){
  const liveQuery=query(
    collection(db,'auditions'),
    where('published','==',true),
    where('approved','==',true),
    where('reviewStatus','==','approved')
  );
  const snap=await timeout(getDocs(liveQuery),8000);
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}

async function loadPublishedProfiles(){
  const snap=await timeout(getDocs(query(collection(db,'profiles'),where('published','==',true))),8000);
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}

async function load(){
  renderBands([]);
  renderMusicians([]);

  try{
    const [live,profiles]=await Promise.all([loadLiveAuditions(),loadPublishedProfiles()]);
    const profilesById=new Map(profiles.map(profile=>[profile.id,profile]));
    const usedMusicianIds=new Set();
    const usedBandIds=new Set();

    const musicians=live.filter(item=>item.type==='musician').map(item=>{
      const listing=listingFromAudition(item,profilesById);
      if(listing.profileId)usedMusicianIds.add(listing.profileId);
      return listing;
    });
    const bands=live.filter(item=>item.type==='band').map(item=>{
      const listing=listingFromAudition(item,profilesById);
      if(listing.profileId)usedBandIds.add(listing.profileId);
      return listing;
    });

    profiles.forEach(profile=>{
      const type=String(profile.accountType||'').toLowerCase();
      if(type==='musician'&&isLookingForBand(profile.lookingForBand)&&!usedMusicianIds.has(profile.id)){
        musicians.push(musicianListingFromProfile(profile));
      }
      if(type==='band'&&publicListingText(profile.lookingForMembers)&&!usedBandIds.has(profile.id)){
        bands.push(bandListingFromProfile(profile));
      }
    });

    musicians.sort(compareFeaturedThenName);
    bands.sort(compareFeaturedThenName);
    renderBands(bands);
    renderMusicians(musicians);
  }catch(error){
    console.warn('The Audition Room could not load live listings.',error);
    renderMusicians([]);
    renderBands([]);
  }
}

[stateFilter,genreFilter,instrumentFilter].forEach(el=>el?.addEventListener('change',applyFilters));cityFilter?.addEventListener('input',applyFilters);
document.getElementById('modalClose')?.addEventListener('click',closeModal);document.getElementById('modalClose2')?.addEventListener('click',closeModal);modal?.addEventListener('click',e=>{if(e.target===modal)closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
load();
