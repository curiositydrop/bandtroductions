/* BANDtroductions shared Google Analytics loader (G-60112G8RH3).
   - One tag for every page: <script src="bt-analytics.js?v=4"></script>
   - Internal testing: open one page in this tab with ?bt_internal=1. The flag stays in
     sessionStorage for this tab only, including the return from checkout. ?bt_internal=0 clears it.
     A permanent localStorage flag is removed so a later normal visit is not labeled internal.
   - Debug: ?bt_debug=1 stays for this tab the same way. A Firebase preview hostname is always debug.
   - window.btTrack(name, params) returns a promise. Checkout uses btTrackCheckout,
     which does not set transport_type. It asks gtag to send begin_checkout, flushes
     the tag batch, then resolves on event_callback or within 800ms.
   - window.btRememberCheckout(plan) marks this tab as having started checkout.
   - window.btTrackPurchase(transactionId, params) sends purchase once per transaction id. */
(function(){
  var ID='G-60112G8RH3';
  if(window.__btAnalytics)return;window.__btAnalytics=true;
  var q;try{q=new URLSearchParams(location.search);}catch(e){q=null;}
  try{localStorage.removeItem('bt_internal');}catch(e){}
  function sessionFlag(name){
    try{
      if(q&&q.get(name)==='1')sessionStorage.setItem(name,'1');
      if(q&&q.get(name)==='0')sessionStorage.removeItem(name);
      return sessionStorage.getItem(name)==='1';
    }catch(e){return false;}
  }
  var internal=sessionFlag('bt_internal');
  var preview=/--[a-z0-9-]+\.web\.app$/i.test(location.hostname);
  var debug=preview||sessionFlag('bt_debug');
  window.dataLayer=window.dataLayer||[];
  window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
  var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+ID;
  (document.head||document.documentElement).appendChild(s);
  var cfg={};
  if(internal)cfg.traffic_type='internal';
  if(debug)cfg.debug_mode=true;
  window.gtag('js',new Date());
  window.gtag('config',ID,cfg);
  window.btTrack=function(name,params,options){
    return new Promise(function(resolve){
      var done=false;
      var useBeacon=!!(options&&options.beacon);
      function finish(){if(done)return;done=true;resolve();}
      var timer=setTimeout(finish,useBeacon?800:1000);
      try{
        var p=Object.assign({},params||{});
        if(debug)p.debug_mode=true;
        // Beacon is only for a hit sent immediately before same-tab navigation.
        // radio_listen stays on the normal transport so it is not held until the tab closes.
        // traffic_type=internal is a config label only; it does not drop the event.
        if(useBeacon){
          p.transport_type='beacon';
          p.event_timeout=800;
        }
        p.event_callback=function(){clearTimeout(timer);finish();};
        window.gtag('event',name,p);
      }catch(e){clearTimeout(timer);finish();}
    });
  };
  function flushTagBatch(){
    try{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));}catch(e){}
  }
  window.btTrackCheckout=function(params){
    return new Promise(function(resolve){
      var settled=false;
      function finish(){if(settled)return;settled=true;resolve();}
      var cap=setTimeout(function(){flushTagBatch();finish();},800);
      var sent=false;
      function send(){
        if(sent)return;sent=true;
        try{
          var p=Object.assign({send_to:ID},params||{});
          delete p.transport_type;
          if(debug)p.debug_mode=true;
          p.event_timeout=800;
          p.event_callback=function(){
            clearTimeout(cap);
            setTimeout(function(){
              flushTagBatch();
              setTimeout(finish,100);
            },0);
          };
          window.gtag('event','begin_checkout',p);
        }catch(e){clearTimeout(cap);finish();}
      }
      var waited=0;
      (function ready(){
        if(window.google_tag_manager&&window.google_tag_manager[ID]){send();return;}
        if(waited>=400){send();return;}
        waited+=50;
        setTimeout(ready,50);
      })();
    });
  };
  window.btRememberCheckout=function(plan){
    var nonce=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():('checkout-'+Date.now());
    try{sessionStorage.setItem('bt_checkout_pending',JSON.stringify({plan:String(plan||''),nonce:nonce,at:Date.now()}));}catch(e){}
    return nonce;
  };
  window.btTrackPurchase=function(transactionId,params){
    var id=String(transactionId||'').trim();
    if(!/^[A-Za-z0-9_-]{8,200}$/.test(id))return Promise.resolve(false);
    var key='bt_purchase_'+id;
    try{
      if(localStorage.getItem(key)==='1'||sessionStorage.getItem(key)==='1')return Promise.resolve(false);
      sessionStorage.setItem(key,'1');
    }catch(e){}
    var body=Object.assign({transaction_id:id,currency:'USD'},params||{});
    return window.btTrack('purchase',body).then(function(){
      try{localStorage.setItem(key,'1');}catch(e){}
      return true;
    });
  };
  document.addEventListener('click',function(ev){
    var a=ev.target&&ev.target.closest?ev.target.closest('a[href]'):null;if(!a)return;
    var href=a.getAttribute('href')||'',label=(a.textContent||'').trim().slice(0,60);
    var beacon={beacon:true};
    if(a.getAttribute('data-bt-event')==='upgrade_intent'){
      window.btTrack('upgrade_intent',{link_text:label,page:location.pathname},beacon);
      return;
    }
    if(/(^|\/)plans\.html/i.test(href))window.btTrack('plan_link_click',{link_text:label,page:location.pathname},beacon);
    else if(/^(\.\/)?website\.html/i.test(href))window.btTrack('my_website_click',{link_text:label,page:location.pathname},beacon);
    else if(/(^|\/)radio-submit\.html/i.test(href))window.btTrack('upload_song_click',{link_text:label,page:location.pathname},beacon);
  },true);
})();
