import { db } from './firebase-dev.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

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
const samples=[
  {id:'sample-guitar',name:'Sample Musician',instrument:'Guitar',genre:'Rock / Metal',city:'Portland',state:'ME',sample:true},
  {id:'sample-drums',name:'Sample Musician',instrument:'Drums',genre:'Rock',city:'Biddeford',state:'ME',sample:true},
  {id:'sample-bass',name:'Sample Musician',instrument:'Bass',genre:'Metal',city:'Saco',state:'ME',sample:true}
];

const clean=value=>String(value||'').trim();
const norm=value=>clean(value).toLowerCase();
const uniqueSorted=values=>[...new Set(values.map(clean).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
const timeout=(promise,ms)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Timed out')),ms))]);

function fillSelect(select,values){
  while(select.options.length>1)select.remove(1);
  values.forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;select.appendChild(option)});
}
function makeMusicianCard(item){
  const button=document.createElement('button');button.type='button';button.className='audition-card';
  button.dataset.city=norm(item.city);button.dataset.state=norm(item.state);button.dataset.genre=norm(item.genre);button.dataset.instrument=norm(item.instrument);
  const thumb=document.createElement('div');thumb.className='thumb'+(item.sample?' sample-thumb':'');
  if(item.sample){
    thumb.textContent=item.instrument==='Guitar'?'🎸':item.instrument==='Drums'?'🥁':'🎵';
    const badge=document.createElement('span');badge.className='sample-badge';badge.textContent='SAMPLE';thumb.appendChild(badge);
  }else{
    if(item.imageUrl){const img=document.createElement('img');img.src=item.imageUrl;img.alt=`${item.name} audition`;img.loading='lazy';thumb.appendChild(img)}
    const play=document.createElement('div');play.className='play';play.innerHTML='<span>▶</span>';thumb.appendChild(play);
  }
  const copy=document.createElement('div');copy.className='card-copy';
  const instrument=document.createElement('span');instrument.className='instrument';instrument.textContent=item.instrument;
  const name=document.createElement('span');name.className='name';name.textContent=item.name;
  const place=document.createElement('span');place.className='place';place.textContent=[item.city,item.state].filter(Boolean).join(', ')||'Location not listed';
  copy.append(instrument,name,place);button.append(thumb,copy);button.addEventListener('click',()=>openModal(item));return button;
}
function makeBandCard(item){
  const button=document.createElement('button');button.type='button';button.className='band-card';button.style.padding='0';button.style.textAlign='left';button.style.cursor='pointer';
  const avatar=document.createElement('div');avatar.className='band-avatar';
  if(item.imageUrl){const img=document.createElement('img');img.src=item.imageUrl;img.alt=item.name;img.loading='lazy';avatar.appendChild(img)}else avatar.textContent='BAND';
  const copy=document.createElement('div');copy.className='band-copy';const name=document.createElement('strong');name.textContent=item.name;const need=document.createElement('span');need.textContent=`Looking for ${item.instrument}`;copy.append(name,need);button.append(avatar,copy);button.addEventListener('click',()=>openModal(item));return button;
}
function openModal(item){
  modalVideo.replaceChildren();
  if(item.sample){
    const sample=document.createElement('div');sample.className='sample-video';sample.innerHTML='<div><strong>Sample Audition Card</strong>This placeholder shows how real uploaded video auditions will appear here.</div>';modalVideo.appendChild(sample);modalProfile.style.display='none';
  }else if(item.videoUrl){
    const video=document.createElement('video');video.src=item.videoUrl;video.controls=true;video.autoplay=true;video.playsInline=true;video.preload='metadata';video.style.width='100%';video.style.height='100%';video.style.objectFit='contain';modalVideo.appendChild(video);modalProfile.href=`profile.html?id=${encodeURIComponent(item.profileId)}`;modalProfile.textContent=item.type==='band'?'VIEW BAND PROFILE →':'VIEW PROFILE →';modalProfile.style.display='inline-flex';
  }else{
    const notice=document.createElement('div');notice.className='sample-video';notice.innerHTML='<div><strong>Band Opening</strong>Performance video will appear here once the live submission is approved.</div>';modalVideo.appendChild(notice);modalProfile.style.display=item.profileId?'inline-flex':'none';if(item.profileId){modalProfile.href=`profile.html?id=${encodeURIComponent(item.profileId)}`;modalProfile.textContent='VIEW BAND PROFILE →'}
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
  if(!shown&&musicianItems.length){const empty=document.createElement('div');empty.className='empty filtered-empty';empty.innerHTML='<strong>No matches.</strong>Try widening one of the filters.';grid.appendChild(empty)}
  resultCount.textContent=`${shown} audition${shown===1?'':'s'}`;
}
function renderMusicians(items){
  musicianItems=items.length?items:[...samples];
  grid.replaceChildren();musicianItems.forEach(item=>grid.appendChild(makeMusicianCard(item)));
  fillSelect(stateFilter,uniqueSorted(musicianItems.map(a=>a.state)));fillSelect(genreFilter,uniqueSorted(musicianItems.map(a=>a.genre)));fillSelect(instrumentFilter,uniqueSorted(musicianItems.map(a=>a.instrument)));applyFilters();
}
function renderBands(items){
  bandNeedGrid.replaceChildren();
  if(!items.length){
    const empty=document.createElement('div');empty.className='empty';empty.innerHTML='<strong>No band openings yet.</strong><br>Approved band submissions will appear here.';bandNeedGrid.appendChild(empty);return;
  }
  items.forEach(item=>bandNeedGrid.appendChild(makeBandCard(item)));
}
async function loadLiveAuditions(){
  const liveQuery=query(
    collection(db,'auditions'),
    where('published','==',true),
    where('approved','==',true),
    where('reviewStatus','==','approved')
  );
  const snap=await timeout(getDocs(liveQuery),5000);
  return snap.docs.map(d=>({id:d.id,...d.data()})).map(item=>({id:item.id,type:item.type,name:clean(item.displayName)||'BANDtroductions Member',instrument:clean(item.role)||'Musician',genre:clean(item.genre),city:clean(item.city),state:clean(item.state),notes:clean(item.notes),imageUrl:clean(item.imageUrl),videoUrl:clean(item.videoUrl),profileId:item.profileId||''}));
}
async function load(){
  // Never leave the public page sitting on Loading while Firebase is unavailable.
  renderBands([]);
  renderMusicians(samples);

  try{
    const live=await loadLiveAuditions();
    const bands=live.filter(item=>item.type==='band');
    const musicians=live.filter(item=>item.type==='musician');
    renderBands(bands);
    if(musicians.length)renderMusicians(musicians);
  }catch(error){
    console.warn('Live Audition Room collection is not readable yet; showing public sample cards.',error);
  }
}
[stateFilter,genreFilter,instrumentFilter].forEach(el=>el?.addEventListener('change',applyFilters));cityFilter?.addEventListener('input',applyFilters);
document.getElementById('modalClose')?.addEventListener('click',closeModal);document.getElementById('modalClose2')?.addEventListener('click',closeModal);modal?.addEventListener('click',e=>{if(e.target===modal)closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
load();
