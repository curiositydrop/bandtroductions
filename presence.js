import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { doc, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

let timer=null;
let currentUser=null;

async function touchPresence(){
  if(!currentUser||document.visibilityState==='hidden') return;
  try{
    await setDoc(doc(db,'users',currentUser.uid),{
      lastActiveAt:serverTimestamp(),
      isOnline:true
    },{merge:true});
  }catch(error){
    console.warn('Presence update skipped.',error);
  }
}

function startHeartbeat(user){
  currentUser=user;
  if(timer) clearInterval(timer);
  touchPresence();
  timer=setInterval(touchPresence,60000);
}

onAuthStateChanged(auth,user=>{
  if(!user){currentUser=null;if(timer){clearInterval(timer);timer=null;}return;}
  startHeartbeat(user);
});

document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible') touchPresence();
});
