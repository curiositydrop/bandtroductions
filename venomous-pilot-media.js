// Pilot-only sample content and UX helpers for the Venomous Thorns website.
// Sample media is never written to Firestore. Real profile/website content wins as it is added.
export const VENOMOUS_PILOT_PROFILE='19MH0ZzVlPVN4ediF4PesZR5TY13';

const absolute=path=>new URL(path,location.href).href;

function safeExternalUrl(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  try{
    const url=new URL(raw,location.href);
    return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';
  }catch{return '';}
}

function pageVisibility(profile={}){
  const sections=profile.websiteSettings?.sections||{};
  return {
    about:sections.about!==false,
    music:sections.music!==false,
    photos:sections.photos!==false,
    shows:sections.shows!==false,
    merch:sections.merch!==false,
    booking:sections.booking!==false,
    contact:sections.contact!==false
  };
}

export function seedVenomousPilotMedia(profile={},profileId=''){
  if(profileId!==VENOMOUS_PILOT_PROFILE)return profile;
  const seeded={...profile};
  const existingMedia=Array.isArray(profile.mediaItems)?profile.mediaItems:[];
  const existingAdditional=Array.isArray(profile.additionalMedia)?profile.additionalMedia:[];
  const hasVideo=Boolean(profile.mediaLink)||existingAdditional.length>0||existingMedia.some(item=>typeof item==='string'||item?.type==='video');
  const hasPhotos=existingMedia.some(item=>item?.type==='image'&&item.url);

  if(!hasVideo){
    seeded.additionalMedia=[
      ...existingAdditional,
      {url:'https://www.youtube.com/watch?v=RyAK3AAX49g',title:'Burning Time — Hard to Follow · BANDtroductions pilot sample'},
      {url:'https://www.youtube.com/watch?v=uV9fAqVsIgQ',title:'Ascent To Power · BANDtroductions pilot sample'},
      {url:'https://www.youtube.com/watch?v=o_a3zRmXjf0',title:'Burning Time · BANDtroductions pilot sample'}
    ];
  }

  if(!hasPhotos){
    seeded.mediaItems=[
      ...existingMedia,
      {type:'image',url:absolute('IMG_0389.jpeg'),caption:'Burning Time · BANDtroductions pilot gallery sample'},
      {type:'image',url:absolute('inbound8324947404328791301.png'),caption:'Ascent To Power · BANDtroductions pilot gallery sample'},
      {type:'image',url:absolute('Band Pic 1.jpeg'),caption:'BANDtroductions pilot gallery sample'},
      {type:'image',url:absolute('IMG_6355.jpeg'),caption:'BANDtroductions pilot gallery sample'}
    ];
  }
  return seeded;
}

export function installVenomousPilotPageVisibility(profileId='',profile={}){
  if(profileId!==VENOMOUS_PILOT_PROFILE||typeof MutationObserver==='undefined')return;
  const pages=pageVisibility(profile);
  const routeMap={about:'about',music:'music',photos:'photos',shows:'shows',merch:'merch',booking:'booking',contact:'contact'};
  let applying=false;
  const apply=()=>{
    if(applying)return;
    applying=true;
    try{
      for(const [key,route] of Object.entries(routeMap)){
        const shown=pages[key]!==false;
        document.querySelectorAll(`a[href="#/${route}"]`).forEach(link=>link.hidden=!shown);
        const section=document.getElementById(route);
        if(section&&!section.closest('#website-editor'))section.hidden=!shown;
        if(key==='music'){
          const player=document.getElementById('band-player');
          if(player)player.hidden=!shown;
        }
      }
      const current=(location.hash||'#/home').slice(2);
      const entry=Object.entries(routeMap).find(([,route])=>route===current);
      if(entry&&pages[entry[0]]===false)location.hash='#/home';
    }finally{applying=false;}
  };
  apply();
  const observer=new MutationObserver(apply);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('hashchange',apply);
  window.addEventListener('pagehide',()=>{observer.disconnect();window.removeEventListener('hashchange',apply);},{once:true});
}

