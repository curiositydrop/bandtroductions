import './account-onboarding-repair.js?v=2';
import './pwa-notifications.js?v=1';
import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { isAdminAccount } from './admin-access.js';

// Keep the homepage visually stable while its independent Firebase-driven panels resolve.
(function stabilizeHomepagePaint(){
  const style=document.createElement('style');
  style.id='bt-home-stability';
  style.textContent=`
    .news-scroller-card{height:62px!important}
    .header-logo{width:auto!important;height:135%!important}
    html.bt-home-booting .grid{visibility:hidden!important}
    @media(max-width:1000px){.news-scroller-card{height:46px!important}}
    @media(max-width:650px){.news-scroller-card{height:36px!important}.header-logo{height:145%!important}}
  `;
  document.head.appendChild(style);
  document.documentElement.classList.add('bt-home-booting');

  let released=false;
  const release=()=>{
    if(released)return;
    released=true;
    document.documentElement.classList.remove('bt-home-booting');
    observer.disconnect();
  };
  const ready=()=>{
    const feed=document.querySelector('.feed');
    const online=document.querySelector('.left .online');
    if(!feed||!online)return false;
    const feedText=(feed.textContent||'').toLowerCase();
    const feedResolved=!feedText.includes('loading community');
    const onlineResolved=online.querySelector('.online-card,.online-empty')!==null;
    if(feedResolved&&onlineResolved){release();return true;}
    return false;
  };
  const observer=new MutationObserver(ready);
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  document.addEventListener('DOMContentLoaded',ready,{once:true});
  setTimeout(release,2500);
})();

const link=document.getElementById('messages-link');
let unsub=null;

function publishUnreadCount(count){
  window.dispatchEvent(new CustomEvent('bt:pwa-unread-count',{detail:{count:Math.max(0,Number(count)||0)}}));
}

function ensureBadge(){
  if(!link)return null;
  let badge=link.querySelector('.menu-count');
  if(!badge){
    badge=document.createElement('span');
    badge.className='menu-count';
    badge.style.cssText='float:right;min-width:18px;padding:1px 4px;border:1px solid #25c7c1;color:#25c7c1;text-align:center;font-size:.85em;font-weight:900;line-height:1.2';
    link.appendChild(badge);
  }
  return badge;
}

function syncAdminLink(user){
  const menu=document.querySelector('.left .menu');
  if(!menu)return;
  let adminLink=document.getElementById('dashboard-admin-link');
  if(!isAdminAccount(user)){
    adminLink?.remove();
    return;
  }
  if(adminLink)return;
  adminLink=document.createElement('a');
  adminLink.id='dashboard-admin-link';
  adminLink.href='admin.html';
  adminLink.textContent='Admin / Control Room';
  adminLink.style.color='#25c7c1';
  adminLink.style.fontWeight='900';
  const logout=[...menu.querySelectorAll('a')].find(a=>a.textContent.trim().toLowerCase()==='log out');
  menu.insertBefore(adminLink,logout||null);
}

function stampMs(stamp){return stamp?.toMillis?stamp.toMillis():(stamp?.seconds?stamp.seconds*1000:0);}

onAuthStateChanged(auth,user=>{
  syncAdminLink(user);
  if(unsub){unsub();unsub=null;}
  const badge=ensureBadge();
  if(!user){if(badge)badge.remove();publishUnreadCount(0);return;}
  unsub=onSnapshot(collection(db,'messageInboxes',user.uid,'items'),snap=>{
    let unread=0;
    snap.docs.forEach(d=>{
      const row=d.data();
      const updated=stampMs(row.updatedAt);
      const read=stampMs(row.readAt);
      const sender=row.lastSenderId||'';
      if(updated>read&&sender&&sender!==user.uid)unread++;
    });
    publishUnreadCount(unread);
    if(!badge)return;
    badge.textContent=String(unread);
    badge.style.display=unread?'inline-block':'none';
    link.title=unread?`${unread} unread conversation${unread===1?'':'s'}`:'Messages';
  },error=>{console.warn('Unread message count unavailable.',error);if(badge)badge.style.display='none';});
});

// Load the No-App App help UI independently so it cannot interfere with message counts.
import('./no-app-app-help.js?v=2').catch(error=>console.warn('No-App App help unavailable.',error));
