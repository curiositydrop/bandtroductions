import './pwa-install.js?v=2';
import { app, auth } from './firebase-dev.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';

const functions=getFunctions(app,'us-central1');
const getPushConfig=httpsCallable(functions,'getPushConfig');
const registerPushSubscription=httpsCallable(functions,'registerPushSubscription');
const removePushSubscription=httpsCallable(functions,'removePushSubscription');

const state={
  unreadCount:0,
  permission:typeof Notification!=='undefined'?Notification.permission:'unsupported',
  subscribed:false
};

function isStandalone(){
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone===true;
}

function supportsPush(){
  return 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification!=='undefined';
}

function base64UrlToUint8Array(value=''){
  const padding='='.repeat((4-value.length%4)%4);
  const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);
  return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)));
}

async function registration(){
  if(!('serviceWorker' in navigator))throw new Error('Service workers are unavailable.');
  return navigator.serviceWorker.ready;
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

async function currentSubscription(){
  if(!supportsPush())return null;
  try{return await (await registration()).pushManager.getSubscription();}
  catch(error){console.warn('BANDtroductions push subscription could not be read:',error);return null;}
}

async function syncSubscription(){
  if(!auth.currentUser)return {status:'login-required'};
  if(!supportsPush())return {status:'unsupported'};
  if(Notification.permission!=='granted')return {status:Notification.permission};
  if(!isStandalone())return {status:'install-required'};

  try{
    const reg=await registration();
    let subscription=await reg.pushManager.getSubscription();
    if(!subscription){
      const configResult=await getPushConfig();
      const publicKey=String(configResult?.data?.publicKey||'').trim();
      if(!publicKey)return {status:'server-not-ready'};
      subscription=await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:base64UrlToUint8Array(publicKey)
      });
    }

    const json=subscription.toJSON();
    await registerPushSubscription({
      subscription:json,
      userAgent:navigator.userAgent,
      standalone:isStandalone()
    });
    state.subscribed=true;
    return {status:'subscribed'};
  }catch(error){
    console.warn('BANDtroductions push registration failed:',error);
    return {status:'error',code:error?.code||'',message:error?.message||''};
  }
}

async function requestPermission(){
  if(!auth.currentUser)return {status:'login-required'};
  if(!supportsPush())return {status:'unsupported'};
  if(!isStandalone())return {status:'install-required'};
  if(Notification.permission==='denied')return {status:'denied'};

  try{
    const result=Notification.permission==='granted'?'granted':await Notification.requestPermission();
    state.permission=result;
    if(result!=='granted')return {status:result};
    return await syncSubscription();
  }catch(error){
    console.warn('BANDtroductions notification permission request failed:',error);
    return {status:'error'};
  }
}

async function disableNotifications(){
  try{
    const subscription=await currentSubscription();
    if(!subscription)return {status:'not-subscribed'};
    const endpoint=subscription.endpoint;
    if(auth.currentUser){
      try{await removePushSubscription({endpoint});}catch(error){console.warn('Push subscription server cleanup failed:',error);}
    }
    await subscription.unsubscribe();
    state.subscribed=false;
    return {status:'disabled'};
  }catch(error){
    console.warn('BANDtroductions notifications could not be disabled:',error);
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

currentSubscription().then(subscription=>{state.subscribed=Boolean(subscription);});

window.BANDtroductionsNotifications={
  setBadge,
  requestPermission,
  syncSubscription,
  disableNotifications,
  currentSubscription,
  isStandalone,
  supportsPush,
  getPermission:()=>state.permission,
  isSubscribed:()=>state.subscribed,
  getUnreadCount:()=>state.unreadCount
};
