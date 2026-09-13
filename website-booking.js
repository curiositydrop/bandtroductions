import { auth } from './firebase-dev.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';

export function initWebsiteBooking({profileId, profile} = {}) {
  const form=document.getElementById('booking-form'), status=document.getElementById('booking-status'), summary=document.getElementById('booking-rate-summary');
  if(!form)return;
  const s=profile?.websiteSettings?.booking||{};
  const calendar=document.createElement('div');calendar.className='booking-availability';calendar.setAttribute('aria-label','Select booking dates');form.before(calendar);
  const blocked=new Set(Array.isArray(s.blockedDates)?s.blockedDates:[]), selected=new Set();
  function iso(d){return d.toISOString().slice(0,10)}
  function drawCalendar(){
    calendar.replaceChildren();const heading=document.createElement('p');heading.className='muted';heading.textContent='Select one or more open dates. Selected dates will be added to your request.';calendar.append(heading);
    const grid=document.createElement('div');grid.className='booking-date-grid';const start=new Date();start.setHours(12,0,0,0);
    for(let i=0;i<90;i++){const d=new Date(start);d.setDate(start.getDate()+i);const key=iso(d),button=document.createElement('button');button.type='button';button.className='booking-date';button.textContent=d.toLocaleDateString('en-US',{month:'short',day:'numeric'});button.setAttribute('aria-label',d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}));if(blocked.has(key)){button.disabled=true;button.title='Unavailable';}if(selected.has(key))button.classList.add('is-selected');button.onclick=()=>{if(selected.has(key))selected.delete(key);else selected.add(key);const dates=[...selected].sort();form.elements.startDate.value=dates[0]||'';form.elements.endDate.value=dates.length>1?dates[dates.length-1]:'';drawCalendar();};grid.append(button);}
    calendar.append(grid);
  }
  drawCalendar();
  const policy={deposit:'Payment policy: 50% deposit online after approval.',full:'Payment policy: full payment online after approval.',in_person:'Payment policy: pay in person at the show.'}[s.paymentPolicy]||'Payment policy: pay in person at the show.';
  summary.textContent=(s.rateCents>0?`Performance rate: $${(Number(s.rateCents)/100).toFixed(2)} ${s.rateBasis==='member'?'per member':'per show'}. `:'Band performance rate: contact the band for pricing. ')+policy;
  const offered=form.elements.offeredPay;if(offered){offered.closest('label').hidden=true;offered.required=false;offered.value='0';}
  if(s.enabled!==true){form.querySelector('#booking-submit').disabled=true;status.textContent='Booking requests are not live yet.';return;}
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const user=auth.currentUser;
    if(!user){status.textContent='Please sign in to send a booking request.';return;}
    const data=Object.fromEntries(new FormData(form));data.termsAccepted=form.elements.termsAccepted.checked;data.capacity=Number(data.capacity);data.offeredPay=0;
    const button=form.querySelector('#booking-submit');button.disabled=true;status.textContent='Sending booking request…';
    try{const result=await httpsCallable(getFunctions(),'createBookingRequest')({...data,selectedDates:[...selected],profileId});status.textContent=result.data?.message||'Request sent for band review.';form.reset();selected.clear();drawCalendar();}
    catch(error){status.textContent=error?.message||'We could not send that request. Please try again.';}
    finally{button.disabled=false;}
  });
}
