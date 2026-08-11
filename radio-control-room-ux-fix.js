import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getDatabase, ref, onValue } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';

const cfg={apiKey:'AIzaSyApLiiJsKTw1Fp8J3aQatMqiSZoP_6EycE',authDomain:'bandfanwall.firebaseapp.com',databaseURL:'https://bandfanwall-default-rtdb.firebaseio.com',projectId:'bandfanwall',storageBucket:'bandfanwall.firebasestorage.app',messagingSenderId:'619241154826',appId:'1:619241154826:web:25ddc58eef094e3c0732f3'};
const app=getApps().find(a=>a.name==='radioControlRoomUxFix')||initializeApp(cfg,'radioControlRoomUxFix');
const db=getDatabase(app);

let beforeIds=new Set();
let latest={};
let armed=false;

function status(text,ok=true){
  const el=document.getElementById('crr-builder-status');
  if(!el)return;
  el.textContent=text;
  el.style.color=ok?'#70e8dc':'#ff9b9b';
}

function flashSchedule(id){
  requestAnimationFrame(()=>{
    const cards=[...document.querySelectorAll('#crr-schedules .crr-schedule')];
    const p=latest[id];
    const card=cards.find(c=>c.textContent.includes(p?.name||'__none__'));
    if(card){
      card.style.boxShadow='0 0 0 2px #0ccfbd,0 0 22px rgba(12,207,189,.22)';
      card.scrollIntoView({behavior:'smooth',block:'center'});
      setTimeout(()=>card.style.boxShadow='',3500);
    }
  });
}

onValue(ref(db,'RadioPlaylists'),snap=>{
  latest=snap.val()||{};
  const ids=new Set(Object.keys(latest));
  if(armed){
    const added=[...ids].find(id=>!beforeIds.has(id));
    if(added){
      const p=latest[added]||{};
      status(`✓ ${p.name||'Playlist'} created and scheduled. It will move to ON AIR automatically when its scheduled time slot is active.`);
      flashSchedule(added);
      armed=false;
    }
  }
  beforeIds=ids;
});

function attach(){
  const save=document.getElementById('crr-save');
  if(!save||save.dataset.uxFixed)return;
  save.dataset.uxFixed='1';
  save.addEventListener('click',()=>{
    beforeIds=new Set(Object.keys(latest));
    armed=true;
    status('Saving playlist and schedule…');
    setTimeout(()=>{
      if(armed){
        armed=false;
        status('No playlist was created. Check that the playlist has a name, at least one audio item, and different start/end times. If those are filled in, this is likely a Firebase write error.',false);
      }
    },4500);
  },true);
}

attach();
new MutationObserver(attach).observe(document.documentElement,{childList:true,subtree:true});
