const listingId=new URLSearchParams(location.search).get('listing')||sessionStorage.getItem('newGearListing')||'';
const link=document.getElementById('gear-payment-link'),reference=document.getElementById('gear-payment-reference');
if(listingId){link.href=`https://buy.stripe.com/4gM6oAa8udge4VbbSP6oo0c?client_reference_id=${encodeURIComponent(listingId)}`;reference.textContent=`Listing reference: ${listingId}`;}else reference.textContent='Your listing remains live even if you decide not to purchase the upgrade.';
link?.addEventListener('click',async event=>{
  const href=link.getAttribute('href')||'';
  if(!/buy\.stripe\.com/i.test(href))return;
  event.preventDefault();
  if(window.btRememberCheckout)window.btRememberCheckout('gear-feature');
  if(window.btTrack)await window.btTrack('begin_checkout',{plan:'gear-feature',currency:'USD',value:5,items:[{item_id:'gear-feature',item_name:'Gear Exchange feature',price:5,quantity:1}]},{beacon:true});
  location.href=link.href;
});
