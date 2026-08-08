import './account-onboarding-repair.js?v=1';
import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const link=document.getElementById('messages-link');
let unsub=null;

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

function stampMs(stamp){return stamp?.toMillis?stamp.toMillis():(stamp?.seconds?stamp.seconds*1000:0);}

onAuthStateChanged(auth,user=>{
  if(unsub){unsub();unsub=null;}
  const badge=ensureBadge();
  if(!user){if(badge)badge.remove();return;}
  unsub=onSnapshot(collection(db,'messageInboxes',user.uid,'items'),snap=>{
    let unread=0;
    snap.docs.forEach(d=>{
      const row=d.data();
      const updated=stampMs(row.updatedAt);
      const read=stampMs(row.readAt);
      const sender=row.lastSenderId||'';
      if(updated>read&&sender&&sender!==user.uid)unread++;
    });
    if(!badge)return;
    badge.textContent=String(unread);
    badge.style.display=unread?'inline-block':'none';
    link.title=unread?`${unread} unread conversation${unread===1?'':'s'}`:'Messages';
  },error=>{console.warn('Unread message count unavailable.',error);if(badge)badge.style.display='none';});
});
