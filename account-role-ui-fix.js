import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { isAdminAccount } from './admin-access.js?v=3';

let currentUser = null;
let posts = [];

function installAccountBar(user) {
  const bar = document.getElementById('auth-account-bar');
  const status = document.getElementById('auth-account-status');
  const login = document.getElementById('auth-login-link');
  const create = document.getElementById('auth-account-link');
  const profile = document.getElementById('auth-profile-link');
  const logout = document.getElementById('auth-logout-link');
  if (!bar || !login || !create || !profile || !logout) return false;

  const signedIn = Boolean(user);
  login.hidden = signedIn;
  create.hidden = signedIn;
  profile.hidden = !signedIn;
  logout.hidden = !signedIn;
  if (status) status.textContent = signedIn ? (isAdminAccount(user) ? 'BANDtroductions Admin' : 'Signed in') : 'Browsing as a guest';
  if (user) profile.href = `profile.html?id=${encodeURIComponent(user.uid)}`;
  bar.hidden = false;
  bar.style.display = 'flex';

  if (!logout.dataset.roleFixReady) {
    logout.dataset.roleFixReady = 'true';
    logout.addEventListener('click', async (event) => {
      event.preventDefault();
      try { await signOut(auth); location.href = 'login.html'; }
      catch (error) { console.error(error); alert('You could not be logged out. Please try again.'); }
    });
  }
  return true;
}

function ensureAccountBar(user) {
  if (installAccountBar(user)) return;
  const observer = new MutationObserver(() => {
    if (installAccountBar(user)) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 12000);
}

function postForArticle(article) {
  const directId = article.dataset.postId;
  if (directId) return posts.find(post => post.id === directId);
  const authorLink = article.querySelector('.community-author');
  const authorId = authorLink ? new URL(authorLink.href, location.href).searchParams.get('id') : '';
  const body = article.querySelector('.community-post-body')?.textContent || '';
  return posts.find(post => (authorId ? post.authorId === authorId : true) && (post.content || '') === body);
}

function installDeleteButtons() {
  if (!isAdminAccount(currentUser)) {
    document.querySelectorAll('.admin-post-delete-button').forEach(button => button.remove());
    return;
  }
  document.querySelectorAll('.community-post').forEach(article => {
    const post = postForArticle(article);
    if (!post) return;
    article.dataset.postId = post.id;
    const header = article.querySelector('.community-post-header');
    if (!header || header.querySelector('.admin-post-delete-button')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-post-delete-button';
    button.textContent = 'Delete Post';
    Object.assign(button.style, { border:'1px solid #8a3d3d', borderRadius:'999px', padding:'7px 12px', background:'#180d0d', color:'#ffc0c0', fontWeight:'900' });
    button.addEventListener('click', async () => {
      if (!confirm('Delete this post permanently? This cannot be undone.')) return;
      button.disabled = true;
      button.textContent = 'Deleting…';
      try { await deleteDoc(doc(db, 'posts', post.id)); }
      catch (error) { console.error(error); alert(error?.code === 'permission-denied' ? 'The delete was blocked by Firestore permissions.' : 'The post could not be deleted.'); button.disabled = false; button.textContent = 'Delete Post'; }
    });
    header.appendChild(button);
  });
}

function installProfileOwnerControls(user) {
  if (!user || !location.pathname.endsWith('/profile.html')) return;
  const profileId = new URLSearchParams(location.search).get('id');
  if (profileId !== user.uid) return;
  const edit = document.getElementById('edit-profile');
  if (edit) {
    edit.href = 'profile-setup.html';
    edit.hidden = false;
  }
}

function refreshAfterRoleReady(event) {
  if (!currentUser || event.detail?.userId !== currentUser.uid) return;
  if (!location.pathname.endsWith('/community.html') && !location.pathname.endsWith('/profile.html')) return;
  const key = `role-ready-refresh-v7:${currentUser.uid}:${location.pathname}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');
  location.reload();
}
window.addEventListener('bandtroductions-role-ready', refreshAfterRoleReady);

if (location.pathname.endsWith('/community.html')) {
  const feed = document.getElementById('feed');
  if (feed) new MutationObserver(installDeleteButtons).observe(feed, { childList:true, subtree:true });
  onSnapshot(query(collection(db, 'posts'), orderBy('createdAt', 'desc')), snapshot => {
    posts = snapshot.docs.map(item => ({ id:item.id, ...item.data() }));
    installDeleteButtons();
  }, error => console.error('Admin post list could not load:', error));
}

onAuthStateChanged(auth, user => {
  currentUser = user;
  ensureAccountBar(user);
  installProfileOwnerControls(user);
  installDeleteButtons();
});