export function installVenomousPilotEditorHints(profileId='',profile={}){
  if(profileId!==VENOMOUS_PILOT_PROFILE||typeof MutationObserver==='undefined')return;

  let publishedButtons=(Array.isArray(profile.websiteSettings?.buttons)?profile.websiteSettings.buttons:[]).slice(0,6).map(b=>({label:String(b?.label||'').trim(),url:String(b?.url||'').trim()}));
  let workingButtons=publishedButtons.map(b=>({...b}));
  let publishedPages=pageVisibility(profile);
  let publishedPayment={depositPaymentUrl:String(profile.websiteSettings?.booking?.depositPaymentUrl||''),fullPaymentUrl:String(profile.websiteSettings?.booking?.fullPaymentUrl||'')};
  let saveHookReady=false;

  const headingText=heading=>heading?.textContent.trim().replace(/[＋−]$/,'').trim()||'';
  const cardByHeading=(editor,name)=>[...editor.querySelectorAll('.editor-grid > section')].find(card=>headingText(card.querySelector('h3'))===name);
  const setHeading=(heading,text)=>{if(heading?.childNodes?.length)heading.childNodes[0].textContent=text+' ';};

  function buildPageControls(editor){
    const card=cardByHeading(editor,'Sections')||cardByHeading(editor,'Website pages');
    if(!card)return false;
    const heading=card.querySelector('h3');setHeading(heading,'Website pages');
    if(card.dataset.pilotPagesReady==='true')return true;
    card.dataset.pilotPagesReady='true';

    const existing={about:card.querySelector('#show-about'),music:card.querySelector('#show-music'),merch:card.querySelector('#show-merch'),meetBand:card.querySelector('#show-meet-band')};
    [...card.children].filter(node=>node!==heading).forEach(node=>node.remove());

    const intro=document.createElement('p');intro.className='muted';intro.textContent='Home always stays on. Turn the other website pages on or off here.';card.append(intro);
    const addToggle=(id,labelText,checked=true,disabled=false)=>{
      const label=document.createElement('label');
      const input=document.createElement('input');input.type='checkbox';input.id=id;input.checked=checked;input.disabled=disabled;
      label.append(input,document.createTextNode(' '+labelText));card.append(label);return input;
    };
    addToggle('show-home','Home',true,true);
    const addExisting=(input,text,checked,indent=false)=>{
      if(!input)return addToggle(text.toLowerCase().replace(/\W+/g,'-'),text,checked);
      input.checked=checked;const label=document.createElement('label');if(indent)label.style.marginLeft='24px';label.append(input,document.createTextNode(' '+text));card.append(label);return input;
    };
    addExisting(existing.about,'About',publishedPages.about);
    addExisting(existing.meetBand,'Meet the band (inside About)',profile.websiteSettings?.sections?.meetBand!==false,true);
    addExisting(existing.music,'Videos',publishedPages.music);
    addToggle('show-photos','Photos',publishedPages.photos);
    addToggle('show-shows','Shows',publishedPages.shows);
    addExisting(existing.merch,'Merch',publishedPages.merch);
    addToggle('show-booking-page','Booking',publishedPages.booking);
    addToggle('show-contact-page','Contact',publishedPages.contact);
    return true;
  }

  function buildPaymentLinks(editor){
    const card=cardByHeading(editor,'Booking & payment');
    if(!card)return false;
    const enabled=card.querySelector('#booking-enabled');
    if(enabled&&profile.websiteSettings?.booking?.enabled===undefined)enabled.checked=true;
    if(card.dataset.pilotPaymentLinks==='true')return true;
    card.dataset.pilotPaymentLinks='true';

    const depositWrap=document.createElement('div');depositWrap.id='deposit-payment-link-wrap';depositWrap.hidden=true;
    depositWrap.innerHTML='<p class="muted">After you approve a booking, the venue can use this link to pay the 50% deposit.</p><label>50% deposit payment link<input type="url" id="booking-deposit-payment-url" inputmode="url" placeholder="https://..."></label>';
    const fullWrap=document.createElement('div');fullWrap.id='full-payment-link-wrap';fullWrap.hidden=true;
    fullWrap.innerHTML='<p class="muted">After you approve a booking, the venue can use this link to pay the full amount.</p><label>Full-payment link<input type="url" id="booking-full-payment-url" inputmode="url" placeholder="https://..."></label>';
    card.append(depositWrap,fullWrap);
    depositWrap.querySelector('input').value=publishedPayment.depositPaymentUrl;
    fullWrap.querySelector('input').value=publishedPayment.fullPaymentUrl;
    const sync=()=>{const selected=card.querySelector('[name="booking-payment"]:checked')?.value||'in_person';depositWrap.hidden=selected!=='deposit';fullWrap.hidden=selected!=='full';};
    card.querySelectorAll('[name="booking-payment"]').forEach(radio=>radio.addEventListener('change',sync));sync();
    return true;
  }

  function convertButtonRows(editor){
    const card=cardByHeading(editor,'Your buttons')||cardByHeading(editor,'Custom buttons');
    if(!card)return false;
    const heading=card.querySelector('h3');setHeading(heading,'Custom buttons');
    const copy=card.querySelector('p');if(copy)copy.textContent='Add up to six custom buttons. Give each button a name and paste the URL you want it to open.';
    const rows=card.querySelector('#button-rows');if(!rows)return false;
    [...rows.children].forEach((row,index)=>{
      let urlInput=row.querySelector('.custom-button-url');
      if(urlInput)return;
      const select=row.querySelector('select');if(!select)return;
      urlInput=document.createElement('input');urlInput.type='url';urlInput.inputMode='url';urlInput.placeholder='https://...';urlInput.className='custom-button-url';urlInput.setAttribute('aria-label','Button URL');
      const known=workingButtons[index]?.url||publishedButtons[index]?.url||select.value||'';
      urlInput.value=known.startsWith('#/')?new URL(location.pathname+known,location.origin).href:known;
      select.hidden=true;select.tabIndex=-1;select.insertAdjacentElement('afterend',urlInput);
    });
    return true;
  }

  function collectCustomButtons(editor){
    const rows=cardByHeading(editor,'Custom buttons')?.querySelector('#button-rows');
    if(!rows)return [];
    const out=[];
    for(const row of rows.children){
      const label=row.querySelector('input:not(.custom-button-url)')?.value.trim()||'';
      const raw=row.querySelector('.custom-button-url')?.value.trim()||'';
      if(!label&&!raw)continue;
      const url=safeExternalUrl(raw);
      if(!label||!url)throw new Error('Each custom button needs button text and a full http:// or https:// URL.');
      out.push({label:label.slice(0,40),url});
    }
    return out.slice(0,6);
  }

  function collectPages(editor){
    return {about:editor.querySelector('#show-about')?.checked!==false,music:editor.querySelector('#show-music')?.checked!==false,photos:editor.querySelector('#show-photos')?.checked!==false,shows:editor.querySelector('#show-shows')?.checked!==false,merch:editor.querySelector('#show-merch')?.checked!==false,booking:editor.querySelector('#show-booking-page')?.checked!==false,contact:editor.querySelector('#show-contact-page')?.checked!==false};
  }

  function collectPayment(editor){
    const deposit=editor.querySelector('#booking-deposit-payment-url')?.value.trim()||'';
    const full=editor.querySelector('#booking-full-payment-url')?.value.trim()||'';
    if(deposit&&!safeExternalUrl(deposit))throw new Error('Use a full http:// or https:// link for the 50% deposit payment link.');
    if(full&&!safeExternalUrl(full))throw new Error('Use a full http:// or https:// link for the full-payment link.');
    return {depositPaymentUrl:deposit?safeExternalUrl(deposit):'',fullPaymentUrl:full?safeExternalUrl(full):''};
  }

  function prepareCoreButtonValidation(editor,buttons){
    const rows=cardByHeading(editor,'Custom buttons')?.querySelector('#button-rows');
    if(!rows)return ()=>{};
    const restore=[];let used=0;
    [...rows.children].forEach(row=>{
      const label=row.querySelector('input:not(.custom-button-url)')?.value.trim()||'';
      const url=row.querySelector('.custom-button-url');if(!url)return;
      restore.push([url,url.value]);
      url.value=label&&buttons[used++]?'#/contact':'';
    });
    return ()=>restore.forEach(([input,value])=>{input.value=value;});
  }

  async function savePilotExtras(buttons,pages,payment){
    const [{db,auth},{doc,updateDoc}]=await Promise.all([import('./firebase-dev.js'),import('https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js')]);
    if(!auth.currentUser)throw new Error('Please sign in again before publishing.');
    const fields={'websiteSettings.buttons':buttons};
    for(const [key,value] of Object.entries(pages))fields[`websiteSettings.sections.${key}`]=value;
    fields['websiteSettings.booking.depositPaymentUrl']=payment.depositPaymentUrl;
    fields['websiteSettings.booking.fullPaymentUrl']=payment.fullPaymentUrl;
    await updateDoc(doc(db,'profiles',profileId),fields);
  }

  function installSaveHooks(editor){
    if(saveHookReady)return;saveHookReady=true;
    const form=editor.querySelector('#website-form'),publish=editor.querySelector('#publish-website'),discard=editor.querySelector('#discard-website'),status=editor.querySelector('#editor-status');
    if(!form||!publish||!discard||!status)return;

    form.addEventListener('submit',event=>{
      try{
        workingButtons=collectCustomButtons(editor);collectPayment(editor);
        const restore=prepareCoreButtonValidation(editor,workingButtons);
        queueMicrotask(()=>{
          restore();
          const rendered=document.querySelectorAll('#custom-buttons a');
          workingButtons.forEach((button,index)=>{if(rendered[index]){rendered[index].href=button.url;rendered[index].target='_blank';rendered[index].rel='noopener';}});
        });
      }catch(error){event.preventDefault();event.stopImmediatePropagation();status.textContent=error.message;}
    },true);

    publish.addEventListener('click',event=>{
      let buttons,pages,payment;
      try{buttons=collectCustomButtons(editor);pages=collectPages(editor);payment=collectPayment(editor);}
      catch(error){event.preventDefault();event.stopImmediatePropagation();status.textContent=error.message;return;}
      workingButtons=buttons.map(b=>({...b}));
      const restore=prepareCoreButtonValidation(editor,buttons);
      queueMicrotask(restore);
      const start=Date.now();
      const timer=setInterval(async()=>{
        if(Date.now()-start>30000){clearInterval(timer);return;}
        if(!status.textContent.startsWith('Published!'))return;
        clearInterval(timer);
        try{
          await savePilotExtras(buttons,pages,payment);
          publishedButtons=buttons.map(b=>({...b}));publishedPages={...pages};publishedPayment={...payment};
          status.textContent='Published! Your website pages, custom buttons and booking settings are live.';
        }catch(error){status.textContent='Website published, but the new custom settings could not be saved. Try Publish again.';console.error(error);}
      },150);
    },true);

    discard.addEventListener('click',()=>{
      workingButtons=publishedButtons.map(b=>({...b}));
      setTimeout(()=>{
        improve();
        for(const [key,id] of Object.entries({about:'show-about',music:'show-music',photos:'show-photos',shows:'show-shows',merch:'show-merch',booking:'show-booking-page',contact:'show-contact-page'})){const input=editor.querySelector('#'+id);if(input)input.checked=publishedPages[key]!==false;}
        const deposit=editor.querySelector('#booking-deposit-payment-url');if(deposit)deposit.value=publishedPayment.depositPaymentUrl;
        const full=editor.querySelector('#booking-full-payment-url');if(full)full.value=publishedPayment.fullPaymentUrl;
      },0);
    },true);
  }

  const improve=()=>{
    const editor=document.getElementById('website-editor');
    if(!editor)return false;
    const baseCards=[...editor.querySelectorAll('.editor-grid > section')];
    const headings=baseCards.map(card=>card.querySelector('h3')).filter(Boolean);
    const imageHeading=headings.find(h=>headingText(h)==='Images'||headingText(h)==='Profile & banner images');
    if(imageHeading)setHeading(imageHeading,'Profile & banner images');
    const heroHeadings=headings.filter(h=>headingText(h)==='Hero');
    if(heroHeadings[0])setHeading(heroHeadings[0],'Homepage buttons & tagline');
    if(heroHeadings[1])setHeading(heroHeadings[1],'Main banner position & brightness');

    buildPageControls(editor);buildPaymentLinks(editor);convertButtonRows(editor);installSaveHooks(editor);

    const panel=document.querySelector('.media-editor-panel');
    if(panel&&!panel.dataset.pilotPhotoHint){
      panel.dataset.pilotPhotoHint='true';
      const heading=panel.querySelector('h3');if(heading)setHeading(heading,'Photos & videos');
      const photoInput=panel.querySelector('#library-photos');
      if(photoInput){const label=photoInput.closest('label');const labelText=label&&[...label.childNodes].find(node=>node.nodeType===Node.TEXT_NODE);if(labelText)labelText.textContent='Upload photos to gallery ';}
      const intro=document.createElement('p');intro.className='muted';intro.textContent='Add gallery photos and YouTube videos here. These are separate from the banner and band image above.';
      const firstParagraph=panel.querySelector('p');if(firstParagraph)firstParagraph.before(intro);else panel.prepend(intro);
    }
    return Boolean(imageHeading&&panel);
  };

  improve();
  const observer=new MutationObserver(()=>improve());
  observer.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
}

