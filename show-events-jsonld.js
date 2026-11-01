// Injects one schema.org MusicEvent JSON-LD block for the upcoming shows shown on the homepage card.
const SCRIPT_ID='bt-show-events-jsonld';
const SITE='https://bandtroductions.com/';
const s=v=>String(v??'').trim();
function validHttp(v){const t=s(v);if(!t||/\s/.test(t))return'';try{const u=new URL(t);if(!/^https?:$/.test(u.protocol))return'';if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(u.hostname))return'';return u.href;}catch{return'';}}
function absUrl(v){const t=s(v);if(!t)return'';try{const u=new URL(t,SITE);return /^https?:$/.test(u.protocol)?u.href:'';}catch{return'';}}
function parseTime(v){const m=s(v).match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?/i);if(!m)return null;let h=+m[1];const min=+(m[2]||0);const ap=(m[3]||'').toLowerCase();if(ap==='p'&&h<12)h+=12;if(ap==='a'&&h===12)h=0;if(!ap&&!m[2])return null;if(h>23||min>59)return null;return[h,min];}
function nyOffset(y,mo,d,h,mi){const utc=Date.UTC(y,mo-1,d,h,mi);const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(utc));const g=t=>+p.find(x=>x.type===t).value;const diff=Math.round((Date.UTC(g('year'),g('month')-1,g('day'),g('hour'),g('minute'))-utc)/60000);const sign=diff<0?'-':'+';const a=Math.abs(diff);return`${sign}${String(Math.floor(a/60)).padStart(2,'0')}:${String(a%60).padStart(2,'0')}`;}
function isoStart(date,time){const raw=s(date);let y,mo,d;const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m){y=+m[1];mo=+m[2];d=+m[3];}else{const dt=new Date(raw);if(Number.isNaN(dt.getTime()))return'';y=dt.getFullYear();mo=dt.getMonth()+1;d=dt.getDate();}const ds=`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const t=parseTime(time);if(!t)return ds;return`${ds}T${String(t[0]).padStart(2,'0')}:${String(t[1]).padStart(2,'0')}:00${nyOffset(y,mo,d,t[0],t[1])}`;}
// shows: [{band, title, date, time, venue, location, ticketUrl, profileUrl, image}]
export function buildShowEvents(shows){
  return (shows||[]).map(x=>{const startDate=isoStart(x.date,x.time);if(!startDate)return null;const band=s(x.band)||'Local band';const venue=s(x.venue);const addr=s(x.location);
    const ev={'@type':'MusicEvent',name:s(x.title)&&s(x.title)!==band?`${band}: ${s(x.title)}`:(venue?`${band} at ${venue}`:band),startDate,eventStatus:'https://schema.org/EventScheduled',eventAttendanceMode:'https://schema.org/OfflineEventAttendanceMode',
      location:{'@type':'Place',name:venue||addr||'TBA',...(addr?{address:addr}:{})},
      performer:{'@type':'MusicGroup',name:band,...(absUrl(x.profileUrl)?{url:absUrl(x.profileUrl)}:{})}};
    const img=validHttp(x.image);if(img)ev.image=img;const t=validHttp(x.ticketUrl);if(t)ev.offers={'@type':'Offer',url:t};return ev;}).filter(Boolean);
}
export function injectShowEvents(shows){
  try{document.getElementById(SCRIPT_ID)?.remove();const events=buildShowEvents(shows);if(!events.length)return;
    const el=document.createElement('script');el.type='application/ld+json';el.id=SCRIPT_ID;
    el.textContent=JSON.stringify({'@context':'https://schema.org','@graph':events}).replace(/</g,'\\u003c');document.head.appendChild(el);}catch(err){console.warn('show JSON-LD skipped',err);}
}
