import { db } from './firebase-dev.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const grid=document.getElementById('auditionGrid');
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

let auditions=[];

function clean(value){return String(value||'').trim()}
function norm(value){return clean(value).toLowerCase()}
function uniqueSorted(values){return [...new Set(values.map(clean).filter(Boolean))].sort((a,b)=>a.localeCompare(b))}
function locationParts(profile={}){
  const city=clean(profile.city||profile.town);
  const state=clean(profile.state);
  if(city||state)return {city,state};
  const raw=clean(profile.location);
  if(!raw)return {city:'',state:''};
  const parts=raw.split(',').map(v=>v.trim()).filter(Boolean);
  return {city:parts[0]||'',state:parts[1]||''};
}
function firstInstrument(profile={}){
  return clean(profile.instruments||profile.instrument||profile.role||'Musician / Vocalist');
}
function profileGenre(profile={}){return clean(profile.genre||profile.style||'')}
function profileName(profile={}){return clean(profile.displayName||profile.name||profile.stageName||'Musician')}
function profileIsMusician(profile={}){
  const type=norm(profile.accountType||profile.profileType||profile.type);
  return type==='musician'||type==='artist'||type==='vocalist';
}
function wantsBand(profile={}){
  const value=profile.lookingForBand ?? profile.seekingBand ?? profile.availableForBand;
  if(value===true)return true;
  const text=norm(value);
  if(!text)return true;
  return !['no','false','not looking','unavailable'].includes(text);
}
function fillSelect(select,values){
  const current=select.value;
  values.forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;select.appendChild(option)});
  select.value=current;
}
function makeCard(item){
  const button=document.createElement('button');
  button.type='button';button.className='audition-card';
  button.dataset.city=norm(item.city);button.dataset.state=norm(item.state);button.dataset.genre=norm(item.genre);button.dataset.instrument=norm(item.instrument);
  const thumb=document.createElement('div');thumb.className='thumb';
  const img=document.createElement('img');img.src=item.video.thumbnailUrl;img.alt=`${item.name} video audition`;img.loading='lazy';thumb.appendChild(img);
  const play=document.createElement('div');play.className='play';play.innerHTML='<span>▶</span>';thumb.appendChild(play);button.appendChild(thumb);
  const copy=document.createElement('div');copy.className='card-copy';
  const instrument=document.createElement('span');instrument.className='instrument';instrument.textContent=item.instrument;
  const name=document.createElement('span');name.className='name';name.textContent=item.name;
  const place=document.createElement('span');place.className='place';place.textContent=[item.city,item.state].filter(Boolean).join(', ')||'Location not listed';
  copy.append(instrument,name,place);button.appendChild(copy);
  button.addEventListener('click',()=>openModal(item));
  return button;
}
function openModal(item){
  modalVideo.replaceChildren();
  const frame=document.createElement('iframe');frame.src=`${item.video.embedUrl}?autoplay=1&rel=0`;frame.title=`${item.name} audition`;frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';frame.allowFullscreen=true;modalVideo.appendChild(frame);
  modalName.textContent=item.name;modalInstrument.textContent=item.instrument;
  modalMeta.textContent=[item.genre,[item.city,item.state].filter(Boolean).join(', ')].filter(Boolean).join(' • ');
  modalProfile.href=`profile.html?id=${encodeURIComponent(item.id)}`;
  modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
}
function closeModal(){modal.classList.remove('open');modal.setAttribute('aria-hidden','true');modalVideo.replaceChildren();document.body.style.overflow=''}
function applyFilters(){
  const state=norm(stateFilter.value),city=norm(cityFilter.value),genre=norm(genreFilter.value),instrument=norm(instrumentFilter.value);
  let shown=0;
  grid.querySelectorAll('.audition-card').forEach(card=>{
    const match=(!state||card.dataset.state===state)&&(!city||card.dataset.city.includes(city))&&(!genre||card.dataset.genre.includes(genre))&&(!instrument||card.dataset.instrument.includes(instrument));
    card.hidden=!match;if(match)shown++;
  });
  const empty=grid.querySelector('.filtered-empty');if(empty)empty.remove();
  if(!shown&&auditions.length){const el=document.createElement('div');el.className='empty filtered-empty';el.innerHTML='<strong>No matches.</strong>Try widening one of the filters.';grid.appendChild(el)}
  resultCount.textContent=`${shown} audition${shown===1?'':'s'}`;
}
async function load(){
  try{
    const snapshot=await getDocs(query(collection(db,'profiles'),where('published','==',true)));
    auditions=[];
    snapshot.forEach(docSnap=>{
      const profile=docSnap.data();
      if(!profileIsMusician(profile)||!wantsBand(profile))return;
      const videos=globalThis.BTProfileVideos?.collectProfileVideos(profile)||[];
      if(!videos.length)return;
      const loc=locationParts(profile);
      auditions.push({id:docSnap.id,name:profileName(profile),instrument:firstInstrument(profile),genre:profileGenre(profile),city:loc.city,state:loc.state,video:videos[0]});
    });
    auditions.sort((a,b)=>a.name.localeCompare(b.name));
    grid.replaceChildren();
    if(!auditions.length){grid.innerHTML='<div class="empty"><strong>No auditions posted yet.</strong>Be the first musician to submit a video audition.</div>';resultCount.textContent='0 auditions';return}
    auditions.forEach(item=>grid.appendChild(makeCard(item)));
    fillSelect(stateFilter,uniqueSorted(auditions.map(a=>a.state)));
    fillSelect(genreFilter,uniqueSorted(auditions.map(a=>a.genre)));
    fillSelect(instrumentFilter,uniqueSorted(auditions.map(a=>a.instrument)));
    applyFilters();
  }catch(error){
    console.error('Could not load auditions:',error);
    grid.innerHTML='<div class="empty"><strong>Auditions are temporarily unavailable.</strong>Please try again shortly.</div>';resultCount.textContent='Unavailable';
  }
}
[stateFilter,genreFilter,instrumentFilter].forEach(el=>el?.addEventListener('change',applyFilters));
cityFilter?.addEventListener('input',applyFilters);
document.getElementById('modalClose')?.addEventListener('click',closeModal);document.getElementById('modalClose2')?.addEventListener('click',closeModal);modal?.addEventListener('click',e=>{if(e.target===modal)closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
load();