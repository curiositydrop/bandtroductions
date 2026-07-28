import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { isAdminAccount } from './admin-access.js';

let stopProfileListener=null;
let stopClaimListener=null;
let profilePendingCount=0;
let claimPendingCount=0;

function updateLabel(){
  const link=document.getElementById('admin-dashboard-link');
  if(!link)return;
  const count=profilePendingCount+claimPendingCount;
  link.textContent=count>0?`Admin — ${count} Pending`:'Admin';
  link.setAttribute('aria-label',count>0?`Admin dashboard, ${count} items pending review`:'Admin dashboard');
  link.title=count>0?`${count} item${count===1?'':'s'} waiting for review`:'Admin dashboard';
  link.style.color=count>0?'#ffd166':'#ffcb9e';
}

function install(){
  const bar=document.getElementById('auth-account-bar');
  if(!bar)return false;
  if(document.getElementById('admin-dashboard-link'))return true;
  const link=document.createElement('a');
  link.id='admin-dashboard-link';
  link.href='admin.html';
  link.textContent='Admin';
  link.style.color='#ffcb9e';
  link.style.fontWeight='900';
  const logout=document.getElementById('auth-logout-link');
  bar.insertBefore(link,logout||null);
  return true;
}

function removeAdminLink(){
  document.getElementById('admin-dashboard-link')?.remove();
}

function stopWatching(){
  if(stopProfileListener)stopProfileListener();
  if(stopClaimListener)stopClaimListener();
  stopProfileListener=null;stopClaimListener=null;profilePendingCount=0;claimPendingCount=0;
}

function watchPendingItems(){
  stopWatching();
  stopProfileListener=onSnapshot(query(collection(db,'profiles'),where('approvalStatus','==','pending')),snapshot=>{
    profilePendingCount=snapshot.docs.filter(item=>item.data().published!==true).length;updateLabel();
  },error=>{console.error('Could not load pending profile count:',error);profilePendingCount=0;updateLabel()});
  stopClaimListener=onSnapshot(query(collection(db,'profileClaims'),where('status','==','pending')),snapshot=>{
    claimPendingCount=snapshot.size;updateLabel();
  },error=>{console.error('Could not load pending ownership claim count:',error);claimPendingCount=0;updateLabel()});
}

onAuthStateChanged(auth,user=>{
  stopWatching();
  if(!isAdminAccount(user)){removeAdminLink();return;}
  if(!install()){
    const observer=new MutationObserver(()=>{
      if(install()){observer.disconnect();watchPendingItems();}
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>observer.disconnect(),10000);
    return;
  }
  watchPendingItems();
});