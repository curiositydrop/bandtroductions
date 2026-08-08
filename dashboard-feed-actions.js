import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { isAdminAccount } from './admin-access.js';

let currentUser=auth.currentUser||null;
let currentProfileName='';
let postsById=new Map();
let cleanups=[];

const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));

onAuthStateChanged(auth,async user=>{
  currentUser=user;
  currentProfileName='';
  if(!user)return;
  try{
    const snap=await getDoc(doc(db,'profiles',user.uid));
    if(snap.exists()){
      const p=snap.data()||{};
      currentProfileName=p.displayName||p.bandName||p.musicianName||p.venueName||p.name||'';
    }
  }catch(error){console.warn('Could not load commenting profile name',error);}
});

function clearListeners(){cleanups.forEach(fn=>{try{fn();}catch{}});cleanups=[];}
function makeButton(label,className,postId){const b=document.createElement('button');b.type='button';b.className=`dashboard-feed-action ${className}`;b.dataset.postId=postId;b.textContent=label;return b;}

function enhanceWelcomeProfileLink(article,post){
  if(!article||!post)return;
  const welcomedId=post.welcomedProfileId||'';
  const targetUrl=post.linkUrl||(welcomedId?`profile.html?id=${encodeURIComponent(welcomedId)}`:'');
  if(!targetUrl)return;
  const body=[...article.children].find(el=>el.tagName==='P')||article.querySelector('p');
  if(!body)return;
  const text=(body.textContent||'').trim();
  const match=text.match(/^👋\s*Welcome\s+(.+?)\s+[—–-]\s+thank you for joining our community!\s*🤘$/i);
  if(!match)return;
  const profileName=match[1].trim();
  const link=document.createElement('a');
  link.href=targetUrl;
  link.textContent=profileName;
  link.className='inline-profile-link';
  body.replaceChildren(
    document.createTextNode('👋 Welcome '),
    link,
    document.createTextNode(' — thank you for joining our community! 🤘')
  );
}

async function sharePost(post){
  const url=`${location.origin}${location.pathname.replace(/[^/]+$/,'')}index.html?post=${encodeURIComponent(post.id)}`;
  const text=[post.authorName,post.content].filter(Boolean).join(': ').slice(0,500);
  try{if(navigator.share){await navigator.share({title:'BANDtroductions Social',text,url});return;}await navigator.clipboard.writeText(url);alert('Post link copied.');}
  catch(error){if(error?.name!=='AbortError')console.warn('Share failed',error);}
}

function ensureCommentArea(article,postId){
  let area=article.querySelector(`.dashboard-comment-area[data-post-id="${CSS.escape(postId)}"]`);
  if(area)return area;
  area=document.createElement('div');
  area.className='dashboard-comment-area';
  area.dataset.postId=postId;
  const actions=article.querySelector('.post-actions');
  if(actions)actions.insertAdjacentElement('afterend',area);else article.appendChild(area);
  return area;
}

function renderComments(area,snap,postId){
  let list=area.querySelector('.dashboard-comments-list');
  if(!list){list=document.createElement('div');list.className='dashboard-comments-list';area.appendChild(list);}
  list.replaceChildren();
  const docs=[...snap.docs].sort((a,b)=>(a.data()?.createdAt?.toMillis?.()||0)-(b.data()?.createdAt?.toMillis?.()||0));
  if(!docs.length){const empty=document.createElement('div');empty.className='dashboard-comments-empty';empty.textContent='No comments yet.';list.appendChild(empty);return;}
  docs.forEach(commentDoc=>{
    const c=commentDoc.data()||{};
    const row=document.createElement('div');row.className='dashboard-comment-row';
    const copy=document.createElement('div');copy.className='dashboard-comment-copy';
    const name=document.createElement('b');name.textContent=c.authorName||c.displayName||'Member';
    const text=document.createElement('span');text.textContent=c.text||c.comment||c.content||'';
    copy.append(name,text);row.appendChild(copy);
    if(isAdminAccount(auth.currentUser||currentUser)){
      const del=document.createElement('button');del.type='button';del.className='dashboard-comment-admin-delete';del.textContent='DELETE';del.title='Delete comment';
      del.addEventListener('click',async()=>{
        if(!confirm('Delete this comment permanently?'))return;
        del.disabled=true;const old=del.textContent;del.textContent='DELETING…';
        try{await deleteDoc(doc(db,'posts',postId,'comments',commentDoc.id));}
        catch(error){console.error('Comment delete failed',error);alert(error?.code==='permission-denied'?'Comment-delete permission was denied.':'The comment could not be deleted.');del.disabled=false;del.textContent=old;}
      });
      row.appendChild(del);
    }
    list.appendChild(row);
  });
}

