import { db as devDb } from './firebase-dev.js';
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { activePlaylist, nextPlaylist, playlistPosition, formatMinutes } from './radio-schedule-engine.js?v=3';

const oldPanel=document.querySelector('.radio-panel');
if(!oldPanel)throw new Error('Radio panel not found');
const panel=document.createElement('section');
panel.className='panel radio-panel bt-radio-panel';
panel.innerHTML='<h3><span class="bt-radio-heading-brand">BANDtroductions</span> <span class="bt-radio-heading-title">Radio</span></h3>';
oldPanel.replaceWith(panel);

const style=document.createElement('style');
style.textContent=`
.bt-radio-panel{
  position:relative!important;
  border-color:var(--teal)!important;
  box-shadow:0 0 18px rgba(37,199,193,.15)!important;
  overflow:hidden!important;
  background:
    linear-gradient(180deg,rgba(1,7,8,.06),rgba(1,7,8,.18)),
    url("bt-radio-speaker-crisp.jpg?v=20260907-radio18") right center/cover no-repeat!important
}
.bt-radio-panel::before{content:none!important;background:none!important;box-shadow:none!important;border:0!important}
.bt-radio-panel::after{content:none!important;background:none!important}
.bt-radio-panel>*{position:relative!important;z-index:1!important}
.bt-radio-panel>h3{background:var(--teal)!important;color:#fff!important;text-align:center!important;border-bottom:0!important;font-weight:950!important;letter-spacing:.045em!important;text-shadow:0 1px 2px rgba(0,0,0,.45)!important}
.bt-radio-panel .radio{background:transparent!important}
.bt-radio-box{position:relative!important;padding:9px!important;border:0!important;background:transparent!important;box-shadow:none!important;text-align:center}
.bt-radio-status-row{display:flex;justify-content:center;margin:0 0 7px}
.bt-radio-status{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:4px 9px;font-size:8px;font-weight:950;letter-spacing:.08em;line-height:1;text-transform:uppercase}
.bt-radio-status.live{background:#991b1b;color:#fff;border:1px solid #ff6767;box-shadow:0 0 12px rgba(255,62,62,.28)}
.bt-radio-status.off{background:#171b1b;color:#8f9998;border:1px solid #3b4443}
.bt-radio-art-row{display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:center;margin:0 auto 8px}
.bt-radio-art,.bt-radio-logo{width:100%;aspect-ratio:1;min-width:0;object-fit:contain;background:#090b0b;border:1px solid #334947;border-radius:3px;padding:2px}
.bt-radio-art{object-fit:cover;padding:0}
.bt-radio-now{font-size:6px;color:#899493;font-weight:850;letter-spacing:.08em;text-transform:uppercase;margin-top:2px}
.bt-radio-track{color:var(--teal);font-size:10px;font-weight:950;line-height:1.15;margin-top:3px;overflow-wrap:anywhere}
.bt-radio-band{color:#fff;font-size:8px;font-weight:900;line-height:1.2;margin-top:4px;overflow-wrap:anywhere}
.bt-radio-playlist{color:#8f9998;font-size:6.5px;line-height:1.2;margin-top:3px;overflow-wrap:anywhere}
.bt-radio-next{margin:7px 0 0;padding:6px 5px;border:1px solid #294b49;border-radius:3px;background:#0b1514;line-height:1.2}
.bt-radio-next-label{color:#8f9998;font-size:6px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
.bt-radio-next-name{color:#fff;font-size:7px;font-weight:950;margin-top:2px;overflow-wrap:anywhere}
.bt-radio-eq{height:24px;display:flex;justify-content:center;align-items:end;gap:3px;margin:8px 0 9px;overflow:hidden}
.bt-radio-eq span{display:block;width:3px;min-height:4px;background:var(--teal);animation:btRadioEq .62s ease-in-out infinite alternate;transform-origin:bottom;box-shadow:0 0 5px rgba(37,199,193,.25)}
.bt-radio-eq span:nth-child(2n){animation-duration:.46s}.bt-radio-eq span:nth-child(3n){animation-duration:.78s}.bt-radio-eq span:nth-child(4n){animation-duration:.56s}.bt-radio-eq span:nth-child(5n){animation-duration:.9s}
.bt-radio-eq.off span{animation:none;height:4px!important;opacity:.22;box-shadow:none}
@keyframes btRadioEq{0%{height:4px}35%{height:16px}70%{height:8px}100%{height:23px}}
.bt-radio-listen{display:block!important;width:100%!important;margin:0 auto 7px!important;text-align:center!important;border:0!important;background:var(--teal)!important;color:#05100f!important;font-size:7px!important;font-weight:950!important;padding:7px 3px!important;cursor:pointer!important;text-transform:uppercase}
.bt-radio-listen:disabled{cursor:default!important;opacity:.55!important}
.bt-radio-actions{display:grid;grid-template-columns:1fr;gap:5px;margin-top:0}
.bt-radio-actions .btn{display:block!important;text-align:center!important;margin:0!important;padding:6px 3px!important;font-size:6px!important;line-height:1.05!important}\n.bt-radio-actions .bt-radio-submit{background:#ffd400!important;color:#000!important;border-color:#ffd400!important;box-shadow:0 0 12px rgba(255,212,0,.5)!important;font-family:"Arial Black",Arial,sans-serif!important;font-weight:900!important;-webkit-text-stroke:.25px #000;letter-spacing:.15px}
@media(min-width:651px){.bt-radio-box{padding:13px!important}.bt-radio-status{font-size:10px}.bt-radio-track{font-size:15px}.bt-radio-band{font-size:12px}.bt-radio-playlist{font-size:10px}.bt-radio-next-label{font-size:8px}.bt-radio-next-name{font-size:10px}.bt-radio-now{font-size:9px}.bt-radio-listen{font-size:10px!important;padding:9px!important}.bt-radio-actions .btn{font-size:9px!important;padding:8px!important}.bt-radio-eq{height:32px}.bt-radio-art-row{gap:10px}}

/* Readable radio card: scoped presentation only. */
.grid>.right .bt-radio-panel>h3{
  color:#031211!important;text-shadow:none!important;letter-spacing:0!important;
  padding:10px 4px!important;line-height:1.05!important;
}
.bt-radio-heading-brand,.bt-radio-heading-title{display:block;font-family:Arial,Helvetica,sans-serif;font-weight:900}
.bt-radio-heading-brand{font-size:clamp(7px,1.6vw,21px);letter-spacing:-.035em}
.bt-radio-heading-title{font-size:clamp(19px,3.5vw,38px);margin-top:2px}
.grid>.right .bt-radio-panel .bt-radio-status.off{color:#fff;border-color:#41615e}
.grid>.right .bt-radio-panel .bt-radio-info,
.grid>.right .bt-radio-panel .bt-radio-next{
  background:rgba(2,7,8,.96);border:1px solid #226360;border-radius:9px;
  padding:10px 6px;line-height:1.3;
}
.grid>.right .bt-radio-panel .bt-radio-now{color:#fff;font-size:10px}
.grid>.right .bt-radio-panel .bt-radio-track{color:#25d8d1;font-size:18px;line-height:1.15;margin-top:6px}
.grid>.right .bt-radio-panel .bt-radio-band{color:#fff;font-size:13px;line-height:1.3}
.grid>.right .bt-radio-panel .bt-radio-playlist{color:#d6dddd;font-size:12px;line-height:1.4;margin-top:7px}
.grid>.right .bt-radio-panel .bt-radio-next-label{color:#25d8d1;font-size:10px;letter-spacing:.025em}
.grid>.right .bt-radio-panel .bt-radio-next-time{color:#fff;font-size:12px;font-weight:900;line-height:1.3;margin-top:5px}
.grid>.right .bt-radio-panel .bt-radio-next-name{color:#fff;font-size:16px;line-height:1.2;margin-top:6px}
.grid>.right .bt-radio-panel .bt-radio-actions .btn{background:#020708;border-radius:9px;padding:10px 3px!important;line-height:1.2!important}
.grid>.right .bt-radio-panel .bt-radio-actions .bt-radio-submit{
  background:#ffd400!important;color:#000!important;
  box-shadow:0 0 0 2px #041413,0 0 10px rgba(255,212,0,.22)!important;
}
@media(max-width:650px){
  .grid>.right .bt-radio-panel>h3{padding:7px 3px!important}
  .grid>.right .bt-radio-panel .bt-radio-box{padding:7px!important}
  .grid>.right .bt-radio-panel .bt-radio-info,
  .grid>.right .bt-radio-panel .bt-radio-next{padding:7px 3px;border-radius:6px}
  .grid>.right .bt-radio-panel .bt-radio-now{font-size:8px}
  .grid>.right .bt-radio-panel .bt-radio-track{font-size:12px;margin-top:4px}
  .grid>.right .bt-radio-panel .bt-radio-band{font-size:9px}
  .grid>.right .bt-radio-panel .bt-radio-playlist{font-size:8px;margin-top:5px}
  .grid>.right .bt-radio-panel .bt-radio-next-label{font-size:8px}
  .grid>.right .bt-radio-panel .bt-radio-next-time{font-size:8px;margin-top:4px}
  .grid>.right .bt-radio-panel .bt-radio-next-name{font-size:10px;margin-top:4px}
}
`;
document.head.appendChild(style);

