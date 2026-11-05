// Dedicated Radio page player. Uses the same Firestore schedule (radioPlaylists) and
// schedule engine as the homepage player. Read-only: never writes to Firestore.
import { db as devDb } from './firebase-dev.js';
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { activePlaylist, nextPlaylist, playlistPosition, formatMinutes, easternClock, sponsorBreak, effectiveSponsorBreak, loadStaticSponsorBreak, withPreviewTestBreak } from './radio-schedule-engine.js?v=6';

const STATION_CONTROL_ID='__stationControl';
const DEFAULT_COVER='bt-radio-logo-280.webp';
const DAYS=['sun','mon','tue','wed','thu','fri','sat'];
const DAY_NAMES={sun:'Sunday',mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday',sat:'Saturday'};
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const safeUrl=u=>{try{const x=new URL(u,location.href);return /^https?:$/.test(x.protocol)?x.href:'';}catch{return '';}};

let playlists={},stationEnabled=true,stationSettings={},loaded=false;
let audio=null,listening=false,currentKey='',selectedDay='';

function currentBreak(){if(!stationEnabled)return null;const c=effectiveSponsorBreak(stationSettings);return withPreviewTestBreak(sponsorBreak(playlists,c),c);}
// Sponsor audio through the same (already tap-unlocked) <audio> element as the music, so iPhone plays it with no extra tap.
function breakAudio(b){return !!(b&&b.audioUrl&&listening);}
function playBreakAudio(b){
  ensureAudio();
  if(currentKey!==b.key){currentKey=b.key;audio.src=b.audioUrl;audio.load();
    audio.addEventListener('loadedmetadata',()=>{const f=currentBreak();if(f&&f.key===b.key){try{audio.currentTime=f.offsetSeconds;}catch{}if(f.clipPlaying)audio.play().catch(()=>{});}},{once:true});
    audio.play().catch(()=>{});return;}
  if(!b.clipPlaying){if(!audio.paused)audio.pause();return;}
  if(audio.readyState>0&&Math.abs((audio.currentTime||0)-b.offsetSeconds)>1.5){try{audio.currentTime=b.offsetSeconds;}catch{}}
  if(audio.paused&&audio.readyState>0&&(audio.currentTime||0)<(audio.duration||99)-.3)audio.play().catch(()=>{});
}
function state(){
  if(!stationEnabled||currentBreak())return null;
  const p=activePlaylist(playlists);if(!p)return null;
  const pos=playlistPosition(p);if(!pos)return null;
  const item=p.items?.[pos.index];if(!item?.audioUrl)return null;
  return {p,pos,item};
}
function showName(p){return (p&&(p.upNextDisplayName||p.name)||'Scheduled Show').toString().trim().replace(/\.$/,'');}
function fmtTime(s){s=Math.max(0,Math.floor(s));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}

function renderBreak(b){
  const card=$('rpPlayer');card.classList.add('is-live');
  $('rpStatus').textContent='● ON AIR';$('rpStatus').className='rp-status live';
  $('rpCover').hidden=true;
  const v=$('rpAd');v.hidden=false;
  if(v.getAttribute('src')!==b.videoUrl){v.src=b.videoUrl;if(b.posterUrl)v.poster=b.posterUrl;}
  v.setAttribute('aria-label',`${b.sponsorName} sponsor clip`);
  const viaAudio=breakAudio(b);
  if(viaAudio)playBreakAudio(b);
  v.muted=viaAudio||!listening;
  const target=viaAudio&&audio&&audio.readyState>0&&!audio.paused?audio.currentTime:b.offsetSeconds;
  if(b.clipPlaying){
    if(v.readyState>0&&Math.abs((v.currentTime||0)-target)>(viaAudio?.5:1.5)){try{v.currentTime=target;}catch{}}
    if(v.paused)v.play().catch(()=>{v.muted=true;v.play().catch(()=>{});});
  }else if(!v.paused)v.pause();
  $('rpLabel').textContent='A WORD FROM OUR SPONSOR';
  $('rpTrack').textContent=b.sponsorName;
  $('rpArtist').innerHTML=`<a class="rp-ad-link" href="${esc(safeUrl(b.clickUrl)||'radio-sponsor.html')}" target="_blank" rel="noopener sponsored">Visit ${esc(b.sponsorName)} ›</a>`;
  $('rpShow').textContent=`Up next: ${b.nextShow} at ${formatMinutes(b.nextStartMinutes)} ET`;
  $('rpProfile').hidden=true;
  $('rpListen').disabled=false;$('rpListen').textContent=listening?'❚❚ PAUSE':'▶ LISTEN LIVE';
  $('rpProgress').hidden=true;$('rpUpNext').innerHTML='';$('rpOff').hidden=true;
}
function hideBreak(){const v=$('rpAd');if(v&&!v.hidden){v.pause();v.hidden=true;$('rpCover').hidden=false;}}
function renderPlayer(){
  const b=currentBreak();
  if(b){renderBreak(b);return;}
  hideBreak();
  const s=state();
  const card=$('rpPlayer');
  card.classList.toggle('is-live',!!s);
  $('rpStatus').textContent=s?'● ON AIR':(loaded?'OFF AIR':'TUNING IN…');
  $('rpStatus').className='rp-status '+(s?'live':'off');
  if(s){
    const {p,pos,item}=s;
    const isSponsor=item.type==='sponsor';
    setImg(item.coverUrl||DEFAULT_COVER, item.title?`${item.title} cover art`:'Cover art');
    $('rpLabel').textContent=isSponsor?'A WORD FROM OUR SPONSOR':'NOW PLAYING';
    $('rpTrack').textContent=isSponsor?(item.title||'BANDtroductions Sponsor'):(item.title||'Untitled');
    $('rpArtist').textContent=item.artist||'Independent Music';
    $('rpShow').textContent=`${showName(p)} · until ${formatMinutes(p.endMinutes??1440)} ET`;
    const prof=safeUrl(item.profileUrl);
    $('rpProfile').hidden=!prof||isSponsor; if(prof)$('rpProfile').href=prof;
    $('rpListen').disabled=false;
    $('rpListen').textContent=listening?'❚❚ PAUSE':'▶ LISTEN LIVE';
    const total=Math.max(1,Number(item.durationSeconds)||1);
    $('rpBar').style.width=Math.min(100,pos.offsetSeconds/total*100)+'%';
    $('rpTime').textContent=`${fmtTime(pos.offsetSeconds)} / ${fmtTime(total)}`;
    $('rpProgress').hidden=false;
    const nextItem=p.items[(pos.index+1)%p.items.length];
    $('rpUpNext').innerHTML=nextItem?`<span>Up next:</span> ${esc(nextItem.title||'Untitled')} — ${esc(nextItem.artist||'')}`:'';
    $('rpOff').hidden=true;
  }else{
    setImg(DEFAULT_COVER,'BANDtroductions Radio');
    $('rpLabel').textContent='BANDTRODUCTIONS RADIO';
    $('rpTrack').textContent=loaded?'We\u2019re between shows':'Loading the station…';
    $('rpArtist').textContent='';
    $('rpShow').textContent='';
    $('rpProfile').hidden=true;
    $('rpListen').disabled=true;$('rpListen').textContent='▶ LISTEN LIVE';
    $('rpProgress').hidden=true;$('rpUpNext').innerHTML='';
    const n=loaded?nextPlaylist(playlists):null;
    if(loaded){
      $('rpOff').hidden=false;
      $('rpOff').innerHTML=!stationEnabled?'The station is taking a short break. Check back soon.':
        n?`Next show: <b>${esc(showName(n))}</b><br>${n.dayOffset===0?'Today':n.dayOffset===1?'Tomorrow':DAY_NAMES[n.day]} at ${formatMinutes(n.startMinutes)} ET`:'New shows are coming soon.';
    }
  }
}
function setImg(src,alt){const img=$('rpCover');if(img.getAttribute('src')!==src){img.src=src;}img.alt=alt;}

function slotsForDay(day){
  return Object.values(playlists).filter(p=>p.active!==false&&Array.isArray(p.items)&&p.items.length)
    .filter(p=>{const d=Array.isArray(p.days)&&p.days.length?p.days:['every'];return d.includes('every')||d.includes(day);})
    .sort((a,b)=>(Number(a.startMinutes)||0)-(Number(b.startMinutes)||0));
}
function renderSchedule(){
  const now=easternClock();const today=now.weekday.toLowerCase().slice(0,3);
  if(!selectedDay)selectedDay=today;
  const ti=DAYS.indexOf(today);
  $('rpDays').innerHTML=Array.from({length:7},(_,i)=>{const d=DAYS[(ti+i)%7];return `<button type="button" data-day="${d}" class="${d===selectedDay?'active':''}">${i===0?'Today':DAY_NAMES[d].slice(0,3)}</button>`;}).join('');
  const s=state();const list=slotsForDay(selectedDay);
  $('rpSchedule').innerHTML=list.length?list.map(p=>{
    const cur=s&&s.p.id===p.id&&selectedDay===today;
    const artists=[...new Set(p.items.map(i=>i.artist).filter(Boolean))];
    return `<li class="${cur?'current':''}"><div class="rp-slot-time">${formatMinutes(p.startMinutes)}<small>– ${formatMinutes(p.endMinutes??1440)}</small></div><div class="rp-slot-info"><b>${esc(showName(p))}</b>${cur?'<span class="rp-live-pill">ON NOW</span>':''}<div>${esc(artists.slice(0,4).join(', '))}${artists.length>4?' + more':''}</div></div></li>`;
  }).join(''):`<li class="empty">No shows scheduled ${selectedDay===today?'today':'this day'} yet.</li>`;
}
$('rpDays').addEventListener('click',e=>{const b=e.target.closest('button[data-day]');if(!b)return;selectedDay=b.dataset.day;renderSchedule();});

function ensureAudio(){
  if(audio)return audio;
  audio=new Audio();audio.preload='auto';audio.playsInline=true;audio.setAttribute('playsinline','');
  audio.addEventListener('ended',()=>sync());
  return audio;
}
async function sync(){
  const br=currentBreak();
  if(br){if(breakAudio(br))return;if(audio&&!audio.paused)audio.pause();currentKey='';return;}
  const s=state();
  if(!s){if(audio&&!audio.paused){audio.pause();}currentKey='';return;}
  if(!listening)return;
  ensureAudio();
  const {p,pos,item}=s;const key=`${p.id}|${pos.index}|${item.id||item.title}`;
  if(currentKey!==key){
    currentKey=key;audio.src=item.audioUrl;audio.load();
    audio.addEventListener('loadedmetadata',async()=>{const f=state();try{audio.currentTime=f?.pos?.offsetSeconds??pos.offsetSeconds;}catch{}try{await audio.play();}catch{}},{once:true});
    try{await audio.play();}catch{}
    return;
  }
  if(audio.readyState>0&&Math.abs(audio.currentTime-pos.offsetSeconds)>4){try{audio.currentTime=pos.offsetSeconds;}catch{}}
  if(audio.paused){try{await audio.play();}catch{}}
}
$('rpListen').addEventListener('click',async()=>{
  const br=currentBreak();
  if(br){listening=!listening;const v=$('rpAd');if(br.audioUrl){if(listening)playBreakAudio(br);else audio?.pause();v.muted=true;if(br.clipPlaying)v.play().catch(()=>{});}else{v.muted=!listening;if(listening)v.play().catch(()=>{});else audio?.pause();}renderPlayer();return;}
  if(listening){listening=false;audio?.pause();renderPlayer();return;}
  listening=true;ensureAudio();currentKey='';await sync();renderPlayer();
});

loadStaticSponsorBreak();setInterval(()=>loadStaticSponsorBreak(),60000);
onSnapshot(collection(devDb,'radioPlaylists'),snap=>{
  playlists={};stationEnabled=true;stationSettings={};
  snap.forEach(d=>{if(d.id===STATION_CONTROL_ID){stationSettings=d.data()||{};stationEnabled=stationSettings.stationOnAir!==false;return;}playlists[d.id]={id:d.id,...d.data()};});
  loaded=true;renderPlayer();renderSchedule();sync();
},err=>{
  console.error('Radio schedule read failed',err);loaded=true;
  $('rpTrack').textContent='Radio is unavailable right now';$('rpOff').hidden=false;$('rpOff').textContent='Please refresh in a minute.';
  $('rpSchedule').innerHTML='<li class="empty">Schedule unavailable. Please refresh.</li>';
});
let lastMin=-1;
setInterval(()=>{renderPlayer();sync();const m=easternClock().minutes;if(m!==lastMin){lastMin=m;if(loaded)renderSchedule();}},1000);
