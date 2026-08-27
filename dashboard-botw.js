import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js';
import { getDatabase, ref, onValue } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js';

const firebaseConfig={apiKey:'AIzaSyApLiiJsKTw1Fp8J3aQatMqiSZoP_6EycE',authDomain:'bandfanwall.firebaseapp.com',databaseURL:'https://bandfanwall-default-rtdb.firebaseio.com',projectId:'bandfanwall',storageBucket:'bandfanwall.firebasestorage.app',messagingSenderId:'619241154826',appId:'1:619241154826:web:25ddc58eef094e3c0732f3'};
const app=getApps().find(a=>a.options?.projectId==='bandfanwall')||initializeApp(firebaseConfig,'botw-dashboard');
const db=getDatabase(app);
const panel=[...document.querySelectorAll('.right .panel')].find(p=>p.querySelector('h3')?.textContent.trim()==='Band of the Week');
const slugify=s=>String(s||'').toLowerCase().trim().replace(/&/g,'and').replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const safeNumber=v=>Number(v||0);
const scoreFor=b=>(safeNumber(b.votes)*5)+(safeNumber(b.likes)*2)+(safeNumber(b.analytics?.supportClicks)*10)+(safeNumber(b.analytics?.shareClicks)*4)+(safeNumber(b.analytics?.views)*.25);
const nameFor=(id,b)=>b.name||b.bandName||b.title||b.displayName||id.replace(/-/g,' ');
const urlFor=(id,b)=>b.profileUrl||b.url||b.link||`bands.html#${encodeURIComponent(slugify(nameFor(id,b)))}`;
let directoryMap=new Map();

async function loadDirectory(){
  try{
    const html=await fetch('bands.html').then(r=>r.text());
    const doc=new DOMParser().parseFromString(html,'text/html');
    [...doc.querySelectorAll('.profile-card')].forEach(card=>{
      const name=card.querySelector('h3')?.textContent?.trim();
      const img=card.querySelector('img')?.getAttribute('src');
      const link=card.querySelector('a.button')?.getAttribute('href');
      if(name)directoryMap.set(slugify(name),{img,link});
    });
  }catch(e){console.warn('Could not load band directory artwork',e);}
}

if(panel){
  const body=panel.querySelector('div');
  loadDirectory().finally(()=>{
    onValue(ref(db,'Bands'),snap=>{
      const data=snap.val()||{};
      const ranked=Object.entries(data).filter(([id])=>!id.startsWith('__')).map(([id,b])=>({id,b,score:scoreFor(b)})).sort((a,b)=>b.score-a.score);
      if(!ranked.length){body.innerHTML='<p style="color:#888">No leaderboard activity yet.</p><a class="btn" href="band-of-the-week.html">VIEW LEADERBOARD</a>';return;}
      const winner=ranked[0];
      const name=nameFor(winner.id,winner.b);
      const directory=directoryMap.get(slugify(name));
      const img=directory?.img||winner.b.image||winner.b.profileImage||winner.b.photo||winner.b.logo||winner.b.avatar||winner.b.banner||'IMG_9383.jpeg';
      const url=directory?.link||urlFor(winner.id,winner.b);
      body.innerHTML=`<a href="${url}" style="display:block;text-decoration:none;color:inherit"><img src="${img}" alt="${name}" style="width:100%;aspect-ratio:16/10;object-fit:cover;border:1px solid #333;margin-bottom:8px"><b style="display:block;color:var(--teal);font-size:1.05em;line-height:1.15">${name}</b><p style="color:var(--muted);margin:5px 0">${safeNumber(winner.b.votes)} votes · ${safeNumber(winner.b.likes)} likes</p></a><a class="btn" href="band-of-the-week.html">VIEW LEADERBOARD</a>`;
    },()=>{body.innerHTML='<p style="color:#888">Band of the Week unavailable.</p><a class="btn" href="band-of-the-week.html">VIEW LEADERBOARD</a>';});
  });
}
