import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const style = document.createElement('style');
style.textContent = `
  .post-owner-controls { display:flex; gap:8px; flex-wrap:wrap; margin-left:auto; }
  .post-owner-button { border:1px solid #555; border-radius:999px; padding:7px 12px; background:#0d0d0d; color:#ddd; font:inherit; font-size:.82rem; font-weight:800; cursor:pointer; }
  .post-owner-button:hover { border-color:#00c8b4; color:#00c8b4; }
  .post-owner-button.delete { border-color:#6b3535; color:#ffb4b4; }
  .post-owner-editor { display:grid; gap:10px; padding:14px; border:1px solid rgba(0,200,180,.38); border-radius:14px; background:#0d0d0d; }
  .post-owner-editor textarea, .post-owner-editor input { width:100%; box-sizing:border-box; padding:12px 13px; border:1px solid #444; border-radius:11px; background:#090909; color:#fff; font:inherit; }
  .post-owner-editor textarea { min-height:110px; resize:vertical; }
  .post-owner-editor-actions { display:flex; gap:8px; flex-wrap:wrap; }
  .post-owner-status { min-height:20px; margin:0; color:#ffb4b4; font-weight:700; }
  .community-author-wrap, .community-composer-person { display:flex; align-items:center; gap:10px; min-width:0; }
  .community-author-avatar { width:44px; height:44px; flex:0 0 44px; display:inline-flex; align-items:center; justify-content:center; border-radius:10px; border:1px solid rgba(0,200,180,.55); background:#0b0b0b; color:#00c8b4; font-weight:900; font-size:1rem; text-transform:uppercase; object-fit:cover; overflow:hidden; }
  @media (max-width:600px) { .post-owner-controls { width:100%; margin-left:0; } .community-author-avatar { width:40px; height:40px; flex-basis:40px; } }
`;
document.head.appendChild(style);

let currentUser = null;
let currentUserIsAdmin = false;
let posts = [];
const profileCache = new Map();

