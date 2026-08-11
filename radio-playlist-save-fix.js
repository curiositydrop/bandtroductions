import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getDatabase, ref, onValue, set } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { activePlaylist, playlistPosition, formatMinutes, RADIO_TIMEZONE } from './radio-schedule-engine.js?v=2';

const cfg={apiKey:'AIzaSyApLiiJsKTw1Fp8J3aQatMqiSZoP_6EycE',authDomain:'bandfanwall.firebaseapp.com',databaseURL:'https://bandfanwall-default-rtdb.firebaseio.com',projectId:'bandfanwall',storageBucket:'bandfanwall.firebasestorage.app',messagingSenderId:'619241154826',appId:'1:619241154826:web:25ddc58eef094e3c0732f3'};
const app=getApps().find(a=>a.name==='radioPlaylistSaveFix')||initializeApp(cfg,'radioPlaylistSaveFix');
const db=getDatabase(app);
const STATION_PATH='RadioTracks/__station';
let stationPlaylists={};
let tracks={};
let sponsors={};

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const mins=v=>{const [h,m]=String(v||'00:00').split(':').map(Number);return (h||0)*60+(m||0)};
const durationText=s=>{s=Math.max(0,Math.round(Number(s)||0));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`};
const timeValue=m=>`${String(Math.floor((Number(m)||0)/60)%24).padStart(2,'0')}:${String((Number(m)||0)%60).padStart(2,'0')}`;
const norm=v=>String(v||'').replace(/[🎵📢♪♫]/gu,'').trim().toLowerCase();

function selectedDays(){const vals=[...document.querySelectorAll('.crr-days input:checked')].map(i=>i.value);return vals.includes('every')?['every']:(vals.length?vals:['every']);}
function parseDuration(meta){const m=String(meta).match(/(\d+):(\d{2})\s*$/);return m?Number(m[1])*60+Number(m[2]):0;}
function currentDraft(){
  const cards=[...document.querySelectorAll('#crr-drop [data-draft-index]')];
  return cards.map(card=>{
    const strongText=card.querySelector('strong')?.textContent||'';
    const titleText=norm(strongText);
    const spans=[...card.querySelectorAll('span')].filter(s=>!s.classList.contains('crr-handle'));
    const meta=spans.map(s=>s.textContent||'').find(t=>t.includes('·')||/\d+:\d{2}/.test(t))||'';
    const isSponsor=strongText.includes('📢');
    if(isSponsor){
      let hit=Object.entries(sponsors).find(([,x])=>norm(x.businessName)===titleText);
      if(!hit)hit=Object.entries(sponsors).find(([,x])=>norm(x.businessName).includes(titleText)||titleText.includes(norm(x.businessName)));
      if(!hit)return null;
      const [id,x]=hit;return {type:'sponsor',id,title:x.businessName||strongText,artist:'Sponsor',audioUrl:x.audioUrl||'',coverUrl:x.logoUrl||'',profileUrl:'',durationSeconds:Number(x.durationSeconds||x.audioDurationSeconds)||parseDuration(meta)};
    }
    const artist=norm(meta.split('·')[0]);
    let hit=Object.entries(tracks).find(([id,x])=>id!=='__station'&&norm(x.title)===titleText&&(!artist||norm(x.artist)===artist));
    if(!hit)hit=Object.entries(tracks).find(([id,x])=>id!=='__station'&&norm(x.title)===titleText);
    if(!hit)hit=Object.entries(tracks).find(([id,x])=>id!=='__station'&&(norm(x.title).includes(titleText)||titleText.includes(norm(x.title))));
    if(!hit)return null;
    const [id,x]=hit;return {type:'track',id,title:x.title||strongText,artist:x.artist||meta.split('·')[0]?.trim()||'',audioUrl:x.audioUrl||'',coverUrl:x.coverUrl||'',profileUrl:x.profileUrl||'',durationSeconds:Number(x.durationSeconds)||parseDuration(meta)};
  }).filter(Boolean);
}
function newId(){return `playlist-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;}

async function savePlaylistFromUi(){
  const status=document.getElementById('crr-builder-status');
  const button=document.getElementById('crr-save');
  const name=document.getElementById('crr-name')?.value.trim()||'';
  const start=mins(document.getElementById('crr-start')?.value);
  const end=mins(document.getElementById('crr-end')?.value);
  const items=currentDraft();
  if(!name){status.textContent='Give the playlist a name.';status.style.color='#ff9d9d';return;}
  if(!items.length){status.textContent='The song is visible, but I could not match it to the approved library. Refresh Admin once and add the song again.';status.style.color='#ff9d9d';return;}
  if(start===end){status.textContent='Start and end time cannot be the same.';status.style.color='#ff9d9d';return;}
  const editingId=button?.dataset.stationEditId||'';
  const id=editingId||newId();
  const old=stationPlaylists[id]||{};
  const payload={name,days:selectedDays(),startMinutes:start,endMinutes:end,timezone:RADIO_TIMEZONE,items,totalDurationSeconds:Math.round(items.reduce((n,x)=>n+Number(x.durationSeconds||0),0)*10)/10,active:true,createdAt:old.createdAt||Date.now(),updatedAt:Date.now()};
  button.disabled=true;status.style.color='#9ca5a4';status.textContent='Saving playlist and schedule…';
  try{
    const next={...stationPlaylists,[id]:payload};
    await set(ref(db,STATION_PATH),next);
    status.style.color='#72e7d9';status.textContent=`✓ ${name} created and scheduled.`;
    button.dataset.stationEditId='';
    setTimeout(()=>document.getElementById('crr-schedules')?.scrollIntoView({behavior:'smooth',block:'center'}),100);
  }catch(error){
    console.error('Station playlist save failed',error);
    status.style.color='#ff9d9d';status.textContent=`Playlist save failed: ${error?.code||error?.message||'PERMISSION_DENIED'}`;
  }finally{button.disabled=false;}
}

