import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

// Community pages may have an older cached copy of global.js. Load the current
// role and moderation modules directly from this already-required module.
import('./admin-access.js?v=5')
  .then(() => import('./admin-post-controls.js?v=5'))
  .catch((error) => console.error('Could not load community admin controls:', error));

const category=document.getElementById('post-category');
const content=document.getElementById('post-content');
const link=document.getElementById('post-link');
const publish=document.getElementById('publish-post');
const status=document.getElementById('composer-status');
const fields=document.getElementById('composer-fields');
if(!category||!content||!publish||!fields) throw new Error('Structured post composer could not load.');

let currentUser=null,currentProfile=null,publishing=false;

const style=document.createElement('style');
style.textContent=`
  .structured-post-fields{display:grid;gap:10px;padding:12px;border:1px solid #333;border-radius:12px;background:#0d0d0d}
  .structured-post-fields[hidden]{display:none!important}
  .structured-post-fields h3{margin:0;font-size:1rem;color:#0ccfbd}
  .community-post-body{white-space:pre-wrap}
`;
document.head.appendChild(style);

category.closest('label').firstChild.textContent='Post type';
category.replaceChildren(
  new Option('General','general'),
  new Option('Song Release','release'),
  new Option('Show / Event','show')
);

const titleLabel=document.createElement('label');
titleLabel.innerHTML='Optional post title<input id="post-title" type="text" maxlength="140" placeholder="Give this post a title">';
category.closest('label').insertAdjacentElement('afterend',titleLabel);

const releaseFields=document.createElement('section');
releaseFields.className='structured-post-fields';
releaseFields.hidden=true;
releaseFields.innerHTML=`<h3>Song Release Details</h3><label>Song title<input id="release-song-title" type="text" maxlength="160" placeholder="Song title"></label><label>Release date<input id="release-date" type="date"></label>`;
titleLabel.insertAdjacentElement('afterend',releaseFields);

const showFields=document.createElement('section');
showFields.className='structured-post-fields';
showFields.hidden=true;
showFields.innerHTML=`
  <h3>Show / Event Details</h3>
  <label>Venue name<input id="event-venue" type="text" maxlength="180" placeholder="Venue name"></label>
  <div class="auth-grid">
    <label>City<input id="event-city" type="text" maxlength="100" placeholder="City"></label>
    <label>State / Province<input id="event-state" type="text" maxlength="100" placeholder="State or province"></label>
  </div>
  <label>Country<input id="event-country" type="text" maxlength="100" value="USA" placeholder="Country"></label>
  <div class="auth-grid">
    <label>Date<input id="event-date" type="date"></label>
    <label>Time<input id="event-time" type="time"></label>
  </div>`;
releaseFields.insertAdjacentElement('afterend',showFields);

const filter=document.getElementById('feed-filter');
if(filter){
  [...filter.options].forEach(option=>{if(['video','radio','btv','shared-profile'].includes(option.value))option.remove()});
  const releaseOption=[...filter.options].find(option=>option.value==='release');
  if(releaseOption)releaseOption.textContent='Song Releases';
}

function syncType(){
  releaseFields.hidden=category.value!=='release';
  showFields.hidden=category.value!=='show';
  link.closest('label').firstChild.textContent=category.value==='release'?'Optional streaming / pre-save link':category.value==='show'?'Optional ticket or event link':'Optional link';
}
category.addEventListener('change',syncType);
syncType();

function value(id){return document.getElementById(id)?.value.trim()||''}
function normalizeUrl(raw){const text=(raw||'').trim();return text?(/^https?:\/\//i.test(text)?text:`https://${text}`):''}
function readableDate(iso){
  if(!iso)return '';
  const [year,month,day]=iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',year:'numeric'}).format(new Date(year,month-1,day));
}
function readableTime(time){
  if(!time)return '';
  const [hour,minute]=time.split(':').map(Number);
  return new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit'}).format(new Date(2000,0,1,hour,minute));
}
function resetComposer(){
  ['post-title','post-content','post-link','release-song-title','release-date','event-venue','event-city','event-state','event-date','event-time'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
  const country=document.getElementById('event-country');
  if(country)country.value='USA';
  category.value='general';syncType();
  window.BANDCommunityMedia?.clear?.();
  fields.hidden=true;
  const toggle=document.getElementById('composer-toggle');
  toggle?.setAttribute('aria-expanded','false');
  if(toggle)toggle.textContent='Create Post';
}

function collect(){
  const type=category.value;
  const postTitle=value('post-title');
  const message=value('post-content');
  const data={category:type,postTitle};
  let displayText='';

  if(type==='release'){
    const songTitle=value('release-song-title');
    const releaseDate=value('release-date');
    if(!songTitle)throw new Error('Add the song title.');
    if(!releaseDate)throw new Error('Choose the release date.');
    Object.assign(data,{songTitle,releaseDate});
    displayText=`🎵 SONG RELEASE\n${songTitle}\nReleasing ${readableDate(releaseDate)}`;
  }else if(type==='show'){
    const venueName=value('event-venue');
    const eventCity=value('event-city');
    const eventState=value('event-state');
    const eventCountry=value('event-country')||'USA';
    const eventDate=value('event-date');
    const eventTime=value('event-time');
    if(!venueName)throw new Error('Add the venue name.');
    if(!eventCity)throw new Error('Add the venue city.');
    if(!eventState)throw new Error('Add the venue state or province.');
    if(!eventDate)throw new Error('Choose the show date.');
    Object.assign(data,{venueName,eventCity,eventState,eventCountry,eventDate,eventTime});
    const location=[eventCity,eventState,eventCountry].filter(Boolean).join(', ');
    displayText=`🎤 SHOW / EVENT\n${venueName}\n${location}\n${readableDate(eventDate)}${eventTime?` at ${readableTime(eventTime)}`:''}`;
  }

  if(postTitle)displayText=`${postTitle}\n\n${displayText}`.trim();
  if(message)displayText=`${displayText}${displayText?'\n\n':''}${message}`;
  if(!displayText)throw new Error('Write something before publishing.');
  return {...data,content:displayText,linkUrl:normalizeUrl(value('post-link'))};
}

publish.addEventListener('click',async event=>{
  event.preventDefault();
  event.stopImmediatePropagation();
  if(publishing||!currentUser||!currentProfile)return;
  let structured;
  try{structured=collect()}catch(error){status.textContent=error.message;return}
  publishing=true;publish.disabled=true;status.textContent='Publishing…';
  const selected=window.BANDCommunityMedia?.getSelected?.()||null;
  try{
    await addDoc(collection(db,'posts'),{
      authorId:currentUser.uid,
      authorName:currentProfile.displayName||currentUser.displayName||'BANDtroductions Member',
      accountType:currentProfile.accountType||'member',
      ...structured,
      imageUrl:selected?.downloadUrl||'',
      mediaId:selected?.id||'',
      mediaType:selected?.mediaType||'',
      published:true,
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    });
    status.textContent='Posted.';
    resetComposer();
  }catch(error){
    console.error(error);
    status.textContent=error.code==='permission-denied'?'Post permissions are not enabled yet.':'Your post could not be published.';
  }finally{publishing=false;publish.disabled=false}
},true);

onAuthStateChanged(auth,async user=>{
  currentUser=user;
  if(!user){currentProfile=null;return}
  try{const snap=await getDoc(doc(db,'profiles',user.uid));currentProfile=snap.exists()?snap.data():{}}catch(error){console.error(error);currentProfile={}}
});