const normalizeUrl = (raw) => {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const formatDate = (timestamp) => {
  if (!timestamp?.toDate) return 'Just now';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(timestamp.toDate());
};

const initialsFor = (name) => {
  const cleaned = (name || '').trim();
  if (!cleaned || cleaned === 'Create a post') return 'BT';
  return cleaned.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase() || 'BT';
};

async function getProfile(userId) {
  if (!userId) return {};
  if (!profileCache.has(userId)) {
    profileCache.set(userId, (async () => {
      try {
        const profileSnapshot = await getDoc(doc(db, 'profiles', userId));
        if (profileSnapshot.exists()) return { id: profileSnapshot.id, ...profileSnapshot.data() };

        const ownedProfiles = await getDocs(query(
          collection(db, 'profiles'),
          where('ownerId', '==', userId),
          limit(1)
        ));
        if (!ownedProfiles.empty) {
          const ownedProfile = ownedProfiles.docs[0];
          return { id: ownedProfile.id, ...ownedProfile.data() };
        }

        const userSnapshot = await getDoc(doc(db, 'users', userId));
        return userSnapshot.exists() ? userSnapshot.data() : {};
      } catch (error) {
        console.error('Could not load profile image:', error);
        return {};
      }
    })());
  }
  return profileCache.get(userId);
}

function makeAvatar(name, imageUrl = '') {
  if (imageUrl) {
    const image = document.createElement('img');
    image.className = 'community-author-avatar';
    image.src = imageUrl;
    image.alt = `${name || 'Member'} profile image`;
    image.loading = 'lazy';
    image.addEventListener('error', () => image.replaceWith(makeAvatar(name)));
    return image;
  }
  const placeholder = document.createElement('span');
  placeholder.className = 'community-author-avatar';
  placeholder.textContent = initialsFor(name);
  placeholder.setAttribute('aria-hidden', 'true');
  return placeholder;
}

const avatarUrlFor = (profile = {}) => profile.imageUrl || profile.avatarUrl || profile.profileImageUrl || profile.photoURL || '';

async function addPostAvatar(article) {
  if (article.dataset.authorAvatarReady === 'true') return;
  const author = article.querySelector('.community-author');
  if (!author) return;
  const userId = new URL(author.href, window.location.href).searchParams.get('id');
  if (!userId) return;
  article.dataset.authorAvatarReady = 'true';
  const wrap = document.createElement('div');
  wrap.className = 'community-author-wrap';
  const placeholder = makeAvatar(author.textContent);
  author.parentNode.insertBefore(wrap, author);
  wrap.append(placeholder, author);
  const profile = await getProfile(userId);
  const imageUrl = avatarUrlFor(profile);
  const correctName = profile.displayName || author.textContent || 'Member';
  if (imageUrl && placeholder.isConnected) {
    placeholder.replaceWith(makeAvatar(correctName, imageUrl));
  } else if (placeholder.isConnected) {
    placeholder.textContent = initialsFor(correctName);
  }
}

async function addComposerAvatar(user) {
  const heading = document.querySelector('.community-composer-heading');
  const name = document.getElementById('composer-name');
  if (!heading || !name) return;

  const profile = await getProfile(user.uid);
  const correctName = profile.displayName || user.displayName || name.textContent || 'Member';
  const imageUrl = avatarUrlFor(profile);

  let person = heading.querySelector('.community-composer-person');
  if (!person) {
    const original = name.parentElement;
    person = document.createElement('div');
    person.className = 'community-composer-person';
    heading.insertBefore(person, original);
    person.append(makeAvatar(correctName, imageUrl), original);
  } else {
    const currentAvatar = person.querySelector('.community-author-avatar');
    const freshAvatar = makeAvatar(correctName, imageUrl);
    if (currentAvatar) currentAvatar.replaceWith(freshAvatar);
    else person.prepend(freshAvatar);
  }
}

function findPostForArticle(article) {
  const author = article.querySelector('.community-author')?.textContent?.trim() || '';
  const body = article.querySelector('.community-post-body')?.textContent || '';
  const meta = article.querySelector('.community-post-meta')?.textContent?.trim() || '';
  return posts.find((post) => {
    const expectedMeta = `${post.accountType || 'member'} • ${post.category || 'general'} • ${formatDate(post.createdAt)}`;
    return post.authorName === author && (post.content || '') === body && expectedMeta === meta;
  });
}

function buildEditor(article, post, controls) {
  if (article.querySelector('.post-owner-editor')) return;
  const editor = document.createElement('form');
  editor.className = 'post-owner-editor';
  const content = document.createElement('textarea');
  content.maxLength = 3000;
  content.required = true;
  content.value = post.content || '';
  const link = document.createElement('input');
  link.type = 'text';
  link.maxLength = 500;
  link.placeholder = 'Optional link';
  link.value = post.linkUrl || '';
  const actions = document.createElement('div');
  actions.className = 'post-owner-editor-actions';
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'post-owner-button';
  save.textContent = 'Save Changes';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'post-owner-button';
  cancel.textContent = 'Cancel';
  const status = document.createElement('p');
  status.className = 'post-owner-status';
  actions.append(save, cancel);
  editor.append(content, link, actions, status);
  controls.insertAdjacentElement('afterend', editor);
  cancel.addEventListener('click', () => editor.remove());
  editor.addEventListener('submit', async (event) => {
    event.preventDefault();
    const newContent = content.value.trim();
    if (!newContent) { status.textContent = 'The post cannot be empty.'; return; }
    save.disabled = true;
    status.textContent = 'Saving…';
    try {
      await updateDoc(doc(db, 'posts', post.id), { content: newContent, linkUrl: normalizeUrl(link.value), updatedAt: serverTimestamp() });
      editor.remove();
    } catch (error) {
      console.error(error);
      status.textContent = error.code === 'permission-denied' ? 'Post-edit permissions are not enabled yet.' : 'The post could not be updated.';
    } finally { save.disabled = false; }
  });
}

function addOwnerControls() {
  document.querySelectorAll('.community-post').forEach((article) => {
    addPostAvatar(article);
    if (article.dataset.ownerControlsReady === 'true') return;
    const post = findPostForArticle(article);
    if (!post || !currentUser) return;
    const isOwner = post.authorId === currentUser.uid;
    const canDelete = isOwner || currentUserIsAdmin;
    if (!isOwner && !canDelete) return;
    article.dataset.ownerControlsReady = 'true';
    const header = article.querySelector('.community-post-header');
    if (!header) return;
    const controls = document.createElement('div');
    controls.className = 'post-owner-controls';
    if (isOwner) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'post-owner-button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => buildEditor(article, post, controls));
      controls.appendChild(edit);
    }
    if (canDelete) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'post-owner-button delete';
      remove.textContent = currentUserIsAdmin && !isOwner ? 'Admin Delete' : 'Delete';
      remove.addEventListener('click', async () => {
        if (!window.confirm('Delete this post permanently? This cannot be undone.')) return;
        remove.disabled = true;
        try { await deleteDoc(doc(db, 'posts', post.id)); }
        catch (error) {
          console.error(error);
          window.alert(error.code === 'permission-denied' ? 'Post-delete permissions are not enabled yet.' : 'The post could not be deleted.');
          remove.disabled = false;
        }
      });
      controls.appendChild(remove);
    }
    header.appendChild(controls);
  });
}

function resetControls() {
  document.querySelectorAll('.post-owner-controls, .post-owner-editor').forEach((item) => item.remove());
  document.querySelectorAll('.community-post').forEach((item) => delete item.dataset.ownerControlsReady);
  addOwnerControls();
}

const observer = new MutationObserver(() => addOwnerControls());
const feed = document.getElementById('feed');
if (feed) observer.observe(feed, { childList: true, subtree: true });

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  currentUserIsAdmin = false;
  if (user) {
    await addComposerAvatar(user);
    try {
      const adminSnapshot = await getDoc(doc(db, 'admins', user.uid));
      currentUserIsAdmin = adminSnapshot.exists();
    } catch (error) { console.error('Could not check admin status:', error); }
  }
  resetControls();
});

const postsQuery = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
onSnapshot(postsQuery, (snapshot) => {
  posts = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  resetControls();
});