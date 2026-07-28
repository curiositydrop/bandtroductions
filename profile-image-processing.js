const bannerInput=document.getElementById('banner-image-file');
const avatarInput=document.getElementById('image-file');
const status=document.getElementById('setup-status');

const style=document.createElement('style');
style.textContent=`
.image-cropper{position:fixed;inset:0;z-index:20000;background:rgba(0,0,0,.88);display:grid;place-items:center;padding:14px}.image-cropper[hidden]{display:none!important}.image-cropper-dialog{width:min(100%,720px);max-height:94vh;overflow:auto;border:1px solid #0ccfbd;border-radius:18px;background:#111;padding:16px;box-sizing:border-box}.image-cropper-dialog h2{margin:0 0 6px}.image-cropper-dialog p{margin:0 0 12px;color:#aaa}.image-cropper-canvas-wrap{display:grid;place-items:center;background:#050505;border:1px solid #333;border-radius:14px;padding:10px;overflow:hidden}.image-cropper canvas{display:block;max-width:100%;height:auto;border-radius:10px}.image-cropper-controls{display:grid;gap:10px;margin-top:14px}.image-cropper-controls label{display:grid;grid-template-columns:88px 1fr;gap:10px;align-items:center;color:#ddd;font-weight:800}.image-cropper-controls input[type=range]{width:100%}.image-cropper-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:15px}.image-cropper-actions button{width:auto!important}.image-cropper-note{font-size:.78rem!important;color:#888!important;margin-top:8px!important}
`;
document.head.appendChild(style);

function loadImage(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const image=new Image();
    image.onload=()=>{URL.revokeObjectURL(url);resolve(image)};
    image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('That image could not be opened.'))};
    image.src=url;
  });
}

function canvasBlob(canvas,type='image/webp',quality=.86){
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('The image could not be processed.')),type,quality));
}

function createCropper(){
  let root=document.getElementById('profile-image-cropper');
  if(root)return root;
  root=document.createElement('div');root.id='profile-image-cropper';root.className='image-cropper';root.hidden=true;
  root.innerHTML=`<section class="image-cropper-dialog" role="dialog" aria-modal="true" aria-labelledby="cropper-title"><h2 id="cropper-title">Position Image</h2><p id="cropper-description">Move the sliders until the image is framed the way you want.</p><div class="image-cropper-canvas-wrap"><canvas id="cropper-canvas"></canvas></div><div class="image-cropper-controls"><label>Zoom <input id="cropper-zoom" type="range" min="1" max="3" step="0.01" value="1"></label><label>Left / Right <input id="cropper-x" type="range" min="-1" max="1" step="0.01" value="0"></label><label>Up / Down <input id="cropper-y" type="range" min="-1" max="1" step="0.01" value="0"></label></div><p class="image-cropper-note">The preview shows exactly what will be saved.</p><div class="image-cropper-actions"><button id="cropper-apply" class="auth-button" type="button">Use This Crop</button><button id="cropper-cancel" class="auth-button auth-button-secondary" type="button">Cancel</button></div></section>`;
  document.body.appendChild(root);return root;
}

