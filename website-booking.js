import { auth } from './firebase-dev.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';

export function initWebsiteBooking({profileId, profile} = {}) {
  const form=document.getElementById('booking-form'), status=document.getElementById('booking-status'), summary=document.getElementById('booking-rate-summary');
  if(!form)return;
  const s=profile?.websiteSettings?.booking||{};
  if(s.enabled===true){
    const policy={deposit:'Payment policy: 50% deposit online after approval.',full:'Payment policy: full payment online after approval.',in_person:'Payment policy: pay in person at the show.'}[s.paymentPolicy]||'Payment policy: pay in person at the show.';
    summary.textContent=(s.rateCents!=null?`Performance rate: $${(Number(s.rateCents)/100).toFixed(2)} ${s.rateBasis==='member'?'per member':'per show'}. `:'')+policy;
    const offered=form.elements.offeredPay;if(offered){offered.closest('label').hidden=true;offered.required=false;offered.value='0';}
  }else{
    summary.textContent='Booking requests are being connected for this website.';
    form.querySelector('#booking-submit').disabled=true;
    status.textContent='This booking form is not live yet.';
    return;
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const user=auth.currentUser;
    if(!user){status.textContent='Please sign in to send a booking request.';return;}
    const data=Object.fromEntries(new FormData(form));data.termsAccepted=form.elements.termsAccepted.checked;data.capacity=Number(data.capacity);data.offeredPay=0;
    const button=form.querySelector('#booking-submit');button.disabled=true;status.textContent='Sending booking request…';
    try{const result=await httpsCallable(getFunctions(),'createBookingRequest')({...data,profileId});status.textContent=result.data?.message||'Request sent for band review.';form.reset();}
    catch(error){status.textContent=error?.message||'We could not send that request. Please try again.';}
    finally{button.disabled=false;}
  });
}
