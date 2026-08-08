import { db } from './firebase-dev.js';
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const feed = document.querySelector('.feed');
if(feed){
  feed.style.visibility='hidden';
  feed.dataset.youtubePreparing='true';
}

const youtubeInfo = raw => {
  const text = String(raw || '');
  const match = text.match(/https?:\/\/(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^\s#]*&)?v=|shorts\/|embed\/))([A-Za-z0-9_-]{6,})[^\s]*/i);
  return match ? { url: match[0], id: match[1] } : null;
};

const stampMs = stamp => stamp?.toMillis ? stamp.toMillis() : (stamp?.seconds ? stamp.seconds * 1000 : 0);
const postMs = post => stampMs(post.createdAt) || stampMs(post.updatedAt) || stampMs(post.publishedAt) || stampMs(post.submittedAt) || 0;

let latestPosts=[];
let enhanceTimer=null;
let revealTimer=null;
let enhancing=false;
const startupAt=Date.now();
const startupHoldMs=1900;

function hide(){
  if(!feed)return;
  feed.style.visibility='hidden';
  feed.dataset.youtubePreparing='true';
}

function reveal(){
  if(!feed)return;
  feed.style.visibility='';
  delete feed.dataset.youtubePreparing;
}

function enhance(posts){
  if(enhancing)return;
  enhancing=true;
  try{
    const cards = [...document.querySelectorAll('.feed .post')];
    const visible = posts.filter(post => post.published !== false);

    visible.forEach((post, index) => {
      const card = cards[index];
      if (!card) return;
      const info = youtubeInfo(post.videoUrl) || youtubeInfo(post.content);
      if (!info) {
        card.dataset.youtubeEnhanced='1';
        return;
      }

      const body = [...card.children].find(el => el.tagName === 'P') || card.querySelector('p');
      const contentInfo = youtubeInfo(post.content);
      if (body && post.content && contentInfo) {
        const cleaned = String(post.content).replace(contentInfo.url, '').replace(/\s{2,}/g, ' ').trim();
        if (cleaned) body.textContent = cleaned;
        else body.remove();
      }

      if (!card.querySelector('.dashboard-youtube-embed')) {
        const embed = document.createElement('div');
        embed.className = 'dashboard-youtube-embed';
        embed.style.cssText = 'position:relative;width:100%;aspect-ratio:16/9;margin-top:10px;background:#000;border:1px solid #333;overflow:hidden';
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(info.id)}`;
        iframe.title = 'YouTube video';
        iframe.loading = 'lazy';
        iframe.allowFullscreen = true;
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0';
        embed.appendChild(iframe);
        const actions = card.querySelector('.post-actions');
        if (actions) actions.insertAdjacentElement('beforebegin', embed); else card.appendChild(embed);
      }

      card.querySelectorAll('a').forEach(a => {
        if ((a.textContent || '').trim() === 'WATCH VIDEO →') a.remove();
      });
      card.dataset.youtubeEnhanced='1';
    });
  } finally {
    enhancing=false;
  }
}

function scheduleReveal(){
  if(revealTimer)clearTimeout(revealTimer);
  const elapsed=Date.now()-startupAt;
  const remaining=Math.max(0,startupHoldMs-elapsed);
  revealTimer=setTimeout(()=>{
    revealTimer=null;
    enhance(latestPosts);
    requestAnimationFrame(()=>requestAnimationFrame(reveal));
  },Math.max(220,remaining));
}

function settle(){
  hide();
  if(enhanceTimer)clearTimeout(enhanceTimer);
  if(revealTimer)clearTimeout(revealTimer);
  enhanceTimer=setTimeout(()=>{
    enhanceTimer=null;
    enhance(latestPosts);
    scheduleReveal();
  },80);
}

if(feed){
  const observer=new MutationObserver(()=>{
    if(enhancing)return;
    settle();
  });
  observer.observe(feed,{childList:true,subtree:true,characterData:true});
}

onSnapshot(collection(db,'posts'), snapshot => {
  latestPosts = snapshot.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b) => {
    const diff = postMs(b) - postMs(a);
    return diff || String(a.id).localeCompare(String(b.id));
  });
  settle();
}, error => {
  console.warn('YouTube embed enhancement unavailable.', error);
  reveal();
});

// Safety valve only. Normal reveal waits through the dashboard's startup enhancement passes.
setTimeout(()=>{ if(feed?.style.visibility==='hidden'){ enhance(latestPosts); reveal(); } },4200);
