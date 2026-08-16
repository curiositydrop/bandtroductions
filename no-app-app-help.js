// Isolated homepage helper for BANDtroductions No-App App install instructions.
// If this file fails, the existing homepage, auth, messaging, and profile systems continue unchanged.
(function initNoAppAppHelp(){
  const menu=document.querySelector('.left .menu');
  if(!menu||document.getElementById('no-app-app-help-link'))return;

  const logout=[...menu.querySelectorAll('a')].find(a=>a.textContent.trim().toLowerCase()==='log out');
  if(!logout)return;

  const link=document.createElement('a');
  link.id='no-app-app-help-link';
  link.href='#';
  link.textContent='Get Our No-App App';
  link.style.color='#25c7c1';
  link.style.fontWeight='900';
  menu.insertBefore(link,logout);

  const overlay=document.createElement('div');
  overlay.id='no-app-app-help-overlay';
  overlay.innerHTML=`
    <div role="dialog" aria-modal="true" aria-labelledby="no-app-app-help-title" style="width:min(92vw,520px);background:#111313;border:1px solid #25c7c1;border-radius:16px;padding:22px;color:#eee;box-shadow:0 20px 60px rgba(0,0,0,.7)">
      <h2 id="no-app-app-help-title" style="margin:0 0 10px;color:#25c7c1">GET OUR NO-APP APP</h2>
      <p style="margin:0 0 14px;color:#ccc;line-height:1.5">Put BANDtroductions on your Home Screen so it opens like an app.</p>
      <label for="no-app-app-phone-type" style="display:block;margin:0 0 6px;color:#25c7c1;font-weight:900">What kind of phone do you have?</label>
      <select id="no-app-app-phone-type" style="width:100%;margin:0 0 14px;border:1px solid #25c7c1;background:#0b0d0d;color:#eee;padding:10px 12px;font:inherit;font-weight:800">
        <option value="">Select your phone</option>
        <option value="iphone">iPhone</option>
        <option value="android">Android / Droid</option>
      </select>
      <div id="no-app-app-install-instructions" style="margin:0 0 16px;color:#ccc;line-height:1.5">Select your phone above to see the correct install instructions.</div>
      <p style="margin:0 0 8px;color:#25c7c1;font-weight:900">Want push notifications? We got you.</p>
      <ol start="6" style="margin:0 0 18px;padding-left:22px;line-height:1.7;color:#eee">
        <li>Open the BANDtroductions Home Screen app.</li>
        <li>Go to <strong>Notifications</strong>.</li>
        <li>Tap <strong>Enable Phone Notifications</strong> and allow notifications when your phone asks.</li>
      </ol>
      <button type="button" id="no-app-app-help-close" style="width:100%;border:1px solid #25c7c1;background:#25c7c1;color:#06100f;padding:11px 14px;font:inherit;font-weight:900;cursor:pointer">GOT IT</button>
    </div>`;
  overlay.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.78);display:none;place-items:center;padding:16px';
  document.body.appendChild(overlay);

  const phoneType=overlay.querySelector('#no-app-app-phone-type');
  const installInstructions=overlay.querySelector('#no-app-app-install-instructions');
  const instructionSets={
    iphone:`<ol style="margin:0;padding-left:22px;line-height:1.7;color:#eee"><li>Open BANDtroductions in <strong>Safari</strong>.</li><li>Tap the <strong>Share</strong> button.</li><li>Choose <strong>Add to Home Screen</strong>.</li><li>Tap <strong>Add</strong>.</li><li>Close Safari and open the new BANDtroductions icon.</li></ol>`,
    android:`<ol style="margin:0;padding-left:22px;line-height:1.7;color:#eee"><li>Open BANDtroductions in <strong>Chrome</strong>.</li><li>Tap the <strong>three-dot menu (⋮)</strong>.</li><li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li><li>Tap <strong>Install</strong> or <strong>Add</strong>.</li><li>Close Chrome and open the new BANDtroductions icon.</li></ol>`
  };
  phoneType?.addEventListener('change',()=>{installInstructions.innerHTML=instructionSets[phoneType.value]||'Select your phone above to see the correct install instructions.';});

  const open=event=>{
    event.preventDefault();
    if(typeof window.gtag==='function')window.gtag('event','no_app_app_help_open',{event_category:'No-App App'});
    overlay.style.display='grid';
    document.getElementById('no-app-app-help-close')?.focus();
  };
  const close=()=>{overlay.style.display='none';link.focus();};
  link.addEventListener('click',open);
  overlay.querySelector('#no-app-app-help-close')?.addEventListener('click',close);
  overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&overlay.style.display!=='none')close();});
})();
