import './pwa-install.js?v=2';

const state={
  unreadCount:0,
  permission:typeof Notification!=='undefined'?Notification.permission:'unsupported'
};

function isStandalone(){
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone===true;
}

async function setBadge(count){
  const value=Math.max(0,Number(count)||0);
  state.unreadCount=value;
  try{
    if(!('setAppBadge' in navigator)||!('clearAppBadge' in navigator))return false;
    if(value>0)await navigator.setAppBadge(value);
    else await navigator.clearAppBadge();
    return true;
  }catch(error){
    console.warn('BANDtroductions app badge could not be updated:',error);
    return false;
  }
}

async function requestPermission(){
  if(typeof Notification==='undefined')return {status:'unsupported'};
  if(!isStandalone())return {status:'install-required'};
  if(Notification.permission==='granted')return {status:'granted'};
  if(Notification.permission==='denied')return {status:'denied'};
  try{
    const result=await Notification.requestPermission();
    state.permission=result;
    return {status:result};
  }catch(error){
    console.warn('BANDtroductions notification permission request failed:',error);
    return {status:'error'};
  }
}

window.addEventListener('bt:pwa-unread-count',event=>{
  setBadge(event.detail?.count||0);
});

if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message',event=>{
    if(event.data?.type==='BT_SET_BADGE')setBadge(event.data.count||0);
  });
}

window.BANDtroductionsNotifications={
  setBadge,
  requestPermission,
  isStandalone,
  getPermission:()=>state.permission,
  getUnreadCount:()=>state.unreadCount
};
