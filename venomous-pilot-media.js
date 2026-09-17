// Pilot-only sample content for the Venomous Thorns website.
// Nothing here is written to Firestore. Real profile/website content wins as it is added.
export const VENOMOUS_PILOT_PROFILE='19MH0ZzVlPVN4ediF4PesZR5TY13';

const absolute=path=>new URL(path,location.href).href;

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

export function installVenomousPilotEditorHints(profileId=''){
  if(profileId!==VENOMOUS_PILOT_PROFILE||typeof MutationObserver==='undefined')return;
  const cleanHeading=heading=>heading?.textContent.trim().replace(/[＋−]$/,'').trim()||'';
  const improve=()=>{
    const editor=document.getElementById('website-editor');
    if(!editor)return false;

    const baseCards=[...editor.querySelectorAll('.editor-grid > section')];
    const headings=baseCards.map(card=>card.querySelector('h3')).filter(Boolean);
    const imageHeading=headings.find(h=>cleanHeading(h)==='Images');
    if(imageHeading)imageHeading.childNodes[0].textContent='Profile & banner images ';

    const heroHeadings=headings.filter(h=>cleanHeading(h)==='Hero');
    if(heroHeadings[0])heroHeadings[0].childNodes[0].textContent='Homepage buttons & tagline ';
    if(heroHeadings[1])heroHeadings[1].childNodes[0].textContent='Main banner position & brightness ';

    const panel=editor.querySelector('.media-editor-panel');
    if(panel&&!panel.dataset.pilotPhotoHint){
      panel.dataset.pilotPhotoHint='true';
      const heading=panel.querySelector('h3');
      if(heading)heading.childNodes[0].textContent='Photos & videos ';
      const photoInput=panel.querySelector('#library-photos');
      if(photoInput){
        const label=photoInput.closest('label');
        if(label){
          const labelText=[...label.childNodes].find(node=>node.nodeType===Node.TEXT_NODE);
          if(labelText)labelText.textContent='Upload photos to gallery ';
        }
      }
      const intro=document.createElement('p');
      intro.className='muted';
      intro.textContent='Add gallery photos and YouTube videos here. These are separate from the banner and band image above.';
      const firstParagraph=panel.querySelector('p');
      if(firstParagraph)firstParagraph.before(intro);else panel.prepend(intro);
    }

    const wrap=editor.querySelector('.wrap');
    const form=editor.querySelector('#website-form');
    const tools=editor.querySelector('.ws-tools');
    const bookingRequests=wrap?[...wrap.children].find(node=>node.tagName==='SECTION'&&node.querySelector(':scope > h2')?.textContent.trim()==='Booking requests'):null;
    const memberPanel=editor.querySelector('.ws-member-editor');
    if(!wrap||!form||!panel||!memberPanel||!tools||!bookingRequests)return false;

    if(!editor.querySelector('.editor-flow-nav')){
      const style=document.createElement('style');
      style.id='venomous-editor-flow-style';
      style.textContent='.editor-flow-nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:22px 0 10px}.website-editor .editor-flow-nav button{background:transparent;color:#eef4ee;border:1px solid #788079;text-align:left;padding:13px 14px}.website-editor .editor-flow-nav button[aria-pressed="true"]{background:#c3ec77;color:#132007;border-color:#c3ec77}.editor-flow-help{margin:0 0 20px!important}.editor-area-tools-note{margin:18px 0 0!important}@media(min-width:760px){.editor-flow-nav{grid-template-columns:repeat(5,minmax(0,1fr))}}';
      document.head.append(style);

      const nav=document.createElement('div');
      nav.className='editor-flow-nav';
      nav.setAttribute('role','group');
      nav.setAttribute('aria-label','Choose what to edit');
      const help=document.createElement('p');
      help.className='editor-flow-help';
      const areas=[
        ['appearance','Appearance','Images, colors, banner and homepage look.'],
        ['pages','Pages & buttons','Menu pages and custom link buttons.'],
        ['booking','Booking','Rates, payment setup and booking requests.'],
        ['media','Media & members','Band members, photos and videos.'],
        ['tools','Shows & songs','Manage shows and upload songs to the player.']
      ];
      const cards=()=>[...editor.querySelectorAll('.editor-grid > section')];
      const areaForCard=card=>{
        if(card.classList.contains('media-editor-panel')||card.classList.contains('ws-member-editor'))return 'media';
        const heading=cleanHeading(card.querySelector('h3'));
        if(['Website pages','Custom buttons'].includes(heading))return 'pages';
        if(heading==='Booking & payment')return 'booking';
        return 'appearance';
      };
      const showArea=area=>{
        for(const card of cards())card.hidden=areaForCard(card)!==area;
        form.hidden=area==='tools';
        bookingRequests.hidden=area!=='booking';
        tools.hidden=area!=='tools';
        nav.querySelectorAll('button[data-editor-area]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.editorArea===area)));
        help.textContent=areas.find(item=>item[0]===area)?.[2]||'';
      };
      for(const [area,label] of areas){
        const button=document.createElement('button');
        button.type='button';
        button.dataset.editorArea=area;
        button.textContent=label;
        button.onclick=()=>showArea(area);
        nav.append(button);
      }
      const introLink=wrap.querySelector('p a[href*="profile-setup.html"]')?.closest('p');
      if(introLink)introLink.after(nav,help);else form.before(nav,help);
      const note=document.createElement('p');
      note.className='editor-area-tools-note muted';
      note.textContent='Shows and song uploads save through their own tools below; website appearance changes still use Preview changes, then Publish website.';
      tools.prepend(note);
      showArea('appearance');
    }

    return true;
  };
  if(improve())return;
  const observer=new MutationObserver(()=>{if(improve())observer.disconnect();});
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