async function cropImage(file,kind){
  if(!file?.type?.startsWith('image/'))throw new Error('Please choose an image file.');
  if(file.size>20*1024*1024)throw new Error('Please choose an image smaller than 20 MB.');
  const image=await loadImage(file),avatar=kind==='avatar';
  const outputWidth=avatar?700:1600,outputHeight=avatar?700:900;
  const previewWidth=avatar?420:640,previewHeight=Math.round(previewWidth*(outputHeight/outputWidth));
  const root=createCropper(),canvas=root.querySelector('#cropper-canvas'),ctx=canvas.getContext('2d',{alpha:false});
  const zoom=root.querySelector('#cropper-zoom'),x=root.querySelector('#cropper-x'),y=root.querySelector('#cropper-y');
  const title=root.querySelector('#cropper-title'),description=root.querySelector('#cropper-description');
  title.textContent=avatar?'Position Avatar':'Position Banner';description.textContent=avatar?'Choose how your square avatar will be cropped.':'Choose how your wide profile banner will be cropped.';
  canvas.width=previewWidth;canvas.height=previewHeight;zoom.value='1';x.value='0';y.value='0';root.hidden=false;
  const targetRatio=outputWidth/outputHeight,sourceRatio=image.naturalWidth/image.naturalHeight;
  const baseScale=sourceRatio>targetRatio?outputHeight/image.naturalHeight:outputWidth/image.naturalWidth;
  function cropRect(){const scale=baseScale*Number(zoom.value);const visibleW=outputWidth/scale,visibleH=outputHeight/scale;const maxX=Math.max(0,(image.naturalWidth-visibleW)/2),maxY=Math.max(0,(image.naturalHeight-visibleH)/2);const sx=(image.naturalWidth-visibleW)/2+Number(x.value)*maxX;const sy=(image.naturalHeight-visibleH)/2+Number(y.value)*maxY;return{sx:Math.max(0,Math.min(image.naturalWidth-visibleW,sx)),sy:Math.max(0,Math.min(image.naturalHeight-visibleH,sy)),sw:visibleW,sh:visibleH}}
  function draw(){const r=cropRect();ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,r.sx,r.sy,r.sw,r.sh,0,0,canvas.width,canvas.height)}
  [zoom,x,y].forEach(control=>control.addEventListener('input',draw));draw();
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{root.hidden=true;root.querySelector('#cropper-apply').onclick=null;root.querySelector('#cropper-cancel').onclick=null};
    root.querySelector('#cropper-cancel').onclick=()=>{cleanup();resolve(null)};
    root.querySelector('#cropper-apply').onclick=async()=>{try{const r=cropRect(),output=document.createElement('canvas');output.width=outputWidth;output.height=outputHeight;const outputContext=output.getContext('2d',{alpha:false});outputContext.drawImage(image,r.sx,r.sy,r.sw,r.sh,0,0,outputWidth,outputHeight);const blob=await canvasBlob(output);const base=(file.name||kind).replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]+/gi,'-');cleanup();resolve(new File([blob],`${base}-${kind}.webp`,{type:'image/webp',lastModified:Date.now()}))}catch(error){cleanup();reject(error)}};
  });
}

function setPreview(id,file){
  const preview=document.getElementById(id);if(!preview)return;
  const url=URL.createObjectURL(file),image=document.createElement('img');image.src=url;image.alt='Processed profile image preview';image.onload=()=>URL.revokeObjectURL(url);preview.replaceChildren(image);
}

async function handle(event,input,kind,previewId){
  if(input.dataset.settingProcessed==='true'){delete input.dataset.settingProcessed;return}
  const original=input.files?.[0];if(!original)return;
  event.stopImmediatePropagation();
  input.disabled=true;if(status)status.textContent=kind==='avatar'?'Opening avatar cropper…':'Opening banner cropper…';
  try{
    const processed=await cropImage(original,kind);
    if(!processed){input.value='';if(status)status.textContent='Image selection canceled.';return}
    const transfer=new DataTransfer();transfer.items.add(processed);input.files=transfer.files;
    setPreview(previewId,processed);input.dataset.processed='true';
    if(status)status.textContent=`${kind==='avatar'?'Avatar':'Banner'} ready — reduced to ${Math.max(1,Math.round(processed.size/1024))} KB.`;
  }catch(error){console.error(error);if(status)status.textContent=error.message||'The image could not be processed.';input.value=''}
  finally{input.disabled=false}
}

bannerInput?.addEventListener('change',event=>handle(event,bannerInput,'banner','banner-preview'),{capture:true});
avatarInput?.addEventListener('change',event=>handle(event,avatarInput,'avatar','avatar-preview'),{capture:true});