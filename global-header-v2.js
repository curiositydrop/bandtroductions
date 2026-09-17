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

  // Website + Merch uses the BANDtroductions artist site as the canonical website.
  // When the shared merch manager is opened for a specific artist, keep that URL visible
  // but locked so it cannot be replaced with an unrelated external page.
  if((location.pathname.split('/').pop()||'').toLowerCase()==='merch.html'){
    const params=new URLSearchParams(location.search);
    const profileId=params.get('band')||'';
    if(profileId){
      const canonical=new URL('website.html',location.href);
      canonical.searchParams.set('id',profileId);
      const canonicalUrl=canonical.href;
      const lockWebsiteField=()=>{
        const input=document.getElementById('store-website');
        if(!input)return false;
        input.value=canonicalUrl;
        input.readOnly=true;
        input.setAttribute('aria-readonly','true');
        input.title='This Website + Merch plan uses your BANDtroductions artist website automatically.';
        input.style.cursor='not-allowed';
        input.style.opacity='.78';
        const label=input.closest('label');
        if(label){
          const textNode=[...label.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim());
          if(textNode)textNode.textContent='BANDtroductions website (automatic)';
        }
        const form=document.getElementById('store-form');
        if(form&&!form.dataset.websiteLockReady){
          form.dataset.websiteLockReady='true';
          form.addEventListener('submit',()=>{input.value=canonicalUrl;},{capture:true});
        }
        return true;
      };
      lockWebsiteField();
      let checks=0;
      const timer=setInterval(()=>{
        lockWebsiteField();
        if(++checks>=24)clearInterval(timer);
      },250);
      window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
    }
  }
})();
