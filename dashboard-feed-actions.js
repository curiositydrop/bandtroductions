import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

let currentUser=null;
let cleanups=[];
let generation=0;
let currentProfileName='';

onAuthStateChanged(auth,async user=>{
  currentUser=user;
  currentProfileName='';
  if(user){
    try{
      const profileSnap=await getDoc(doc(db,'profiles',user.uid));
      if(profileSnap.exists()){
        const p=profileSnap.data()||{};
        currentProfileName=p.displayName||p.bandName||p.musicianName||p.venueName||p.name||'';
      }
    }catch(error){console.warn('Could not load commenting profile name',error);}
  }
});

function clearListeners(){cleanups.forEach(fn=>{try{fn();}catch{}});cleanups=[];}

function makeButton(label,className){
  const button=document.createElement('button');
  button.type='button';
  button.className=`dashboard-feed-action ${className}`;
  button.textContent=label;
  return button;
}

async function sharePost(post){
  const url=`${location.origin}${location.pathname.replace(/[^/]+$/,'')}index.html?post=${encodeURIComponent(post.id)}`;
  const text=[post.authorName,post.content].filter(Boolean).join(': ').slice(0,500);
  try{
    if(navigator.share){await navigator.share({title:'BANDtroductions Social',text,url});return;}
    await navigator.clipboard.writeText(url);
    alert('Post link copied.');
  }catch(error){if(error?.name!=='AbortError')console.warn('Share failed',error);}
}

function renderInlineComments(article,post,commentsSnap){
  let box=article.querySelector('.dashboard-comments-box');
  if(!box){
    box=document.createElement('div');
    box.className='dashboard-comments-box';
    article.appendChild(box);
  }
  const docs=commentsSnap.docs.sort((a,b)=>{
    const at=a.data()?.createdAt?.toMillis?.()||0;
    const bt=b.data()?.createdAt?.toMillis?.()||0;
    return at-bt;
  });
  const list=docs.map(d=>{
    const c=d.data()||{};
    const name=c.authorName||c.displayName||'Member';
    const text=c.text||c.comment||c.content||'';
    return `<div class="dashboard-comment-row"><b>${escapeHtml(name)}</b><span>${escapeHtml(text)}</span></div>`;
  }).join('');
  box.innerHTML=`<div class="dashboard-comments-list">${list||'<div class="dashboard-comments-empty">No comments yet.</div>'}</div>`;
}

function escapeHtml(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}

function openCommentComposer(article,post){
  let composer=article.querySelector('.dashboard-comment-composer');
  if(composer){composer.remove();return;}
  if(!currentUser){location.href=`login.html?returnTo=${encodeURIComponent('index.html')}`;return;}
  composer=document.createElement('form');
  composer.className='dashboard-comment-composer';
  composer.innerHTML=`<textarea maxlength="1000" placeholder="Write a comment..." required></textarea><div class="dashboard-comment-buttons"><button type="button" class="dashboard-comment-cancel">CANCEL</button><button type="submit" class="dashboard-comment-submit">POST COMMENT</button></div><div class="dashboard-comment-status" aria-live="polite"></div>`;
  article.appendChild(composer);
  const textarea=composer.querySelector('textarea');
  textarea.focus();
  composer.querySelector('.dashboard-comment-cancel').addEventListener('click',()=>composer.remove());
  composer.addEventListener('submit',async event=>{
    event.preventDefault();
    const text=textarea.value.trim();
    if(!text)return;
    const submit=composer.querySelector('.dashboard-comment-submit');
    const status=composer.querySelector('.dashboard-comment-status');
    submit.disabled=true;
    status.textContent='Posting…';
    try{
      const authorName=currentProfileName||currentUser.displayName||currentUser.email?.split('@')[0]||'Member';
      await addDoc(collection(db,'posts',post.id,'comments'),{
        authorId:currentUser.uid,
        authorName,
        postId:post.id,
        text,
        published:true,
        createdAt:serverTimestamp()
      });
      textarea.value='';
      status.textContent='Posted.';
      setTimeout(()=>composer.remove(),350);
    }catch(error){
      console.error('Comment could not be saved',error);
      status.textContent=error?.code==='permission-denied'?'Comment permission was denied.':'Comment could not be posted. Please try again.';
      submit.disabled=false;
    }
  });
}

