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
