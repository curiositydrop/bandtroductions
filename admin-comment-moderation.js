import { auth, db } from './firebase-dev.js';
import { collection, deleteDoc, doc, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { isAdminAccount } from './admin-access.js';

const normalize = value => String(value || '').trim();

function addStyles() {
  if (document.getElementById('admin-comment-moderation-style')) return;
  const style = document.createElement('style');
  style.id = 'admin-comment-moderation-style';
  style.textContent = `
    .admin-comment-delete{margin-left:auto;border:1px solid #8d3c3c;background:#1c0d0d;color:#ffbcbc;border-radius:999px;padding:4px 9px;font:inherit;font-size:.68rem;font-weight:900;cursor:pointer}
    .admin-comment-delete:hover,.admin-comment-delete:focus{background:#351313;color:#fff}
    .admin-comment-delete:disabled{opacity:.55;cursor:wait}
    .comment-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  `;
  document.head.appendChild(style);
}

async function resolvePost(article) {
  const authorLink = article?.querySelector('.community-author');
  const authorId = authorLink ? new URL(authorLink.href, location.href).searchParams.get('id') : '';
  const content = normalize(article?.querySelector('.community-post-body')?.dataset.fullContent || article?.querySelector('.community-post-body')?.textContent);
  if (!authorId) return null;
  const snap = await getDocs(query(collection(db, 'posts'), where('authorId', '==', authorId)));
  const matches = snap.docs
    .filter(item => normalize(item.data().content) === content)
    .sort((a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0));
  return matches[0] || null;
}

async function resolveComment(postId, item) {
  const authorLink = item.querySelector('.comment-top a');
  const authorId = authorLink ? new URL(authorLink.href, location.href).searchParams.get('id') : '';
  const content = normalize(item.querySelector(':scope > p')?.textContent);
  const snap = await getDocs(collection(db, 'posts', postId, 'comments'));
  const matches = snap.docs
    .filter(comment => {
      const data = comment.data();
      return normalize(data.content) === content && (!authorId || data.authorId === authorId);
    })
    .sort((a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0));
  return matches[0] || null;
}

async function deleteComment(button, item) {
  if (!isAdminAccount(auth.currentUser)) return;
  const author = normalize(item.querySelector('.comment-top a')?.textContent) || 'this member';
  if (!confirm(`Delete ${author}'s comment? This cannot be undone.`)) return;

  button.disabled = true;
  button.textContent = 'Deleting…';
  try {
    const article = item.closest('.community-post');
    const post = await resolvePost(article);
    if (!post) throw new Error('Post could not be identified.');
    const comment = await resolveComment(post.id, item);
    if (!comment) throw new Error('Comment could not be identified.');
    await deleteDoc(doc(db, 'posts', post.id, 'comments', comment.id));
  } catch (error) {
    console.error('Admin comment deletion failed:', error);
    alert(error?.code === 'permission-denied'
      ? 'Firestore blocked the deletion. The admin delete rule still needs to be enabled.'
      : 'That comment could not be deleted. Please refresh and try again.');
    button.disabled = false;
    button.textContent = 'Delete';
  }
}

function enhanceComments() {
  if (!isAdminAccount(auth.currentUser)) return;
  document.querySelectorAll('.comment-item').forEach(item => {
    if (item.querySelector('.admin-comment-delete')) return;
    const top = item.querySelector('.comment-top');
    if (!top) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-comment-delete';
    button.textContent = 'Delete';
    button.title = 'Admin: delete this comment';
    button.addEventListener('click', () => deleteComment(button, item));
    top.appendChild(button);
  });
}

function start() {
  if (!location.pathname.endsWith('/community.html') || !isAdminAccount(auth.currentUser)) return;
  addStyles();
  const feed = document.getElementById('feed');
  if (!feed) return;
  new MutationObserver(enhanceComments).observe(feed, { childList: true, subtree: true });
  enhanceComments();
}

if (auth.currentUser) start();
window.addEventListener('bandtroductions-role-ready', start);
