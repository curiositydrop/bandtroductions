import './pwa-notifications.js?v=3';
import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

let unsubscribe=null;
const stampMs=stamp=>stamp?.toMillis?stamp.toMillis():(stamp?.seconds?stamp.seconds*1000:0);

onAuthStateChanged(auth,user=>{
  if(unsubscribe){unsubscribe();unsubscribe=null;}
  if(!user){window.BANDtroductionsNotifications?.setBadge(0);return;}
  unsubscribe=onSnapshot(collection(db,'messageInboxes',user.uid,'items'),snap=>{
    let unread=0;
    snap.docs.forEach(docSnap=>{
      const row=docSnap.data()||{};
      const updated=stampMs(row.updatedAt);
      const read=stampMs(row.readAt);
      const sender=row.lastSenderId||'';
      if(updated>read&&sender&&sender!==user.uid)unread+=1;
    });
    window.BANDtroductionsNotifications?.setBadge(unread);
  },error=>console.warn('Message app badge sync unavailable:',error));
});
