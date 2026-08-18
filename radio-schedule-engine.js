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