function renderSchedules(){
  const el=document.getElementById('crr-schedules');if(!el)return;
  const current=activePlaylist(stationPlaylists);
  const entries=Object.entries(stationPlaylists).sort((a,b)=>(a[1].startMinutes||0)-(b[1].startMinutes||0));
  const count=document.getElementById('crr-playlist-count');if(count)count.textContent=entries.length;
  el.innerHTML=entries.length?entries.map(([id,p])=>{const on=current?.id===id;return `<article class="crr-schedule ${on?'onair':''}"><strong style="color:#fff">${on?'🔴 ':''}${esc(p.name||'Playlist')}</strong><div class="crr-muted">${(p.days||['every']).join(', ')} · ${formatMinutes(p.startMinutes)}–${formatMinutes(p.endMinutes)} · ${durationText(p.totalDurationSeconds)} · ${(p.items||[]).length} items · ${p.active===false?'INACTIVE':'ACTIVE'}</div><div class="crr-actions"><button class="crr-btn" data-station-action="edit" data-key="${id}">Edit</button><button class="crr-btn gold" data-station-action="toggle" data-key="${id}">${p.active===false?'Activate':'Disable'}</button><button class="crr-btn danger" data-station-action="delete" data-key="${id}">Delete</button></div></article>`}).join(''):'<div class="crr-empty">No scheduled playlists yet.</div>';
  renderOnAir();
}
function renderOnAir(){const el=document.getElementById('crr-onair');if(!el)return;const p=activePlaylist(stationPlaylists);if(!p){el.innerHTML='<div class="crr-empty">Nothing is scheduled for this time slot.</div>';return;}const pos=playlistPosition(p);const item=p.items?.[pos?.index||0];if(!item){el.innerHTML='<div class="crr-empty">Active playlist has no playable items.</div>';return;}el.innerHTML=`<div class="crr-onair"><div class="crr-onair-art">${item.coverUrl?`<img src="${esc(item.coverUrl)}">`:(item.type==='sponsor'?'📢':'♪')}</div><div><strong style="color:#fff;font-size:1rem">${esc(p.name)}</strong><div style="color:#0ccfbd;font-weight:900;margin-top:4px">${item.type==='sponsor'?'SPONSOR: ':''}${esc(item.title||'Untitled')}</div><div class="crr-muted">${esc(item.artist||'')} · ${durationText(pos?.offsetSeconds||0)} into item · ${formatMinutes(p.startMinutes)}–${formatMinutes(p.endMinutes)}</div></div></div>`;}
function loadEdit(id){const p=stationPlaylists[id];if(!p)return;document.getElementById('crr-name').value=p.name||'';document.getElementById('crr-start').value=timeValue(p.startMinutes);document.getElementById('crr-end').value=timeValue(p.endMinutes);document.querySelectorAll('.crr-days input').forEach(i=>i.checked=(p.days||['every']).includes(i.value));const btn=document.getElementById('crr-save');btn.dataset.stationEditId=id;btn.textContent='Save Playlist';document.getElementById('crr-name').scrollIntoView({behavior:'smooth',block:'center'});}

function installCapture(){
  document.addEventListener('click',async e=>{
    const save=e.target.closest('#crr-save');
    if(save){e.preventDefault();e.stopImmediatePropagation();await savePlaylistFromUi();return;}
    const b=e.target.closest('[data-station-action]');if(!b)return;
    e.preventDefault();e.stopImmediatePropagation();const id=b.dataset.key,action=b.dataset.stationAction;
    if(action==='edit'){loadEdit(id);return;}
    if(action==='toggle'){const p=stationPlaylists[id];if(!p)return;await set(ref(db,STATION_PATH),{...stationPlaylists,[id]:{...p,active:p.active===false,updatedAt:Date.now()}});return;}
    if(action==='delete'&&confirm('Delete this scheduled playlist?')){const next={...stationPlaylists};delete next[id];await set(ref(db,STATION_PATH),next);}
  },true);
}

installCapture();
onValue(ref(db,'RadioTracks'),s=>{tracks=s.val()||{};stationPlaylists=tracks.__station||{};renderSchedules();},e=>console.error('RadioTracks read failed',e));
onValue(ref(db,'RadioSponsors'),s=>{sponsors=s.val()||{};},()=>{});
setInterval(renderOnAir,1000);
