import { db } from './firebase-dev.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

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
