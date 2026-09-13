import { auth } from './firebase-dev.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';

export function initWebsiteBooking({profileId, profile} = {}) {
  const form=document.getElementById('booking-form'), status=document.getElementById('booking-status'), summary=document.getElementById('booking-rate-summary');
  if(!form)return;
  const s=profile?.websiteSettings?.booking||{};
  if(s.enabled===true){
    summary.textContent=s.rateCents!=null?`Typical rate: $${(Number(s.rateCents)/100).toFixed(2)} ${s.rateBasis==='member'?'per member':'per show'}.`: 'Contact the band for booking rates.';
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
    const data=Object.fromEntries(new FormData(form));data.termsAccepted=form.elements.termsAccepted.checked;data.capacity=Number(data.capacity);data.offeredPay=Number(data.offeredPay);
    const button=form.querySelector('#booking-submit');button.disabled=true;status.textContent='Sending booking request…';
    try{const result=await httpsCallable(getFunctions(),'createBookingRequest')({...data,profileId});status.textContent=result.data?.message||'Request sent for band review.';form.reset();}
    catch(error){status.textContent=error?.message||'We could not send that request. Please try again.';}
    finally{button.disabled=false;}
  });
}
