import { db } from './firebase-dev.js';
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const CONTROL_DOC='__stationControl';
const playlists=new Map();
const discoveredGenres=new Map();
let scheduleObserver=null;
let libraryObserver=null;

const minutesToTime=value=>{
  const minutes=((Number(value)||0)%1440+1440)%1440;
  return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
};

function genreForCard(card){
  if(!card)return '';
  const meta=card.querySelector('span')?.textContent||'';
  const parts=meta.split('·').map(part=>part.trim()).filter(Boolean);
  return parts.length>1?parts[1]:'';
}

function applyGenreFilter(){
  const select=document.getElementById('crr-genre-filter');
  const library=document.getElementById('crr-track-library');
  if(!select||!library)return;
  const selected=select.value;
  library.querySelectorAll('.crr-lib-item').forEach(card=>{
    const genre=genreForCard(card);
    if(genre&&!discoveredGenres.has(genre.toLowerCase()))discoveredGenres.set(genre.toLowerCase(),genre);
    card.hidden=Boolean(selected&&genre.toLowerCase()!==selected);
  });
  refreshGenreOptions();
}

function refreshGenreOptions(){
  const select=document.getElementById('crr-genre-filter');
  if(!select)return;
  const selected=select.value;
  const sorted=[...discoveredGenres.entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  select.replaceChildren();
  const all=document.createElement('option');all.value='';all.textContent='All genres';select.appendChild(all);
  sorted.forEach(([key,label])=>{const option=document.createElement('option');option.value=key;option.textContent=label;select.appendChild(option);});
  if([...select.options].some(option=>option.value===selected))select.value=selected;
}

function installGenreFilter(){
  const search=document.getElementById('crr-song-search');
  const library=document.getElementById('crr-track-library');
  if(!search||!library)return false;
  if(!document.getElementById('crr-genre-filter')){
    const select=document.createElement('select');
    select.id='crr-genre-filter';
    select.className='crr-search';
    select.setAttribute('aria-label','Filter approved songs by genre');
    select.innerHTML='<option value="">All genres</option>';
    search.insertAdjacentElement('afterend',select);
    select.addEventListener('change',applyGenreFilter);
  }
  if(!libraryObserver){
    libraryObserver=new MutationObserver(()=>applyGenreFilter());
    libraryObserver.observe(library,{childList:true,subtree:true});
  }
  applyGenreFilter();
  return true;
}

function setBuilderDays(days){
  const selected=Array.isArray(days)&&days.length?days:['every'];
  document.querySelectorAll('.crr-days input').forEach(input=>{input.checked=selected.includes(input.value);});
}

function clearLibraryFilters(){
  const songSearch=document.getElementById('crr-song-search');
  if(songSearch&&songSearch.value){songSearch.value='';songSearch.dispatchEvent(new Event('input',{bubbles:true}));}
  const sponsorSearch=document.getElementById('crr-sponsor-search');
  if(sponsorSearch&&sponsorSearch.value){sponsorSearch.value='';sponsorSearch.dispatchEvent(new Event('input',{bubbles:true}));}
  const genre=document.getElementById('crr-genre-filter');
  if(genre){genre.value='';applyGenreFilter();}
}

function findAddButton(item){
  const id=String(item?.id||'');
  if(!id)return null;
  const root=item.type==='sponsor'?document.getElementById('crr-sponsor-library'):document.getElementById('crr-track-library');
  if(!root)return null;
  return [...root.querySelectorAll('[data-action="add-library"]')].find(button=>String(button.dataset.key||'')===id)||null;
}

function resetSaveButton(){
  const save=document.getElementById('crr-save');
  if(!save)return;
  if(!save.dataset.stationEditId)save.textContent='Create Playlist';
}

function loadPlaylist(id,{duplicate=false}={}){
  const playlist=playlists.get(id);
  if(!playlist)return;
  const newButton=document.getElementById('crr-new');
  const save=document.getElementById('crr-save');
  if(!save)return;

  if(newButton)newButton.click();
  clearLibraryFilters();

  const name=document.getElementById('crr-name');
  const start=document.getElementById('crr-start');
  const end=document.getElementById('crr-end');
  if(name)name.value=duplicate?`${playlist.name||'Playlist'} Copy`:(playlist.name||'Playlist');
  if(start)start.value=minutesToTime(playlist.startMinutes);
  if(end)end.value=minutesToTime(playlist.endMinutes);
  setBuilderDays(playlist.days);

  save.dataset.stationEditId=duplicate?'':id;
  save.textContent=duplicate?'Create Copy':'Save Changes';

  let restored=0;
  let missing=0;
  (playlist.items||[]).forEach(item=>{
    const add=findAddButton(item);
    if(add){add.click();restored++;}else missing++;
  });

  const status=document.getElementById('crr-builder-status');
  if(status){
    status.style.color='#72e7d9';
    status.textContent=duplicate
      ? `Loaded “${playlist.name||'Playlist'}” as a copy. ${restored} item${restored===1?'':'s'} restored${missing?`; ${missing} unavailable item${missing===1?'':'s'} skipped`:''}.`
      : `Loaded “${playlist.name||'Playlist'}” for editing. ${restored} item${restored===1?'':'s'} restored${missing?`; ${missing} unavailable item${missing===1?'':'s'} skipped`:''}.`;
  }

  document.querySelector('.crr-builder')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function decorateSchedules(){
  const host=document.getElementById('crr-schedules');
  if(!host)return false;
  host.querySelectorAll('.crr-schedule').forEach(card=>{
    if(card.dataset.playlistTools==='1')return;
    const deleteButton=card.querySelector('[data-firestore-playlist-delete]');
    const id=deleteButton?.dataset.firestorePlaylistDelete;
    if(!id)return;
    const actions=deleteButton.closest('.crr-actions')||card;
    const edit=document.createElement('button');
    edit.type='button';edit.className='crr-btn';edit.textContent='Edit';
    edit.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();loadPlaylist(id,{duplicate:false});});
    const duplicate=document.createElement('button');
    duplicate.type='button';duplicate.className='crr-btn gold';duplicate.textContent='Replay / Copy';
    duplicate.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();loadPlaylist(id,{duplicate:true});});
    actions.insertBefore(edit,deleteButton);
    actions.insertBefore(duplicate,deleteButton);
    card.dataset.playlistTools='1';
  });
  return true;
}