function openCommentComposer(postId){
  const post=postsById.get(postId);if(!post)return;
  const article=[...document.querySelectorAll('.feed .post')].find(el=>el.dataset.postId===postId||el.dataset.actionsFor===postId);
  if(!article)return;
  const user=auth.currentUser||currentUser;
  if(!user){alert('Please log in to comment.');location.href=`login.html?returnTo=${encodeURIComponent('index.html')}`;return;}
  const area=ensureCommentArea(article,postId);
  let composer=area.querySelector('.dashboard-comment-composer');
  if(composer){composer.remove();return;}
  composer=document.createElement('form');composer.className='dashboard-comment-composer';
  composer.innerHTML='<textarea maxlength="1000" placeholder="Write a comment..." required></textarea><div class="dashboard-comment-buttons"><button type="button" class="dashboard-comment-cancel">CANCEL</button><button type="submit" class="dashboard-comment-submit">POST COMMENT</button></div><div class="dashboard-comment-status" aria-live="polite"></div>';
  area.prepend(composer);
  const textarea=composer.querySelector('textarea');textarea.focus();
  composer.querySelector('.dashboard-comment-cancel').onclick=()=>composer.remove();
  composer.onsubmit=async event=>{
    event.preventDefault();
    const text=textarea.value.trim();if(!text)return;
    const submit=composer.querySelector('.dashboard-comment-submit');const status=composer.querySelector('.dashboard-comment-status');submit.disabled=true;status.textContent='Posting…';
    try{
      const activeUser=auth.currentUser||currentUser;if(!activeUser)throw new Error('signed-out');
      const authorName=currentProfileName||activeUser.displayName||activeUser.email?.split('@')[0]||'Member';
      await addDoc(collection(db,'posts',postId,'comments'),{authorId:activeUser.uid,authorName,postId,text,published:true,createdAt:serverTimestamp()});
      textarea.value='';status.textContent='Posted.';setTimeout(()=>composer.remove(),250);
    }catch(error){console.error('Comment could not be saved',error);status.textContent=error?.code==='permission-denied'?'Comment permission was denied.':'Comment could not be posted. Please try again.';submit.disabled=false;}
  };
}

function enhance(posts){
  postsById=new Map(posts.map(p=>[p.id,p]));
  const visible=posts.filter(p=>p.published!==false).slice(0,6);
  const articles=[...document.querySelectorAll('.feed .post')];
  visible.forEach((post,index)=>{
    const article=articles[index];if(!article)return;
    article.dataset.postId=post.id;article.dataset.actionsFor=post.id;
    enhanceWelcomeProfileLink(article,post);
    const row=article.querySelector('.post-actions');if(!row)return;
    row.replaceChildren();
    const rock=makeButton('🤘 ROCK ON','dashboard-rock',post.id);
    const comment=makeButton('COMMENT','dashboard-comment',post.id);
    const share=makeButton('SHARE','dashboard-share',post.id);
    row.append(rock,comment,share);

    const reactions=collection(db,'posts',post.id,'reactions');
    cleanups.push(onSnapshot(reactions,snap=>{const mine=(auth.currentUser||currentUser)?snap.docs.some(d=>d.id===(auth.currentUser||currentUser).uid):false;rock.dataset.reacted=mine?'true':'false';rock.classList.toggle('is-active',mine);rock.textContent=`🤘 ROCK ON${snap.size?` (${snap.size})`:''}`;},()=>{}));

    const comments=collection(db,'posts',post.id,'comments');
    const area=ensureCommentArea(article,post.id);
    cleanups.push(onSnapshot(comments,snap=>{comment.textContent=`COMMENT${snap.size?` (${snap.size})`:''}`;renderComments(area,snap,post.id);},error=>console.warn('Comments unavailable for post',post.id,error)));
  });
}

