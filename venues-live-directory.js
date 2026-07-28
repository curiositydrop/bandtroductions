import { db } from './firebase-dev.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const grid=document.getElementById('venueGrid')||document.querySelector('.musician-directory .profile-grid');
const townSearch=document.getElementById('townSearch');

function text(value,fallback='Not specified'){
  const clean=String(value||'').trim();
  return clean||fallback;
}

function makeCard(id,profile){
  const card=document.createElement('div');
  card.className='profile-card firebase-profile-card';
  card.dataset.profileId=id;
  card.dataset.town=String(profile.location||'').toLowerCase();

  if(profile.imageUrl){
    const image=document.createElement('img');
    image.src=profile.imageUrl;
    image.alt=`${text(profile.displayName,'Venue')} profile image`;
    image.loading='lazy';
    card.appendChild(image);
  }

  const name=document.createElement('h3');
  name.textContent=text(profile.displayName,'Unnamed Venue');
  card.appendChild(name);

  const location=document.createElement('p');
  const locationLabel=document.createElement('strong');
  locationLabel.textContent='Town: ';
  location.append(locationLabel,text(profile.location));
  card.appendChild(location);

  const type=document.createElement('p');
  const typeLabel=document.createElement('strong');
  typeLabel.textContent='Type: ';
  type.append(typeLabel,text(profile.venueType));
  card.appendChild(type);

  if(profile.genre){
    const hosts=document.createElement('p');
    const hostsLabel=document.createElement('strong');
    hostsLabel.textContent='Hosts: ';
    hosts.append(hostsLabel,text(profile.genre));
    card.appendChild(hosts);
  }

  if(profile.venueBooking){
    const booking=document.createElement('p');
    const bookingLabel=document.createElement('strong');
    bookingLabel.textContent='Booking: ';
    booking.append(bookingLabel,text(profile.venueBooking));
    card.appendChild(booking);
  }

  const link=document.createElement('a');
  link.className='button';
  link.href=`profile.html?id=${encodeURIComponent(id)}`;
  link.textContent='View Venue';
  card.appendChild(link);

  return card;
}

function applyTownSearch(){
  if(!townSearch)return;
  const search=townSearch.value.toLowerCase().trim();
  document.querySelectorAll('#venueGrid .profile-card').forEach(card=>{
    card.style.display=String(card.dataset.town||'').toLowerCase().includes(search)?'':'none';
  });
}

async function loadApprovedVenues(){
  if(!grid)return;
  try{
    const snapshot=await getDocs(query(collection(db,'profiles'),where('published','==',true)));
    const venues=[];
    snapshot.forEach(documentSnapshot=>{
      const profile=documentSnapshot.data();
      if(String(profile.accountType||'').toLowerCase()==='venue'){
        venues.push({id:documentSnapshot.id,profile});
      }
    });
    venues.sort((a,b)=>text(a.profile.displayName,'').localeCompare(text(b.profile.displayName,'')));
    venues.forEach(({id,profile})=>{
      if(grid.querySelector(`[data-profile-id="${CSS.escape(id)}"]`))return;
      grid.appendChild(makeCard(id,profile));
    });
    applyTownSearch();
  }catch(error){
    console.error('Could not load approved Firebase venues:',error);
  }
}

townSearch?.addEventListener('input',applyTownSearch);
loadApprovedVenues();