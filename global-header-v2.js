(async function loadBandtroductionsGlobalHeader(){
  const target=document.getElementById('global-header');
  if(!target)return;

  // Reserve the final header footprint before injection so the dashboard is not shoved down.
  if(window.matchMedia('(max-width:650px)').matches) target.style.minHeight='124px';
  else if(window.matchMedia('(max-width:1000px)').matches) target.style.minHeight='170px';
  else target.style.minHeight='150px';

  // Older index markup may still carry the previous boot class; release it immediately.
  document.documentElement.classList.remove('bt-home-booting');

  try{
    const response=await fetch('global-header-v2.html?v=2');
    if(!response.ok)throw new Error(`Header request failed: ${response.status}`);
    target.innerHTML=await response.text();
    const current=(location.pathname.split('/').pop()||'index.html').toLowerCase();
    const aliases={
      '':'index.html',
      'submit-audition.html':'auditions.html',
      'gear-detail.html':'gear-exchange.html',
      'submit-gear.html':'gear-exchange.html',
      'radio-submit.html':'radio.html'
    };
    const active=aliases[current]||current;
    target.querySelectorAll('.bt-nav a').forEach(link=>{
      const page=(link.dataset.page||'').toLowerCase();
      const isActive=page===active;
      link.classList.toggle('bt-active',isActive);
      if(isActive)link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    });
  }catch(error){
    console.error('Could not load BANDtroductions global header.',error);
  }
})();
