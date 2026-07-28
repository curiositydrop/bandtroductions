import { db } from './firebase-dev.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const grid=document.querySelector('.musician-directory .profile-grid');
const genreFilter=document.getElementById('genreFilter');
const instrumentFilter=document.getElementById('instrumentFilter');

function text(value,fallback='Not specified'){
  const clean=String(value||'').trim();
  return clean||fallback;
}

function makeCard(id,profile){
  const card=document.createElement('div');
  card.className='profile-card firebase-profile-card';
  card.dataset.profileId=id;
  card.dataset.genre=String(profile.genre||'').toLowerCase();
  card.dataset.instrument=String(profile.instruments||'').toLowerCase();

  if(profile.imageUrl){
    const image=document.createElement('img');
    image.src=profile.imageUrl;
    image.alt=`${text(profile.displayName,'Musician')} profile image`;
    image.loading='lazy';
    card.appendChild(image);
  }

  const name=document.createElement('h3');
  name.textContent=text(profile.displayName,'Unnamed Musician');
  card.appendChild(name);

  const instrument=document.createElement('p');
  const instrumentLabel=document.createElement('strong');
  instrumentLabel.textContent='Instrument: ';
  instrument.append(instrumentLabel,text(profile.instruments));
  card.appendChild(instrument);

  const location=document.createElement('p');
  const locationLabel=document.createElement('strong');
  locationLabel.textContent='Location: ';
  location.append(locationLabel,text(profile.location));
  card.appendChild(location);

  const genre=document.createElement('p');
  const genreLabel=document.createElement('strong');
  genreLabel.textContent='Style: ';
  genre.append(genreLabel,text(profile.genre));
  card.appendChild(genre);

  if(profile.lookingForBand){
    const looking=document.createElement('p');
    const lookingLabel=document.createElement('strong');
    lookingLabel.textContent='Looking For: ';
    looking.append(lookingLabel,text(profile.lookingForBand));
    card.appendChild(looking);
  }

  const link=document.createElement('a');
  link.className='button';
  link.href=`profile.html?id=${encodeURIComponent(id)}`;
  link.textContent='View Profile';
  card.appendChild(link);

  return card;
}

function normalize(value){
  return String(value||'').toLowerCase().replace(/[^a-z0-9&]+/g,'');
}

function applyCurrentFilters(){
  const selectedGenre=genreFilter?.value||'all';
  const selectedInstrument=instrumentFilter?.value||'all';
  document.querySelectorAll('.profile-grid .profile-card').forEach(card=>{
    const genreMatch=selectedGenre==='all'||normalize(card.dataset.genre).includes(normalize(selectedGenre));
    const instrumentMatch=selectedInstrument==='all'||normalize(card.dataset.instrument).includes(normalize(selectedInstrument));
    card.style.display=genreMatch&&instrumentMatch?'':'none';
  });
}

async function loadApprovedMusicians(){
  if(!grid)return;
  try{
    const snapshot=await getDocs(query(collection(db,'profiles'),where('published','==',true)));
    const musicians=[];
    snapshot.forEach(documentSnapshot=>{
      const profile=documentSnapshot.data();
      if(String(profile.accountType||'').toLowerCase()==='musician'){
        musicians.push({id:documentSnapshot.id,profile});
      }
    });
    musicians.sort((a,b)=>text(a.profile.displayName,'').localeCompare(text(b.profile.displayName,'')));
    musicians.forEach(({id,profile})=>{
      if(grid.querySelector(`[data-profile-id="${CSS.escape(id)}"]`))return;
      grid.appendChild(makeCard(id,profile));
    });
    applyCurrentFilters();
  }catch(error){
    console.error('Could not load approved Firebase musicians:',error);
  }
}

genreFilter?.addEventListener('change',applyCurrentFilters);
instrumentFilter?.addEventListener('change',applyCurrentFilters);
loadApprovedMusicians();