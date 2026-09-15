import { mountBookingReview } from './website-booking.js?v=5';
import { normalizeMembers, renderMembers, createMemberEditor, initialMembers } from './website-review-members.js?v=2';
import { mountWebsiteTools } from './website-features.js?v=2';
import { normalizeMedia, profileVideos, websiteVideos, applyMedia, createMediaEditor } from './website-media-v2.js?v=grid1';
// Website pilot settings and owner editor. No database writes happen during preview.
// Match admin-access.js without importing its account-normalization side effects.
export function isWebsiteAdmin(user){return !!user&&['mbergeron79@gmail.com','mbegeron79@gmail.com'].includes(String(user.email||'').trim().toLowerCase());}
export function canEditWebsite(user,profile,profileId){return profileId===BOOKING_PILOT_PROFILE&&!!user&&(user.uid===profileId||profile.ownerId===user.uid||isWebsiteAdmin(user));}
export const DEFAULTS={background:'#0b100f',text:'#eef4ee',accent:'#c3ec77'};
export const DEFAULT_TAGLINE='Heavy music. No apologies.';
export const DEFAULT_HERO_BRIGHTNESS=1.16;
export const DEFAULT_HERO_POSITION={x:50,y:25};
const BOOKING_PILOT_PROFILE='19MH0ZzVlPVN4ediF4PesZR5TY13';
const color=v=>/^#[0-9a-f]{6}$/i.test(v||'');
function luminance(hex){return hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);}
export function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function safeButtonUrl(value){
 const v=String(value||'').trim();if(!v||/%0[ad]/i.test(v))return '';
 try{const u=new URL(v);if(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password)return u.href;
 if(u.protocol==='mailto:'&&/^mailto:[^\s@?<>]+@[^\s@?<>]+\.[^\s@?<>]+$/.test(v))return v;}catch{}
 return '';
}
export function normalizeSettings(input={}){
 if(!input||typeof input!=='object')input={};
 const theme={...DEFAULTS};for(const k of Object.keys(theme))if(color(input.theme?.[k]))theme[k]=input.theme[k];
 if(contrast(theme.background,theme.text)<4.5||contrast(theme.background,theme.accent)<3)Object.assign(theme,DEFAULTS);
 const bookingInput=input.booking||{},paymentPolicy=['deposit','full','in_person'].includes(bookingInput.paymentPolicy)?bookingInput.paymentPolicy:'in_person';
 const tagline=input.tagline===undefined?DEFAULT_TAGLINE:String(input.tagline||'').trim().slice(0,120);
 const heroBrightness=Math.min(1.5,Math.max(.7,Number(input.heroBrightness)||DEFAULT_HERO_BRIGHTNESS));
 const heroPosition={x:Math.min(100,Math.max(0,Number(input.heroPosition?.x??DEFAULT_HERO_POSITION.x))),y:Math.min(100,Math.max(0,Number(input.heroPosition?.y??DEFAULT_HERO_POSITION.y)))};
 const backgroundImageUrl=safeButtonUrl(input.backgroundImageUrl);const pageChoices=['#/home','#/about','#/music','#/photos','#/shows','#/merch','#/booking','#/contact'];const heroButtons=Array.isArray(input.heroButtons)?input.heroButtons.slice(0,2).map((b,i)=>({label:String(b?.label||['Meet the band','Get in touch'][i]).trim().slice(0,40),url:pageChoices.includes(b?.url)?b.url:['#/about','#/contact'][i]})):[{label:'Meet the band',url:'#/about'},{label:'Get in touch',url:'#/contact'}];const settings={theme,tagline,heroBrightness,heroPosition,backgroundImageUrl,heroButtons,sections:{about:input.sections?.about!==false,music:input.sections?.music!==false,merch:input.sections?.merch!==false,meetBand:input.sections?.meetBand!==false},booking:{...bookingInput,enabled:bookingInput.enabled===true,rateCents:Number.isFinite(Number(bookingInput.rateCents))?Math.max(0,Math.round(Number(bookingInput.rateCents))):0,rateBasis:bookingInput.rateBasis==='member'?'member':'show',paymentPolicy,depositPercent:paymentPolicy==='deposit'?50:0},buttons:[]};
 for(const b of (Array.isArray(input.buttons)?input.buttons:[]).slice(0,6)){const url=safeButtonUrl(b?.url),label=String(b?.label||'').trim().slice(0,40);if(url&&label)settings.buttons.push({label,url});}
 for(const k of ['bannerImageUrl','imageUrl','backgroundImageUrl']){const v=safeButtonUrl(input[k]);if(v&&/^https?:/.test(v))settings[k]=v;}
 return {...settings,...normalizeMedia(input),bandMembers:normalizeMembers(input.bandMembers)};
}
export function websiteProfile(profile,settings){const s=normalizeSettings(settings);return {...profile,mediaLink:'',additionalMedia:websiteVideos(profile,s),mediaItems:(profile.mediaItems||[]).filter(i=>i?.type==='image'),...(s.bannerImageUrl?{bannerImageUrl:s.bannerImageUrl}:{}),...(s.imageUrl?{imageUrl:s.imageUrl}:{})};}
export function applyWebsiteStyle(input,profile={}){
 const s=normalizeSettings(input),root=document.documentElement,el=id=>document.getElementById(id);applyMedia(s,{},profile);renderMembers(s);
 for(const [key,value] of Object.entries(s.theme))root.style.setProperty(`--site-${key}`,value);root.style.setProperty('--site-page-bg-image',s.backgroundImageUrl?`url("${s.backgroundImageUrl}")`:'none');root.style.setProperty('--site-hero-brightness',String(s.heroBrightness));root.style.setProperty('--site-hero-position-x',s.heroPosition.x+'%');root.style.setProperty('--site-hero-position-y',s.heroPosition.y+'%');
 root.style.setProperty('--site-button-text',contrast(s.theme.accent,'#000000')>=contrast(s.theme.accent,'#ffffff')?'#000000':'#ffffff');
 for(const id of ['about','music','merch']){const section=el(id);section.hidden=s.sections[id]===false||(id==='music'&&!el('videos').children.length)||(id==='merch'&&section.dataset.available!=='true');const nav=el(`${id}-nav`);if(nav)nav.hidden=section.hidden;}const booking=el('booking');if(booking){booking.hidden=false;const nav=el('booking-nav');if(nav)nav.hidden=false;}
 el('listen').hidden=el('music').hidden;el('about-cta').hidden=el('about').hidden;
 el('custom-buttons').replaceChildren();for(const b of s.buttons){const a=document.createElement('a');a.className='button';a.href=b.url;a.textContent=b.label;el('custom-buttons').append(a);}
}