function enhance(posts,myGeneration){
  if(myGeneration!==generation)return;
  const articles=[...document.querySelectorAll('.feed .post')];
  const visible=posts.filter(p=>p.published!==false).slice(0,6);
  if(!articles.length||!visible.length)return;

  visible.forEach((post,index)=>{
    const article=articles[index];
    if(!article||article.dataset.actionsFor===post.id)return;
    article.dataset.actionsFor=post.id;
    const row=article.querySelector('.post-actions');
    if(!row)return;
    row.replaceChildren();

    const rock=makeButton('🤘 ROCK ON','dashboard-rock');
    const comment=makeButton('COMMENT','dashboard-comment');
    const share=makeButton('SHARE','dashboard-share');
    row.append(rock,comment,share);

    const reactions=collection(db,'posts',post.id,'reactions');
    const stopReactions=onSnapshot(reactions,snap=>{
      const mine=currentUser?snap.docs.some(d=>d.id===currentUser.uid):false;
      rock.dataset.reacted=mine?'true':'false';
      rock.classList.toggle('is-active',mine);
      rock.textContent=`🤘 ROCK ON${snap.size?` (${snap.size})`:''}`;
      rock.title=currentUser?(mine?'Remove Rock On':'Rock On'):'Log in to react';
    },()=>{});
    cleanups.push(stopReactions);

    const comments=collection(db,'posts',post.id,'comments');
    const stopComments=onSnapshot(comments,snap=>{
      comment.textContent=`COMMENT${snap.size?` (${snap.size})`:''}`;
      if(article.querySelector('.dashboard-comments-box'))renderInlineComments(article,post,snap);
    },error=>console.warn('Comments unavailable for post',post.id,error));
    cleanups.push(stopComments);

    rock.addEventListener('click',async()=>{
      if(!currentUser){location.href=`login.html?returnTo=${encodeURIComponent('index.html')}`;return;}
      rock.disabled=true;
      try{
        const target=doc(db,'posts',post.id,'reactions',currentUser.uid);
        if(rock.dataset.reacted==='true')await deleteDoc(target);
        else await setDoc(target,{userId:currentUser.uid,createdAt:serverTimestamp()});
      }catch(error){console.warn('Reaction could not be saved',error);}
      finally{rock.disabled=false;}
    });

    comment.addEventListener('click',()=>{
      openCommentComposer(article,post);
      onSnapshot(collection(db,'posts',post.id,'comments'),snap=>renderInlineComments(article,post,snap),()=>{});
    },{once:false});
    share.addEventListener('click',()=>sharePost(post));
  });
}

const style=document.createElement('style');
style.textContent=`
.dashboard-feed-action{appearance:none;border:0;background:transparent;color:#aaa;padding:0;font:inherit;font-size:inherit;font-weight:700;cursor:pointer;text-align:left}
.dashboard-feed-action:hover,.dashboard-feed-action.is-active{color:var(--teal)}
.dashboard-feed-action:disabled{opacity:.55;cursor:wait}
.dashboard-comment-composer{margin-top:10px;border-top:1px solid #2a2d2d;padding-top:10px}
.dashboard-comment-composer textarea{width:100%;min-height:64px;resize:vertical;background:#080a0a;color:#eee;border:1px solid #466;padding:9px;font:inherit;outline:none}
.dashboard-comment-composer textarea:focus{border-color:var(--teal);box-shadow:0 0 0 1px var(--teal)}
.dashboard-comment-buttons{display:flex;justify-content:flex-end;gap:7px;margin-top:7px}
.dashboard-comment-buttons button{border:1px solid var(--teal);background:#0b0d0d;color:var(--teal);padding:6px 9px;font-weight:900;cursor:pointer}
.dashboard-comment-buttons .dashboard-comment-submit{background:var(--teal);color:#06100f}
.dashboard-comment-status{font-size:10px;color:#999;text-align:right;margin-top:5px}
.dashboard-comments-box{margin-top:8px;border-top:1px dotted #2d3434;padding-top:8px}
.dashboard-comment-row{padding:6px 0;border-bottom:1px dotted #242929;font-size:11px;line-height:1.35}.dashboard-comment-row b{color:var(--teal);margin-right:6px}.dashboard-comment-row span{color:#ddd}.dashboard-comments-empty{font-size:10px;color:#777}
@media(max-width:650px){.dashboard-feed-action{font-size:6px}.dashboard-comment-composer textarea{min-height:42px;padding:5px;font-size:7px}.dashboard-comment-buttons button{font-size:6px;padding:4px 5px}.dashboard-comment-status,.dashboard-comments-empty{font-size:6px}.dashboard-comment-row{font-size:7px;padding:4px 0}}
`;
document.head.appendChild(style);

const postsQuery=query(collection(db,'posts'),orderBy('createdAt','desc'));
onSnapshot(postsQuery,snapshot=>{
  generation++;
  clearListeners();
  const myGeneration=generation;
  const posts=snapshot.docs.map(d=>({id:d.id,...d.data()}));
  [80,250,600].forEach(delay=>setTimeout(()=>enhance(posts,myGeneration),delay));
},error=>console.warn('Dashboard feed actions unavailable',error));

import('./dashboard-media-upload.js?v=1').catch(error=>console.error('Dashboard media upload unavailable',error));
