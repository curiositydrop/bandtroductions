// Shared media settings for the website pilot. Draft images upload only on Publish.
export function youtubeId(value){
 try{const u=new URL(value),host=u.hostname.toLowerCase().replace(/^www\./,'');let id='';const parts=u.pathname.split('/').filter(Boolean);
 if(host==='youtu.be')id=parts[0];else if(['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host))id=u.searchParams.get('v')||(['embed','shorts','live'].includes(parts[0])?parts[1]:'');
 return /^[A-Za-z0-9_-]{11}$/.test(id)?id:'';}catch{return '';}
}
function imageUrl(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export function normalizeMedia(input={}){
 const out={layout:['classic','music-first','photo-first'].includes(input.layout)?input.layout:'classic',buttonStyle:['rounded','pill','square','outline'].includes(input.buttonStyle)?input.buttonStyle:'rounded',photos:[]};
 const ids=new Set();
 for(const [i,p] of (Array.isArray(input.photos)?input.photos:[]).slice(0,18).entries()){if(!p||typeof p!=='object')continue;const id=/^photo_[a-zA-Z0-9_-]+$/.test(p.id)?p.id:'photo_saved_'+i;if(ids.has(id))continue;ids.add(id);out.photos.push({id,url:imageUrl(p.url),caption:String(p.caption||'').slice(0,120),visible:p.visible!==false});}
 if(Array.isArray(input.videos)){out.videos=[];const seen=new Set();for(const v of input.videos.slice(0,12)){const id=youtubeId(v?.url);if(!id||seen.has(id))continue;seen.add(id);out.videos.push({url:'https://www.youtube.com/watch?v='+id,title:String(v.title||'').slice(0,100),visible:v.visible!==false});}}
 return out;
}
export function profileVideos(profile){
 const candidates=[{url:profile.mediaLink,title:profile.featuredTitle},...(Array.isArray(profile.additionalMedia)?profile.additionalMedia:[]),...(Array.isArray(profile.mediaItems)?profile.mediaItems.filter(v=>typeof v==='string'||v?.type==='video'):[])];
 const seen=new Map();for(const item of candidates){if(!item)continue;const v=typeof item==='string'?{url:item}:item,id=youtubeId(v.url);if(id&&!seen.has(id))seen.set(id,{url:'https://www.youtube.com/watch?v='+id,title:String(v.title||v.caption||''),visible:true});}
 return [...seen.values()];
}
export function applyMedia(input,previewUrls={},profile={}){
 const settings=normalizeMedia(input),el=id=>document.getElementById(id),main=el('main');
 main.dataset.layout=settings.layout;main.dataset.buttonStyle=settings.buttonStyle;
 const order=settings.layout==='music-first'?['home','band-player','music','shows','about','photos','merch','contact']:settings.layout==='photo-first'?['home','photos','about','band-player','music','shows','merch','contact']:['home','about','band-player','music','photos','shows','merch','contact'];
 order.forEach(id=>{if(el(id))main.append(el(id));});
 const grid=el('photo-grid');if(!grid)return;grid.replaceChildren();
 for(const p of websitePhotos(profile,settings)){const src=previewUrls[p.id]||p.url;if(!p.visible||!src)continue;const figure=document.createElement('figure'),img=document.createElement('img');img.src=src;img.alt=p.caption||'Band photo';img.loading='lazy';figure.append(img);if(p.caption){const caption=document.createElement('figcaption');caption.textContent=p.caption;figure.append(caption);}grid.append(figure);}
 el('photos').hidden=!grid.children.length;el('photos-nav').hidden=el('photos').hidden;
}
export function createMediaEditor({container,changed,preparePhoto,removePending,getPreviewUrl}){
 const section=document.createElement('section');section.className='media-editor-panel';
 section.innerHTML='<h3>Layout & button style</h3><label>Website layout<select id="site-layout"><option value="classic">Classic — about, music, photos</option><option value="music-first">Music First — videos lead</option><option value="photo-first">Photo First — gallery leads</option></select></label><label>Button style<select id="site-button-style"><option value="rounded">Rounded</option><option value="pill">Pill</option><option value="square">Square</option><option value="outline">Outline</option></select></label><p>All layouts use your existing content. Empty sections stay hidden.</p><h3>Photo library</h3><p>Your profile photos appear automatically. Add extra website photos below.</p><p>Up to 18 photos. JPG, PNG or WebP, up to 12 MB each. Removing a photo removes it from this website only.</p><label>Add photos<input id="library-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><div id="library-photo-list"></div><h3>Video library</h3><p>Your profile videos appear automatically. Add extra videos below; saved entries for the same video control its title and visibility here.</p><p>Add up to 12 YouTube links. The first visible video is featured. Videos that disable embedding may need to be watched on YouTube.</p><div id="library-video-list"></div><button id="library-add-video" type="button">+ Add YouTube video</button>';
 container.append(section);const $=id=>section.querySelector('#'+id);let photos=[],videos=[];
 function button(text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;return b;}
 function input(label,value,max,update){const wrap=document.createElement('label');wrap.textContent=label;const field=document.createElement('input');field.value=value;field.maxLength=max;field.oninput=()=>{update(field.value);changed();};wrap.append(field);return wrap;}
 function visibleControl(item){const label=document.createElement('label');const box=document.createElement('input');box.type='checkbox';box.checked=item.visible!==false;box.onchange=()=>{item.visible=box.checked;changed();};label.append(box,document.createTextNode('Show on website'));return label;}
 function move(items,i,delta,draw){const j=i+delta;if(j<0||j>=items.length)return;[items[i],items[j]]=[items[j],items[i]];draw();changed();}
 function orderControls(row,items,i,draw){const controls=document.createElement('div');controls.className='media-row-actions';const up=button('Move up',()=>move(items,i,-1,draw)),down=button('Move down',()=>move(items,i,1,draw));up.disabled=i===0;down.disabled=i===items.length-1;controls.append(up,down);row.append(controls);return controls;}
 function drawPhotos(){const list=$('library-photo-list');list.replaceChildren();photos.forEach((p,i)=>{const row=document.createElement('div');row.className='library-row';const img=document.createElement('img');img.src=getPreviewUrl(p.id)||p.url;img.alt=p.caption||'Photo '+(i+1);row.append(img,input('Caption',p.caption,120,v=>{p.caption=v;}),visibleControl(p));orderControls(row,photos,i,drawPhotos).append(button('Remove',()=>{removePending(p.id);photos.splice(i,1);drawPhotos();changed();}));list.append(row);});$('library-photos').disabled=photos.length>=18;}
 function drawVideos(){const list=$('library-video-list');list.replaceChildren();videos.forEach((v,i)=>{const row=document.createElement('div');row.className='library-row';const title=document.createElement('strong');title.textContent='Video '+(i+1)+(i===0?' · Featured when visible':'');row.append(title,input('YouTube URL',v.url,1000,x=>{v.url=x;}),input('Title / caption',v.title,100,x=>{v.title=x;}),visibleControl(v));const controls=orderControls(row,videos,i,drawVideos);if(i>0)controls.append(button('Make featured',()=>{videos.splice(i,1);videos.unshift(v);v.visible=true;drawVideos();changed();}));controls.append(button('Remove',()=>{videos.splice(i,1);drawVideos();changed();}));list.append(row);});$('library-add-video').disabled=videos.length>=12;}
 $('library-add-video').onclick=()=>{if(videos.length>=12)return;videos.push({url:'',title:'',visible:true});drawVideos();changed();};
 $('site-layout').onchange=changed;$('site-button-style').onchange=changed;
 $('library-photos').onchange=async()=>{
  const files=[...$('library-photos').files];if(!files.length)return;
  const status=document.getElementById('editor-status'),fields=document.getElementById('website-fields');
  if(photos.length+files.length>18){status.textContent='Choose fewer photos. This library holds up to 18.';$('library-photos').value='';return;}
  fields.disabled=true;section.dataset.processing='true';let count=0;
  try{for(const file of files){const id='photo_'+crypto.randomUUID();await preparePhoto(file,id);photos.push({id,url:'',caption:'',visible:true});count++;changed();}status.textContent='Photos ready. Preview before publishing.';}
  catch(error){status.textContent=error.message+(count?' '+count+' photo(s) were added to your draft.':'');}
  finally{delete section.dataset.processing;fields.disabled=false;$('library-photos').value='';drawPhotos();}
 };
 return {
  fill(settings,profile){const s=normalizeMedia(settings);photos=structuredClone(s.photos);videos=structuredClone(s.videos??[]);$('site-layout').value=s.layout;$('site-button-style').value=s.buttonStyle;drawPhotos();drawVideos();},
  read(){const seen=new Set();for(const v of videos){const id=youtubeId(v.url);if(!id)throw new Error('Each video needs a valid YouTube video link.');if(seen.has(id))throw new Error('Remove duplicate YouTube videos from the library.');seen.add(id);}
   return {layout:$('site-layout').value,buttonStyle:$('site-button-style').value,photos:structuredClone(photos),videos:structuredClone(videos)};},
  isProcessing(){return section.dataset.processing==='true';}
 };
}

export function websiteVideos(profile,settings={}){
 const merged=new Map(profileVideos(profile).map(v=>[youtubeId(v.url),v]));
 for(const v of normalizeMedia(settings).videos||[])merged.set(youtubeId(v.url),v);
 return [...merged.values()].filter(v=>v.visible!==false);
}
export function websitePhotos(profile,settings={}){
 const merged=new Map();
 for(const [i,p] of (Array.isArray(profile.mediaItems)?profile.mediaItems:[]).entries()){
  if(p?.type!=='image'||!imageUrl(p.url))continue;
  merged.set(p.url,{id:'profile_'+i,url:imageUrl(p.url),caption:String(p.caption||p.title||'').slice(0,160),visible:true});
 }
 for(const p of normalizeMedia(settings).photos)merged.set(p.url||p.id,p);
 return [...merged.values()];
}
