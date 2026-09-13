'use strict';
// Pure validation shared by the callable service and its tests. No client pricing is trusted.
class BookingError extends Error { constructor(code, message) { super(message); this.code = code; } }
const fail = (message, code = 'invalid-argument') => { throw new BookingError(code, message); };
function text(value, max = 200) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function id(value) { const v = text(value, 128); if (!/^[A-Za-z0-9_-]{1,128}$/.test(v)) fail('Invalid booking identifier.'); return v; }
function day(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T12:00:00Z')) || new Date(value + 'T12:00:00Z').toISOString().slice(0,10) !== value) fail('Choose a valid date.'); return value; }
function today(zone = 'UTC', now = new Date()) { return new Intl.DateTimeFormat('en-CA', {timeZone: zone, year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
function dates(start, end = start, now = new Date(), zone = 'UTC') {
  day(start); day(end);
  const count = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  if (count < 1 || count > 7) fail('Select one date or up to seven consecutive performance dates.');
  if (start < today(zone, now) || Date.parse(end) > now.getTime() + 730 * 86400000) fail('Choose dates within the next two years.');
  return Array.from({length:count}, (_, i) => new Date(Date.parse(start) + i * 86400000).toISOString().slice(0,10));
}
function integer(value, min, max, label) { const n = Number(value); if (!Number.isInteger(n) || n < min || n > max) fail('Check ' + label + '.'); return n; }
function money(value) { const n = Number(value); if (value === '' || value == null || !Number.isFinite(n) || n < 0 || n > 100000 || Math.abs(n*100-Math.round(n*100)) > 0.00001) fail('Enter a valid dollar amount with at most two decimal places.'); return Math.round(n*100); }
function settings(input = {}) {
  let timeZone = text(input.timeZone, 80) || 'America/Phoenix';
  try { today(timeZone); } catch { fail('Choose a valid calendar time zone.'); }
  if (input.enabled !== true && !input.rate && !input.rateBasis) return {enabled:false,currency:'USD',rateCents:0,rateBasis:'show',memberCount:1,sets:1,setMinutes:60,timeZone,travel:'',terms:'',blockedDates:[]};
  if (!['show','member'].includes(input.rateBasis)) fail('Choose per show or per member.');
  const blockedDates = [...new Set(Array.isArray(input.blockedDates) ? input.blockedDates.map(day) : [])].sort();
  if (blockedDates.length > 366) fail('Use at most 366 blocked dates.');
  const rateCents=Number.isInteger(input.rateCents)?input.rateCents:money(input.rate);
  if(rateCents<0||rateCents>10000000) fail('Enter a valid performance rate.');
  return {enabled:input.enabled === true, currency:'USD', rateCents, rateBasis:input.rateBasis, memberCount:integer(input.memberCount||1,1,30,'member count'), sets:integer(input.sets||1,1,12,'number of sets'), setMinutes:integer(input.setMinutes||60,10,240,'set length'), timeZone, travel:text(input.travel,500), terms:text(input.terms,1200), blockedDates};
}
function terms(s) { return {currency:s.currency,rateCents:s.rateCents,rateBasis:s.rateBasis,memberCount:s.memberCount,sets:s.sets,setMinutes:s.setMinutes,timeZone:s.timeZone,travel:s.travel,terms:s.terms,showRateCents:s.rateCents*(s.rateBasis==='member'?s.memberCount:1)}; }
function requestData(input, s, now = new Date()) {
  const event = {};
  for (const [key,max] of Object.entries({venue:140,contactName:100,phone:50,address:250,location:140,title:160,sound:500,details:1500})) {
    event[key] = text(input[key],max);
    if (!event[key] && !['details','address','title','sound'].includes(key)) fail('Please complete ' + key.replace(/([A-Z])/g,' $1').toLowerCase() + '.');
  }
  for (const key of ['time','loadIn']) { event[key] = text(input[key],5); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(event[key])) fail('Complete the show and load-in times.'); }
  event.endTime = text(input.endTime,5); if (event.endTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.endTime)) fail('Check the end time.');
  event.title = event.title || 'Live show'; event.age = text(input.age,30); if (!['All ages','21+'].includes(event.age)) fail('Choose All ages or 21+.');
  event.capacity = integer(input.capacity,1,100000,'expected attendance');
  event.price = text(input.price,80);
  event.offeredCents = money(input.offeredPay);
  event.dates = dates(input.startDate,input.endDate || input.startDate,now,s.timeZone);
  event.privateEvent = input.privateEvent === true;
  if (input.termsAccepted !== true) fail('Confirm that this is a request, subject to the band’s review.');
  return event;
}
function assertAvailable(selected, unavailable) { if (selected.some(d => unavailable.has(d))) fail('One or more selected dates are no longer available. Choose other dates.', 'already-exists'); }
function assertTransition(status, action) {
  if (!['accept','decline','changes'].includes(action)) fail('Choose a booking decision.');
  if (!['pending','changes_requested'].includes(status)) fail('This request has already been decided.', 'failed-precondition');
}
function ownsPost(p, profileId, ownerId) {
  let explicit = p.websiteProfileId;
  if (!explicit) for (const url of [p.profileUrl,p.event?.profileUrl]) { try { const u=new URL(url,'https://bandtroductions.com'); if (['bandtroductions.com','www.bandtroductions.com'].includes(u.hostname)) explicit=u.searchParams.get('id'); } catch {} if(explicit) break; }
  return explicit ? explicit === profileId : [profileId,ownerId].includes(p.authorId) || p.submittedByUid === profileId;
}
function showPost(request, date, stamp) {
  const e = request.event;
  // Private contact information, pay and private-event details never enter public posts.
  const event = {title:e.title,date,time:e.time,endTime:e.endTime,venue:e.venue,location:e.location,age:e.age,price:e.price,details:e.details};
  return {websiteProfileId:request.profileId,bookingRequestId:request.id,authorId:request.ownerId,authorName:request.bandName,accountType:'band',category:'show',published:!e.privateEvent,event,eventDate:date,showDate:date,content:e.title+' · '+e.venue+' · '+date,createdAt:stamp,updatedAt:stamp};
}
module.exports = {BookingError,fail,text,id,day,today,dates,settings,terms,requestData,assertAvailable,assertTransition,ownsPost,showPost};