export function installVenomousPilotPlayer(profileId=''){
  if(profileId!==VENOMOUS_PILOT_PROFILE||typeof MutationObserver==='undefined')return;
  let timer=0,done=false;
  const fill=()=>{
    if(done)return true;
    const section=document.getElementById('band-player');
    if(!section)return false;
    clearTimeout(timer);
    timer=setTimeout(()=>{
      if(done||!section.isConnected)return;
      const list=section.querySelector('.ws-tracks');
      const audio=section.querySelector('audio');
      if(!list||!audio||list.querySelector('button')||audio.getAttribute('src'))return;
      const title=section.querySelector('.ws-track-title');
      const artist=section.querySelector('.ws-track-artist');
      const status=section.querySelector('.ws-player-status');
      const cover=section.querySelector('.ws-cover');
      const previous=section.querySelector('[data-track="-1"]');
      const next=section.querySelector('[data-track="1"]');
      const trackUrl=absolute('BT_-_Hard_to_Follow_(FINAL).mp3');
      const play=()=>{audio.src=trackUrl;audio.hidden=false;audio.play().catch(()=>{if(status)status.textContent='Tap Play on the audio controls to listen.';});};
      const li=document.createElement('li');
      const button=document.createElement('button');
      button.type='button';button.textContent='Hard to Follow — Burning Time';button.setAttribute('aria-pressed','true');button.onclick=play;
      li.append(button);list.replaceChildren(li);
      if(title)title.textContent='Hard to Follow';
      if(artist)artist.textContent='Burning Time · BANDtroductions pilot sample';
      if(cover)cover.src=absolute('IMG_0389.jpeg');
      if(status)status.textContent='Pilot sample from Burning Time. Venomous Thorns uploads will replace this after approval.';
      if(previous)previous.disabled=true;if(next)next.disabled=true;
      audio.src=trackUrl;audio.hidden=false;
      done=true;
    },2200);
    return false;
  };
  const observer=new MutationObserver(()=>{if(fill()){observer.disconnect();}});
  observer.observe(document.documentElement,{subtree:true,childList:true});
  fill();
  window.addEventListener('pagehide',()=>{clearTimeout(timer);observer.disconnect();},{once:true});
}
