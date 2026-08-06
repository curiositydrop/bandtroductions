import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js';
import { getDatabase, ref, onValue, runTransaction } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js';

function setupDashboardChrome(){
  const header=document.querySelector('.sticky-header');
  const grid=document.querySelector('.grid');
  if(!header||!grid)return;

  const style=document.createElement('style');
  style.id='dashboard-fixed-header-style';
  style.textContent=`
    .sticky-header{
      position:fixed!important;
      top:0!important;
      left:50%!important;
      transform:translateX(-50%)!important;
      width:min(calc(100% - 24px),1476px)!important;
      z-index:5000!important;
      background:#090a0a!important;
      box-shadow:0 8px 18px rgba(0,0,0,.72)!important;
    }
    .news-scroller-card{height:40px!important;grid-template-columns:66px minmax(0,1fr)!important}
    .news-label{font-size:9px!important;line-height:.88!important}
    .news-group{font-size:10px!important;gap:25px!important;padding:0 12px!important}
    .radio-panel{position:relative!important;overflow:hidden!important;min-width:0!important}
    .right,.center,.left{min-width:0!important}
    .radio-coming-soon{
      position:absolute;
      z-index:20;
      top:43px;
      right:-24px;
      width:126px;
      text-align:center;
      background:#b91c1c;
      color:#fff;
      border:1px solid #ff5a5a;
      padding:5px 6px;
      font-size:10px;
      font-weight:950;
      letter-spacing:.07em;
      transform:rotate(32deg);
      transform-origin:center;
      box-shadow:0 3px 10px rgba(0,0,0,.65);
      pointer-events:none;
      text-transform:uppercase;
      white-space:nowrap;
    }
    @media(max-width:1000px){
      .sticky-header{width:calc(100% - 12px)!important}
      .news-scroller-card{height:31px!important;grid-template-columns:56px minmax(0,1fr)!important}
      .news-label{font-size:8px!important}
      .news-group{font-size:8px!important;gap:20px!important;padding:0 10px!important}
      .grid{grid-template-columns:minmax(0,24fr) minmax(0,48fr) minmax(0,28fr)!important;width:100%!important;max-width:100%!important;overflow:visible!important}
      .radio-coming-soon{top:34px;right:-20px;width:106px;font-size:7px;padding:4px 3px}
    }
    @media(max-width:650px){
      .sticky-header{width:calc(100% - 8px)!important}
      .news-scroller-card{height:24px!important;grid-template-columns:44px minmax(0,1fr)!important}
      .news-label{font-size:6px!important;line-height:.82!important}
      .news-group{font-size:6px!important;gap:15px!important;padding:0 8px!important}
      .grid{grid-template-columns:minmax(0,24fr) minmax(0,48fr) minmax(0,28fr)!important;gap:4px!important;width:100%!important;max-width:100%!important}
      .right{padding-right:0!important;margin-right:0!important;overflow:hidden!important}
      .right .panel{width:100%!important;max-width:100%!important;overflow:hidden!important}
      .radio-coming-soon{top:23px;right:-15px;width:78px;font-size:5px;padding:3px 2px;letter-spacing:.04em;transform:rotate(30deg)}
    }
  `;
  document.head.appendChild(style);

  const sync=()=>{
    const height=Math.ceil(header.getBoundingClientRect().height);
    grid.style.marginTop=`${height+12}px`;
  };
  sync();
  requestAnimationFrame(sync);
  window.addEventListener('resize',sync,{passive:true});
  if('ResizeObserver' in window)new ResizeObserver(sync).observe(header);
}

setupDashboardChrome();

const firebaseConfig={
  apiKey:'AIzaSyApLiiJsKTw1Fp8J3aQatMqiSZoP_6EycE',
  authDomain:'bandfanwall.firebaseapp.com',
  databaseURL:'https://bandfanwall-default-rtdb.firebaseio.com',
  projectId:'bandfanwall',
  storageBucket:'bandfanwall.firebasestorage.app',
  messagingSenderId:'619241154826',
  appId:'1:619241154826:web:25ddc58eef094e3c0732f3'
};

