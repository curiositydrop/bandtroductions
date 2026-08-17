const listingId=new URLSearchParams(location.search).get('listing')||sessionStorage.getItem('newGearListing')||'';
const link=document.getElementById('gear-payment-link'),reference=document.getElementById('gear-payment-reference');
if(listingId){link.href=`https://buy.stripe.com/4gM6oAa8udge4VbbSP6oo0c?client_reference_id=${encodeURIComponent(listingId)}`;reference.textContent=`Listing reference: ${listingId}`;}else reference.textContent='Your listing remains live even if you decide not to purchase the upgrade.';
