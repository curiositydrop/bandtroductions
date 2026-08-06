import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

let currentUser=null;
let cleanups=[];
let generation=0;

onAuthStateChanged(auth,user=>{currentUser=user;});

const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));

function clearListeners(){
  cleanups.forEach(fn=>{try{fn();}catch{}});
  cleanups=[];
}

function makeButton(label,className){
  const button=document.createElement('button');
  button.type='button';
  button.className=`dashboard-feed-action ${className}`;
  button.textContent=label;
  return button;
}

async function sharePost(post){
  const url=`${location.origin}${location.pathname.replace(/[^/]+$/,'')}community.html?post=${encodeURIComponent(post.id)}`;
  const text=[post.authorName,post.content].filter(Boolean).join(': ').slice(0,500);
  try{
    if(navigator.share){await navigator.share({title:'BANDtroductions Social',text,url});return;}
    await navigator.clipboard.writeText(url);
    alert('Post link copied.');
  }catch(error){
    if(error?.name!=='AbortError')console.warn('Share failed',error);
  }
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
    },()=>{});
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
      location.href=`community.html?post=${encodeURIComponent(post.id)}`;
    });
    share.addEventListener('click',()=>sharePost(post));
  });
}

const style=document.createElement('style');
style.textContent=`
.dashboard-feed-action{appearance:none;border:0;background:transparent;color:#aaa;padding:0;font:inherit;font-size:inherit;font-weight:700;cursor:pointer;text-align:left}
.dashboard-feed-action:hover,.dashboard-feed-action.is-active{color:var(--teal)}
.dashboard-feed-action:disabled{opacity:.55;cursor:wait}
@media(max-width:650px){.dashboard-feed-action{font-size:6px}}
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