const app=getApps().find(a=>a.options?.databaseURL===firebaseConfig.databaseURL)||initializeApp(firebaseConfig,'dashboard-radio');
const db=getDatabase(app);
const panel=document.querySelector('.radio-panel');
const headerPlayer=document.querySelector('.mini-player');
const DEFAULT_COVER='IMG_9367.png';
let tracks=[],current=0,audio=null;

const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

function applyComingSoon(){
  if(!panel||panel.querySelector('.radio-coming-soon'))return;
  const badge=document.createElement('div');badge.className='radio-coming-soon';badge.textContent='COMING SOON';panel.appendChild(badge);
}

function approvedTracks(data){
  if(!data)return [];
  return Object.entries(data).map(([id,t])=>({id,...t})).filter(t=>t.approved===true&&Boolean(t.audioUrl||t.audio)).sort((a,b)=>(b.dateAdded||0)-(a.dateAdded||0));
}

function render(){
  if(!panel)return;
  const t=tracks[current];
  const heading=panel.querySelector('h3');
  panel.replaceChildren();
  if(heading)panel.appendChild(heading);
  if(!t){
    const div=document.createElement('div');div.className='radio';div.innerHTML='<div class="radio-box"><small>NOW PLAYING</small><h2 style="color:var(--teal);margin:6px 0">Radio Beta</h2><div style="color:#999">Approved tracks will appear here.</div><a class="btn primary" style="display:block;text-align:center;margin-top:10px" href="radio.html">VIEW RADIO</a></div>';panel.appendChild(div);
    applyComingSoon();
    if(headerPlayer)headerPlayer.innerHTML='<b>● LIVE RADIO</b><div style="margin-top:8px">BANDtroductions Radio Beta</div>';
    return;
  }
  const cover=t.coverUrl||t.cover||DEFAULT_COVER,title=t.title||'Untitled Track',artist=t.artist||'Unknown Artist',album=t.album||'';
  const wrap=document.createElement('div');wrap.className='radio';
  wrap.innerHTML=`<div class="radio-box"><div class="now"><img class="cover" src="${esc(cover)}" alt="${esc(title)} artwork" style="object-fit:cover"><div><small>NOW PLAYING</small><h2 style="margin:5px 0;color:var(--teal)">${esc(title)}</h2><div>${esc(artist)}</div>${album?`<div style="color:#888;margin-top:2px">${esc(album)}</div>`:''}</div></div><div class="wave"></div><button type="button" class="btn primary dashboard-radio-play" style="display:block;width:100%;text-align:center;margin-top:10px;cursor:pointer">▶ PLAY</button><a class="btn" style="display:block;text-align:center;margin-top:6px" href="radio.html">OPEN RADIO</a></div>`;
  panel.appendChild(wrap);
  applyComingSoon();
  if(headerPlayer)headerPlayer.innerHTML=`<b>● LIVE RADIO</b><div style="margin-top:8px">${esc(artist)} — ${esc(title)}</div>`;
  const play=wrap.querySelector('.dashboard-radio-play');
  play.addEventListener('click',()=>togglePlay(t,play));
}

function togglePlay(track,button){
  const src=track.audioUrl||track.audio||'';
  if(!src)return;
  if(!audio){audio=new Audio();audio.preload='none';audio.addEventListener('ended',()=>{current=(current+1)%tracks.length;render();});}
  if(audio.src&&audio.src===new URL(src,location.href).href&&!audio.paused){audio.pause();button.textContent='▶ PLAY';return;}
  if(audio.src!==new URL(src,location.href).href){audio.src=src;audio.load();}
  audio.play().then(()=>{
    button.textContent='❚❚ PAUSE';
    runTransaction(ref(db,`RadioTracks/${track.id}/playCount`),v=>(v||0)+1).catch(()=>{});
  }).catch(error=>{console.warn('Dashboard radio play failed',error);button.textContent='▶ PLAY';});
}

onValue(ref(db,'RadioTracks'),snap=>{tracks=approvedTracks(snap.val());current=0;render();},error=>{console.warn('Dashboard radio unavailable',error);render();});
