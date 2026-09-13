// Member photos follow the website editor's preview/publish/discard lifecycle.
function photoUrl(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export function normalizeMembers(input){
 const ids=new Set();
 return (Array.isArray(input)?input:[]).slice(0,16).filter(m=>m&&typeof m==='object').map((m,i)=>{
  let id=/^member_[a-zA-Z0-9_-]+$/.test(m.id)?m.id:'member_saved_'+i;
  if(ids.has(id))id='member_duplicate_'+i;ids.add(id);
  return {id,name:String(m.name||'').trim().slice(0,100),instrument:String(m.instrument||'').trim().slice(0,100),photoUrl:photoUrl(m.photoUrl)};
 });
}
export function renderMembers(settings={},previewUrls={}){
 const grid=document.getElementById('band-member-cards');if(!grid)return;
 grid.replaceChildren();
 for(const m of normalizeMembers(settings.bandMembers)){
  if(!m.name)continue;
  const card=document.createElement('article');card.className='ws-member-card';
  const portrait=document.createElement('div');portrait.className='ws-member-portrait';
  const initials=document.createElement('span');initials.textContent=m.name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();initials.setAttribute('aria-hidden','true');portrait.append(initials);
  const src=previewUrls[m.id]||m.photoUrl;
  if(src){const img=document.createElement('img');img.src=src;img.alt=m.name+(m.instrument?' — '+m.instrument:'');img.loading='lazy';img.onerror=()=>img.remove();portrait.append(img);}
  const name=document.createElement('h3');name.textContent=m.name;card.append(portrait,name);
  if(m.instrument){const role=document.createElement('p');role.textContent=m.instrument;card.append(role);}
  grid.append(card);
 }
 grid.hidden=!grid.children.length;
}
export function createMemberEditor({container,changed,preparePhoto,removePending,getPreviewUrl}){
 const section=document.createElement('section');section.className='ws-member-editor';
 section.innerHTML='<h3>Meet the band</h3><p>Add each member’s name, instrument or role, and photo. JPG, PNG or WebP, up to 12 MB. Photos upload only when you publish the website.</p><div id="member-editor-list"></div><button id="member-add" type="button">+ Add band member</button>';
 container.prepend(section);const list=section.querySelector('#member-editor-list'),add=section.querySelector('#member-add');let members=[],processing=false;
 function button(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;return b;}
 function draw(){
  list.replaceChildren();add.disabled=members.length>=16;
  for(const [i,m] of members.entries()){
   const row=document.createElement('div');row.className='ws-member-edit-row';
   for(const [key,label] of [['name','Member name'],['instrument','Instrument / role']]){
    const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.value=m[key];input.maxLength=100;input.dataset.memberField=key;
    input.oninput=()=>{m[key]=input.value;changed();};wrap.append(input);row.append(wrap);
   }
   const photo=document.createElement('img');photo.className='ws-member-edit-photo';photo.alt=m.name||'Member photo preview';const url=getPreviewUrl(m.id)||m.photoUrl;photo.hidden=!url;if(url)photo.src=url;row.append(photo);
   const label=document.createElement('label');label.textContent='Member photo';const file=document.createElement('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';label.append(file);row.append(label);
   file.onchange=async()=>{
    const selected=file.files[0];if(!selected||processing)return;
    const fields=document.getElementById('website-fields'),status=document.getElementById('editor-status');fields.disabled=true;processing=true;
    try{await preparePhoto(selected,m.id);changed();status.textContent='Member photo ready. Preview before publishing.';}
    catch(error){status.textContent=error.message;}
    finally{processing=false;if(section.isConnected){fields.disabled=false;draw();}}
   };
   const actions=document.createElement('div');actions.className='ws-member-edit-actions';
   actions.append(button('Remove photo',()=>{removePending(m.id);m.photoUrl='';draw();changed();}));
   const up=button('Move up',()=>{[members[i-1],members[i]]=[members[i],members[i-1]];draw();changed();});up.disabled=i===0;
   const down=button('Move down',()=>{[members[i+1],members[i]]=[members[i],members[i+1]];draw();changed();});down.disabled=i===members.length-1;
   actions.append(up,down,button('Remove member',()=>{removePending(m.id);members.splice(i,1);draw();changed();}));row.append(actions);list.append(row);
  }
 }
 add.onclick=()=>{if(members.length>=16)return;members.push({id:'member_'+crypto.randomUUID(),name:'',instrument:'',photoUrl:''});draw();changed();list.lastElementChild.querySelector('input').focus();};
 return {fill(settings){members=normalizeMembers(settings.bandMembers);draw();},read(){if(members.some(m=>!m.name.trim()||!m.instrument.trim()))throw new Error('Add a name and instrument / role for each member, or remove the empty member.');return normalizeMembers(members);},isProcessing(){return processing;}};
}