function installScheduleObserver(){
  const host=document.getElementById('crr-schedules');
  if(!host)return false;
  if(!scheduleObserver){
    scheduleObserver=new MutationObserver(()=>decorateSchedules());
    scheduleObserver.observe(host,{childList:true,subtree:true});
  }
  decorateSchedules();
  return true;
}

function install(){
  const readyGenre=installGenreFilter();
  const readySchedules=installScheduleObserver();
  if(!readyGenre||!readySchedules)return false;
  const newButton=document.getElementById('crr-new');
  if(newButton&&!newButton.dataset.playlistToolsReset){
    newButton.dataset.playlistToolsReset='1';
    newButton.addEventListener('click',()=>setTimeout(resetSaveButton,0));
  }
  const save=document.getElementById('crr-save');
  if(save&&!save.dataset.playlistToolsReset){
    save.dataset.playlistToolsReset='1';
    save.addEventListener('click',()=>setTimeout(resetSaveButton,900));
  }
  return true;
}

onSnapshot(collection(db,'radioPlaylists'),snapshot=>{
  playlists.clear();
  snapshot.forEach(docSnap=>{if(docSnap.id!==CONTROL_DOC)playlists.set(docSnap.id,{id:docSnap.id,...docSnap.data()});});
  decorateSchedules();
},error=>console.warn('Playlist reuse tools could not read scheduled playlists.',error));

if(!install()){
  const observer=new MutationObserver(()=>{if(install())observer.disconnect();});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>observer.disconnect(),15000);
}