const DEFAULT_COVER='IMG_9367.png';
const RADIO_LOGO='5C9409EE-59F6-4151-9624-2998D7DDF2D0.png';
const STATION_CONTROL_ID='__stationControl';
let playlists={};
let stationEnabled=true;
let stationSettings={};
let audio=null;
let currentKey='';
let userUnmuted=false;
let autoplayAttemptedKey='';

const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
const eqBars=()=>Array.from({length:13},()=>'<span></span>').join('');

function state(){
  if(!stationEnabled)return null;
  const p=activePlaylist(playlists);
  if(!p)return null;
  const pos=playlistPosition(p);
  if(!pos)return null;
  const item=p.items?.[pos.index];
  if(!item?.audioUrl)return null;
  return {p,pos,item};
}

function actions(){
  return '<div class="bt-radio-actions"><a class="btn bt-radio-submit" href="radio-submit.html">SUBMIT YOUR MUSIC</a><a class="btn" href="radio-sponsor.html">SPONSOR RADIO HERE</a></div>';
}

function playerMarkup(s){
  const live=Boolean(s);
  const item=s?.item||{};
  const p=s?.p||{};
  const next=nextPlaylist(playlists);
  const upNextLabel=String(stationSettings.upNextLabel||'UP NEXT').trim()||'UP NEXT';
  const track=live?(item.type==='sponsor'?`Sponsor: ${item.title||'BANDtroductions Sponsor'}`:(item.title||'Untitled')):'Station standing by';
  const band=live?(item.artist||'Independent Music'):'';
  const playlist=live?(p.name||'Scheduled Programming'):(stationEnabled?'No playlist is scheduled for this time.':'Station has been taken off air.');
  const button=live?(userUnmuted?'🔇 MUTE':'🔊 LISTEN NOW'):'🔊 LISTEN NOW';
  return `<div class="radio"><div class="radio-box bt-radio-box">
    <div class="bt-radio-status-row"><span class="bt-radio-status ${live?'live':'off'}">${live?'● ON AIR':'OFF AIR'}</span></div>
    <div class="bt-radio-art-row"><img class="bt-radio-art" src="${esc(item.coverUrl||DEFAULT_COVER)}" alt="${live?'album artwork':'BANDtroductions artwork'}"><img class="bt-radio-logo" src="${RADIO_LOGO}" alt="BANDtroductions Radio"></div>
    <div class="bt-radio-info"><div class="bt-radio-now">${live?'NOW PLAYING':'RADIO'}</div>
    <div class="bt-radio-track">${esc(track)}</div>
    ${band?`<div class="bt-radio-band">${esc(band)}</div>`:''}
    <div class="bt-radio-playlist">${esc(playlist)}</div></div>
    ${next?`<div class="bt-radio-next"><div class="bt-radio-next-label">${esc(upNextLabel)}</div><div class="bt-radio-next-time">${next.dayOffset===0?'TODAY':next.dayOffset===1?'TOMORROW':String(next.day||'').toUpperCase()} · ${formatMinutes(next.startMinutes)}</div><div class="bt-radio-next-name">${esc(next.upNextDisplayName||next.name||'Scheduled Programming')}</div></div>`:''}
    <div class="bt-radio-eq ${live?'':'off'}" aria-hidden="true">${eqBars()}</div>
    <button type="button" class="btn primary bt-radio-listen" ${live?'':'disabled'}>${button}</button>
    ${actions()}
  </div></div>`;
}

