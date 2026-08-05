import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, doc, getDoc, onSnapshot, orderBy, query } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const feed = document.querySelector('.feed');
const showsPanel = [...document.querySelectorAll('.right .panel')].find(panel => panel.querySelector('h3')?.textContent.trim() === 'Upcoming Shows');
const profilePanel = document.querySelector('.left .menu');
const profileLink = profilePanel?.querySelector('a[href="profile.html"]');

const initialsFor = name => (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'BT';
const formatDate = stamp => {
  if (!stamp?.toDate) return 'Just now';
  return new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }).format(stamp.toDate());
};

function safeText(value='') {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
}

function renderFeed(posts) {
  if (!feed) return;
  const heading = feed.querySelector('h3');
  feed.replaceChildren();
  if (heading) feed.appendChild(heading);

  const visible = posts.filter(p => p.published !== false).slice(0, 6);
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'post';
    empty.innerHTML = '<p>No community posts yet.</p>';
    feed.appendChild(empty);
    return;
  }

  visible.forEach(post => {
    const article = document.createElement('article');
    article.className = 'post';
    article.innerHTML = `
      <div class="post-head">
        <div class="post-avatar">${safeText(initialsFor(post.authorName))}</div>
        <div>
          <div class="post-name">${safeText(post.authorName || 'BANDtroductions Member')}</div>
          <div class="post-meta">${safeText(formatDate(post.createdAt))}${post.category ? ` · ${safeText(post.category)}` : ''}</div>
        </div>
      </div>
      ${post.content ? `<p>${safeText(post.content)}</p>` : ''}
      ${post.imageUrl ? `<img src="${safeText(post.imageUrl)}" alt="" style="display:block;width:100%;margin-top:12px;border:1px solid #333;max-height:420px;object-fit:cover">` : ''}
      ${post.linkUrl ? `<a class="btn" href="${safeText(post.linkUrl)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px">OPEN LINK</a>` : ''}
      <div class="post-actions"><span>ROCK ON</span><span>COMMENT</span><span>SHARE</span></div>`;
    feed.appendChild(article);
  });
}

function renderShows(posts) {
  if (!showsPanel) return;
  const heading = showsPanel.querySelector('h3');
  showsPanel.replaceChildren();
  if (heading) showsPanel.appendChild(heading);

  const shows = posts.filter(p => p.published !== false && p.category === 'show').slice(0, 4);
  if (!shows.length) {
    const empty = document.createElement('div');
    empty.style.padding = '12px';
    empty.style.color = '#9ca3a3';
    empty.textContent = 'Show/Event posts will appear here automatically.';
    showsPanel.appendChild(empty);
    return;
  }

  shows.forEach(post => {
    const d = post.createdAt?.toDate ? post.createdAt.toDate() : new Date();
    const row = document.createElement('a');
    row.className = 'show';
    row.href = 'community.html';
    row.style.color = 'inherit';
    row.style.textDecoration = 'none';
    row.innerHTML = `<div class="date">${d.toLocaleString('en-US',{month:'short'}).toUpperCase()}<span>${d.getDate()}</span></div><div><b>${safeText(post.authorName || 'Upcoming Show')}</b><div>${safeText((post.content || 'View show details').slice(0, 95))}</div><small>Tap for community post</small></div>`;
    showsPanel.appendChild(row);
  });
}

onAuthStateChanged(auth, async user => {
  if (!profilePanel) return;
  const title = profilePanel.querySelector('h3');
  if (!user) {
    if (title) title.textContent = 'My Profile';
    if (profileLink) {
      profileLink.textContent = 'Log In / Create Account';
      profileLink.href = 'login.html';
    }
    return;
  }

  try {
    const profileSnap = await getDoc(doc(db, 'profiles', user.uid));
    const userSnap = await getDoc(doc(db, 'users', user.uid));
    const profile = profileSnap.exists() ? profileSnap.data() : (userSnap.exists() ? userSnap.data() : {});
    const name = profile.displayName || user.displayName || 'My Profile';
    if (title) title.textContent = name;
    if (profileLink) {
      profileLink.textContent = 'View / Edit Profile';
      profileLink.href = `profile.html?id=${encodeURIComponent(user.uid)}`;
    }
  } catch (error) {
    console.warn('Could not load profile for preview dashboard.', error);
  }
});

const postsQuery = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
onSnapshot(postsQuery, snapshot => {
  const posts = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  renderFeed(posts);
  renderShows(posts);
}, error => {
  console.error('Could not load live posts into dashboard preview.', error);
});
