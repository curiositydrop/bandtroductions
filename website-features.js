import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';
import { app, auth, db, storage } from './firebase-dev.js';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where, setDoc, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';

const RADIO_LOGO='5C9409EE-59F6-4151-9624-2998D7DDF2D0.png';
let currentShows=[],showListeners=new Set();
const web=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
const make=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
function profileFromUrl(value){try{const u=new URL(value,location.href);return u.origin===location.origin||['bandtroductions.com','www.bandtroductions.com'].includes(u.hostname)?u.searchParams.get('id')||'':'';}catch{return '';}}
export function belongsToProfile(record,profileId){
 const explicit=record.websiteProfileId||profileFromUrl(record.profileUrl)||profileFromUrl(record.event?.profileUrl);
 return explicit?explicit===profileId:record.authorId===profileId||record.submittedByUid===profileId;
}
export function validDay(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
 const [y,m,d]=value.split('-').map(Number),date=new Date(y,m-1,d,12);
 return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d;
}
export function ageClass(age){const v=String(age||'').trim().toLowerCase();return /^all[\s-]*ages$/.test(v)?'all-ages':/^21\s*\+/.test(v)?'adults':'other-age';}
function dayKey(y,m,d){return String(y).padStart(4,'0')+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
function eventData(p){const e=p.event||{};return {...e,title:e.title||p.eventTitle||p.title||'Show',date:e.date||p.eventDate||p.showDate||'',age:e.age||p.eventAge||'',details:e.details||p.content||'',imageUrl:e.imageUrl||p.imageUrl||''};}
function dialog(title){
 const d=make('dialog',undefined,'ws-dialog'),heading=make('h2',title),body=make('div'),close=make('button','Close','button secondary');
 d.append(heading,body,close);document.body.append(d);
 close.type='button';close.onclick=()=>d.close();d.addEventListener('click',e=>{if(e.target===d)d.close();});
 return {d,body,heading};
}
export function initWebsiteFeatures({profileId,profile}){
 const main=document.getElementById('main');
 if(document.getElementById('shows'))return;
 const section=make('section',undefined,'section');section.id='shows';
 section.innerHTML='<div class="wrap"><p class="eyebrow">See us live</p><h2>Shows calendar.</h2><div class="ws-calendar"><div class="ws-month-nav"><button type="button" class="button secondary" data-month="-1" aria-label="Previous month">‹</button><h3 id="ws-month" aria-live="polite"></h3><button type="button" class="button secondary" data-month="1" aria-label="Next month">›</button></div><div class="ws-legend"><span><i class="all-ages"></i> All ages</span><span><i class="adults"></i> 21+</span></div><p class="muted">Tap a marked date for show details. Times are local to the venue.</p><div class="ws-weekdays" aria-hidden="true"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div id="ws-days" class="ws-days"></div><p id="ws-show-status" role="status">Loading shows…</p></div></div>';
 main.append(section);
 const popup=dialog('Show details');let month=new Date();month=new Date(month.getFullYear(),month.getMonth(),1,12);
 function showDetails(shows){
  popup.body.replaceChildren();
  for(const p of shows){const e=eventData(p),card=make('article',undefined,'ws-show-detail');card.append(make('h3',e.title));
   for(const [label,key] of [['Date','date'],['Time','time'],['Venue','venue'],['Location','location'],['Admission','price'],['Ages','age']])if(e[key])card.append(make('p',label+': '+e[key]));
   if(e.details)card.append(make('p',e.details,'ws-prewrap'));
   if(web(e.imageUrl)){const img=make('img');img.src=web(e.imageUrl);img.alt=e.title+' flyer';img.loading='lazy';card.append(img);}
   for(const [label,key] of [['Tickets','ticketUrl'],['Support','donateUrl']])if(web(e[key])){const a=make('a',label,'button');a.href=web(e[key]);a.target='_blank';a.rel='noopener';card.append(a);}
   popup.body.append(card);
  }
  popup.d.showModal();
 }
 function draw(){
  section.querySelector('#ws-month').textContent=month.toLocaleString('en-US',{month:'long',year:'numeric'});
  const grid=section.querySelector('#ws-days');grid.replaceChildren();
  const y=month.getFullYear(),m=month.getMonth(),days=new Date(y,m+1,0).getDate();
  for(let i=0;i<month.getDay();i++)grid.append(make('span',undefined,'ws-blank'));
  let count=0;
  for(let d=1;d<=days;d++){
   const key=dayKey(y,m,d),shows=currentShows.filter(p=>eventData(p).date===key),cell=make(shows.length?'button':'div',undefined,'ws-day');
   cell.append(make('span',String(d)));if(key===dayKey(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()))cell.setAttribute('aria-current','date');
   if(shows.length){count+=shows.length;cell.type='button';cell.classList.add('has-shows');cell.setAttribute('aria-label',key+': '+shows.map(p=>{const e=eventData(p);return e.title+', '+(e.age||'ages not specified');}).join('; '));
    const marks=make('span',undefined,'ws-day-marks');
    for(const c of new Set(shows.map(p=>ageClass(eventData(p).age))))marks.append(make('i',undefined,c));
    cell.append(marks,make('small',shows.length===1?'Show':shows.length+' shows'));cell.onclick=()=>showDetails(shows);
   }
   grid.append(cell);
  }
  section.querySelector('#ws-show-status').textContent=count?count+' show'+(count===1?'':'s')+' this month.':'No shows scheduled this month.';
 }
 section.querySelectorAll('[data-month]').forEach(b=>b.onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()+Number(b.dataset.month),1,12);draw();});
 draw();
 const snapshots=new Map(),stops=[];
 // Existing show posts remain the single source for Social, Upcoming Shows and this calendar.
 const owners=[...new Set([profileId,profile.ownerId].filter(Boolean))];
 const queries=[...owners.map(id=>query(collection(db,'posts'),where('authorId','==',id))),query(collection(db,'posts'),where('websiteProfileId','==',profileId))];
 queries.forEach((q,i)=>stops.push(onSnapshot(q,snap=>{
  snapshots.set(i,snap.docs.map(d=>({id:d.id,...d.data()})));
  const merged=new Map([...snapshots.values()].flat().map(p=>[p.id,p]));
  currentShows=[...merged.values()].filter(p=>p.published!==false&&p.category==='show'&&belongsToProfile(p,profileId)&&validDay(eventData(p).date)).sort((a,b)=>eventData(a).date.localeCompare(eventData(b).date));
  draw();showListeners.forEach(fn=>fn());
 },error=>{console.warn('Website shows unavailable',error);section.querySelector('#ws-show-status').textContent='Some shows could not be loaded. Please refresh to try again.';})));
 initBandPlayer({main,profileId,profile,stops});
 window.addEventListener('pagehide',()=>{if(popup.d.open)popup.d.close();},{once:true});
}
function initBandPlayer({main,profileId,profile,stops}){
 const section=make('section',undefined,'section');section.id='band-player';
 section.innerHTML='<div class="wrap"><p class="eyebrow">Turn it up</p><h2>Our music.</h2><div class="ws-player"><div class="ws-art"><img class="ws-cover" alt="Album artwork"><a href="radio.html"><img src="'+RADIO_LOGO+'" alt="BANDtroductions Radio"></a></div><h3 class="ws-track-title">Loading music…</h3><p class="ws-track-artist"></p><audio controls preload="none" aria-label="Band music player"></audio><div class="ws-player-controls"><button type="button" class="button secondary" data-track="-1">Previous</button><button type="button" class="button secondary" data-track="1">Next</button></div><ol class="ws-tracks"></ol><p class="ws-player-status" role="status">Songs appear here after admin approval.</p></div></div>';
 main.append(section);
 const audio=section.querySelector('audio'),list=section.querySelector('ol'),status=section.querySelector('.ws-player-status');
 const cover=section.querySelector('.ws-cover');const fallback=web(profile.imageUrl)||RADIO_LOGO;cover.src=fallback;
 cover.onerror=()=>{cover.onerror=null;cover.src=RADIO_LOGO;};
 let tracks=[],selected=-1;
 function choose(index,play=false){
  if(!tracks.length)return;
  selected=(index+tracks.length)%tracks.length;const t=tracks[selected];
  section.querySelector('.ws-track-title').textContent=t.title||'Untitled';
  section.querySelector('.ws-track-artist').textContent=(t.artist||profile.displayName||'')+(t.album?' · '+t.album:'');
  cover.src=web(t.coverUrl)||fallback;audio.src=web(t.audioUrl);
  [...list.querySelectorAll('button')].forEach((b,i)=>{b.classList.toggle('is-playing',i===selected);b.setAttribute('aria-pressed',String(i===selected));});
  if(play)audio.play().catch(()=>{status.textContent='Tap Play on the audio controls to listen.';});
 }
 section.querySelectorAll('[data-track]').forEach(b=>b.onclick=()=>choose(selected+Number(b.dataset.track),true));
 audio.addEventListener('ended',()=>{if(selected+1<tracks.length)choose(selected+1,true);});
 audio.addEventListener('error',()=>{status.textContent='This song could not be played. Try another track or refresh.';});
 audio.addEventListener('play',()=>{status.textContent='Playing '+(tracks[selected]?.title||'your selection');});
 const fetchTracks=httpsCallable(getFunctions(app,'us-central1'),'getWebsiteRadioTracks');let loading=false;
 async function refreshTracks(){if(loading)return;loading=true;try{const response=await fetchTracks({profileId});
  const previous=tracks[selected]?.id;
  tracks=(Array.isArray(response.data?.tracks)?response.data.tracks:[]).filter(t=>web(t.audioUrl)).sort((a,b)=>(a.dateAdded||a.approvedAt||0)-(b.dateAdded||b.approvedAt||0));
  list.replaceChildren();
  tracks.forEach((t,i)=>{const li=make('li'),b=make('button',t.title||'Untitled');b.type='button';b.onclick=()=>choose(i,true);li.append(b);list.append(li);});
  section.querySelectorAll('[data-track]').forEach(b=>b.disabled=!tracks.length);audio.hidden=!tracks.length;
  if(!tracks.length){audio.pause();audio.removeAttribute('src');audio.load();selected=-1;section.querySelector('.ws-track-title').textContent='Music coming soon';status.textContent='Approved songs from '+(profile.displayName||'this artist')+' will appear here.';return;}
  const retained=tracks.findIndex(t=>t.id===previous);
  if(retained<0)choose(0);else{selected=retained;list.querySelectorAll('button')[selected]?.setAttribute('aria-pressed','true');}
  status.textContent=tracks.length+' approved song'+(tracks.length===1?'':'s')+'. Choose a track to listen.';
 }catch(error){console.warn('Band player unavailable',error);section.querySelector('.ws-track-title').textContent='Music coming soon';status.textContent='The band player is being connected. Song submissions still go to admin review.';}finally{loading=false;}}
 void refreshTracks();window.addEventListener('focus',refreshTracks);
 const timer=setInterval(()=>{if(!document.hidden)void refreshTracks();},60000);
 stops.push(()=>{clearInterval(timer);window.removeEventListener('focus',refreshTracks);});
 window.addEventListener('pagehide',()=>audio.pause());
}
export function mountWebsiteTools({container,profileId,profile,user,canEdit}){
 const tools=make('div',undefined,'ws-tools');
 tools.innerHTML='<h2>Shows & song uploads</h2><p>Shows publish when you choose Publish show. Song uploads go to admin review. These actions are separate from the appearance preview above.</p><details class="ws-tool"><summary>Manage shows calendar</summary><div class="ws-show-list"></div><form class="ws-show-form"><fieldset><legend>Show details</legend><div class="ws-form-grid"></div><label>Details<textarea name="details" maxlength="3000"></textarea></label><div class="actions"><button type="submit" class="button">Publish show</button><button type="button" class="button secondary ws-new-show">Clear / new show</button><button type="button" class="button secondary ws-remove-show" hidden>Unpublish show</button></div></fieldset><p role="status" class="ws-form-status"></p></form></details><details class="ws-tool"><summary>Upload songs to your player</summary><p>Upload MP3 files with album art. Songs use the same radio submission folder and approval queue. After approval, they appear in your website player and are available for radio scheduling.</p><form class="ws-song-form"><fieldset><legend>Song submission</legend><div class="ws-form-grid"></div><label>Notes<textarea name="notes" maxlength="3000"></textarea></label><div class="ws-permissions"></div><button type="submit" class="button">Submit song for approval</button></fieldset><p role="status" class="ws-form-status"></p></form></details>';
 container.append(tools);
 const showForm=tools.querySelector('.ws-show-form'),songForm=tools.querySelector('.ws-song-form');
 const value=(form,key)=>form.elements.namedItem(key);
 function input(form,key,label,type='text',required=false,initial=''){
  const wrap=make('label',label),field=make('input');field.name=key;field.type=type;field.required=required;field.value=initial;if(type==='text'||type==='url'||type==='email')field.maxLength=1000;wrap.append(field);form.querySelector('.ws-form-grid').append(wrap);return field;
 }
 for(const [key,label,type,req] of [['title','Show title','text',true],['date','Date','date',true],['time','Time (venue local)','time',true],['venue','Venue','text',true],['location','City / state','text',true],['price','Admission price','text',false],['ticketUrl','Ticket link','url',false],['donateUrl','Support link','url',false],['imageUrl','Flyer image URL','url',false]])input(showForm,key,label,type,req);
 const ageWrap=make('label','Age restriction'),age=make('select');age.name='age';age.required=true;
 for(const text of ['All ages','21+']){const option=make('option',text);option.value=text;age.append(option);}ageWrap.append(age);showForm.querySelector('.ws-form-grid').append(ageWrap);
 let editing=null,editRevision=null,showBusy=false,songBusy=false,disposed=false;
 const showStatus=showForm.querySelector('.ws-form-status');
 async function verify(){if(disposed||auth.currentUser?.uid!==user.uid)throw new Error('Your sign-in changed. Reload before saving.');const s=await getDoc(doc(db,'profiles',profileId));if(!s.exists()||!canEdit(user,s.data(),profileId))throw new Error('Only this profile’s owner or an administrator can save.');return s.data();}
 const revision=p=>p.updatedAt?.toMillis?.()||p.createdAt?.toMillis?.()||0;
 function clearShow(){showForm.reset();editing=null;editRevision=null;showForm.querySelector('[type=submit]').textContent='Publish show';showForm.querySelector('.ws-remove-show').hidden=true;}
 function drawList(){
  const list=tools.querySelector('.ws-show-list');list.replaceChildren();
  currentShows.forEach(p=>{const e=eventData(p),b=make('button',e.date+' · '+e.title,'button secondary');b.type='button';b.disabled=showBusy;b.onclick=()=>{
   if(showBusy)return;clearShow();editing=p;editRevision=revision(p);
   for(const key of ['title','date','time','venue','location','price','ticketUrl','donateUrl','imageUrl','details'])value(showForm,key).value=e[key]||'';
   if(!['All ages','21+'].includes(e.age)){age.value='';showStatus.textContent='Choose All ages or 21+ before saving this existing show.';}else{age.value=e.age;showStatus.textContent='Editing this show updates Social and Upcoming Shows too.';}
   showForm.querySelector('[type=submit]').textContent='Save show changes';showForm.querySelector('.ws-remove-show').hidden=false;
  };list.append(b);});
  if(!currentShows.length)list.append(make('p','No published shows yet. Add your first show below.'));
 }
 showListeners.add(drawList);drawList();
 showForm.querySelector('.ws-new-show').onclick=()=>{clearShow();showStatus.textContent='';};
 async function saveShow(unpublish=false){
  if(showBusy)return;
  if(!unpublish&&!showForm.reportValidity())return;
  showBusy=true;showForm.querySelector('fieldset').disabled=true;drawList();
  try{
   await verify();const id=editing?.id||doc(collection(db,'posts')).id;
   const e={};for(const key of ['title','date','time','venue','location','price','ticketUrl','donateUrl','imageUrl','details','age'])e[key]=value(showForm,key).value.trim();
   if(!unpublish&&(!validDay(e.date)||!['All ages','21+'].includes(e.age)))throw new Error('Choose a valid show date and age restriction.');
   for(const key of ['ticketUrl','donateUrl','imageUrl'])if(e[key]&&!web(e[key]))throw new Error('Use a full https:// or http:// link.');
   e.profileUrl=new URL('profile.html?id='+encodeURIComponent(profileId),location.href).href;
   const summary=[e.title,e.venue&&'at '+e.venue,e.location&&'in '+e.location].filter(Boolean).join(' ');
   const update={event:e,eventDate:e.date,showDate:e.date,content:summary+(e.details?'\n\n'+e.details:''),linkUrl:e.ticketUrl,imageUrl:e.imageUrl,websiteProfileId:profileId,published:!unpublish,updatedAt:serverTimestamp()};
   await runTransaction(db,async tx=>{
    const target=doc(db,'posts',id),snap=await tx.get(target);
    if(editing){
     if(!snap.exists())throw new Error('This show no longer exists. Refresh the page.');
     const p=snap.data();if(!belongsToProfile(p,profileId))throw new Error('This show belongs to another profile.');
     if(revision(p)!==editRevision)throw new Error('This show changed in another session. Select it again before saving.');
     tx.update(target,update);
    }else{
     if(snap.exists())throw new Error('Please try publishing again.');
     tx.set(target,{...update,authorId:user.uid,authorName:profile.displayName||'BANDtroductions Member',accountType:profile.accountType||'band',category:'show',createdAt:serverTimestamp()});
    }
   });
   clearShow();showStatus.textContent=unpublish?'Show unpublished from your calendar, Social and Upcoming Shows.':'Saved! Your calendar, Social and Upcoming Shows use this same show.';
  }catch(error){console.error(error);showStatus.textContent=error.code==='permission-denied'?'Your account could not save this show. Nothing was published.':error.message;}
  finally{showBusy=false;if(!disposed){showForm.querySelector('fieldset').disabled=false;drawList();}}
 }
 showForm.onsubmit=e=>{e.preventDefault();void saveShow();};
 showForm.querySelector('.ws-remove-show').onclick=()=>{if(editing&&confirm('Unpublish this show from the calendar, Social and Upcoming Shows?'))void saveShow(true);};

 for(const [key,label,type,req,initial] of [['title','Song title','text',true,''],['album','Album','text',false,'Single'],['genre','Genre','text',true,profile.genre||''],['contactName','Contact name','text',true,user.displayName||profile.displayName||''],['contactEmail','Contact email','email',true,user.email||''],['location','Location','text',false,profile.location||''],['labelContact','Label name / contact (if signed)','text',false,'']])input(songForm,key,label,type,req,initial);
 const signedWrap=make('label','Signed to a record label?'),signed=make('select');signed.name='signedToLabel';
 for(const [v,t] of [['false','No'],['true','Yes']]){const o=make('option',t);o.value=v;signed.append(o);}signedWrap.append(signed);songForm.querySelector('.ws-form-grid').append(signedWrap);
 input(songForm,'audioFile','MP3 (under 25 MB)','file',true).accept='.mp3,audio/mpeg';
 input(songForm,'coverFile','Album art (JPG, PNG, WebP; under 10 MB)','file').accept='image/jpeg,image/png,image/webp';
 const permissions=[
 ['permissionConfirmed','I certify that I own this recording and composition, or I am legally authorized by the rights holders to submit it to BANDtroductions Radio.'],
 ['broadcastPermission','I give BANDtroductions permission to store, stream, broadcast, and promote this recording through BANDtroductions Radio and BANDtroductions promotional features without requiring additional approval each time it is played.'],
 ['agreementAccepted','I understand that submitting a song does not guarantee airplay, rotation frequency, placement, or promotion, and I agree to the BANDtroductions Radio Music Submission & Broadcast Agreement below.'],
 ['websiteRadioPermission','I understand any music uploaded to my website is also submitted for play on BANDtroductions Radio, subject to admin approval and radio scheduling.']
 ];
 const permissionArea=songForm.querySelector('.ws-permissions');
 permissions.forEach(([key,text])=>{const label=make('label',undefined,'ws-check'),box=make('input');box.type='checkbox';box.name=key;box.required=true;label.append(box,make('span',text));permissionArea.append(label);});
 const agreement=make('details');agreement.innerHTML='<summary>Read the Radio Music Submission & Broadcast Agreement</summary><div class="ws-agreement"></div>';permissionArea.append(agreement);
 agreement.querySelector('div').innerHTML=AGREEMENT_HTML;
 const songStatus=songForm.querySelector('.ws-form-status');
 let attempt=null;
 songForm.onsubmit=async event=>{
  event.preventDefault();if(songBusy||!songForm.reportValidity())return;
  songBusy=true;songForm.querySelector('fieldset').disabled=true;
  const uploaded=[];let committed=false;
  try{
   await verify();const account=await getDoc(doc(db,'users',user.uid));if(!account.exists())throw new Error('Complete your BANDtroductions account before submitting music.');
   const audioFile=value(songForm,'audioFile').files[0],coverFile=value(songForm,'coverFile').files[0];
   if(!audioFile||!(audioFile.type==='audio/mpeg'||/\.mp3$/i.test(audioFile.name))||audioFile.size<=0||audioFile.size>=25*1024*1024)throw new Error('Choose a valid MP3 smaller than 25 MB.');
   if(coverFile&&(!['image/jpeg','image/png','image/webp'].includes(coverFile.type)||coverFile.size>=10*1024*1024))throw new Error('Choose JPG, PNG or WebP album art smaller than 10 MB.');
   if(permissions.some(([key])=>!value(songForm,key).checked))throw new Error('Accept all music permissions before uploading.');
   const title=value(songForm,'title').value.trim(),artist=profile.displayName||'BANDtroductions Artist';
   if(!title||!value(songForm,'genre').value.trim())throw new Error('Add a song title and genre.');
   songStatus.textContent='Reading your MP3…';const durationSeconds=await audioDuration(audioFile);
   if(!attempt)attempt=doc(collection(db,'radioSubmissions'));
   // Reuse the submission ID if a response is lost; never duplicate the review entry on retry.
   const base='website-'+attempt.id;
   const audioPath='radio-submissions/'+user.uid+'/'+base+'.mp3',audioRef=ref(storage,audioPath);
   songStatus.textContent='Uploading your song for admin approval…';
   await uploadBytes(audioRef,audioFile,{contentType:'audio/mpeg',customMetadata:{submittedByUid:user.uid,artist,title,websiteProfileId:profileId}});uploaded.push(audioRef);
   const audioUrl=await getDownloadURL(audioRef);let coverUrl='',coverStoragePath='';
   if(coverFile){const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[coverFile.type];coverStoragePath='radio-submissions/'+user.uid+'/'+base+'-cover.'+ext;const r=ref(storage,coverStoragePath);await uploadBytes(r,coverFile,{contentType:coverFile.type});uploaded.push(r);coverUrl=await getDownloadURL(r);}
   await verify();
   const record={artist,title,album:value(songForm,'album').value.trim()||'Single',genre:value(songForm,'genre').value.trim(),location:value(songForm,'location').value.trim(),contactName:value(songForm,'contactName').value.trim(),contactEmail:value(songForm,'contactEmail').value.trim(),memberDisplayName:account.data().displayName||artist,memberAccountType:account.data().accountType||'',submittedByUid:user.uid,submittedByVerifiedAccount:true,profileUrl:new URL('profile.html?id='+encodeURIComponent(profileId),location.href).href,websiteProfileId:profileId,submissionSource:'profile-website',coverUrl,coverStoragePath,originalCoverFileName:coverFile?.name||'',audioUrl,audioStoragePath:audioPath,originalAudioFileName:audioFile.name,durationSeconds:Math.round(durationSeconds*10)/10,signedToLabel:value(songForm,'signedToLabel').value==='true',labelContact:value(songForm,'labelContact').value.trim(),notes:value(songForm,'notes').value.trim(),permissionConfirmed:true,broadcastPermission:true,agreementAccepted:true,websiteRadioPermission:true,websiteRadioPermissionText:permissions[3][1],approved:false,reviewStatus:'pending',submittedAt:Date.now(),createdAt:serverTimestamp(),isrc:'',label:'',releaseYear:'',songwriter:'',publisher:'',explicit:false};
   await setDoc(attempt,record);committed=true;const submissionId=attempt.id;attempt=null;
   songForm.reset();songStatus.textContent='Submitted for admin approval! After approval, this song appears in your player and is available for BANDtroductions Radio scheduling.';
   void notifyAdmins({user,artist,title,submissionId});
  }catch(error){
   console.error('Website song submission failed',error);
   // Keep uploads on ambiguous network failures so a committed review entry never loses its audio.
   // Do not delete uploaded audio after an uncertain response: admin may already have received it.
   songStatus.textContent=error.code==='permission-denied'?'Your account could not access the radio review queue. Your form is still here.':error.message||'Submission failed. Your form is still here; try again.';
  }finally{songBusy=false;if(!disposed)songForm.querySelector('fieldset').disabled=false;}
 };
 const unload=e=>{if(songBusy||showBusy){e.preventDefault();e.returnValue='';}};
 window.addEventListener('beforeunload',unload);
 return ()=>{disposed=true;showListeners.delete(drawList);window.removeEventListener('beforeunload',unload);tools.remove();};
}
function audioDuration(file){return new Promise((resolve,reject)=>{
 const a=document.createElement('audio'),url=URL.createObjectURL(file);
 const done=(error)=>{clearTimeout(timer);const duration=a.duration;a.onloadedmetadata=null;a.onerror=null;a.removeAttribute('src');a.load();URL.revokeObjectURL(url);error?reject(error):resolve(duration);};
 const timer=setTimeout(()=>done(new Error('Could not read this MP3. Please try another file.')),15000);
 a.onloadedmetadata=()=>done(Number.isFinite(a.duration)&&a.duration>0?null:new Error('The MP3 has no readable duration.'));
 a.onerror=()=>done(new Error('Could not read this MP3. Please try another file.'));a.preload='metadata';a.src=url;
});}
async function notifyAdmins({user,artist,title,submissionId}){
 try{const snap=await getDocs(query(collection(db,'profiles'),where('isAdmin','==',true)));
 await Promise.all(snap.docs.map(d=>setDoc(doc(db,'notifications','website_radio_'+submissionId+'_'+d.id),{recipientId:d.id,actorId:user.uid,actorName:artist,type:'radio-submission',message:artist+' submitted “'+title+'” from their website for radio approval.',linkUrl:'admin.html',read:false,createdAt:serverTimestamp()})));
 }catch(error){console.warn('Song saved; optional admin notification unavailable.',error);}
}
const AGREEMENT_HTML="<p>By submitting music to BANDtroductions Radio, you agree to the following terms:</p>\n    <h3>Ownership & Authority</h3>\n    <p>You represent and warrant that you own or control all rights necessary to submit the music provided to BANDtroductions Radio and that you have authority to grant the permissions described here.</p>\n    <h3>Grant of Permission</h3>\n    <p>You grant BANDtroductions and BANDtroductions Radio a non-exclusive, worldwide, royalty-free, revocable permission to store, stream, broadcast, and promote the submitted recording and to display artist names, song titles, logos, artwork, and promotional information connected with that use. Ownership remains with the artist or rights holder.</p>\n    <h3>Signed Artists & Other Rights Arrangements</h3>\n    <p>If the music is subject to a label, publishing, management, distribution, or other rights agreement, you represent that all necessary permissions have been obtained before submission. BANDtroductions may request verification.</p>\n    <h3>Airplay & Compensation</h3>\n    <p>Submission does not guarantee airplay, promotion, placement, rotation frequency, or continued inclusion. Unless otherwise agreed in writing, BANDtroductions does not owe compensation or fees for use authorized by this submission.</p>\n    <h3>Removal</h3>\n    <p>You may request that future use of your submitted recording stop by contacting BANDtroductions. BANDtroductions may also remove a submission at its discretion.</p>\n    <h3>Acceptance</h3>\n    <p>By checking the submission boxes and submitting music, you confirm that you have read, understood, and agree to these terms.</p>";
