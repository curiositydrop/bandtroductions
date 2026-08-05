import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const avatarUrlFor = (profile = {}) => profile.imageUrl || profile.avatarUrl || profile.profileImageUrl || profile.photoURL || '';

const composerAvatar = document.getElementById('composer-avatar');
if (composerAvatar) {
  // Do not expose BT/BA while the real composer identity is still resolving.
  composerAvatar.textContent = '';
  composerAvatar.style.visibility = 'hidden';
}

async function resolveComposerProfile(user) {
  let directMatch = null;
  try {
    const direct = await getDoc(doc(db, 'profiles', user.uid));
    if (direct.exists()) directMatch = { id: direct.id, data: direct.data() };
  } catch (error) {
    console.error('Could not load direct composer profile:', error);
  }

  try {
    const owned = await getDocs(query(collection(db, 'profiles'), where('ownerId', '==', user.uid), limit(20)));
    const choices = owned.docs.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() }));

    const adminWithImage = choices.find(({ data }) =>
      /bandtroductions\s+admin/i.test(data.displayName || '') && Boolean(avatarUrlFor(data))
    );
    const anyWithImage = choices.find(({ data }) => Boolean(avatarUrlFor(data)));
    return adminWithImage
      || anyWithImage
      || (directMatch && avatarUrlFor(directMatch.data) ? directMatch : null)
      || choices.find(({ data }) => /bandtroductions\s+admin/i.test(data.displayName || ''))
      || directMatch
      || choices[0]
      || null;
  } catch (error) {
    console.error('Could not load owned composer profiles:', error);
    return directMatch;
  }
}

function initialsFor(name) {
  return (name || 'BT').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'BT';
}

function setAvatarElement(avatar, profile, imageUrl) {
  if (!avatar) return;
  const wantedName = profile.displayName || 'Member';
  avatar.style.visibility = 'hidden';

  if (imageUrl) {
    const current = avatar.matches('img') ? avatar : avatar.querySelector('img');
    if (current?.src === imageUrl) {
      avatar.style.visibility = '';
      return;
    }

    if (avatar.matches('img')) {
      avatar.src = imageUrl;
      avatar.alt = `${wantedName} profile image`;
      avatar.style.visibility = '';
      return;
    }

    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = `${wantedName} profile image`;
    image.className = avatar.classList.contains('community-author-avatar') ? 'community-author-avatar' : '';
    image.addEventListener('load', () => { avatar.style.visibility = ''; }, { once: true });
    image.addEventListener('error', () => {
      avatar.textContent = initialsFor(wantedName);
      avatar.style.visibility = '';
    }, { once: true });
    avatar.replaceChildren(image);
    if (image.complete) avatar.style.visibility = '';
  } else if (!avatar.matches('img')) {
    avatar.textContent = initialsFor(wantedName);
    avatar.style.visibility = '';
  }
}

function applyComposerProfile(match, user) {
  if (!match) return;
  const avatar = document.getElementById('composer-avatar');
  const name = document.getElementById('composer-name');
  const type = document.getElementById('composer-type');
  const profileLink = document.getElementById('composer-profile-link');
  if (!name) return;

  const profile = match.data || {};
  const imageUrl = avatarUrlFor(profile);
  name.textContent = profile.displayName || user.displayName || 'Create a post';
  if (type) type.textContent = profile.accountType === 'fan' ? 'Scene Supporter' : (profile.accountType || 'Member');
  if (profileLink) profileLink.href = `profile.html?id=${encodeURIComponent(match.id)}`;

  setAvatarElement(avatar, profile, imageUrl);

  document.querySelectorAll('.community-composer-person .community-author-avatar').forEach((secondary) => {
    setAvatarElement(secondary, profile, imageUrl);
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  const match = await resolveComposerProfile(user);
  if (!match) {
    if (composerAvatar) composerAvatar.style.visibility = '';
    return;
  }

  applyComposerProfile(match, user);

  const heading = document.querySelector('.community-composer-heading');
  if (!heading) return;

  let repairing = false;
  const observer = new MutationObserver(() => {
    if (repairing) return;
    repairing = true;
    applyComposerProfile(match, user);
    queueMicrotask(() => { repairing = false; });
  });

  observer.observe(heading, { childList: true, subtree: true, characterData: true });
});
