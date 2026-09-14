import { app } from './firebase-dev.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';
export function initWebsiteBooking({profileId, profile} = {}) {
  const form=document.getElementById('booking-form'), status=document.getElementById('booking-status');
  if(!form)return;
  const s=profile?.websiteSettings?.booking||{};
  const source=document.querySelector('#shows .ws-calendar');
  const calendar=source?.cloneNode(true)||document.createElement('div');
  calendar.id='booking-calendar';calendar.setAttribute('aria-label','Select booking dates');
  const instruction=document.createElement('p');instruction.className='muted';instruction.textContent='Select one or more available dates to book this band.';
  calendar.prepend(instruction);form.before(calendar);form.hidden=true;const selected=new Set();
  const sync=()=>{if(!source)return;const days=source.querySelector('#ws-days'),copy=calendar.querySelector('#ws-days');if(days&&copy)copy.replaceChildren(...[...days.children].map(x=>x.cloneNode(true)));const month=source.querySelector('#ws-month'),copyMonth=calendar.querySelector('#ws-month');if(month&&copyMonth)copyMonth.textContent=month.textContent;};
  sync();if(source)new MutationObserver(sync).observe(source,{subtree:true,childList:true});
  calendar.addEventListener('click',event=>{const nav=event.target.closest('[data-month]');if(nav&&source){source.querySelector(`[data-month="${nav.dataset.month}"]`)?.click();return;}const cell=event.target.closest('.ws-day');if(!cell||cell.classList.contains('has-shows'))return;const key=cell.getAttribute('data-date')||cell.dataset.date;if(!key)return;selected.has(key)?selected.delete(key):selected.add(key);cell.classList.toggle('is-selected',selected.has(key));const dates=[...selected].sort();form.elements.startDate.value=dates[0]||'';form.elements.endDate.value=dates.length>1?dates[dates.length-1]:'';form.hidden=!selected.size;});
  const offered=form.elements.offeredPay;if(offered){offered.closest('label').hidden=true;offered.required=false;offered.value='0';}
  const recipient=String(profile?.websiteSettings?.booking?.email||profile?.bookingEmail||profile?.email||'').trim();
  if(!recipient){form.querySelector('#booking-submit').disabled=true;status.textContent='Booking email is not available yet.';return;}
  let attemptId=null,busy=false;
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy || !form.reportValidity())return;
    const data=Object.fromEntries(new FormData(form));
    data.capacity=Number(data.capacity)||0;data.termsAccepted=form.elements.termsAccepted.checked;
    const dates=[...selected].sort();
    data.selectedDates=dates; data.profileId=profileId;
    if(!attemptId)attemptId=crypto.randomUUID();data.requestId=attemptId;
    const subject=`Booking request for ${data.venue||'your venue'} — ${data.startDate||'date to be discussed'}`;
    const body=[
      'BANDtroductions booking request',
      '',
      `Venue: ${data.venue||''}`,`Contact name: ${data.contactName||''}`,`Email: ${data.email||''}`,`Phone: ${data.phone||''}`,
      `Requested date(s): ${dates.join(', ')||data.startDate||''}`,`Show time: ${data.time||''}`,`Load-in time: ${data.loadIn||''}`,
      `Location: ${data.location||''}`,`Age policy: ${data.age||''}`,`Expected attendance: ${data.capacity||''}`,
      '',`Event details: ${data.details||''}`,'','This request was sent from the BANDtroductions band website.'
    ].join('\n');
    
    busy=true;const submit=form.querySelector('#booking-submit');submit.disabled=true;
    status.textContent='Saving your booking request…';
    try {
      const response=await httpsCallable(getFunctions(app,'us-central1'),'createBookingRequest')(data);
      const link=document.createElement('a');link.className='button';
      link.textContent='Open email to notify the band';
      link.href='mailto:'+encodeURIComponent(response.data.recipient)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
      status.textContent='Request saved for the band to review. Open your email below and press Send to notify them.';
      status.append(document.createElement('br'),link);
      submit.textContent='Request saved';
      // A separate tap reliably opens Mail on phones after the asynchronous save.
    } catch(error) {
      status.textContent=error.message||'Could not save the request. Your details are still here; try again.';
      submit.disabled=false;busy=false;
    }

  });
}
export function renderBookingSummary(s={}) {
  const summary=document.getElementById('booking-rate-summary');
  const policy={deposit:'Payment policy: 50% deposit online after approval.',full:'Payment policy: full payment online after approval.',in_person:'Payment policy: pay in person at the show.'}[s.paymentPolicy]||'Payment policy: pay in person at the show.';
  if(summary)summary.textContent=(s.rateCents>0?`Performance rate: $${(Number(s.rateCents)/100).toFixed(2)} ${s.rateBasis==='member'?'per member':'per show'}. `:'Band performance rate: contact the band for pricing. ')+policy;
}

