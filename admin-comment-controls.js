import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { isAdminAccount } from './admin-access.js';

const style=document.createElement('style');
style.textContent=`
.comment-delete-button,.comment-edit-button{margin-left:6px;border:1px solid #555;border-radius:999px;padding:5px 9px;background:#0d0d0d;color:#ddd;font:inherit;font-size:.72rem;font-weight:800;cursor:pointer}.comment-edit-button{color:#0ccfbd;border-color:#2f625e}.comment-delete-button{color:#ffb4b4;border-color:#6b3535}.comment-delete-button:hover{border-color:#ff7777;color:#fff}.comment-edit-button:hover{border-color:#0ccfbd;color:#fff}.comment-delete-button:disabled,.comment-edit-button:disabled{opacity:.55;cursor:wait}.comment-edit-form{display:grid;gap:7px;margin-top:8px}.comment-edit-form textarea{width:100%;min-height:76px;box-sizing:border-box;border:1px solid #444;border-radius:10px;background:#090909;color:#fff;padding:10px;font:inherit}.comment-edit-actions{display:flex;gap:7px;flex-wrap:wrap}.comment-edit-actions button{width:auto!important;padding:7px 11px!important}.comment-edited-label{margin-left:6px;color:#888;font-size:.68rem;font-style:italic}
`;
document.head.appendChild(style);

let currentUser=null,isAdmin=false,posts=[];
const subscriptions=new Map();
const formatDate=t=>!t?.toDate?'Just now':new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(t.toDate());

function findPost(article){
  const directId=article.dataset.postId||article.getAttribute('data-post-id');
  if(directId)return posts.find(p=>p.id===directId);
  const link=article.querySelector('.community-author');
  const authorId=link?new URL(link.href,location.href).searchParams.get('id'):'';
  const meta=article.querySelector('.community-post-meta')?.textContent||'';
  return posts.find(post=>(authorId?post.authorId===authorId:post.authorName===link?.textContent?.trim())&&meta.includes(formatDate(post.createdAt)));
}

function openEditor(item,post,commentDoc,comment){
  if(item.querySelector('.comment-edit-form'))return;
  const form=document.createElement('form');form.className='comment-edit-form';
  const textarea=document.createElement('textarea');textarea.maxLength=1000;textarea.required=true;textarea.value=comment.content||'';
  const actions=document.createElement('div');actions.className='comment-edit-actions';
  const save=document.createElement('button');save.type='submit';save.className='auth-button';save.textContent='Save Comment';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='auth-button auth-button-secondary';cancel.textContent='Cancel';
  const message=document.createElement('p');message.className='auth-message';
  actions.append(save,cancel);form.append(textarea,actions,message);item.appendChild(form);textarea.focus();textarea.setSelectionRange(textarea.value.length,textarea.value.length);
  cancel.addEventListener('click',()=>form.remove());
  form.addEventListener('submit',async event=>{event.preventDefault();const content=textarea.value.trim();if(!content){message.textContent='The comment cannot be empty.';return}save.disabled=true;message.textContent='Saving…';try{await updateDoc(doc(db,'posts',post.id,'comments',commentDoc.id),{content,editedAt:serverTimestamp()});form.remove()}catch(error){console.error(error);message.textContent=error?.code==='permission-denied'?'Comment-edit permission was denied.':'The comment could not be updated.'}finally{save.disabled=false}});
}

function addButtons(article,post,snapshot){
  if(!currentUser)return;
  const items=[...article.querySelectorAll('.comment-list .comment-item')];
  items.forEach((item,index)=>{
    const commentDoc=snapshot.docs[index];if(!commentDoc)return;
    const comment=commentDoc.data();
    const owner=comment.authorId===currentUser.uid;
    if(comment.editedAt&&!item.querySelector('.comment-edited-label')){const label=document.createElement('span');label.className='comment-edited-label';label.textContent='Edited';item.querySelector('.comment-top')?.appendChild(label)}
    if(!owner&&!isAdmin)return;
    const top=item.querySelector('.comment-top');if(!top)return;
    if(owner){let edit=item.querySelector('.comment-edit-button');if(!edit){edit=document.createElement('button');edit.type='button';edit.className='comment-edit-button';edit.textContent='Edit';top.appendChild(edit)}if(edit.dataset.ready!=='true'){edit.dataset.ready='true';edit.addEventListener('click',()=>openEditor(item,post,commentDoc,comment))}}
    let button=item.querySelector('.comment-delete-button');
    if(!button){button=document.createElement('button');button.type='button';button.className='comment-delete-button';top.appendChild(button)}
    button.textContent=isAdmin&&!owner?'Admin Delete':'Delete';
    if(button.dataset.ready==='true')return;
    button.dataset.ready='true';
    button.addEventListener('click',async()=>{
      if(!confirm('Delete this comment permanently? This cannot be undone.'))return;
      const label=button.textContent;button.disabled=true;button.textContent='Deleting…';
      try{await deleteDoc(doc(db,'posts',post.id,'comments',commentDoc.id))}
      catch(error){console.error(error);alert(error?.code==='permission-denied'?'Comment-delete permission was denied.':'The comment could not be deleted.');button.disabled=false;button.textContent=label}
    });
  });
}

function subscribe(article){
  if(!currentUser)return;
  const post=findPost(article);if(!post)return;
  article.dataset.commentControlsPostId=post.id;
  article.dataset.postId=post.id;
  if(subscriptions.has(post.id))return;
  const stop=onSnapshot(query(collection(db,'posts',post.id,'comments'),orderBy('createdAt','asc')),snap=>{
    document.querySelectorAll(`.community-post[data-comment-controls-post-id="${post.id}"]`).forEach(a=>addButtons(a,post,snap));
  },error=>console.error('Could not load comments for moderation:',error));
  subscriptions.set(post.id,stop);
}

function scan(){if(!currentUser||!posts.length)return;document.querySelectorAll('.community-post').forEach(subscribe)}
const feed=document.getElementById('feed');if(feed)new MutationObserver(scan).observe(feed,{childList:true,subtree:true});
onAuthStateChanged(auth,user=>{currentUser=user;isAdmin=isAdminAccount(user);scan()});
onSnapshot(collection(db,'posts'),snap=>{posts=snap.docs.map(d=>({id:d.id,...d.data()}));scan()});