function render(){
  const s=state();
  panel.innerHTML='<h3><span class="bt-radio-heading-brand">BANDtroductions</span> <span class="bt-radio-heading-title">Radio</span></h3>'+playerMarkup(s);
  panel.querySelector('.bt-radio-listen:not([disabled])')?.addEventListener('click',async()=>{
    const latest=state();
    if(!latest)return;
    ensureAudio();
    if(userUnmuted){
      userUnmuted=false;
      audio.muted=true;
      render();
      return;
    }
    userUnmuted=true;
    audio.muted=false;
    await synchronize(true);
    render();
  });
}

function ensureAudio(){
  if(audio)return audio;
  audio=new Audio();
  audio.preload='auto';
  audio.autoplay=true;
  audio.muted=true;
  audio.playsInline=true;
  audio.setAttribute('playsinline','');
  audio.addEventListener('ended',()=>synchronize(false));
  return audio;
}

async function tryMutedAutoplay(key){
  ensureAudio();
  if(autoplayAttemptedKey===key)return;
  autoplayAttemptedKey=key;
  audio.muted=true;
  if(userUnmuted)audio.muted=false;
  try{await audio.play();}catch{/* Safari may require the LISTEN NOW tap. */}
}

async function synchronize(forcePlay=false){
  const s=state();
  if(!s){
    if(audio){audio.pause();audio.removeAttribute('src');audio.load();}
    currentKey='';
    autoplayAttemptedKey='';
    userUnmuted=false;
    return;
  }
  ensureAudio();
  const {p,pos,item}=s;
  const src=item.audioUrl;
  const key=`${p.id}|${pos.index}|${item.id||item.title}`;
  const abs=new URL(src,location.href).href;
  if(audio.src!==abs||currentKey!==key){
    currentKey=key;
    autoplayAttemptedKey='';
    audio.muted=!userUnmuted;
    audio.src=src;
    audio.load();
    audio.addEventListener('loadedmetadata',async()=>{
      const fresh=state();
      const offset=fresh?.pos?.offsetSeconds??pos.offsetSeconds;
      try{audio.currentTime=Math.min(offset,Math.max(0,(audio.duration||offset+1)-.25));}catch{}
      if(forcePlay||userUnmuted){
        try{await audio.play();}catch{}
      }else{
        await tryMutedAutoplay(key);
      }
      render();
    },{once:true});
    return;
  }
  if(audio.readyState>0&&Math.abs((audio.currentTime||0)-pos.offsetSeconds)>3){
    try{audio.currentTime=pos.offsetSeconds;}catch{}
  }
  audio.muted=!userUnmuted;
  if(forcePlay||userUnmuted){
    try{await audio.play();}catch{}
  }else if(audio.paused){
    await tryMutedAutoplay(key);
  }
}

onSnapshot(collection(devDb,'radioPlaylists'),snap=>{
  playlists={};
  stationSettings={};
  stationEnabled=true;
  snap.forEach(d=>{
    if(d.id===STATION_CONTROL_ID){
      stationSettings=d.data()||{};
      stationEnabled=stationSettings.stationOnAir!==false;
      return;
    }
    playlists[d.id]={id:d.id,...d.data()};
  });
  render();
  synchronize(false);
},error=>{
  console.error('Radio schedule read failed',error);
  panel.innerHTML='<h3><span class="bt-radio-heading-brand">BANDtroductions</span> <span class="bt-radio-heading-title">Radio</span></h3><div class="radio"><div class="radio-box bt-radio-box"><div class="bt-radio-status-row"><span class="bt-radio-status off">OFF AIR</span></div><div style="color:#999;text-align:center">Schedule unavailable. Please refresh and try again.</div></div></div>';
});

setInterval(()=>{
  render();
  synchronize(false);
},1000);
