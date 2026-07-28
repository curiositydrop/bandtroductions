import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { isAdminAccount } from './admin-access.js';

const style = document.createElement('style');
style.textContent = `
  .admin-post-delete-button {
    border:1px solid #7d3b3b;
    border-radius:999px;
    padding:7px 12px;
    background:#180d0d;
    color:#ffc0c0;
    font:inherit;
    font-size:.82rem;
    font-weight:900;
    cursor:pointer;
  }
  .admin-post-delete-button:hover { border-color:#ff7777; color:#fff; }
  .admin-post-delete-button:disabled { opacity:.55; cursor:wait; }
`;
document.head.appendChild(style);

let currentUser = null;
let adminMode = false;
let posts = [];
let cleanupQueued = false;

const formatDate = (timestamp) => {
  if (!timestamp?.toDate) return 'Just now';
  return new Intl.DateTimeFormat('en-US', {
    month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit'
  }).format(timestamp.toDate());
};

function findPost(article) {
  const directId = article.dataset.postId || article.getAttribute('data-post-id');
  if (directId) return posts.find((post) => post.id === directId);

  const authorLink = article.querySelector('.community-author');
  const authorId = authorLink ? new URL(authorLink.href, window.location.href).searchParams.get('id') : '';
  const meta = article.querySelector('.community-post-meta')?.textContent?.trim() || '';
  const authorName = authorLink?.textContent?.trim() || '';

  return posts.find((post) => {
    const sameAuthor = authorId ? post.authorId === authorId : post.authorName === authorName;
    return sameAuthor && meta.includes(formatDate(post.createdAt));
  });
}

function removeEmptyControlRows(article) {
  article.querySelectorAll('.post-owner-controls').forEach((row) => {
    if (!row.children.length) row.remove();
  });
}

function removeNonAdminDeleteButtons() {
  if (adminMode) return;
  document.querySelectorAll('.admin-post-delete-button').forEach((button) => button.remove());
}

function installAdminDeleteButtons() {
  removeNonAdminDeleteButtons();
  if (!adminMode || !currentUser || !posts.length) return;

  document.querySelectorAll('.community-post').forEach((article) => {
    const post = findPost(article);
    if (!post) return;
    article.dataset.postId = post.id;

    const header = article.querySelector('.community-post-header');
    if (!header) return;

    // Admin uses one dedicated delete control. Remove the owner's duplicate delete pill.
    article.querySelectorAll('.post-owner-button.delete').forEach((button) => button.remove());

    const existingAdminButtons = [...article.querySelectorAll('.admin-post-delete-button')];
    let remove = existingAdminButtons.shift() || null;
    existingAdminButtons.forEach((button) => button.remove());

    let controls = header.querySelector('.post-owner-controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'post-owner-controls';
      header.appendChild(controls);
    }

    if (!remove) {
      remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'admin-post-delete-button';
      remove.textContent = 'Delete Post';
      remove.addEventListener('click', async () => {
        if (!window.confirm('Delete this post permanently? This cannot be undone.')) return;
        remove.disabled = true;
        remove.textContent = 'Deleting…';
        try {
          await deleteDoc(doc(db, 'posts', post.id));
        } catch (error) {
          console.error('Admin post deletion failed:', error);
          window.alert(error?.code === 'permission-denied'
            ? 'The delete was blocked by Firestore permissions.'
            : 'The post could not be deleted.');
          remove.disabled = false;
          remove.textContent = 'Delete Post';
        }
      });
    }

    if (remove.parentElement !== controls) controls.appendChild(remove);
    removeEmptyControlRows(article);
  });
}

function queueCleanup() {
  if (cleanupQueued) return;
  cleanupQueued = true;
  requestAnimationFrame(() => {
    cleanupQueued = false;
    installAdminDeleteButtons();
  });
}

const feed = document.getElementById('feed');
if (feed) {
  new MutationObserver(queueCleanup).observe(feed, { childList:true, subtree:true });
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  adminMode = isAdminAccount(user);
  installAdminDeleteButtons();
});

onSnapshot(query(collection(db, 'posts'), orderBy('createdAt', 'desc')), (snapshot) => {
  posts = snapshot.docs.map((item) => ({ id:item.id, ...item.data() }));
  installAdminDeleteButtons();
});