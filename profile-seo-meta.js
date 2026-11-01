/* SEO helper for profile.html: mirrors the already-loaded profile into title/meta/canonical/og tags.
   Read-only: watches the rendered DOM, never fetches or changes load logic. */
(function(){
  var SITE='https://bandtroductions.com/';
  var id=new URLSearchParams(location.search).get('id');
  function meta(attr,key,val){
    if(!val)return;
    var el=document.head.querySelector('meta['+attr+'="'+key+'"]');
    if(!el){el=document.createElement('meta');el.setAttribute(attr,key);document.head.appendChild(el);}
    el.setAttribute('content',val);
  }
  function canon(url){
    var el=document.head.querySelector('link[rel="canonical"]');
    if(!el){el=document.createElement('link');el.rel='canonical';document.head.appendChild(el);}
    el.href=url;
  }
  var done=false;
  function apply(){
    var nameEl=document.getElementById('profile-name');
    var name=nameEl&&nameEl.textContent.trim();
    if(!name)return false;
    var type=((document.getElementById('profile-type')||{}).textContent||'').trim();
    var bio=((document.getElementById('profile-bio')||{}).textContent||'').replace(/\s+/g,' ').trim();
    if(/^No bio has been added yet/i.test(bio))bio='';
    var desc=bio?(bio.length>155?bio.slice(0,152).replace(/\s+\S*$/,'')+'…':bio)
      :name+(type?' ('+type+')':'')+' on BANDtroductions, the free community for independent bands, musicians, venues and local music scenes worldwide.';
    var url=SITE+'profile.html'+(id?'?id='+encodeURIComponent(id):'');
    document.title=name+' | BANDtroductions';
    meta('name','description',desc);
    meta('property','og:title',name+' on BANDtroductions');
    meta('property','og:description',desc);
    meta('property','og:url',url);
    meta('property','og:type','profile');
    meta('name','twitter:title',name+' on BANDtroductions');
    meta('name','twitter:description',desc);
    var img=document.querySelector('#profile-avatar img');
    if(img&&/^https:\/\//.test(img.src)){meta('property','og:image',img.src);meta('name','twitter:image',img.src);}
    canon(url);
    return true;
  }
  function start(){
    var target=document.getElementById('profile-content')||document.body;
    if(apply())done=true;
    var obs=new MutationObserver(function(){if(apply()){done=true;}});
    obs.observe(target,{childList:true,subtree:true,characterData:true});
    setTimeout(function(){obs.disconnect();},20000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
