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
    .brand-block{
      display:flex!important;
      align-items:center!important;
      justify-content:flex-start!important;
      gap:14px!important;
      min-width:0!important;
    }
    .brand-copy{
      display:flex!important;
      flex-direction:column!important;
      justify-content:center!important;
      min-width:0!important;
    }
    .header-logo-frame{
      width:126px!important;
      height:92px!important;
      display:flex!important;
      align-items:center!important;
      justify-content:center!important;
      overflow:visible!important;
      flex:0 0 126px!important;
      align-self:center!important;
    }
    .header-logo{
      width:100%!important;
      height:100%!important;
      max-width:none!important;
      object-fit:contain!important;
      object-position:center!important;
      display:block!important;
      transform:scale(1.22)!important;
      transform-origin:center!important;
    }
    .news-scroller-card{height:40px!important;grid-template-columns:66px minmax(0,1fr)!important}
    .news-label{font-size:11px!important;line-height:.92!important}
    .news-group{font-size:12px!important;gap:25px!important;padding:0 12px!important}
    .radio-panel{position:relative!important;overflow:hidden!important;min-width:0!important}
    .right,.center,.left{min-width:0!important}
    .right{max-width:100%!important}
    .right .panel{max-width:100%!important}
    .radio-coming-soon{
      position:absolute;
      z-index:20;
      top:11px;
      right:8px;
      width:116px;
      text-align:center;
      background:#b91c1c;
      color:#fff;
      border:1px solid #ff5a5a;
      padding:5px 6px;
      font-size:9px;
      font-weight:950;
      letter-spacing:.06em;
      transform:rotate(12deg);
      transform-origin:center;
      box-shadow:0 3px 10px rgba(0,0,0,.65);
      pointer-events:none;
      text-transform:uppercase;
      white-space:nowrap;
    }
    @media(max-width:1000px){
      .sticky-header{width:calc(100% - 12px)!important}
      .brand-block{gap:10px!important}
      .header-logo-frame{width:106px!important;height:78px!important;flex-basis:106px!important}
      .header-logo{transform:scale(1.24)!important}
      .news-scroller-card{height:31px!important;grid-template-columns:56px minmax(0,1fr)!important}
      .news-label{font-size:9px!important;line-height:.9!important}
      .news-group{font-size:10px!important;gap:20px!important;padding:0 10px!important}
      .grid{grid-template-columns:minmax(0,23fr) minmax(0,50fr) minmax(0,27fr)!important;gap:6px!important;width:100%!important;max-width:100%!important;overflow:hidden!important}
      .right{width:100%!important;max-width:100%!important;overflow:hidden!important}
      .right .panel{width:100%!important;max-width:100%!important;overflow:hidden!important}
      .radio-coming-soon{top:9px;right:5px;width:92px;font-size:7px;padding:4px 3px;transform:rotate(10deg)}
    }
    @media(max-width:650px){
      .sticky-header{width:calc(100% - 8px)!important}
      .brand-block{gap:8px!important;align-items:center!important}
      .brand-copy{justify-content:center!important}
      .header-logo-frame{width:88px!important;height:68px!important;flex-basis:88px!important}
      .header-logo{transform:scale(1.28)!important}
      .news-scroller-card{height:26px!important;grid-template-columns:48px minmax(0,1fr)!important}
      .news-label{font-size:7px!important;line-height:.88!important}
      .news-group{font-size:7.5px!important;gap:15px!important;padding:0 8px!important}
      .grid{grid-template-columns:minmax(0,23fr) minmax(0,51fr) minmax(0,26fr)!important;gap:3px!important;width:100%!important;max-width:100%!important;overflow:hidden!important}
      .right{width:100%!important;max-width:100%!important;padding:0!important;margin:0!important;overflow:hidden!important}
      .right .panel{width:100%!important;max-width:100%!important;margin-left:0!important;margin-right:0!important;overflow:hidden!important}
      .right .panel h3{padding-right:3px!important;overflow-wrap:anywhere!important}
      .radio-coming-soon{top:5px;right:3px;width:61px;font-size:4.8px;padding:2px 2px;letter-spacing:.03em;transform:rotate(9deg)}
    }
  `;
  document.head.appendChild(style);

  const navLinks=[...document.querySelectorAll('.nav a')];
  const communityLink=navLinks.find(a=>a.textContent.trim().toUpperCase()==='COMMUNITY');
  if(communityLink){communityLink.textContent='GEAR EXCHANGE';communityLink.href='gear-exchange.html';}

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
