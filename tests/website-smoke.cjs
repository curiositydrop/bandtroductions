const { chromium } = require('/tmp/bt-website-tests/node_modules/playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.cwd();fs.mkdirSync('/tmp/bt-website-review',{recursive:true});

const vm=require('node:vm');
const backend={exports:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'functions/website-radio.js'),'utf8'),{exports:backend.exports,URL,require:(name)=>{
 if(name==='firebase-admin/firestore')return {getFirestore:()=>{throw new Error('No database access in serializer test');}};
 if(name==='firebase-functions/v2/https')return {onCall:(options,handler)=>handler,HttpsError:Error};
 throw new Error('Unexpected dependency');
}});
const rawTrack={approved:true,websiteProfileId:'19MH0ZzVlPVN4ediF4PesZR5TY13',title:'Approved',audioUrl:'https://example.com/song.mp3',contactEmail:'private@example.com',notes:'private notes',permissionConfirmed:true};
const publicResult=backend.exports.publicTrack('song',rawTrack,'19MH0ZzVlPVN4ediF4PesZR5TY13');
assert(publicResult);assert.equal('contactEmail' in publicResult,false);assert.equal('notes' in publicResult,false);assert.equal('permissionConfirmed' in publicResult,false);
assert.equal(backend.exports.publicTrack('song',{...rawTrack,approved:false},'19MH0ZzVlPVN4ediF4PesZR5TY13'),null);
assert.equal(backend.exports.publicTrack('song',rawTrack,'band-b'),null);
assert.equal(backend.exports.publicTrack('song',{...rawTrack,audioUrl:'javascript:alert(1)'},'19MH0ZzVlPVN4ediF4PesZR5TY13'),null);
console.log('PASS: public song endpoint excludes pending songs, other bands and all private submission fields.');

