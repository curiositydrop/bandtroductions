(async function loadBandtroductionsGlobalHeader(){
  const target=document.getElementById('global-header');
  if(!target)return;
  try{
    const response=await fetch('global-header-v2.html?v=1',{cache:'no-cache'});
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