document.addEventListener('click',async event=>{
  const button=event.target.closest('.dashboard-feed-action');if(!button)return;
  event.preventDefault();event.stopPropagation();
  const postId=button.dataset.postId;const post=postsById.get(postId);if(!post)return;
  if(button.classList.contains('dashboard-comment')){openCommentComposer(postId);return;}
  if(button.classList.contains('dashboard-share')){await sharePost(post);return;}
  if(button.classList.contains('dashboard-rock')){
    const user=auth.currentUser||currentUser;if(!user){location.href=`login.html?returnTo=${encodeURIComponent('index.html')}`;return;}
    button.disabled=true;
    try{const target=doc(db,'posts',postId,'reactions',user.uid);if(button.dataset.reacted==='true')await deleteDoc(target);else await setDoc(target,{userId:user.uid,createdAt:serverTimestamp()});}
    catch(error){console.warn('Reaction could not be saved',error);}finally{button.disabled=false;}
  }
},true);

const style=document.createElement('style');style.textContent=`
.dashboard-feed-action{appearance:none;border:0;background:transparent;color:#aaa;padding:0;font:inherit;font-size:inherit;font-weight:700;cursor:pointer;text-align:left;position:relative;z-index:3;touch-action:manipulation}
.dashboard-feed-action:hover,.dashboard-feed-action.is-active{color:var(--teal)}.dashboard-feed-action:disabled{opacity:.55;cursor:wait}
.dashboard-comment-area{margin-top:8px;border-top:1px dotted #2d3434;padding-top:8px;position:relative;z-index:4}.dashboard-comment-composer{margin:0 0 8px;padding:8px;border:1px solid #2f6662;background:#0b1010}.dashboard-comment-composer textarea{display:block;width:100%;min-height:72px;resize:vertical;background:#080a0a;color:#eee;border:1px solid #466;padding:9px;font:inherit;outline:none}.dashboard-comment-composer textarea:focus{border-color:var(--teal);box-shadow:0 0 0 1px var(--teal)}.dashboard-comment-buttons{display:flex;justify-content:flex-end;gap:7px;margin-top:7px}.dashboard-comment-buttons button{border:1px solid var(--teal);background:#0b0d0d;color:var(--teal);padding:6px 9px;font-weight:900;cursor:pointer}.dashboard-comment-buttons .dashboard-comment-submit{background:var(--teal);color:#06100f}.dashboard-comment-status{font-size:10px;color:#999;text-align:right;margin-top:5px}.dashboard-comment-row{padding:6px 0;border-bottom:1px dotted #242929;font-size:11px;line-height:1.35;display:flex;align-items:flex-start;gap:8px;justify-content:space-between}.dashboard-comment-copy{min-width:0;flex:1}.dashboard-comment-row b{color:var(--teal);margin-right:6px}.dashboard-comment-row span{color:#ddd}.dashboard-comments-empty{font-size:10px;color:#777}.dashboard-comment-admin-delete{flex:none;border:1px solid #a63b3b;background:#240d0d;color:#ff9f9f;padding:3px 6px;font-size:8px;font-weight:900;cursor:pointer}.dashboard-comment-admin-delete:hover{background:#3a1111;color:#fff}.dashboard-comment-admin-delete:disabled{opacity:.55;cursor:wait}
@media(max-width:650px){.dashboard-feed-action{font-size:6px}.dashboard-comment-composer{padding:5px}.dashboard-comment-composer textarea{min-height:48px;padding:5px;font-size:7px}.dashboard-comment-buttons button{font-size:6px;padding:4px 5px}.dashboard-comment-status,.dashboard-comments-empty{font-size:6px}.dashboard-comment-row{font-size:7px;padding:4px 0;gap:4px}.dashboard-comment-admin-delete{font-size:5px;padding:2px 3px}}
`;document.head.appendChild(style);

const postsQuery=query(collection(db,'posts'),orderBy('createdAt','desc'));
onSnapshot(postsQuery,snapshot=>{clearListeners();const posts=snapshot.docs.map(d=>({id:d.id,...d.data()}));[100,350,800,1500].forEach(delay=>setTimeout(()=>enhance(posts),delay));},error=>console.warn('Dashboard feed actions unavailable',error));

import('./dashboard-media-upload.js?v=1').catch(error=>console.error('Dashboard media upload unavailable',error));