import './account-onboarding-repair.js?v=2';
import './pwa-notifications.js?v=1';
import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, getDocs, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { isAdminAccount } from './admin-access.js';

const messagesLink=document.getElementById('messages-link');
const notificationsLink=[...document.querySelectorAll('.left .menu a')].find(a=>new URL(a.href,location.href).pathname.endsWith('/notifications.html'))||null;
let messageUnsub=null;
let notificationUnsubs=[];
let authGeneration=0;
let unreadMessages=0;
let unreadNotifications=0;

function publishUnreadCount(){
  const count=unreadMessages+unreadNotifications;
  window.dispatchEvent(new CustomEvent('bt:pwa-unread-count',{detail:{count}}));
}

function ensureBadge(link){
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

function updateBadge(link,badge,count,label){
  if(!badge)return;
  badge.textContent=String(count);
  badge.style.display=count?'inline-block':'none';
  link.title=count?`${count} unread ${label}${count===1?'':'s'}`:label[0].toUpperCase()+label.slice(1)+'s';
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

function clearListeners(){
  if(messageUnsub){messageUnsub();messageUnsub=null;}
  notificationUnsubs.forEach(unsub=>unsub());
  notificationUnsubs=[];
}

async function notificationRecipientIds(user){
  const recipients=new Set([user.uid]);
  const ownedProfiles=await getDocs(query(collection(db,'profiles'),where('ownerId','==',user.uid)));
  ownedProfiles.docs.forEach(docSnap=>recipients.add(docSnap.id));
  if(isAdminAccount(user)){
    const [adminProfiles,adminPosts]=await Promise.all([
      getDocs(query(collection(db,'profiles'),where('isAdmin','==',true))),
      getDocs(query(collection(db,'posts'),where('authorName','==','BANDtroductions Admin')))
    ]);
    adminProfiles.docs.forEach(docSnap=>recipients.add(docSnap.id));
    adminPosts.docs.forEach(docSnap=>{const authorId=docSnap.data().authorId;if(authorId)recipients.add(authorId);});
  }
  return [...recipients].slice(0,30);
}

onAuthStateChanged(auth,async user=>{
  const generation=++authGeneration;
  syncAdminLink(user);
  clearListeners();
  unreadMessages=0;
  unreadNotifications=0;
  const messageBadge=ensureBadge(messagesLink);
  const notificationBadge=ensureBadge(notificationsLink);
  if(!user){messageBadge?.remove();notificationBadge?.remove();publishUnreadCount();return;}

  messageUnsub=onSnapshot(collection(db,'messageInboxes',user.uid,'items'),snap=>{
    if(generation!==authGeneration)return;
    let unread=0;
    snap.docs.forEach(d=>{
      const row=d.data();
      const updated=stampMs(row.updatedAt);
      const read=stampMs(row.readAt);
      const sender=row.lastSenderId||'';
      if(updated>read&&sender&&sender!==user.uid)unread++;
    });
    unreadMessages=unread;
    updateBadge(messagesLink,messageBadge,unread,'conversation');
    publishUnreadCount();
  },error=>{console.warn('Unread message count unavailable.',error);unreadMessages=0;if(messageBadge)messageBadge.style.display='none';publishUnreadCount();});

  try{
    const recipientIds=await notificationRecipientIds(user);
    if(generation!==authGeneration)return;
    const chunks=[];
    for(let i=0;i<recipientIds.length;i+=10)chunks.push(recipientIds.slice(i,i+10));
    const snapshots=new Array(chunks.length);
    notificationUnsubs=chunks.map((ids,index)=>{
      const notificationsQuery=ids.length===1
        ?query(collection(db,'notifications'),where('recipientId','==',ids[0]))
        :query(collection(db,'notifications'),where('recipientId','in',ids));
      return onSnapshot(notificationsQuery,snap=>{
        if(generation!==authGeneration)return;
        snapshots[index]=snap;
        const merged=new Map();
        snapshots.filter(Boolean).forEach(snapshot=>snapshot.docs.forEach(d=>merged.set(d.id,d.data())));
        unreadNotifications=[...merged.values()].filter(item=>item.read!==true).length;
        updateBadge(notificationsLink,notificationBadge,unreadNotifications,'notification');
        publishUnreadCount();
      },error=>{console.warn('Unread notification count unavailable.',error);if(notificationBadge)notificationBadge.style.display='none';});
    });
  }catch(error){
    console.warn('Unread notification count unavailable.',error);
    if(notificationBadge)notificationBadge.style.display='none';
  }
});

// Load the No-App App help UI independently so it cannot interfere with dashboard counts.
import('./no-app-app-help.js?v=2').catch(error=>console.warn('No-App App help unavailable.',error));