export function mountBookingReview({container,profileId}) {
  const panel=document.createElement('section');
  const heading=document.createElement('h2');heading.textContent='Booking requests';
  const status=document.createElement('p');status.setAttribute('role','status');
  const refresh=document.createElement('button');refresh.type='button';refresh.className='button secondary';refresh.textContent='Refresh requests';
  const list=document.createElement('div');
  panel.append(heading,refresh,status,list);container.append(panel);
  const api=getFunctions(app,'us-central1');let disposed=false,busy=false;
  const element=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
  async function reload() {
    if(busy||disposed)return;busy=true;refresh.disabled=true;status.textContent='Loading requests…';
    try {
      const response=await httpsCallable(api,'listWebsiteBookingRequests')({profileId});
      if(disposed)return;
      list.replaceChildren();
      for(const row of response.data.requests||[]) {
        const e=row.event||{},card=document.createElement('article');
        card.style.cssText='border-top:1px solid #687568;padding:20px 0;overflow-wrap:anywhere';
        card.append(element('h3',e.venue+' — '+row.status));
        const details=element('p',[
          'Dates: '+(e.dates||[]).join(', '),'Show: '+(e.time||'')+' · Load-in: '+(e.loadIn||''),
          'Location: '+(e.location||''),'Age policy: '+(e.age||''),
          'Expected attendance: '+(e.capacity||''),'Contact: '+(e.contactName||''),
          'Email: '+(row.requesterEmail||''),'Phone: '+(e.phone||''),'Notes: '+(e.details||'None')
        ].join('\n'));details.style.whiteSpace='pre-wrap';card.append(details);
        if(['pending','changes_requested'].includes(row.status)) {
          for(const [action,label] of [['accept','Approve and publish shows'],['decline','Deny request']]) {
            const button=element('button',label);button.type='button';button.className='button';button.style.margin='4px';
            button.onclick=async()=>{
              if(busy||disposed)return;
              if(!confirm(action==='accept'?'Approve these dates and publish them to the show calendars?':'Deny this booking request?'))return;
              busy=true;refresh.disabled=true;list.querySelectorAll('button').forEach(b=>b.disabled=true);
              status.textContent='Saving decision…';
              try {
                await httpsCallable(api,'respondToBookingRequest')({requestId:row.id,action});
                busy=false;await reload();
                if(!disposed)status.textContent=action==='accept'?'Approved. Shows published to the shared calendar.':'Request denied. No shows published.';
              }catch(error){if(!disposed)status.textContent=error.message||'Decision could not be saved. Refresh to check its status.';}
              finally{busy=false;if(!disposed){refresh.disabled=false;list.querySelectorAll('button').forEach(b=>b.disabled=false);}}
            };card.append(button);
          }
        }
        list.append(card);
      }
      status.textContent=list.children.length?'Requests loaded.':'No booking requests yet.';
    } catch(error){if(!disposed)status.textContent=error.message||'Booking review is unavailable. Try refreshing.';}
    finally{busy=false;if(!disposed)refresh.disabled=false;}
  }
  refresh.onclick=reload;void reload();
  return ()=>{disposed=true;panel.remove();};
}
