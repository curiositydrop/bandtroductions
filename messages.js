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
let currentUser=null,currentConversationId='',unsubscribeMessages=null,unsubscribeProfiles=null;
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

async function profile(uid){
  if(!uid)return null;
  const direct=profileDirectory.find(p=>p.id===uid||targetUserId(p)===uid);
  if(direct)return direct;
  try{
    const snap=await getDoc(doc(db,'profiles',uid));
    return snap.exists()?{id:snap.id,...snap.data()}:null;
  }catch{return null;}
}

async function markRead(id){
  if(!currentUser||!id)return;
  try{await updateDoc(doc(db,'conversations',id),{[`readAt.${currentUser.uid}`]:serverTimestamp()});}
  catch(error){console.warn('Could not mark conversation read.',error);}
}

async function openConversation(id,otherUid,preferredProfile=null){
  currentConversationId=id;
  const other=preferredProfile||await profile(otherUid).catch(()=>null);
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

async function ensureTargetConversation(target,preferredProfile=null){
  if(!currentUser||!target||target===currentUser.uid)return;
  const id=conversationId(currentUser.uid,target);
  const profileId=preferredProfile?.id||'';
  const profileName=preferredProfile?displayName(preferredProfile,target):'';
  await setDoc(doc(db,'conversations',id),{
    participants:[currentUser.uid,target],
    participantProfiles:{[currentUser.uid]:currentUser.uid,[target]:profileId||target},
    participantNames:profileName?{[target]:profileName}:{},
    updatedAt:serverTimestamp()
  },{merge:true});
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
      try{await ensureTargetConversation(target,p);}catch(error){console.warn('Could not start private conversation',error);messagesEl.innerHTML='<div class="empty">Messaging permissions are not enabled yet.</div>';}
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

  const q=query(collection(db,'conversations'),where('participants','array-contains',user.uid));
  onSnapshot(q,async snap=>{
    const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0));
    list.innerHTML='';
    if(!rows.length){list.innerHTML='<div class="status">No conversations yet. Search a profile above to start a private message.</div>';return;}
    for(const row of rows){
      const otherUid=(row.participants||[]).find(id=>id!==user.uid)||'';
      const preferredId=row.participantProfiles?.[otherUid]||'';
      let other=preferredId?profileDirectory.find(p=>p.id===preferredId):null;
      if(!other)other=await profile(otherUid).catch(()=>null);
      const name=row.participantNames?.[otherUid]||displayName(other,otherUid);
      const a=document.createElement('a');a.href='#';a.className='conversation';a.innerHTML=`<b>${safe(name)}</b><small>${safe(row.lastMessage||'Open private conversation')}</small>`;
      a.addEventListener('click',event=>{event.preventDefault();document.querySelectorAll('.conversation').forEach(x=>x.classList.remove('active'));a.classList.add('active');openConversation(row.id,otherUid,other);});list.appendChild(a);
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
