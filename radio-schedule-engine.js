import './radio-control-room-ux-fix.js?v=1';

export const RADIO_TIMEZONE='America/New_York';

export function easternClock(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:RADIO_TIMEZONE,weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(date);
  const get=type=>parts.find(p=>p.type===type)?.value||'';
  const weekday=get('weekday');
  const hour=Number(get('hour'))%24;
  const minute=Number(get('minute'));
  const second=Number(get('second'));
  return {weekday,hour,minute,second,minutes:hour*60+minute,seconds:hour*3600+minute*60+second};
}

const DAYS=['sun','mon','tue','wed','thu','fri','sat'];
function previousDay(day){const i=DAYS.indexOf(day);return i<0?day:DAYS[(i+6)%7];}

export function activePlaylist(playlists,date=new Date()){
  const now=easternClock(date);
  const day=now.weekday.toLowerCase().slice(0,3);
  const list=Object.entries(playlists||{}).map(([id,p])=>({id,...p})).filter(p=>p.active!==false&&Array.isArray(p.items)&&p.items.length);
  const matches=list.filter(p=>{
    const days=Array.isArray(p.days)&&p.days.length?p.days:['every'];
    const start=Number(p.startMinutes||0);
    const end=Number(p.endMinutes??1440);
    const every=days.includes('every');
    if(end>start){
      const dayMatch=every||days.includes(day);
      return dayMatch&&now.minutes>=start&&now.minutes<end;
    }
    if(now.minutes>=start){
      const dayMatch=every||days.includes(day);
      return dayMatch;
    }
    if(now.minutes<end){
      const dayMatch=every||days.includes(previousDay(day));
      return dayMatch;
    }
    return false;
  });
  return matches.sort((a,b)=>(Number(b.priority||0)-Number(a.priority||0))||(Number(b.startMinutes||0)-Number(a.startMinutes||0))||(Number(b.createdAt||0)-Number(a.createdAt||0)))[0]||null;
}

export function nextPlaylist(playlists,date=new Date()){
  const now=easternClock(date);
  const day=now.weekday.toLowerCase().slice(0,3);
  const todayIndex=DAYS.indexOf(day);
  if(todayIndex<0)return null;
  const list=Object.entries(playlists||{}).map(([id,p])=>({id,...p})).filter(p=>p.active!==false&&Array.isArray(p.items)&&p.items.length);
  const candidates=[];
  for(const p of list){
    const days=Array.isArray(p.days)&&p.days.length?p.days:['every'];
    const start=((Number(p.startMinutes)||0)%1440+1440)%1440;
    for(let dayOffset=0;dayOffset<=7;dayOffset++){
      const candidateDay=DAYS[(todayIndex+dayOffset)%7];
      if(!days.includes('every')&&!days.includes(candidateDay))continue;
      const minutesUntil=dayOffset*1440+start-now.minutes;
      if(minutesUntil<=0)continue;
      candidates.push({...p,dayOffset,day:candidateDay,minutesUntil});
      break;
    }
  }
  return candidates.sort((a,b)=>a.minutesUntil-b.minutesUntil||(Number(b.priority||0)-Number(a.priority||0))||(Number(b.createdAt||0)-Number(a.createdAt||0)))[0]||null;
}

export function playlistPosition(playlist,date=new Date()){
  if(!playlist||!Array.isArray(playlist.items)||!playlist.items.length)return null;
  const now=easternClock(date);
  const durations=playlist.items.map(item=>Math.max(1,Number(item.durationSeconds)||1));
  const total=durations.reduce((sum,n)=>sum+n,0);
  if(!total)return null;
  const start=Number(playlist.startMinutes||0)*60;
  let elapsed=now.seconds-start;
  if(elapsed<0)elapsed+=86400;
  let offset=((elapsed%total)+total)%total;
  for(let index=0;index<playlist.items.length;index++){
    const duration=durations[index];
    if(offset<duration)return {index,offsetSeconds:offset,totalDurationSeconds:total,elapsedSeconds:elapsed};
    offset-=duration;
  }
  return {index:0,offsetSeconds:0,totalDurationSeconds:total,elapsedSeconds:elapsed};
}

export function formatMinutes(value){
  const mins=((Number(value)||0)%1440+1440)%1440;
  const h=Math.floor(mins/60),m=mins%60;
  const suffix=h>=12?'PM':'AM';
  const display=h%12||12;
  return `${display}:${String(m).padStart(2,'0')} ${suffix}`;
}

