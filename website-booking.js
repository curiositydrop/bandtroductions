import { auth } from './firebase-dev.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';

export function initWebsiteBooking({profileId, profile} = {}) {
  const form=document.getElementById('booking-form'), status=document.getElementById('booking-status'), summary=document.getElementById('booking-rate-summary');
  if(!form)return;
  const s=profile?.websiteSettings?.booking||{};
  const source=document.querySelector('#shows .ws-calendar');const calendar=source?.cloneNode(true)||document.createElement('div');calendar.id='booking-calendar';calendar.setAttribute('aria-label','Select booking dates');const instruction=document.createElement('p');instruction.className='muted';instruction.textContent='Select one or more available dates to book this band.';calendar.prepend(instruction);form.before(calendar);form.hidden=true;const selected=new Set();
  const sync=()=>{if(!source)return;const days=source.querySelector('#ws-days'),copy=calendar.querySelector('#ws-days');if(days&&copy)copy.replaceChildren(...[...days.children].map(x=>x.cloneNode(true)));const month=source.querySelector('#ws-month'),copyMonth=calendar.querySelector('#ws-month');if(month&&copyMonth)copyMonth.textContent=month.textContent;};sync();if(source)new MutationObserver(sync).observe(source,{subtree:true,childList:true});
  calendar.addEventListener('click',event=>{const nav=event.target.closest('[data-month]');if(nav&&source){source.querySelector(`[data-month="${nav.dataset.month}"]`)?.click();return;}const cell=event.target.closest('.ws-day');if(!cell||cell.classList.contains('has-shows'))return;const key=cell.getAttribute('data-date')||cell.dataset.date;if(!key)return;selected.has(key)?selected.delete(key):selected.add(key);cell.classList.toggle('is-selected',selected.has(key));const dates=[...selected].sort();form.elements.startDate.value=dates[0]||'';form.elements.endDate.value=dates.length>1?dates[dates.length-1]:'';form.hidden=!selected.size;});
  renderBookingSummary(s);
  const offered=form.elements.offeredPay;if(offered){offered.closest('label').hidden=true;offered.required=false;offered.value='0';}
  if(s.enabled!==true){form.querySelector('#booking-submit').disabled=true;status.textContent='Booking requests are not live yet.';return;}
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const user=auth.currentUser;
    if(!user){status.textContent='Please sign in to send a booking request.';return;}
    const data=Object.fromEntries(new FormData(form));data.termsAccepted=form.elements.termsAccepted.checked;data.capacity=Number(data.capacity);data.offeredPay=0;
    const button=form.querySelector('#booking-submit');button.disabled=true;status.textContent='Sending booking request…';
    try{const result=await httpsCallable(getFunctions(),'createBookingRequest')({...data,selectedDates:[...selected],profileId});status.textContent=result.data?.message||'Request sent for band review.';form.reset();selected.clear();form.hidden=true;}
    catch(error){status.textContent=error?.message||'We could not send that request. Please try again.';}
    finally{button.disabled=false;}
  });
}

export function renderBookingSummary(s={}) {
  const summary=document.getElementById('booking-rate-summary');
  const policy={deposit:'Payment policy: 50% deposit online after approval.',full:'Payment policy: full payment online after approval.',in_person:'Payment policy: pay in person at the show.'}[s.paymentPolicy]||'Payment policy: pay in person at the show.';
  if(summary)summary.textContent=(s.rateCents>0?`Performance rate: $${(Number(s.rateCents)/100).toFixed(2)} ${s.rateBasis==='member'?'per member':'per show'}. `:'Band performance rate: contact the band for pricing. ')+policy;
}