const mock=String.raw`
export const app={};
export const auth={currentUser:{uid:'19MH0ZzVlPVN4ediF4PesZR5TY13',email:'artist@example.com',displayName:'Test Artist'}},db={},storage={};
export const records=new Map([
 ['profiles/19MH0ZzVlPVN4ediF4PesZR5TY13',{displayName:'Test Artist',published:true,ownerId:'19MH0ZzVlPVN4ediF4PesZR5TY13',genre:'Metal',bookingEmail:'booking@example.com',location:'Portland, Maine',mediaLink:'https://youtu.be/abcdefghijk',mediaItems:[{type:'image',url:'https://example.com/original.jpg',caption:'Original profile photo'},{type:'video',url:'https://youtu.be/lmnopqrstuv',caption:'Original profile video'}],websiteSettings:{bandMembers:[],booking:{rateCents:120000,rateBasis:'show',paymentPolicy:'in_person',timezone:'America/Phoenix',blockedDates:['2026-12-25']},photos:[{id:'photo_saved',url:'https://example.com/extra.jpg',caption:'Website photo'}],videos:[{url:'https://youtu.be/12345678901',title:'Website video',visible:true}]}}],
 ['users/19MH0ZzVlPVN4ediF4PesZR5TY13',{displayName:'Test Artist',accountType:'band'}],
 ['radioApprovedTracks/other',{approved:true,websiteProfileId:'other-band',title:'Other band song',audioUrl:'https://example.com/audio.mp3'}]
]);
const listeners=[];let serial=0;
export function collection(db,name){return {collection:name};}
export function doc(db,...parts){if(db.collection){const id=parts[0]||'test-'+(++serial);return {path:db.collection+'/'+id,id};}return {path:parts.join('/'),id:parts.at(-1)};}
export function where(field,op,value){return {field,op,value};}
export function query(base,...conditions){return {...base,conditions};}
const snapshot=(key)=>({id:key.split('/').pop(),exists:()=>records.has(key),data:()=>records.get(key)});
export async function getDoc(target){return snapshot(target.path);}
function result(q){const docs=[...records.keys()].filter(k=>k.startsWith(q.collection+'/')&&k.split('/').length===2).filter(k=>(q.conditions||[]).every(c=>records.get(k)[c.field]===c.value)).map(snapshot);return {docs,empty:!docs.length,forEach:fn=>docs.forEach(fn)};}
export async function getDocs(q){return result(q);}
function emit(){listeners.forEach(({q,fn})=>fn(result(q)));}
export function onSnapshot(q,fn){const x={q,fn};listeners.push(x);queueMicrotask(()=>fn(result(q)));return ()=>listeners.splice(listeners.indexOf(x),1);}
const authListeners=[];
export function onAuthStateChanged(a,fn){authListeners.push(fn);queueMicrotask(()=>fn(a.currentUser));return ()=>{};}
export function changeUser(user){auth.currentUser=user;authListeners.forEach(fn=>fn(user));}
export function serverTimestamp(){const now=Date.now();return {toMillis:()=>now,toDate:()=>new Date(now)};}
export async function setDoc(target,data){records.set(target.path,data);emit();}
export async function runTransaction(db,fn){const writes=[];await fn({get:getDoc,set:(t,d)=>writes.push([t.path,d]),update:(t,d)=>writes.push([t.path,{...records.get(t.path),...d}])});writes.forEach(([k,v])=>records.set(k,v));emit();}
export function ref(storage,path){return {path};}
export function getFunctions(){return {};}
export function httpsCallable(){return async ({profileId})=>({data:{tracks:[...records].filter(([k,v])=>k.startsWith('radioApprovedTracks/')&&v.approved===true&&v.websiteProfileId===profileId).map(([k,v])=>({id:k.split('/').pop(),title:v.title,artist:v.artist,album:v.album,audioUrl:v.audioUrl,coverUrl:v.coverUrl,dateAdded:v.dateAdded}))}});}
export const uploads=[];
export async function uploadBytes(r,file,metadata){uploads.push({path:r.path,metadata,size:file.size});}
export async function getDownloadURL(r){return 'https://example.com/'+r.path;}
export async function deleteObject(){}
`;
const server=http.createServer((req,res)=>{
 if(req.url==='/mock-firebase.js'){res.setHeader('Content-Type','text/javascript');return res.end(mock);}
 const file=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root)){res.statusCode=403;return res.end();}
 try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const memberPhotoFixture=await page.screenshot();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=route.request().url();
   if(url.includes('/firebase-dev.js')||url.startsWith('https://www.gstatic.com/firebasejs/'))return route.fulfill({contentType:'text/javascript',body:'export * from "'+base+'/mock-firebase.js";',headers:{'access-control-allow-origin':'*'}});
   if(url.startsWith(base))return route.continue();
   if(url.includes('/profile-media/'))return route.fulfill({contentType:'image/png',body:memberPhotoFixture});
   return route.abort(); // No live Firebase, email, radio or storage writes.
  });
  await page.goto(base+'/website-upgrade-preview.html?id=19MH0ZzVlPVN4ediF4PesZR5TY13&edit=1');
  await page.locator('#website-editor').waitFor({state:'visible'});
  assert.equal(await page.locator('#photo-grid img').count(),2,'profile and extra website photos');
  assert.equal(await page.locator('#videos iframe').count(),3,'profile and extra website videos');
  assert.equal(await page.locator('#band-player audio').isVisible(),false,'no unapproved or other-band music');
  await page.locator('.ws-tool summary').filter({hasText:'Manage shows calendar'}).click();
  const form=page.locator('.ws-show-form');
  const today=new Date(),date=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-15';
  for(const [name,v] of Object.entries({title:'Calendar test',date,time:'19:00',venue:'Test Hall',location:'Portland, ME',price:'$10',details:'Test show details'}))await form.locator('[name='+name+']').fill(v);
  await form.locator('[name=age]').selectOption('All ages');await form.locator('[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('.ws-show-form .ws-form-status').textContent.startsWith('Saved!'));
  assert.equal(await page.locator('#shows .ws-day.has-shows').count(),1);
  assert.equal(await page.locator('#shows .ws-day.has-shows .all-ages').count(),1);
  await page.locator('#shows-nav').click();
  await page.locator('#shows .ws-day.has-shows').click();
  assert.match(await page.locator('dialog[open]').innerText(),/Test show details/);await page.locator('dialog[open] button').last().click();
  const saved=await page.evaluate(async()=>{const {records}=await import('/mock-firebase.js');return [...records].filter(([k])=>k.startsWith('posts/')).map(([,v])=>v);});
  assert.equal(saved.length,1);assert.equal(saved[0].category,'show');assert.equal(saved[0].published,true);assert.equal(saved[0].event.age,'All ages');
  await page.locator('.ws-show-list button').click();await form.locator('[name=age]').selectOption('21+');await form.locator('[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#shows .ws-day.has-shows .adults'));
  const postCount=await page.evaluate(async()=>{const {records}=await import('/mock-firebase.js');return [...records.keys()].filter(k=>k.startsWith('posts/')).length;});assert.equal(postCount,1,'editing reuses the Social post');

  // Member image participates in the same draft/publish lifecycle.
  assert.equal(await page.locator('a').filter({hasText:/^(Community profile|View current profile)/}).count(),0);
  await page.locator('#member-add').click();
  await page.locator('[data-member-field=name]').fill('Mike');
  await page.locator('[data-member-field=instrument]').fill('Vocals');
  await page.locator('.ws-member-edit-row input[type=file]').setInputFiles({name:'member.png',mimeType:'image/png',buffer:memberPhotoFixture});
  await page.waitForFunction(()=>document.querySelector('#editor-status').textContent.startsWith('Member photo ready.'));
  await page.locator('#website-form [type=submit]').click();
  assert.equal(await page.locator('#band-member-cards h3').innerText(),'Mike');
  assert.match(await page.locator('#band-member-cards img').getAttribute('src'),/^blob:/);
  const before=await page.evaluate(async()=>{const {records}=await import('/mock-firebase.js');return records.get('profiles/19MH0ZzVlPVN4ediF4PesZR5TY13').websiteSettings.bandMembers;});
  assert.deepEqual(before,[],'preview does not save members');
  page.once('dialog',d=>d.accept());
  await page.locator('#discard-website').click();
  assert.equal(await page.locator('#band-member-cards article').count(),0,'discard removes draft member');
  await page.locator('#member-add').click();
  await page.locator('[data-member-field=name]').fill('Mike');
  await page.locator('[data-member-field=instrument]').fill('Vocals');
  await page.locator('.ws-member-edit-row input[type=file]').setInputFiles({name:'member.png',mimeType:'image/png',buffer:memberPhotoFixture});
  await page.waitForFunction(()=>document.querySelector('#editor-status').textContent.startsWith('Member photo ready.'));
  // Appearance preview retains inherited media and new features.
  await page.locator('#booking-rate').fill('1600');await page.locator('[name="booking-payment"][value="deposit"]').check();await page.locator('#site-button-style').selectOption('pill');await page.locator('#website-form [type=submit]').click();
  assert.equal(await page.locator('#photo-grid img').count(),2);assert.equal(await page.locator('#shows').count(),1);assert.equal(await page.locator('#band-player').count(),1);
  await page.locator('#publish-website').click();await page.waitForFunction(()=>document.querySelector('#editor-status').textContent.startsWith('Published!'));

  assert.match(await page.locator('#booking-rate-summary').textContent(),/\$1600\.00 per show/);
  const booking=await page.evaluate(async()=>{const {records}=await import('/mock-firebase.js');return records.get('profiles/19MH0ZzVlPVN4ediF4PesZR5TY13').websiteSettings.booking;});
  assert.equal(booking.paymentPolicy,'deposit');assert.equal(booking.rateCents,160000);assert.equal(booking.timezone,'America/Phoenix');assert.deepEqual(booking.blockedDates,['2026-12-25']);
  const savedMembers=await page.evaluate(async()=>{const {records}=await import('/mock-firebase.js');return records.get('profiles/19MH0ZzVlPVN4ediF4PesZR5TY13').websiteSettings.bandMembers;});
  assert.equal(savedMembers[0].name,'Mike');assert.equal(savedMembers[0].instrument,'Vocals');assert.match(savedMembers[0].photoUrl,/profile-media\/19MH0ZzVlPVN4ediF4PesZR5TY13\/website-member_/);
  assert.equal(await page.locator('#band-member-cards img').count(),1);
  await page.locator('#home-nav').click();
  // Upload through mocked storage/review queue, then simulate the existing admin approval copy.
  await page.locator('.ws-tool summary').filter({hasText:'Upload songs'}).click();
  const song=page.locator('.ws-song-form');await song.locator('[name=title]').fill('Website test song');
  await song.locator('[name=audioFile]').setInputFiles('/tmp/bt-test.mp3');
  for(const box of await song.locator('[type=checkbox]').all())await box.check();
  await song.locator('[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('.ws-song-form .ws-form-status').textContent.startsWith('Submitted for admin approval!'));
  const submission=await page.evaluate(async()=>{const {records,uploads}=await import('/mock-firebase.js');return {pending:[...records].filter(([k])=>k.startsWith('radioSubmissions/')).map(([,v])=>v),uploads};});
  assert.equal(submission.pending.length,1);assert.equal(submission.pending[0].approved,false);assert.equal(submission.pending[0].websiteRadioPermission,true);assert.match(submission.uploads.find(u=>u.path.endsWith('.mp3')).path,/^radio-submissions\/19MH0ZzVlPVN4ediF4PesZR5TY13\//);
  assert.equal(await page.locator('#band-player audio').isVisible(),false,'pending songs stay off public player');
  await page.evaluate(async()=>{const {records,setDoc}=await import('/mock-firebase.js');const entry=[...records].find(([k])=>k.startsWith('radioSubmissions/'));await setDoc({path:'radioApprovedTracks/approved-test'},{...entry[1],approved:true,reviewStatus:'approved',dateAdded:Date.now()});});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.locator('.ws-tracks button').filter({hasText:'Website test song'}).waitFor();
  assert.equal(await page.locator('.ws-tracks button').count(),1);assert.equal(await page.locator('#band-player audio').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile has no horizontal overflow');
  await page.locator('#close-editor').click();await page.locator('#home-nav').click();
  assert.equal(await page.locator('#home').isVisible(),true);assert.equal(await page.locator('#about').isVisible(),false);
  await page.screenshot({path:'/tmp/bt-website-review/mobile.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'/tmp/bt-website-review/desktop.png',fullPage:true});
  // Guests keep the target profile ID through login.
  await page.evaluate(async()=>{const {auth}=await import('/mock-firebase.js');auth.currentUser=null;});
  await page.reload();await page.locator('#website-edit-link').waitFor();
  // Module fixture resets on reload, so exercise a genuinely anonymous session via route.
  await page.route(base+'/mock-firebase.js',route=>route.fulfill({contentType:'text/javascript',body:mock.replace("currentUser:{uid:'19MH0ZzVlPVN4ediF4PesZR5TY13',email:'artist@example.com',displayName:'Test Artist'}","currentUser:null")}));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#website-edit-link').textContent.includes('Log in'));
  assert.match(decodeURIComponent(await page.locator('#website-edit-link').getAttribute('href')),/id=19MH0ZzVlPVN4ediF4PesZR5TY13/);
  assert.equal(await page.locator('.ws-tools').count(),0,'guests cannot edit shows or upload');
  assert.deepEqual(errors,[]);

  await page.goto(base+'/website-navigation-preview.html?id=19MH0ZzVlPVN4ediF4PesZR5TY13');
  await page.waitForFunction(()=>!document.getElementById('main').hidden);
  await page.locator('#band-player').waitFor();
  assert.equal(await page.locator('#home').isVisible(),true);
  assert.equal(await page.locator('#about').isVisible(),false);
  assert.equal(await page.locator('#website-editor').count(),0);
  assert.equal(await page.locator('header nav a:visible').count(),8);
  await page.locator('#about-nav').click();await page.waitForFunction(()=>document.body.dataset.view==='about');
  assert.equal(await page.locator('#about').isVisible(),true);
  assert.equal(await page.locator('#home').isVisible(),false);
  assert.equal(await page.locator('#band-player').isVisible(),false);

  assert.equal(await page.locator('#about-cta').innerText(),'Meet the band');
  assert.equal(await page.locator('#band-member-cards .ws-member-card').count(),0);
  assert.equal(await page.locator('#band-member-cards #portrait').count(),0);
  assert.equal(await page.evaluate(()=>document.getElementById('band-member-cards').getBoundingClientRect().bottom<=document.querySelector('.review-biography').getBoundingClientRect().top),true);
  await page.evaluate(async()=>{
   const {initialMembers,renderMembers,normalizeMembers}=await import('./website-review-members.js?v=2');
   const ms=initialMembers({members:'Mike singer Kris vocals Dave drums Bob bass'});
   if(ms.map(m=>m.name).join(',')!=='Mike,Kris,Dave,Bob')throw Error('Legacy names not split correctly');
   const settings={bandMembers:[{id:'member_test',name:'Mike',instrument:'Guitar',photoUrl:'https://example.com/mike.jpg',showPhoto:false}]};
   renderMembers(settings);
   if(!document.querySelector('.ws-member-portrait').hidden)throw Error('Photo visibility setting ignored');
   if(normalizeMembers(settings.bandMembers)[0].showPhoto!==false)throw Error('Visibility not retained');
  });
  await page.locator('#music-nav').click();await page.waitForFunction(()=>document.body.dataset.view==='music');
  assert.equal(await page.locator('#music').isVisible(),true);
  assert.equal(await page.locator('#about').isVisible(),false);
  await page.goBack();
  await page.waitForFunction(()=>document.body.dataset.view==='about');
  await page.locator('#merch-nav').click();await page.waitForFunction(()=>document.body.dataset.view==='merch');
  assert.equal(await page.locator('#view-empty').isVisible(),true);
  await page.locator('#shows-nav').click();await page.waitForFunction(()=>document.body.dataset.view==='shows');
  assert.equal(await page.locator('#shows').isVisible(),true);
  await page.locator('#home-nav').click();await page.waitForFunction(()=>document.body.dataset.view==='home');
  assert.equal(await page.locator('#band-player').isVisible(),true);
  await page.evaluate(()=>{document.querySelector('#band-player audio').dispatchEvent(new Event('play'));location.hash='/photos';});
  await page.waitForFunction(()=>document.body.dataset.view==='photos');
  assert.equal(await page.locator('#band-player').isVisible(),true,'playing controls stay available');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'/tmp/bt-website-review/navigation-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS navigation views, browser Back, visible full menu, empty views, persistent player and read-only preview');

  // Both approved routes mount the same editor, seed legacy members and enforce the pilot.
  await page.unroute(base+'/mock-firebase.js');
  for(const routeName of ['website-upgrade-preview.html','website-navigation-preview.html']){
   await page.route(base+'/mock-firebase.js',route=>route.fulfill({contentType:'text/javascript',body:mock.replace("bandMembers:[],","").replace("genre:'Metal',","genre:'Metal',members:'Mike singer Kris vocals Dave drums Bob bass',")}));
   await page.goto(base+'/'+routeName+'?id=19MH0ZzVlPVN4ediF4PesZR5TY13&edit=1');
   await page.locator('#website-editor').waitFor({state:'visible'});
   assert.equal(await page.locator('.ws-member-edit-row').count(),4);
   assert.deepEqual(await page.locator('[data-member-field=name]').evaluateAll(nodes=>nodes.map(n=>n.value)),['Mike','Kris','Dave','Bob']);
   assert.equal(await page.locator('#booking-rate').inputValue(),'1200.00');
   assert.equal(await page.locator('.ws-member-edit-row input[type=file]').count(),4);
   assert.doesNotMatch(await page.locator('.test-bar').textContent(),/locked/);
   await page.locator('#contact-nav').click();await page.locator('#contact-links a').filter({hasText:'Request booking'}).click();
   await page.waitForFunction(()=>document.body.dataset.view==='booking');
   assert.equal(await page.locator('#booking-calendar').isVisible(),true);
   assert.equal(await page.locator('#booking-form').isVisible(),false);
   assert.equal(await page.locator('[name=offeredPay]').count(),0);
   await page.locator('#booking-calendar .ws-day:not(.has-shows)').first().click();
   assert.equal(await page.locator('#booking-form').isVisible(),true);
   assert.equal(await page.locator('#home').isVisible(),false);
   await page.screenshot({path:'/tmp/bt-website-review/'+routeName+'.png',fullPage:true});
   // Signing out or switching accounts tears down edit and upload controls.
   await page.evaluate(async()=>{const {changeUser}=await import('/mock-firebase.js');changeUser({uid:'other-user',email:'other@example.com'});});
   assert.equal(await page.locator('#website-editor').count(),0);
   assert.equal(await page.locator('#website-edit-link').isVisible(),false);
   await page.evaluate(async()=>{const {changeUser}=await import('/mock-firebase.js');changeUser(null);});
   assert.match(await page.locator('#website-edit-link').textContent(),/Log in/);
   assert.equal(await page.locator('.ws-tools').count(),0);
   await page.evaluate(async()=>{const {changeUser}=await import('/mock-firebase.js');changeUser({uid:'admin-user',email:'mbergeron79@gmail.com'});});
   await page.locator('#website-editor').waitFor({state:'visible'});
   await page.unroute(base+'/mock-firebase.js');
  }

  // A signed-in owner of any non-pilot band is still locked on both routes.
  await page.route(base+'/mock-firebase.js',route=>route.fulfill({contentType:'text/javascript',body:mock.replaceAll('19MH0ZzVlPVN4ediF4PesZR5TY13','other-band')}));
  for(const routeName of ['website-upgrade-preview.html','website-navigation-preview.html']){
   await page.goto(base+'/'+routeName+'?id=other-band&edit=1');
   await page.waitForFunction(()=>!document.getElementById('main').hidden);
   // Wait for the async editor initializer to resolve, not a timer.
   await page.evaluate(async()=>{const {initWebsiteEditor}=await import('./website-review-editor.js?v=7');await initWebsiteEditor({profileId:'other-band',profile:{ownerId:'other-band'},render:()=>{}});});
   assert.equal(await page.locator('#website-editor').count(),0);
   assert.equal(await page.locator('.ws-tools').count(),0);
   assert.equal(await page.locator('#website-edit-link').isVisible(),false);
   assert.match(await page.locator('#preview-lock-copy').textContent(),/locked/);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: both pilot editor routes, owner/admin/guest/account-change guards, legacy member fields, booking rates and payment persistence, contact booking navigation, other profiles locked.');
  console.log('PASS: member photo preview/discard/publish, removed old-profile links, mobile/desktop rendering, media merge, calendar details + editing, appearance publish, pending/approved song flow, upload folder + permissions, band isolation, guest access and login link.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
