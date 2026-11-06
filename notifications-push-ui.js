import './pwa-notifications.js?v=3';

const button=document.getElementById('enable-push');
const pushStatus=document.getElementById('push-status');

function isIos(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function labelFor(status){
  switch(status){
    case 'subscribed': return 'Phone banners are enabled for this installed app. In-site notices on this page work either way.';
    case 'granted': return 'Phone banners are enabled for this installed app. In-site notices on this page work either way.';
    case 'denied': return 'Phone banners are blocked in system settings. In-site notices on this page still work.';
    case 'install-required': return isIos()
      ? 'On iPhone, add BANDtroductions to the Home Screen and open it from that icon before phone banners can be turned on. In-site notices on this page still work.'
      : 'Install BANDtroductions before phone banners can be turned on. In-site notices on this page still work.';
    case 'login-required': return 'Log in to enable notifications.';
    case 'unsupported': return 'This browser cannot show phone banners. In-site notices on this page still work.';
    case 'server-not-ready': return 'Phone banners are not available yet because the push service is not ready. In-site notices on this page still work.';
    case 'error': return 'Phone banners could not be enabled. In-site notices on this page still work.';
    default: return 'Phone banners are off until you allow them. In-site notices on this page still work.';
  }
}

async function refresh(){
  if(!button||!pushStatus)return;
  const api=window.BANDtroductionsNotifications;
  if(!api){button.hidden=true;pushStatus.textContent='Notification controls unavailable.';return;}
  const subscription=await api.currentSubscription();
  const permission=api.getPermission();
  const standalone=api.isStandalone();
  if(subscription&&permission==='granted'&&standalone){
    button.textContent='Phone banners on';
    button.disabled=true;
    pushStatus.textContent=labelFor('subscribed');
    return;
  }
  button.hidden=false;
  if(!standalone){
    button.textContent=isIos()?'Add to Home Screen first':'Install the site first';
    button.disabled=true;
    pushStatus.textContent=labelFor('install-required');
    return;
  }
  if(permission==='denied'){
    button.textContent='Phone banners blocked';
    button.disabled=true;
    pushStatus.textContent=labelFor('denied');
    return;
  }
  button.disabled=false;
  button.textContent='Enable Phone Notifications';
  pushStatus.textContent=labelFor(permission);
}

button?.addEventListener('click',async()=>{
  const api=window.BANDtroductionsNotifications;
  if(!api)return;
  button.disabled=true;
  button.textContent='Enabling…';
  pushStatus.textContent='Connecting this device to BANDtroductions notifications…';
  const result=await api.requestPermission();
  pushStatus.textContent=labelFor(result?.status);
  if(result?.status==='subscribed'||result?.status==='granted'){
    if(typeof window.gtag==='function')window.gtag('event','push_notifications_enabled',{event_category:'No-App App'});
    button.textContent='Notifications Enabled';
    button.disabled=true;
  }else{
    button.textContent='Enable Phone Notifications';
    button.disabled=false;
  }
});

refresh();
