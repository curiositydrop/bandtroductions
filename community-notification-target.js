import { db } from './firebase-dev.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const postId=new URLSearchParams(location.search).get('post');
if(postId){
  const style=document.createElement('style');
  style.textContent=`.community-post.notification-target{border-color:#0ccfbd!important;box-shadow:0 0 0 3px rgba(12,207,189,.22),0 0 30px rgba(12,207,189,.18)!important;transition:box-shadow .35s ease,border-color .35s ease}`;
  document.head.appendChild(style);

  const normalize=value=>String(value||'').trim();
  const findArticle=post=>[...document.querySelectorAll('.community-post')].find(article=>{
    const link=article.querySelector('.community-author');
    const authorId=link?new URL(link.href,location.href).searchParams.get('id'):'';
    const body=article.querySelector('.community-post-body')?.dataset.fullContent||article.querySelector('.community-post-body')?.textContent||'';
    return authorId===post.authorId&&normalize(body)===normalize(post.content);
  });

  const reveal=article=>{
    article.dataset.postId=postId;
    const comments=article.querySelector('.post-comments');
    const toggle=article.querySelector('.comment-toggle');
    if(comments&&toggle){comments.hidden=false;toggle.setAttribute('aria-expanded','true');}
    article.classList.add('notification-target');
    article.scrollIntoView({behavior:'smooth',block:'center'});
    window.setTimeout(()=>article.classList.remove('notification-target'),4200);
  };

  try{
    const snap=await getDoc(doc(db,'posts',postId));
    if(snap.exists()){
      const post={id:snap.id,...snap.data()};
      let attempts=0;
      const locate=()=>{
        const article=findArticle(post);
        if(article){reveal(article);return;}
        attempts+=1;
        if(attempts<40)window.setTimeout(locate,250);
      };
      locate();
    }
  }catch(error){console.error('Could not open the notification post:',error)}
}