// ---- Sponsor break (between-shows ad) ----
// Config lives on radioPlaylists/__stationControl as a `sponsorBreak` map:
//   { active:true, sponsorName, clickUrl, videoUrl (mp4 with voice-over), posterUrl, durationSeconds }
// A "break minute" is a 1-minute gap where one scheduled show has just ended and the next
// scheduled show starts the following minute. Full-day filler playlists (e.g. the Rotation) do
// not count as shows. If the config is missing, inactive, or has no videoUrl, this returns null
// and the players behave exactly as before.
function isFiller(p){
  const start=Number(p.startMinutes||0),end=Number(p.endMinutes??1440);
  const len=end>start?end-start:1440-start+end;
  return len>=1439;
}
function dayList(p){return Array.isArray(p.days)&&p.days.length?p.days:['every'];}
export function sponsorBreak(playlists,config,date=new Date()){
  if(!config||config.active!==true||!(config.videoUrl||config.posterUrl))return null;
  const now=easternClock(date);
  const day=now.weekday.toLowerCase().slice(0,3);
  const shows=Object.entries(playlists||{}).map(([id,p])=>({id,...p}))
    .filter(p=>p.active!==false&&Array.isArray(p.items)&&p.items.length&&!isFiller(p));
  const m=now.minutes;
  const ended=shows.find(p=>{
    const start=Number(p.startMinutes||0),end=Number(p.endMinutes??1440)%1440;
    if(end!==m)return false;
    const d=dayList(p);
    const wraps=Number(p.endMinutes??1440)<=start;
    const showDay=wraps&&m<start?previousDay(day):day;
    return d.includes('every')||d.includes(showDay);
  });
  if(!ended)return null;
  const nextMin=(m+1)%1440;
  const nextDay=nextMin===0?DAYS[(DAYS.indexOf(day)+1)%7]:day;
  const next=shows.find(p=>{
    if(((Number(p.startMinutes||0)%1440)+1440)%1440!==nextMin)return false;
    const d=dayList(p);return d.includes('every')||d.includes(nextDay);
  });
  if(!next)return null;
  const offsetSeconds=now.second;
  const durationSeconds=Math.max(1,Math.min(60,Number(config.durationSeconds)||40));
  return {
    type:'sponsorBreak',
    key:`break|${ended.id}|${next.id}|${day}|${m}`,
    sponsorName:String(config.sponsorName||'Our Sponsor'),
    clickUrl:String(config.clickUrl||'radio-sponsor.html'),
    videoUrl:String(config.videoUrl),
    audioUrl:String(config.audioUrl||''),
    posterUrl:String(config.posterUrl||''),
    durationSeconds,
    offsetSeconds,
    clipPlaying:offsetSeconds<durationSeconds,
    endedShow:ended.upNextDisplayName||ended.name||'',
    nextShow:next.upNextDisplayName||next.name||'',
    nextStartMinutes:nextMin
  };
}

// Static fallback config (site-root sponsor-break.json). Firestore __stationControl.sponsorBreak
// wins whenever that field exists (so the Control Room can override or switch it off).
let staticBreakConfig=null,staticBreakLoaded=0;
export function loadStaticSponsorBreak(url='/sponsor-break.json'){
  if(Date.now()-staticBreakLoaded<300000)return;
  staticBreakLoaded=Date.now();
  fetch(url,{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(j=>{staticBreakConfig=j&&typeof j==='object'?j:null;}).catch(()=>{staticBreakConfig=null;});
}
export function effectiveSponsorBreak(stationSettings){
  const fs=stationSettings&&stationSettings.sponsorBreak;
  if(fs&&typeof fs==='object')return fs;
  return staticBreakConfig;
}

// PREVIEW-ONLY test break. Active only on a Firebase Hosting preview channel host
// (<site>--<channel>-<hash>.web.app) AND with ?testBreak=1 in the URL. It never runs on
// bandtroductions.com or the default web.app site and never reads or writes Firestore.
const PREVIEW_TEST_BREAK=(()=>{try{return /--[a-z0-9-]+\.web\.app$/i.test(location.hostname)&&new URLSearchParams(location.search).get('testBreak')==='1';}catch{return false;}})();
const TEST_BREAK_START=Date.now()+20000;
export function withPreviewTestBreak(real,config){
  if(real||!PREVIEW_TEST_BREAK)return real;
  const c=config||{};if(!(c.videoUrl||c.posterUrl))return null;
  const durationSeconds=Math.max(1,Math.min(60,Number(c.durationSeconds)||40));
  const offsetSeconds=(Date.now()-TEST_BREAK_START)/1000;
  if(offsetSeconds<0||offsetSeconds>=durationSeconds+3)return null;
  const now=easternClock();
  return {type:'sponsorBreak',key:'break|preview-test',sponsorName:String(c.sponsorName||'Our Sponsor'),clickUrl:String(c.clickUrl||'radio-sponsor.html'),videoUrl:String(c.videoUrl),audioUrl:String(c.audioUrl||''),posterUrl:String(c.posterUrl||''),durationSeconds,offsetSeconds,clipPlaying:offsetSeconds<durationSeconds,endedShow:'Test',nextShow:'Back to the music',nextStartMinutes:(now.minutes+1)%1440};
}
