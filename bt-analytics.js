/* BANDtroductions shared Google Analytics loader (G-60112G8RH3).
   - One tag for every page: <script src="bt-analytics.js?v=1"></script>
   - Internal traffic: open any page once with ?bt_internal=1 (this device is then tagged traffic_type=internal);
     ?bt_internal=0 clears it. GA's Internal Traffic data filter excludes it once Mike activates the filter.
   - Debug: ?bt_debug=1, or any Firebase preview channel, sends debug_mode so events show in GA DebugView.
   - window.btTrack(name, params) sends a custom event; safe to call anywhere. */
(function(){
  var ID='G-60112G8RH3';
  if(window.__btAnalytics)return;window.__btAnalytics=true;
  var q;try{q=new URLSearchParams(location.search);}catch(e){q=null;}
  try{
    if(q&&q.get('bt_internal')==='1')localStorage.setItem('bt_internal','1');
    if(q&&q.get('bt_internal')==='0')localStorage.removeItem('bt_internal');
  }catch(e){}
  var internal=false;try{internal=localStorage.getItem('bt_internal')==='1';}catch(e){}
  var preview=/--[a-z0-9-]+\.web\.app$/i.test(location.hostname);
  var debug=preview||(q&&q.get('bt_debug')==='1');
  window.dataLayer=window.dataLayer||[];
  window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
  var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+ID;
  (document.head||document.documentElement).appendChild(s);
  var cfg={};
  if(internal)cfg.traffic_type='internal';
  if(debug)cfg.debug_mode=true;
  window.gtag('js',new Date());
  window.gtag('config',ID,cfg);
  window.btTrack=function(name,params){
    try{var p=Object.assign({},params||{});if(debug)p.debug_mode=true;window.gtag('event',name,p);}catch(e){}
  };
  // Website plan / upgrade link clicks, tracked by one delegated listener (no per-page code).
  document.addEventListener('click',function(ev){
    var a=ev.target&&ev.target.closest?ev.target.closest('a[href]'):null;if(!a)return;
    var href=a.getAttribute('href')||'',label=(a.textContent||'').trim().slice(0,60);
    if(/(^|\/)plans\.html/i.test(href))window.btTrack('plan_link_click',{link_text:label,page:location.pathname});
    else if(/^(\.\/)?website\.html/i.test(href))window.btTrack('my_website_click',{link_text:label,page:location.pathname});
    else if(/buy\.stripe\.com/i.test(href))window.btTrack('begin_checkout',{link_text:label,page:location.pathname});
    else if(/(^|\/)radio-submit\.html/i.test(href))window.btTrack('upload_song_click',{link_text:label,page:location.pathname});
  },true);
})();
