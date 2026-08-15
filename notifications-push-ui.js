import './pwa-notifications.js?v=3';

const button=document.getElementById('enable-push');
const pushStatus=document.getElementById('push-status');

function labelFor(status){
  switch(status){
    case 'subscribed': return 'Notifications Enabled';
    case 'granted': return 'Notifications Enabled';
    case 'denied': return 'Notifications Blocked in Phone Settings';
    case 'install-required': return 'Install BANDtroductions to enable phone notifications';
    case 'login-required': return 'Log in to enable notifications';
    case 'unsupported': return 'Push notifications are not supported on this device';
    case 'server-not-ready': return 'Notification service is not ready yet';
    case 'error': return 'Could not enable notifications. Try again.';
    default: return 'Get phone banners and app badge alerts for new activity.';
  }
}

async function refresh(){
  if(!button||!pushStatus)return;
  const api=window.BANDtroductionsNotifications;
  if(!api){button.hidden=true;pushStatus.textContent='Notification controls unavailable.';return;}
  const subscription=await api.currentSubscription();
  const permission=api.getPermission();
  const standalone=api.isStandalone();
  if(subscription&&permission==='granted'){
    button.textContent='Notifications Enabled';
    button.disabled=true;
    pushStatus.textContent='Phone notifications are enabled for this installed BANDtroductions app.';
    return;
  }
  button.disabled=false;
  button.hidden=false;
  button.textContent='Enable Phone Notifications';
  pushStatus.textContent=labelFor(!standalone?'install-required':permission);
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
