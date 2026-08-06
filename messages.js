import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { addDoc, collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const list=document.getElementById('conversation-list');
const messagesEl=document.getElementById('messages');
const head=document.getElementById('thread-head');
const composer=document.getElementById('composer');
const input=document.getElementById('message-input');
const searchInput=document.getElementById('profile-search');
const searchResults=document.getElementById('search-results');
let currentUser=null,currentConversationId='',currentOtherUid='',currentOtherProfile=null,unsubscribeMessages=null,unsubscribeProfiles=null,unsubscribeInbox=null;
let profileDirectory=[];
const params=new URLSearchParams(location.search);
const targetProfileId=params.get('to')||'';

function safe(v=''){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function when(stamp){return stamp?.toDate?stamp.toDate().toLocaleString():'';}
function initials(name=''){return name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'BT';}
function displayName(data,uid){return data?.displayName||data?.name||data?.bandName||data?.venueName||uid?.slice(0,8)||'Member';}
function profileType(data){return data?.profileType||data?.accountType||data?.type||data?.role||'Member';}
function profileImage(data){return data?.avatarUrl||data?.photoURL||data?.imageUrl||data?.profileImageUrl||data?.profileImage||data?.avatar||'';}
function targetUserId(profileDoc){return profileDoc?.ownerId||profileDoc?.userId||profileDoc?.uid||profileDoc?.id||'';}
function conversationId(a,b){return [a,b].sort().join('__');}
function inboxDoc(uid,id){return doc(db,'messageInboxes',uid,'items',id);}
function ownProfile(){return profileDirectory.find(p=>targetUserId(p)===currentUser?.uid)||null;}

async function profile(uid){
  if(!uid)return null;
  const direct=profileDirectory.find(p=>p.id===uid||targetUserId(p)===uid);
  if(direct)return direct;
  try{
    const snap=await getDoc(doc(db,'profiles',uid));
    return snap.exists()?{id:snap.id,...snap.data()}:null;
  }catch{return null;}
}

async function writeInboxPair(id,otherUid,preferredProfile=null,extras={}){
  if(!currentUser||!id||!otherUid)return;
  const me=ownProfile();
  const participants=[currentUser.uid,otherUid];
  const otherName=preferredProfile?displayName(preferredProfile,otherUid):'';
  const myName=me?displayName(me,currentUser.uid):(currentUser.displayName||'BANDtroductions Member');
  const now=serverTimestamp();
  const shared={conversationId:id,participants,updatedAt:extras.updatedAt||now};
  await Promise.all([
    setDoc(inboxDoc(currentUser.uid,id),{
      ...shared,
      ownerId:currentUser.uid,
      otherUid,
      profileId:preferredProfile?.id||otherUid,
      profileName:otherName||displayName(preferredProfile,otherUid),
      ...(extras.lastMessage!==undefined?{lastMessage:extras.lastMessage,lastSenderId:extras.lastSenderId||''}:{}),
      ...(extras.markCurrentRead?{readAt:now}:{})
    },{merge:true}),
    setDoc(inboxDoc(otherUid,id),{
      ...shared,
      ownerId:otherUid,
      otherUid:currentUser.uid,
      profileId:me?.id||currentUser.uid,
      profileName:myName,
      ...(extras.lastMessage!==undefined?{lastMessage:extras.lastMessage,lastSenderId:extras.lastSenderId||''}:{})
    },{merge:true})
  ]);
}

async function markRead(id){
  if(!currentUser||!id)return;
  const now=serverTimestamp();
  try{await updateDoc(doc(db,'conversations',id),{[`readAt.${currentUser.uid}`]:now});}
  catch(error){console.warn('Could not mark conversation read on conversation record.',error);}
  try{await setDoc(inboxDoc(currentUser.uid,id),{ownerId:currentUser.uid,conversationId:id,readAt:serverTimestamp()},{merge:true});}
  catch(error){console.warn('Could not mark inbox item read.',error);}
}

async function openConversation(id,otherUid,preferredProfile=null){
  currentConversationId=id;
  currentOtherUid=otherUid;
  currentOtherProfile=preferredProfile||await profile(otherUid).catch(()=>null);
  head.textContent=displayName(currentOtherProfile,otherUid);
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

async function ensureTargetConversation(target,preferredProfile=null){
  if(!currentUser||!target||target===currentUser.uid)return;
  const id=conversationId(currentUser.uid,target);
  const profileId=preferredProfile?.id||'';
  const profileName=preferredProfile?displayName(preferredProfile,target):'';
  await setDoc(doc(db,'conversations',id),{
    participants:[currentUser.uid,target],
    participantProfiles:{[currentUser.uid]:ownProfile()?.id||currentUser.uid,[target]:profileId||target},
    participantNames:{[currentUser.uid]:ownProfile()?displayName(ownProfile(),currentUser.uid):(currentUser.displayName||'BANDtroductions Member'),...(profileName?{[target]:profileName}:{})},
    updatedAt:serverTimestamp()
  },{merge:true});
  await writeInboxPair(id,target,preferredProfile,{markCurrentRead:true});
  await openConversation(id,target,preferredProfile);
}

function closeSearch(){searchResults?.classList.remove('show');}
function renderSearch(term=''){
  if(!searchResults)return;
  const q=term.trim().toLowerCase();
  if(!q){searchResults.innerHTML='';closeSearch();return;}
  const matches=profileDirectory.filter(p=>{
    const target=targetUserId(p);
    if(!target||target===currentUser?.uid)return false;
    const hay=[displayName(p,p.id),profileType(p),p.city,p.state,p.genre].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  }).slice(0,10);
  searchResults.replaceChildren();
  if(!matches.length){searchResults.innerHTML='<div class="search-empty">No matching profiles found.</div>';searchResults.classList.add('show');return;}
  matches.forEach(p=>{
    const target=targetUserId(p),name=displayName(p,p.id),image=profileImage(p);
    const button=document.createElement('button');button.type='button';button.className='search-result';
    button.innerHTML=`<span class="search-avatar">${image?`<img src="${safe(image)}" alt="${safe(name)}">`:safe(initials(name))}</span><span><span class="search-name">${safe(name)}</span><span class="search-meta">${safe(profileType(p))}</span></span>`;
    button.addEventListener('click',async()=>{
      searchInput.value=name;closeSearch();
      messagesEl.innerHTML='<div class="empty">Opening private conversation…</div>';
      try{await ensureTargetConversation(target,p);}catch(error){console.warn('Could not start private conversation',error);messagesEl.innerHTML='<div class="empty">Private inbox permissions are not enabled yet.</div>';}
    });
    searchResults.appendChild(button);
  });
  searchResults.classList.add('show');
}

searchInput?.addEventListener('input',()=>renderSearch(searchInput.value));
searchInput?.addEventListener('focus',()=>{if(searchInput.value.trim())renderSearch(searchInput.value);});
document.addEventListener('click',event=>{if(!event.target.closest('.search-box'))closeSearch();});

onAuthStateChanged(auth,async user=>{
  currentUser=user;
  if(unsubscribeProfiles){unsubscribeProfiles();unsubscribeProfiles=null;}
  if(unsubscribeInbox){unsubscribeInbox();unsubscribeInbox=null;}
  if(!user){list.innerHTML='<a class="conversation" href="login.html"><b>Log in</b><small>Sign in to use private messages.</small></a>';searchInput.disabled=true;return;}
  searchInput.disabled=false;

  const profilesQuery=query(collection(db,'profiles'),where('published','==',true));
  unsubscribeProfiles=onSnapshot(profilesQuery,snap=>{
    profileDirectory=snap.docs.map(d=>({id:d.id,...d.data()}));
    if(searchInput.value.trim())renderSearch(searchInput.value);
  },error=>console.warn('Profile search unavailable.',error));

  if(targetProfileId){
    try{
      let targetProfile=profileDirectory.find(p=>p.id===targetProfileId)||null;
      if(!targetProfile){const snap=await getDoc(doc(db,'profiles',targetProfileId));if(snap.exists())targetProfile={id:snap.id,...snap.data()};}
      const target=targetProfile?targetUserId(targetProfile):targetProfileId;
      if(target&&target!==user.uid)ensureTargetConversation(target,targetProfile).catch(error=>console.warn('Could not start conversation',error));
    }catch(error){console.warn('Could not resolve target profile',error);}
  }

  unsubscribeInbox=onSnapshot(collection(db,'messageInboxes',user.uid,'items'),async snap=>{
    const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0));
    list.innerHTML='';
    if(!rows.length){list.innerHTML='<div class="status">No conversations yet. Search a profile above to start a private message.</div>';return;}
    for(const row of rows){
      const otherUid=row.otherUid||'';
      let other=row.profileId?profileDirectory.find(p=>p.id===row.profileId):null;
      if(!other)other=await profile(otherUid).catch(()=>null);
      const name=row.profileName||displayName(other,otherUid);
      const a=document.createElement('a');a.href='#';a.className='conversation';a.innerHTML=`<b>${safe(name)}</b><small>${safe(row.lastMessage||'Open private conversation')}</small>`;
      a.addEventListener('click',event=>{event.preventDefault();document.querySelectorAll('.conversation').forEach(x=>x.classList.remove('active'));a.classList.add('active');openConversation(row.conversationId||row.id,otherUid,other);});list.appendChild(a);
    }
  },error=>{console.warn(error);list.innerHTML='<div class="status">Private inbox could not be loaded. Message inbox permissions still need to be enabled.</div>';});
});

composer.addEventListener('submit',async event=>{
  event.preventDefault();const text=input.value.trim();if(!text||!currentUser||!currentConversationId||!currentOtherUid)return;
  input.value='';
  try{
    await addDoc(collection(db,'conversations',currentConversationId,'messages'),{senderId:currentUser.uid,text,createdAt:serverTimestamp()});
    await setDoc(doc(db,'conversations',currentConversationId),{lastMessage:text,lastSenderId:currentUser.uid,updatedAt:serverTimestamp()},{merge:true});
    try{await writeInboxPair(currentConversationId,currentOtherUid,currentOtherProfile,{lastMessage:text,lastSenderId:currentUser.uid,markCurrentRead:true});}
    catch(inboxError){console.warn('Message sent, but inbox index could not be updated yet.',inboxError);}
    await markRead(currentConversationId);
  }catch(error){console.error(error);alert('Message could not be sent.');input.value=text;}
});
