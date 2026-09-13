const { chromium } = require('/tmp/bt-website-tests/node_modules/playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.cwd();fs.mkdirSync('/tmp/bt-website-review',{recursive:true});
const mock=String.raw`
export const auth={currentUser:{uid:'band-a',email:'artist@example.com',displayName:'Test Artist'}},db={},storage={};
export const records=new Map([
 ['profiles/band-a',{displayName:'Test Artist',published:true,ownerId:'band-a',genre:'Metal',bookingEmail:'booking@example.com',location:'Portland, Maine',mediaLink:'https://youtu.be/abcdefghijk',mediaItems:[{type:'image',url:'https://example.com/original.jpg',caption:'Original profile photo'},{type:'video',url:'https://youtu.be/lmnopqrstuv',caption:'Original profile video'}],websiteSettings:{photos:[{id:'photo_saved',url:'https://example.com/extra.jpg',caption:'Website photo'}],videos:[{url:'https://youtu.be/12345678901',title:'Website video',visible:true}]}}],
 ['users/band-a',{displayName:'Test Artist',accountType:'band'}],
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
export function onAuthStateChanged(a,fn){queueMicrotask(()=>fn(a.currentUser));return ()=>{};}
export function serverTimestamp(){const now=Date.now();return {toMillis:()=>now,toDate:()=>new Date(now)};}
export async function setDoc(target,data){records.set(target.path,data);emit();}
export async function runTransaction(db,fn){const writes=[];await fn({get:getDoc,set:(t,d)=>writes.push([t.path,d]),update:(t,d)=>writes.push([t.path,{...records.get(t.path),...d}])});writes.forEach(([k,v])=>records.set(k,v));emit();}
export function ref(storage,path){return {path};}
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
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=route.request().url();
   if(url.includes('/firebase-dev.js')||url.startsWith('https://www.gstatic.com/firebasejs/'))return route.fulfill({contentType:'text/javascript',body:'export * from "'+base+'/mock-firebase.js";',headers:{'access-control-allow-origin':'*'}});
   if(url.startsWith(base))return route.continue();
   return route.abort(); // No live Firebase, email, radio or storage writes.
  });
  await page.goto(base+'/website.html?id=band-a&edit=1');
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
  assert.equal(await page.locator('.ws-day.has-shows').count(),1);
  assert.equal(await page.locator('.ws-day.has-shows .all-ages').count(),1);
  await page.locator('.ws-day.has-shows').click();
  assert.match(await page.locator('dialog[open]').innerText(),/Test show details/);await page.locator('dialog[open] button').last().click();
  const saved=await page.evaluate(async()=>{const {records}=await import('/mock-firebase.js');return [...records].filter(([k])=>k.startsWith('posts/')).map(([,v])=>v);});
  assert.equal(saved.length,1);assert.equal(saved[0].category,'show');assert.equal(saved[0].published,true);assert.equal(saved[0].event.age,'All ages');
  await page.locator('.ws-show-list button').click();await form.locator('[name=age]').selectOption('21+');await form.locator('[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('.ws-day.has-shows .adults'));
  const postCount=await page.evaluate(async()=>{const {records}=await import('/mock-firebase.js');return [...records.keys()].filter(k=>k.startsWith('posts/')).length;});assert.equal(postCount,1,'editing reuses the Social post');
  // Appearance preview retains inherited media and new features.
  await page.locator('#site-button-style').selectOption('pill');await page.locator('#website-form [type=submit]').click();
  assert.equal(await page.locator('#photo-grid img').count(),2);assert.equal(await page.locator('#shows').count(),1);assert.equal(await page.locator('#band-player').count(),1);
  await page.locator('#publish-website').click();await page.waitForFunction(()=>document.querySelector('#editor-status').textContent.startsWith('Published!'));
  // Upload through mocked storage/review queue, then simulate the existing admin approval copy.
  await page.locator('.ws-tool summary').filter({hasText:'Upload songs'}).click();
  const song=page.locator('.ws-song-form');await song.locator('[name=title]').fill('Website test song');
  await song.locator('[name=audioFile]').setInputFiles('/tmp/bt-test.mp3');
  for(const box of await song.locator('[type=checkbox]').all())await box.check();
  await song.locator('[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('.ws-song-form .ws-form-status').textContent.startsWith('Submitted for admin approval!'));
  const submission=await page.evaluate(async()=>{const {records,uploads}=await import('/mock-firebase.js');return {pending:[...records].filter(([k])=>k.startsWith('radioSubmissions/')).map(([,v])=>v),uploads};});
  assert.equal(submission.pending.length,1);assert.equal(submission.pending[0].approved,false);assert.equal(submission.pending[0].websiteRadioPermission,true);assert.match(submission.uploads[0].path,/^radio-submissions\/band-a\//);
  assert.equal(await page.locator('#band-player audio').isVisible(),false,'pending songs stay off public player');
  await page.evaluate(async()=>{const {records,setDoc}=await import('/mock-firebase.js');const entry=[...records].find(([k])=>k.startsWith('radioSubmissions/'));await setDoc({path:'radioApprovedTracks/approved-test'},{...entry[1],approved:true,reviewStatus:'approved',dateAdded:Date.now()});});
  await page.locator('.ws-tracks button').filter({hasText:'Website test song'}).waitFor();
  assert.equal(await page.locator('.ws-tracks button').count(),1);assert.equal(await page.locator('#band-player audio').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile has no horizontal overflow');
  await page.locator('#close-editor').click();await page.screenshot({path:'/tmp/bt-website-review/mobile.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'/tmp/bt-website-review/desktop.png',fullPage:true});
  // Guests keep the target profile ID through login.
  await page.evaluate(async()=>{const {auth}=await import('/mock-firebase.js');auth.currentUser=null;});
  await page.reload();await page.locator('#website-edit-link').waitFor();
  // Module fixture resets on reload, so exercise a genuinely anonymous session via route.
  await page.route(base+'/mock-firebase.js',route=>route.fulfill({contentType:'text/javascript',body:mock.replace("currentUser:{uid:'band-a',email:'artist@example.com',displayName:'Test Artist'}","currentUser:null")}));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#website-edit-link').textContent.includes('Log in'));
  assert.match(decodeURIComponent(await page.locator('#website-edit-link').getAttribute('href')),/id=band-a/);
  assert.equal(await page.locator('.ws-tools').count(),0,'guests cannot edit shows or upload');
  assert.deepEqual(errors,[]);
  const live=await browser.newPage();
  await live.goto('https://bandtroductions.com/website.html?id=19MH0ZzVlPVN4ediF4PesZR5TY13',{waitUntil:'domcontentloaded'});
  const reads=await live.evaluate(async()=>{
   const {db}=await import('./firebase-dev.js');
   const {collection,getDocs,query,where}=await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js');
   const results={};
   for(const [key,coll,field,val] of [['approvedSongs','radioApprovedTracks','approved',true],['existingShows','posts','authorId','19MH0ZzVlPVN4ediF4PesZR5TY13'],['websiteShows','posts','websiteProfileId','19MH0ZzVlPVN4ediF4PesZR5TY13']]){
    try{const s=await getDocs(query(collection(db,coll),where(field,'==',val)));results[key]={ok:true,count:s.size};}catch(e){results[key]={ok:false,code:e.code};}
   }
   return results;
  });
  console.log('Live public read access:',JSON.stringify(reads));
  for(const result of Object.values(reads))assert.equal(result.ok,true,'live public read permissions');
  await live.close();
  console.log('PASS: mobile/desktop rendering, media merge, calendar details + editing, appearance publish, pending/approved song flow, upload folder + permissions, band isolation, guest access and login link.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
