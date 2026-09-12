// Website pilot settings and owner editor. No database writes happen during preview.
// Match admin-access.js without importing its account-normalization side effects.
export function isWebsiteAdmin(user){return !!user&&['mbergeron79@gmail.com','mbegeron79@gmail.com'].includes(String(user.email||'').trim().toLowerCase());}
export function canEditWebsite(user,profile,profileId){return !!user&&(user.uid===profileId||profile.ownerId===user.uid||isWebsiteAdmin(user));}
export const DEFAULTS={background:'#0b100f',text:'#eef4ee',accent:'#c3ec77'};
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
 const settings={theme,sections:{about:input.sections?.about!==false,music:input.sections?.music!==false,merch:input.sections?.merch!==false},buttons:[]};
 for(const b of (Array.isArray(input.buttons)?input.buttons:[]).slice(0,6)){const url=safeButtonUrl(b?.url),label=String(b?.label||'').trim().slice(0,40);if(url&&label)settings.buttons.push({label,url});}
 for(const k of ['bannerImageUrl','imageUrl']){const v=safeButtonUrl(input[k]);if(v&&/^https?:/.test(v))settings[k]=v;}
 return settings;
}
export function websiteProfile(profile,settings){const s=normalizeSettings(settings);return {...profile,...(s.bannerImageUrl?{bannerImageUrl:s.bannerImageUrl}:{}),...(s.imageUrl?{imageUrl:s.imageUrl}: {})};}
export function applyWebsiteStyle(input){
 const s=normalizeSettings(input),root=document.documentElement,el=id=>document.getElementById(id);
 for(const [key,value] of Object.entries(s.theme))root.style.setProperty(`--site-${key}`,value);
 root.style.setProperty('--site-button-text',contrast(s.theme.accent,'#000000')>=contrast(s.theme.accent,'#ffffff')?'#000000':'#ffffff');
 for(const id of ['about','music','merch']){const section=el(id);section.hidden=s.sections[id]===false||(id==='music'&&!el('videos').children.length)||(id==='merch'&&section.dataset.available!=='true');const nav=el(`${id}-nav`);if(nav)nav.hidden=section.hidden;}
 el('listen').hidden=el('music').hidden;el('about-cta').hidden=el('about').hidden;
 el('custom-buttons').replaceChildren();for(const b of s.buttons){const a=document.createElement('a');a.className='button';a.href=b.url;a.textContent=b.label;el('custom-buttons').append(a);}
}

