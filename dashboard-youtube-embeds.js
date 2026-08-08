import { db } from './firebase-dev.js';
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const youtubeInfo = raw => {
  const text = String(raw || '');
  const match = text.match(/https?:\/\/(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^\s#]*&)?v=|shorts\/|embed\/))([A-Za-z0-9_-]{6,})[^\s]*/i);
  return match ? { url: match[0], id: match[1] } : null;
};

const stampMs = stamp => stamp?.toMillis ? stamp.toMillis() : (stamp?.seconds ? stamp.seconds * 1000 : 0);
const postMs = post => stampMs(post.createdAt) || stampMs(post.updatedAt) || stampMs(post.publishedAt) || stampMs(post.submittedAt) || 0;

function enhance(posts){
  const cards = [...document.querySelectorAll('.feed .post')];
  const visible = posts.filter(post => post.published !== false);

  visible.forEach((post, index) => {
    const card = cards[index];
    if (!card) return;
    const info = youtubeInfo(post.videoUrl) || youtubeInfo(post.content);
    if (!info) return;

    const body = [...card.children].find(el => el.tagName === 'P') || card.querySelector('p');
    if (body && post.content && youtubeInfo(post.content)) {
      const cleaned = String(post.content).replace(info.url, '').replace(/\s{2,}/g, ' ').trim();
      body.textContent = cleaned;
      if (!cleaned) body.remove();
    }

    let embed = card.querySelector('.dashboard-youtube-embed');
    if (!embed) {
      embed = document.createElement('div');
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
      if (a !== embed && (a.textContent || '').trim() === 'WATCH VIDEO →') a.remove();
    });
  });
}

function schedule(posts){[60,180,450,900,1600,2600].forEach(delay => setTimeout(() => enhance(posts), delay));}

onSnapshot(collection(db,'posts'), snapshot => {
  const posts = snapshot.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b) => {
    const diff = postMs(b) - postMs(a);
    return diff || String(a.id).localeCompare(String(b.id));
  });
  schedule(posts);
}, error => console.warn('YouTube embed enhancement unavailable.', error));

const observer = new MutationObserver(() => {
  // Firestore snapshot handler will do the real data-to-card mapping; this just gives late-rendered cards time to be caught.
});
observer.observe(document.documentElement,{childList:true,subtree:true});
