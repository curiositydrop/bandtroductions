import { db as devDb } from './firebase-dev.js';
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { activePlaylist, playlistPosition } from './radio-schedule-engine.js?v=2';

const oldPanel=document.querySelector('.radio-panel');
if(!oldPanel)throw new Error('Radio panel not found');
const panel=document.createElement('section');
panel.className='panel radio-panel';
panel.innerHTML='<h3>BANDtroductions Radio</h3>';
oldPanel.replaceWith(panel);

const DEFAULT_COVER='IMG_9367.png';
let playlists={};
let audio=null;
let currentKey='';
let userStarted=false;
let switching=false;

const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

function state(){
  const p=activePlaylist(playlists);
  if(!p)return null;
  const pos=playlistPosition(p);
  if(!pos)return null;
  const item=p.items?.[pos.index];
  if(!item?.audioUrl)return null;
  return {p,pos,item};
}

function actions(){
  return '<div class="dashboard-radio-actions"><a class="btn" href="radio-submit.html">PLAY OUR SONGS</a><a class="btn dashboard-radio-sponsor" href="radio-sponsor.html">SPONSOR RADIO</a></div>';
}

function render(){
  const s=state();
  panel.innerHTML='<h3>BANDtroductions Radio</h3>';
  if(!s){
    const d=document.createElement('div');
    d.className='radio';
    d.innerHTML=`<div class="radio-box"><small>RADIO</small><h2 style="color:var(--teal);margin:6px 0">Off Air</h2><div style="color:#999">No playlist is scheduled for this time.</div>${actions()}</div>`;
    panel.appendChild(d);
    return;
  }
  const {p,item}=s;
  const d=document.createElement('div');
  d.className='radio';
  d.innerHTML=`<div class="radio-box"><div class="now"><img class="cover" src="${esc(item.coverUrl||DEFAULT_COVER)}" alt="artwork" style="object-fit:cover"><div><small>NOW PLAYING</small><h2 style="margin:5px 0;color:var(--teal)">${esc(item.type==='sponsor'?`Sponsor: ${item.title}`:(item.title||'Untitled'))}</h2><div>${esc(item.artist||'')}</div><div style="color:#888;margin-top:2px">${esc(p.name||'')}</div></div></div><div class="wave"></div><button type="button" class="btn primary dashboard-radio-play" style="display:block;width:100%;text-align:center;cursor:pointer">${audio&&!audio.paused&&userStarted?'● RADIO PLAYING':'▶ PLAY RADIO'}</button>${actions()}</div>`;
  panel.appendChild(d);
  const badge=document.createElement('div');
  badge.className='radio-live-badge';
  badge.textContent='● LIVE';
  panel.appendChild(badge);
  d.querySelector('.dashboard-radio-play')?.addEventListener('click',()=>{
    if(audio&&!audio.paused&&userStarted)return;
    userStarted=true;
    synchronize(true);
    render();
  });
}

async function synchronize(playAfter=false){
  const s=state();
  if(!s){
    if(audio&&!audio.paused)audio.pause();
    return;
  }
  const {p,pos,item}=s;
  const src=item.audioUrl;
  const key=`${p.id}|${pos.index}|${item.id||item.title}`;
  const abs=new URL(src,location.href).href;
  if(!audio){
    audio=new Audio();
    audio.preload='metadata';
    audio.addEventListener('ended',()=>synchronize(true));
  }
  if(audio.src!==abs||currentKey!==key){
    const resume=playAfter||userStarted;
    switching=true;
    currentKey=key;
    audio.src=src;
    audio.load();
    audio.addEventListener('loadedmetadata',()=>{
      try{audio.currentTime=Math.min(pos.offsetSeconds,Math.max(0,(audio.duration||pos.offsetSeconds+1)-.25));}catch{}
      switching=false;
      if(resume)audio.play().catch(()=>{});
      render();
    },{once:true});
    return;
  }
  if(audio.readyState>0&&Math.abs((audio.currentTime||0)-pos.offsetSeconds)>3){
    try{audio.currentTime=pos.offsetSeconds;}catch{}
  }
  if(playAfter&&audio.paused)audio.play().catch(()=>{});
}

onSnapshot(collection(devDb,'radioPlaylists'),snap=>{
  playlists={};
  snap.forEach(d=>{playlists[d.id]={id:d.id,...d.data()};});
  render();
  synchronize(false);
},error=>{
  console.error('Radio schedule read failed',error);
  panel.innerHTML='<h3>BANDtroductions Radio</h3><div class="radio"><div class="radio-box"><small>RADIO</small><h2 style="color:var(--teal);margin:6px 0">Schedule unavailable</h2><div style="color:#999">Please refresh and try again.</div></div></div>';
});

setInterval(()=>{
  render();
  if(userStarted)synchronize(true);
},1000);
