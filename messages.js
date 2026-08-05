import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { addDoc, collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const list=document.getElementById('conversation-list');
const messagesEl=document.getElementById('messages');
const head=document.getElementById('thread-head');
const composer=document.getElementById('composer');
const input=document.getElementById('message-input');
let currentUser=null,currentConversationId='',unsubscribeMessages=null;
const params=new URLSearchParams(location.search);
const targetUid=params.get('to')||'';

function safe(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function when(stamp){return stamp?.toDate?stamp.toDate().toLocaleString():'';}
async function profile(uid){if(!uid)return null;const [a,b]=await Promise.all([getDoc(doc(db,'profiles',uid)),getDoc(doc(db,'users',uid))]);return a.exists()?a.data():(b.exists()?b.data():null);}
function displayName(data,uid){return data?.displayName||data?.name||data?.bandName||data?.venueName||uid?.slice(0,8)||'Member';}
function conversationId(a,b){return [a,b].sort().join('__');}

async function markRead(id){
  if(!currentUser||!id)return;
  try{await updateDoc(doc(db,'conversations',id),{[`readAt.${currentUser.uid}`]:serverTimestamp()});}
  catch(error){console.warn('Could not mark conversation read.',error);}
}

async function openConversation(id,otherUid){
  currentConversationId=id;
  const other=await profile(otherUid).catch(()=>null);
  head.textContent=displayName(other,otherUid);
  composer.hidden=false;
  markRead(id);
  if(unsubscribeMessages)unsubscribeMessages();
  unsubscribeMessages=onSnapshot(collection(db,'conversations',id,'messages'),snap=>{
    const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
    messagesEl.innerHTML=rows.length?'':'<div class="empty">No messages yet. Say hello.</div>';
    rows.forEach(m=>{const div=document.createElement('div');div.className='bubble'+(m.senderId===currentUser.uid?' mine':'');div.innerHTML=`${safe(m.text||'')}<small>${safe(when(m.createdAt))}</small>`;messagesEl.appendChild(div);});
    messagesEl.scrollTop=messagesEl.scrollHeight;
    markRead(id);
  },error=>{console.warn(error);messagesEl.innerHTML='<div class="empty">Messages could not be loaded.</div>';});
}

async function ensureTargetConversation(uid){
  if(!currentUser||!uid||uid===currentUser.uid)return;
  const id=conversationId(currentUser.uid,uid);
  await setDoc(doc(db,'conversations',id),{participants:[currentUser.uid,uid],updatedAt:serverTimestamp()}, {merge:true});
  await openConversation(id,uid);
}

onAuthStateChanged(auth,async user=>{
  currentUser=user;
  if(!user){list.innerHTML='<a class="conversation" href="login.html"><b>Log in</b><small>Sign in to use direct messages.</small></a>';return;}
  if(targetUid)ensureTargetConversation(targetUid).catch(error=>console.warn('Could not start conversation',error));
  const q=query(collection(db,'conversations'),where('participants','array-contains',user.uid));
  onSnapshot(q,async snap=>{
    const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0));
    list.innerHTML='';
    if(!rows.length){list.innerHTML='<div class="status">No conversations yet. Open a member profile and start a message.</div>';return;}
    for(const row of rows){
      const otherUid=(row.participants||[]).find(id=>id!==user.uid)||'';
      const other=await profile(otherUid).catch(()=>null);
      const a=document.createElement('a');a.href='#';a.className='conversation';a.innerHTML=`<b>${safe(displayName(other,otherUid))}</b><small>${safe(row.lastMessage||'Open conversation')}</small>`;
      a.addEventListener('click',event=>{event.preventDefault();document.querySelectorAll('.conversation').forEach(x=>x.classList.remove('active'));a.classList.add('active');openConversation(row.id,otherUid);});list.appendChild(a);
    }
  },error=>{console.warn(error);list.innerHTML='<div class="status">Inbox could not be loaded. Firestore messaging permissions may still need to be enabled before launch.</div>';});
});

composer.addEventListener('submit',async event=>{
  event.preventDefault();const text=input.value.trim();if(!text||!currentUser||!currentConversationId)return;
  input.value='';
  try{
    await addDoc(collection(db,'conversations',currentConversationId,'messages'),{senderId:currentUser.uid,text,createdAt:serverTimestamp()});
    await setDoc(doc(db,'conversations',currentConversationId),{lastMessage:text,lastSenderId:currentUser.uid,updatedAt:serverTimestamp()}, {merge:true});
    await markRead(currentConversationId);
  }catch(error){console.error(error);alert('Message could not be sent yet. Messaging permissions may still need to be enabled.');input.value=text;}
});