export async function initWebsiteEditor({profileId,profile,render}){
 const [{auth,db,storage},{onAuthStateChanged},{doc,runTransaction},{ref,uploadBytes,getDownloadURL,deleteObject}]=await Promise.all([
 import('./firebase-dev.js'),import('https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js'),import('https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js')]);
 const link=document.getElementById('website-edit-link');let teardown=null;
 onAuthStateChanged(auth,user=>{
  if(teardown){teardown();teardown=null;}
  const owns=canEditWebsite(user,profile,profileId);
  link.hidden=false;link.textContent=owns?(isWebsiteAdmin(user)?'Edit website · Admin':'Edit my website'):user?'Editing requires the owner or admin account':'Log in to edit website';
  link.href=owns?'#website-editor':`login.html?returnTo=${encodeURIComponent(location.pathname+'?edit=1')}`;
  if(!owns)return;
  teardown=mount(user);
 });
 function mount(user){
  let saved=normalizeSettings(profile.websiteSettings),revision=profile.websiteSettings?.revision||null,dirty=false,busy=false,previewed=false;
  let pending={},urls={},draft=null;
  const panel=document.createElement('section');panel.id='website-editor';panel.className='website-editor';panel.hidden=true;
  const profileEditUrl=isWebsiteAdmin(user)?`profile-setup.html?adminProfile=${profileId}&editor=3`:`profile-setup.html?id=${profileId}`;
  panel.innerHTML=`<div class="wrap"><h2>Edit my website</h2><p>Keep your layout. Make it yours. Preview changes, then publish when you're ready.</p><p><a href="${profileEditUrl}">Edit bio, band details & videos ↗</a></p>
  <form id="website-form"><fieldset id="website-fields"><legend class="sr-only">Website appearance</legend><div class="editor-grid">
  <section><h3>Images</h3><p>Website images only. Use JPG, PNG, or WebP, up to 12 MB. Images are resized automatically.</p><label>Banner image<input type="file" id="site-banner" accept="image/jpeg,image/png,image/webp"></label><button type="button" id="reset-banner">Use profile banner</button><label>Band image / logo<input type="file" id="site-image" accept="image/jpeg,image/png,image/webp"></label><button type="button" id="reset-image">Use profile image</button></section>
  <section><h3>Colors</h3><label>Page background<input type="color" id="site-background"></label><label>Page text<input type="color" id="site-text"></label><label>Accent & buttons<input type="color" id="site-accent"></label><p>Banner text stays light for readability. Page text and accent colors must contrast with the background.</p><button type="button" id="reset-colors">Restore default colors</button></section>
  <section><h3>Sections</h3><label><input type="checkbox" id="show-about"> About the band</label><label><input type="checkbox" id="show-music"> Music & videos</label><label><input type="checkbox" id="show-merch"> Merch</label><p>Music and merch appear when content is available. Contact always stays visible.</p></section>
  <section><h3>Your buttons</h3><p>Add up to six links below the banner. Use a full https:// address or mailto: email link.</p><div id="button-rows"></div><button type="button" id="add-button">+ Add button</button></section>
  </div><div class="editor-actions"><button type="submit">Preview changes ↓</button><button type="button" id="publish-website" disabled>Publish website</button><button type="button" id="discard-website">Discard changes</button><button type="button" id="close-editor">Close editor</button></div></fieldset><p id="editor-status" role="status" aria-live="polite"></p></form></div>`;
  document.querySelector('header').after(panel);
  const $=id=>panel.querySelector(`#${id}`),form=$('website-form'),fields=$('website-fields'),status=$('editor-status'),rows=$('button-rows');
  function setDirty(){dirty=true;previewed=false;$('publish-website').disabled=true;status.textContent='Unpublished changes. Preview to review them.';}
  function clearImages(){Object.values(urls).forEach(URL.revokeObjectURL);pending={};urls={};}
  function addRow(button={}){if(rows.children.length>=6)return;const row=document.createElement('div');row.className='button-row';const label=document.createElement('input'),url=document.createElement('input'),remove=document.createElement('button');label.placeholder='Button label';label.setAttribute('aria-label','Button label');label.maxLength=40;label.value=button.label||'';url.placeholder='https://…';url.setAttribute('aria-label','Button destination');url.type='text';url.inputMode='url';url.value=button.url||'';remove.type='button';remove.textContent='Remove';remove.onclick=()=>{row.remove();$('add-button').disabled=rows.children.length>=6;setDirty();};row.append(label,url,remove);rows.append(row);$('add-button').disabled=rows.children.length>=6;}
  function fill(){for(const key of Object.keys(DEFAULTS))$(`site-${key}`).value=saved.theme[key];for(const id of ['about','music','merch'])$(`show-${id}`).checked=saved.sections[id];rows.replaceChildren();saved.buttons.forEach(addRow);$('add-button').disabled=rows.children.length>=6;draft=structuredClone(saved);$('site-banner').value='';$('site-image').value='';}
  fill();
  function settingsFromForm(){
   const s=structuredClone(draft);s.theme={};for(const key of Object.keys(DEFAULTS))s.theme[key]=$(`site-${key}`).value;
   if(contrast(s.theme.background,s.theme.text)<4.5)throw new Error('Choose a lighter or darker text color so it is readable against the page background.');
   if(contrast(s.theme.background,s.theme.accent)<3)throw new Error('Choose an accent color with more contrast against the page background.');
   s.sections={};for(const id of ['about','music','merch'])s.sections[id]=$(`show-${id}`).checked;
   s.buttons=[];for(const row of rows.children){const [label,url]=row.querySelectorAll('input');if(!label.value.trim()&&!url.value.trim())continue;const destination=safeButtonUrl(url.value);if(!label.value.trim()||!destination)throw new Error('Each button needs a label and a valid https://, http://, or mailto: link.');s.buttons.push({label:label.value.trim(),url:destination});}
   return s;
  }
  function paint(s,withDraftImages=false){render(profile,s);if(withDraftImages){if(urls.bannerImageUrl)document.getElementById('cover').src=urls.bannerImageUrl;if(urls.imageUrl){document.getElementById('portrait').src=urls.imageUrl;document.getElementById('portrait').hidden=false;}}}
  const editClick=event=>{event.preventDefault();panel.hidden=false;panel.scrollIntoView({behavior:'smooth'});};link.addEventListener('click',editClick);
  form.addEventListener('input',setDirty);
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
   if(!previewed||busy||!dirty)return;busy=true;fields.disabled=true;const uploaded=[];let committed=false;
   try{
    if(auth.currentUser?.uid!==user.uid)throw new Error('Your sign-in changed. Please reload before publishing.');
    const next=settingsFromForm();status.textContent='Publishing website…';
    for(const [key,blob] of Object.entries(pending)){const imageRef=ref(storage,`profile-media/${user.uid}/website-${key}-${crypto.randomUUID()}.webp`);await uploadBytes(imageRef,blob,{contentType:'image/webp',customMetadata:{ownerId:user.uid,profileImageType:'website'}});uploaded.push(imageRef);next[key]=await getDownloadURL(imageRef);}
    const nextRevision=crypto.randomUUID();
    await runTransaction(db,async transaction=>{const target=doc(db,'profiles',profileId),snap=await transaction.get(target);if(!snap.exists())throw new Error('This profile is no longer available.');const current=snap.data();const owns=canEditWebsite(user,current,profileId);if(!owns)throw new Error('Only the profile owner or site administrator can publish this website.');if((current.websiteSettings?.revision||null)!==revision)throw new Error('This website was updated in another session. Reload before editing again.');transaction.update(target,{websiteSettings:{...normalizeSettings(next),revision:nextRevision}});});
    committed=true;saved=normalizeSettings(next);revision=nextRevision;profile.websiteSettings={...saved,revision};clearImages();fill();dirty=false;previewed=false;$('publish-website').disabled=true;paint(saved);status.textContent='Published! Your website changes are now live.';
   }catch(error){if(!committed)await Promise.allSettled(uploaded.map(imageRef=>deleteObject(imageRef)));status.textContent=error.code==='permission-denied'?'Publishing was denied by your account permissions. Your changes are still here; nothing was published.':error.message||'Publishing failed. Your changes are still here. Try again.';}
   finally{busy=false;fields.disabled=false;}
  };
  const unload=event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',unload);
  if(new URLSearchParams(location.search).get('edit')==='1')panel.hidden=false;
  return ()=>{clearImages();panel.remove();link.removeEventListener('click',editClick);window.removeEventListener('beforeunload',unload);render(profile,profile.websiteSettings);};
 }
}
async function resizeImage(file,maxWidth){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Please choose a JPG, PNG, or WebP image.');
 if(file.size>12*1024*1024)throw new Error('Choose an image smaller than 12 MB.');
 const bitmap=await createImageBitmap(file);try{const scale=Math.min(1,maxWidth/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('This image could not be resized.')),'image/webp',.86));}finally{bitmap.close();}
}
