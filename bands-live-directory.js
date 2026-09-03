import { db } from './firebase-dev.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

function applyDirectoryCardLayout(){
  if(document.getElementById('bt-directory-card-layout'))return;
  const style=document.createElement('style');
  style.id='bt-directory-card-layout';
  style.textContent=`
    .musician-directory{padding:34px 18px 50px}
    .musician-directory .profile-grid{
      display:grid;
      grid-template-columns:repeat(3,minmax(0,1fr));
      gap:18px;
      width:min(1180px,100%);
      margin:0 auto;
      align-items:start;
    }
    .musician-directory .profile-card{
      box-sizing:border-box;
      width:auto;
      min-width:0;
      height:auto;
      padding:0 0 18px;
      margin:0;
      display:flex;
      flex-direction:column;
      background:#0d1010;
      border:1px solid #343b3b;
      border-radius:2px;
      overflow:hidden;
      box-shadow:0 12px 30px rgba(0,0,0,.18);
    }
    .musician-directory .profile-card > img{
      display:block;
      width:100%;
      height:auto;
      aspect-ratio:1 / 1;
      object-fit:cover;
      object-position:center;
      background:#171b1b;
      margin:0 0 16px;
      border:0;
    }
    .musician-directory .profile-card:not(:has(> img))::before{
      content:'BANDtroductions';
      display:grid;
      place-items:center;
      width:100%;
      aspect-ratio:1 / 1;
      background:radial-gradient(circle at 50% 38%,#183a3a 0,#111 55%,#080909 100%);
      color:#27d6d6;
      font-weight:900;
      letter-spacing:.08em;
      font-size:clamp(9px,1.4vw,18px);
    }
    .musician-directory .profile-card .band-info{
      flex:0 0 auto!important;
      width:auto!important;
      max-width:none!important;
      min-width:0!important;
      margin:0!important;
      padding:0!important;
    }
    .musician-directory .profile-card > h3,
    .musician-directory .profile-card .band-info h3{
      margin:0 14px 8px;
      font-size:clamp(15px,2vw,27px);
      line-height:1.12;
      text-align:center;
      color:#fff;
    }
    .musician-directory .profile-card > p,
    .musician-directory .profile-card .band-info p{
      margin:3px 14px;
      font-size:clamp(11px,1.25vw,16px);
      line-height:1.3;
      color:#d5dddd;
      text-align:center;
    }
    .musician-directory .profile-card > p:nth-of-type(n+3){display:none}
    .musician-directory .profile-card .button{
      margin:12px 12px 0;
      padding:4px 4px 2px;
      background:transparent;
      color:#25d7d7;
      border:0;
      border-radius:0;
      box-shadow:none;
      font-size:clamp(11px,1.4vw,17px);
      font-weight:900;
      line-height:1.15;
      text-decoration:none;
      text-transform:uppercase;
      text-align:center;
    }
    .musician-directory .profile-card .button::after{content:' →'}
    .musician-directory .profile-card .band-actions{
      display:flex;
      flex:0 0 auto!important;
      flex-wrap:wrap;
      justify-content:center;
      margin-top:12px!important;
    }
    .musician-directory .profile-card .band-actions .button{margin:0 8px}
    @media (max-width:700px){
      .musician-directory{padding:22px 6px 36px}
      .musician-directory .profile-grid{gap:6px}
      .musician-directory .profile-card{padding-bottom:9px}
      .musician-directory .profile-card > img{margin-bottom:9px}
      .musician-directory .profile-card > h3,
      .musician-directory .profile-card .band-info h3{margin:0 5px 5px;font-size:clamp(11px,3.5vw,15px)}
      .musician-directory .profile-card > p,
      .musician-directory .profile-card .band-info p{margin:2px 5px;font-size:clamp(8px,2.55vw,11px);line-height:1.2}
      .musician-directory .profile-card .button{margin:8px 4px 0;padding:2px 2px 0;font-size:clamp(8px,2.6vw,11px)}
    }
  `;
  document.head.appendChild(style);
}

applyDirectoryCardLayout();

const grid=document.querySelector('.musician-directory .profile-grid');
const filter=document.getElementById('genreFilter');

function text(value,fallback='Not specified'){
  const clean=String(value||'').trim();
  return clean||fallback;
}

function makeCard(id,profile){
  const card=document.createElement('div');
  card.className='profile-card firebase-profile-card';
  card.dataset.profileId=id;
  card.dataset.genre=String(profile.genre||'').toLowerCase();

  if(profile.imageUrl){
    const image=document.createElement('img');
    image.src=profile.imageUrl;
    image.alt=`${text(profile.displayName,'Band')} profile image`;
    image.loading='lazy';
    card.appendChild(image);
  }

  const name=document.createElement('h3');
  name.textContent=text(profile.displayName,'Unnamed Band');
  card.appendChild(name);

  const location=document.createElement('p');
  const locationLabel=document.createElement('strong');
  locationLabel.textContent='Location: ';
  location.append(locationLabel,text(profile.location));
  card.appendChild(location);

  const genre=document.createElement('p');
  const genreLabel=document.createElement('strong');
  genreLabel.textContent='Genre: ';
  genre.append(genreLabel,text(profile.genre));
  card.appendChild(genre);

  if(profile.bio){
    const bio=document.createElement('p');
    bio.textContent=String(profile.bio).length>180?`${String(profile.bio).slice(0,177)}…`:profile.bio;
    card.appendChild(bio);
  }

  const link=document.createElement('a');
  link.className='button';
  link.href=`profile.html?id=${encodeURIComponent(id)}`;
  link.textContent='View Band';
  card.appendChild(link);

  return card;
}

function applyCurrentFilter(){
  if(!filter)return;
  const selected=filter.value.toLowerCase();
  document.querySelectorAll('.profile-grid .profile-card').forEach(card=>{
    const genres=String(card.dataset.genre||'').toLowerCase();
    card.style.display=selected==='all'||genres.includes(selected)?'':'none';
  });
}

async function loadApprovedBands(){
  if(!grid)return;
  try{
    const snapshot=await getDocs(query(collection(db,'profiles'),where('published','==',true)));
    const bands=[];
    snapshot.forEach(documentSnapshot=>{
      const profile=documentSnapshot.data();
      if(String(profile.accountType||'').toLowerCase()==='band'){
        bands.push({id:documentSnapshot.id,profile});
      }
    });
    bands.sort((a,b)=>text(a.profile.displayName,'').localeCompare(text(b.profile.displayName,'')));
    bands.forEach(({id,profile})=>{
      if(grid.querySelector(`[data-profile-id="${CSS.escape(id)}"]`))return;
      grid.appendChild(makeCard(id,profile));
    });
    applyCurrentFilter();
  }catch(error){
    console.error('Could not load approved Firebase bands:',error);
  }
}

filter?.addEventListener('change',applyCurrentFilter);
loadApprovedBands();