export async function initWebsiteEditor({profileId,profile,render}){
 const [{auth,db,storage},{onAuthStateChanged},{doc,runTransaction},{ref,uploadBytes,getDownloadURL,deleteObject}]=await Promise.all([
 import('./firebase-dev.js'),import('https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js'),import('https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js')]);
 const link=document.getElementById('website-edit-link'),copy=document.getElementById('preview-lock-copy');
 if(!link)throw new Error('The website editor entry is missing. Please reload this page.');
 if(profileId!==BOOKING_PILOT_PROFILE){
  link.hidden=true;
  if(copy)copy.textContent='Editing is locked while subscriptions are being set up.';
  return;
 }
 let teardown=null;
 onAuthStateChanged(auth,user=>{
  if(teardown){teardown();teardown=null;}
  const owns=canEditWebsite(user,profile,profileId);
  if(copy)copy.textContent=owns?'Venomous Thorns pilot · ':user?'This website can only be edited by its owner or an administrator. ':'Sign in as the Venomous Thorns owner to edit this pilot. ';
  link.hidden=!!user&&!owns;link.textContent=owns?(isWebsiteAdmin(user)?'Edit website · Admin':'Edit my website'):user?'Editing requires the owner or admin account':'Log in to edit website';
  link.href=owns?'#website-editor':`login.html?returnTo=${encodeURIComponent(location.pathname+'?id='+encodeURIComponent(profileId)+'&edit=1')}`;
  if(!owns)return;
  try{teardown=mount(user);}catch(error){
   console.error('Website editor could not open.',error);
   document.getElementById('website-editor')?.remove();
   if(copy)copy.textContent='The editor could not open. Please refresh to try again.';
  }
 });
 function mount(user){
  let saved=normalizeSettings({...profile.websiteSettings,bandMembers:initialMembers(profile,profile.websiteSettings||{})}),revision=profile.websiteSettings?.revision||null,dirty=false,busy=false,previewed=false;
  let pending={},urls={},draft=null;
  const panel=document.createElement('section');panel.id='website-editor';panel.className='website-editor';panel.hidden=true;
  const profileEditUrl=isWebsiteAdmin(user)?`profile-setup.html?adminProfile=${profileId}&editor=3`:`profile-setup.html?id=${profileId}`;
  panel.innerHTML=`<div class="wrap"><h2>Edit my website</h2><p>Keep your layout. Make it yours. Preview changes, then publish when you're ready.</p><p><a href="${profileEditUrl}">Edit free-profile bio & basic details ↗</a></p>
  <form id="website-form"><fieldset id="website-fields"><legend class="sr-only">Website appearance</legend><div class="editor-grid">
  <section><h3>Images</h3><p>Website images only. Use JPG, PNG, or WebP, up to 12 MB. Images are resized automatically.</p><label>Banner image<input type="file" id="site-banner" accept="image/jpeg,image/png,image/webp"></label><button type="button" id="reset-banner">Use profile banner</button><label>Band image / logo<input type="file" id="site-image" accept="image/jpeg,image/png,image/webp"></label><button type="button" id="reset-image">Use profile image</button></section>
  <section><h3>Page background</h3><label>Background image<input type="file" id="site-background-image" accept="image/jpeg,image/png,image/webp"></label><button type="button" id="reset-background-image">Use page color</button></section>
  <section><h3>Hero</h3><label>First button text<input type="text" id="site-hero-button-1" maxlength="40"></label><label>First button page<select id="site-hero-destination-1"><option value="#/about">About / Meet the band</option><option value="#/home">Home</option><option value="#/music">Videos</option><option value="#/photos">Photos</option><option value="#/shows">Shows</option><option value="#/merch">Merch store</option><option value="#/booking">Booking</option><option value="#/contact">Contact</option></select></label><label>Second button text<input type="text" id="site-hero-button-2" maxlength="40"></label><label>Second button page<select id="site-hero-destination-2"><option value="#/contact">Contact</option><option value="#/home">Home</option><option value="#/about">About / Meet the band</option><option value="#/music">Videos</option><option value="#/photos">Photos</option><option value="#/shows">Shows</option><option value="#/merch">Merch store</option><option value="#/booking">Booking</option></select></label><label>Tagline<input type="text" id="site-tagline" maxlength="120" placeholder="Heavy music. No apologies."></label><p>This appears under the band name. Our wording is only a suggestion—make it yours or leave it blank.</p></section>
  <section><h3>Hero</h3><label>Background brightness <input type="range" id="site-hero-brightness" min="0.70" max="1.50" step="0.01"></label><output id="site-hero-brightness-value"></output><label>Left / right <input type="range" id="site-hero-x" min="0" max="100" step="1"></label><output id="site-hero-x-value"></output><label>Up / down <input type="range" id="site-hero-y" min="0" max="100" step="1"></label><output id="site-hero-y-value"></output><p>Adjust the hero image until it looks right on your page.</p></section>
  <section><h3>Colors</h3><label>Page background<input type="color" id="site-background"></label><label>Page text<input type="color" id="site-text"></label><label>Accent & buttons<input type="color" id="site-accent"></label><p>Banner text stays light for readability. Page text and accent colors must contrast with the background.</p><button type="button" id="reset-colors">Restore default colors</button></section>
  <section><h3>Sections</h3><label><input type="checkbox" id="show-about"> About the band</label><label><input type="checkbox" id="show-meet-band" checked> Meet the band</label><label><input type="checkbox" id="show-music"> Videos</label><label><input type="checkbox" id="show-merch"> Merch</label><p>Music and merch appear when content is available. Contact always stays visible.</p></section>
  <section><h3>Booking & payment</h3><label>Booking email<input type="email" id="booking-email" maxlength="200" required></label><label><input type="checkbox" id="booking-enabled"> Accept booking requests</label><label>Rate ($)<input type="number" id="booking-rate" min="0" step="0.01"></label><label>Rate basis<select id="booking-rate-basis"><option value="show">Per show</option><option value="member">Per member</option></select></label><p>Choose one payment policy:</p><label><input type="radio" name="booking-payment" value="deposit"> 50% deposit online after approval</label><label><input type="radio" name="booking-payment" value="full"> Full payment online after approval</label><label><input type="radio" name="booking-payment" value="in_person"> Pay in person at the show</label></section>
  <section><h3>Your buttons</h3><p>Add up to six buttons below the banner. Rename the button, then choose which page it opens.</p><div id="button-rows"></div><button type="button" id="add-button">+ Add button</button></section>
  </div><div class="editor-actions"><button type="submit">Preview changes ↓</button><button type="button" id="publish-website" disabled>Publish website</button><button type="button" id="discard-website">Discard changes</button><button type="button" id="close-editor">Close editor</button></div></fieldset><p id="editor-status" role="status" aria-live="polite"></p></form></div>`;
  document.querySelector('header').after(panel);
  const $=id=>panel.querySelector(`#${id}`),form=$('website-form'),fields=$('website-fields'),status=$('editor-status'),rows=$('button-rows');
  panel.querySelectorAll('.editor-grid > section').forEach(card=>{const heading=card.querySelector('h3');if(!heading)return;heading.style.cursor='pointer';heading.setAttribute('role','button');heading.setAttribute('aria-expanded','false');[...card.children].filter(node=>node!==heading).forEach(node=>node.hidden=true);heading.onclick=()=>{const open=heading.getAttribute('aria-expanded')==='true';heading.setAttribute('aria-expanded',String(!open));[...card.children].filter(node=>node!==heading).forEach(node=>node.hidden=open);};});
  if(profileId!==BOOKING_PILOT_PROFILE){const section=[...panel.querySelectorAll('section')].find(node=>node.querySelector('h3')?.textContent==='Booking & payment');if(section){section.querySelectorAll('input,select').forEach(control=>control.disabled=true);const note=document.createElement('p');note.textContent='Booking setup is currently in pilot testing with Venomous Thorns.';section.append(note);}}
  function setDirty(){dirty=true;previewed=false;$('publish-website').disabled=true;status.textContent='Unpublished changes. Preview to review them.';}
  function clearImages(){Object.values(urls).forEach(URL.revokeObjectURL);pending={};urls={};}
  function addRow(button={}){if(rows.children.length>=6)return;const row=document.createElement('div');row.className='button-row';const label=document.createElement('input'),destination=document.createElement('select'),remove=document.createElement('button');label.placeholder='Button text';label.setAttribute('aria-label','Button text');label.maxLength=40;label.value=button.label||'';destination.setAttribute('aria-label','Button destination');destination.innerHTML='<option value="">Choose a page…</option><option value="#/home">Home</option><option value="#/about">About / Meet the band</option><option value="#/music">Videos</option><option value="#/photos">Photos</option><option value="#/shows">Shows</option><option value="#/merch">Merch store</option><option value="#/booking">Booking</option><option value="#/contact">Contact</option>';destination.value=button.url||'';remove.type='button';remove.textContent='Remove';remove.onclick=()=>{row.remove();$('add-button').disabled=rows.children.length>=6;setDirty();};row.append(label,destination,remove);rows.append(row);$('add-button').disabled=rows.children.length>=6;}
  const mediaEditor=createMediaEditor({container:panel.querySelector('.editor-grid'),changed:setDirty,getPreviewUrl:id=>urls[id],removePending:id=>{delete pending[id];if(urls[id])URL.revokeObjectURL(urls[id]);delete urls[id];},preparePhoto:async(file,id)=>{if(auth.currentUser?.uid!==user.uid)throw new Error('Please sign in again before adding photos.');const blob=await resizeImage(file,1600);pending[id]=blob;urls[id]=URL.createObjectURL(blob);}});
  const memberEditor=createMemberEditor({container:panel.querySelector('.editor-grid'),changed:setDirty,getPreviewUrl:id=>urls[id],removePending:id=>{delete pending[id];if(urls[id])URL.revokeObjectURL(urls[id]);delete urls[id];},preparePhoto:async(file,id)=>{if(auth.currentUser?.uid!==user.uid)throw new Error('Please sign in again before adding photos.');const blob=await resizeImage(file,1000);if(!panel.isConnected||auth.currentUser?.uid!==user.uid)throw new Error('Your sign-in changed. Reload before editing.');if(urls[id])URL.revokeObjectURL(urls[id]);pending[id]=blob;urls[id]=URL.createObjectURL(blob);}});
  function fill(){memberEditor.fill(saved);mediaEditor.fill(saved,profile);for(const key of Object.keys(DEFAULTS))$(`site-${key}`).value=saved.theme[key];$('site-tagline').value=saved.tagline||'';$('site-hero-button-1').value=saved.heroButtons[0]?.label||'Meet the band';$('site-hero-destination-1').value=saved.heroButtons[0]?.url||'#/about';$('site-hero-button-2').value=saved.heroButtons[1]?.label||'Get in touch';$('site-hero-destination-2').value=saved.heroButtons[1]?.url||'#/contact';$('site-background-image').value='';$('site-hero-brightness').value=saved.heroBrightness;$('site-hero-brightness-value').textContent=Math.round(saved.heroBrightness*100)+'%';for(const id of ['about','music','merch'])$(`show-${id}`).checked=saved.sections[id];$('show-meet-band').checked=saved.sections.meetBand!==false;$('booking-email').value=saved.booking.email||profile.bookingEmail||profile.email||'';$('booking-enabled').checked=saved.booking.enabled;$('booking-rate').value=(saved.booking.rateCents/100).toFixed(2);$('booking-rate-basis').value=saved.booking.rateBasis;panel.querySelectorAll('[name="booking-payment"]').forEach(r=>r.checked=r.value===saved.booking.paymentPolicy);rows.replaceChildren();saved.buttons.forEach(addRow);$('add-button').disabled=rows.children.length>=6;draft=structuredClone(saved);$('site-banner').value='';$('site-image').value='';}
  fill();
  const cleanupBookings=mountBookingReview({container:panel.querySelector('.wrap'),profileId});
  const cleanupTools=mountWebsiteTools({container:panel.querySelector('.wrap'),profileId,profile,user,canEdit:canEditWebsite});
  function settingsFromForm(){
   const s=structuredClone(draft);s.tagline=$('site-tagline').value.trim().slice(0,120);s.heroButtons=[{label:$('site-hero-button-1').value.trim().slice(0,40),url:$('site-hero-destination-1').value},{label:$('site-hero-button-2').value.trim().slice(0,40),url:$('site-hero-destination-2').value}];s.heroBrightness=Number($('site-hero-brightness').value);s.heroPosition={x:Number($('site-hero-x').value),y:Number($('site-hero-y').value)};s.theme={};for(const key of Object.keys(DEFAULTS))s.theme[key]=$(`site-${key}`).value;
   if(contrast(s.theme.background,s.theme.text)<4.5)throw new Error('Choose a lighter or darker text color so it is readable against the page background.');
   if(contrast(s.theme.background,s.theme.accent)<3)throw new Error('Choose an accent color with more contrast against the page background.');
   s.sections={};for(const id of ['about','music','merch'])s.sections[id]=$(`show-${id}`).checked;s.sections.meetBand=$('show-meet-band').checked;const paymentPolicy=panel.querySelector('[name="booking-payment"]:checked')?.value||'in_person';s.booking={...draft.booking,email:$('booking-email').value.trim(),enabled:$('booking-enabled').checked,rateCents:Math.round(Number($('booking-rate').value||0)*100),rateBasis:$('booking-rate-basis').value,paymentPolicy,depositPercent:paymentPolicy==='deposit'?50:0};
   s.buttons=[];for(const row of rows.children){const [label,url]=row.querySelectorAll('input');if(!label.value.trim()&&!url.value.trim())continue;const destination=url.value;if(!label.value.trim()||!/^#\/(home|about|music|photos|shows|merch|booking|contact)$/.test(destination))throw new Error('Each button needs text and a website page destination.');s.buttons.push({label:label.value.trim(),url:destination});}
   return Object.assign(s,mediaEditor.read(),{bandMembers:memberEditor.read()});
  }
  function paint(s,withDraftImages=false){render(profile,s);if(withDraftImages){applyMedia(s,urls,profile);renderMembers(s,urls);}if(withDraftImages){if(urls.bannerImageUrl)document.getElementById('cover').src=urls.bannerImageUrl;if(urls.imageUrl){document.getElementById('portrait').src=urls.imageUrl;document.getElementById('portrait').hidden=false;}}}
  const editClick=event=>{event.preventDefault();panel.hidden=false;panel.scrollIntoView({behavior:'smooth'});};link.addEventListener('click',editClick);
  form.addEventListener('input',event=>{if(event.target.id==='site-hero-brightness')$('site-hero-brightness-value').textContent=Math.round(Number(event.target.value)*100)+'%';if(event.target.id==='site-hero-x')$('site-hero-x-value').textContent=event.target.value+'%';if(event.target.id==='site-hero-y')$('site-hero-y-value').textContent=event.target.value+'%';setDirty();});
  $('add-button').onclick=()=>{addRow();setDirty();};
  $('reset-colors').onclick=()=>{for(const k of Object.keys(DEFAULTS))$(`site-${k}`).value=DEFAULTS[k];setDirty();};
  for(const [id,key] of [['banner','bannerImageUrl'],['image','imageUrl']]){
   $(`reset-${id}`).onclick=()=>{delete draft[key];delete pending[key];if(urls[key])URL.revokeObjectURL(urls[key]);delete urls[key];$(`site-${id}`).value='';setDirty();};
   $(`site-${id}`).onchange=async()=>{const file=$(`site-${id}`).files[0];if(!file)return;busy=true;fields.disabled=true;status.textContent='Preparing image…';try{const blob=await resizeImage(file,id==='banner'?2000:800);if(urls[key])URL.revokeObjectURL(urls[key]);pending[key]=blob;urls[key]=URL.createObjectURL(blob);setDirty();status.textContent='Image ready. Preview to see it on your website.';}catch(error){status.textContent=error.message;$(`site-${id}`).value='';}finally{busy=false;fields.disabled=false;}};
  }
  form.onsubmit=event=>{event.preventDefault();try{const s=settingsFromForm();paint(s,true);previewed=true;$('publish-website').disabled=!dirty;status.textContent='Preview shown below. These changes are not published yet.';document.getElementById('home').scrollIntoView({behavior:'smooth'});}catch(error){status.textContent=error.message;}};
  $('discard-website').onclick=()=>{if(dirty&&!confirm('Discard your unpublished website changes?'))return;clearImages();fill();dirty=false;previewed=false;$('publish-website').disabled=true;paint(saved);status.textContent='Published appearance restored.';};
  $('close-editor').onclick=()=>{if(dirty){status.textContent='Publish or discard your changes before closing the editor.';return;}panel.hidden=true;};
  $('publish-website').onclick=async()=>{
   if(!previewed||busy||(mediaEditor.isProcessing()||memberEditor.isProcessing())||!dirty)return;busy=true;fields.disabled=true;const uploaded=[];let committed=false;
   try{
    if(auth.currentUser?.uid!==user.uid)throw new Error('Your sign-in changed. Please reload before publishing.');
    if(!canEditWebsite(auth.currentUser,profile,profileId))throw new Error('Website editing is restricted to the Venomous Thorns pilot owner or administrator.');
    const next=settingsFromForm();status.textContent='Publishing website…';
    for(const [key,blob] of Object.entries(pending)){const imageRef=ref(storage,`profile-media/${user.uid}/website-${key}-${crypto.randomUUID()}.webp`);await uploadBytes(imageRef,blob,{contentType:'image/webp',customMetadata:{ownerId:user.uid,profileImageType:'website'}});uploaded.push(imageRef);const downloadUrl=await getDownloadURL(imageRef);if(key.startsWith('photo_')){const photo=next.photos.find(p=>p.id===key);if(!photo)throw new Error('A draft photo could not be found. Please preview again.');photo.url=downloadUrl;}else if(key.startsWith('member_')){const member=next.bandMembers.find(m=>m.id===key);if(!member)throw new Error('A draft member was removed. Preview again.');member.photoUrl=downloadUrl;}else next[key]=downloadUrl;}
    const nextRevision=crypto.randomUUID();
    await runTransaction(db,async transaction=>{const target=doc(db,'profiles',profileId),snap=await transaction.get(target);if(!snap.exists())throw new Error('This profile is no longer available.');const current=snap.data();const owns=canEditWebsite(user,current,profileId);if(!owns)throw new Error('Only the profile owner or site administrator can publish this website.');if((current.websiteSettings?.revision||null)!==revision)throw new Error('This website was updated in another session. Reload before editing again.');transaction.update(target,{websiteSettings:{...normalizeSettings(next),revision:nextRevision}});});
    committed=true;saved=normalizeSettings(next);revision=nextRevision;profile.websiteSettings={...saved,revision};clearImages();fill();dirty=false;previewed=false;$('publish-website').disabled=true;paint(saved);status.textContent='Published! Your website changes are now live.';
   }catch(error){if(!committed)await Promise.allSettled(uploaded.map(imageRef=>deleteObject(imageRef)));status.textContent=error.code==='permission-denied'?'Publishing was denied by your account permissions. Your changes are still here; nothing was published.':error.message||'Publishing failed. Your changes are still here. Try again.';}
   finally{busy=false;fields.disabled=false;}
  };
  const unload=event=>{if(dirty||busy||(mediaEditor.isProcessing()||memberEditor.isProcessing())){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',unload);
  if(new URLSearchParams(location.search).get('edit')==='1')panel.hidden=false;
  return ()=>{cleanupBookings();cleanupTools();clearImages();panel.remove();link.removeEventListener('click',editClick);window.removeEventListener('beforeunload',unload);render(profile,profile.websiteSettings);};
 }
}
async function resizeImage(file,maxWidth){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Please choose a JPG, PNG, or WebP image.');
 if(file.size>12*1024*1024)throw new Error('Choose an image smaller than 12 MB.');
 const bitmap=await createImageBitmap(file);try{const scale=Math.min(1,maxWidth/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('This image could not be resized.')),'image/webp',.86));}finally{bitmap.close();}
}
