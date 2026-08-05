import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const avatarUrlFor = (profile = {}) => profile.imageUrl || profile.avatarUrl || profile.profileImageUrl || profile.photoURL || '';

async function resolveComposerProfile(user) {
  const choices = [];

  try {
    const direct = await getDoc(doc(db, 'profiles', user.uid));
    if (direct.exists()) choices.push({ id: direct.id, data: direct.data(), direct: true });
  } catch (error) {
    console.error('Could not load direct composer profile:', error);
  }

  try {
    const owned = await getDocs(query(collection(db, 'profiles'), where('ownerId', '==', user.uid), limit(20)));
    owned.docs.forEach((snapshot) => {
      if (!choices.some((choice) => choice.id === snapshot.id)) {
        choices.push({ id: snapshot.id, data: snapshot.data(), direct: false });
      }
    });
  } catch (error) {
    console.error('Could not load owned composer profiles:', error);
  }

  if (!choices.length) return null;

  // Prefer the BANDtroductions Admin profile only when it has an actual avatar.
  // Previously an avatar-less admin record could win before another owned
  // profile containing the real image, leaving the composer stuck on initials.
  return choices.find(({ data }) => /bandtroductions\s+admin/i.test(data.displayName || '') && Boolean(avatarUrlFor(data)))
    || choices.find(({ data }) => Boolean(avatarUrlFor(data)))
    || choices.find(({ data }) => /bandtroductions\s+admin/i.test(data.displayName || ''))
    || choices.find(({ direct }) => direct)
    || choices[0];
}

function applyComposerProfile(match, user) {
  if (!match) return;
  const avatar = document.getElementById('composer-avatar');
  const name = document.getElementById('composer-name');
  const type = document.getElementById('composer-type');
  const profileLink = document.getElementById('composer-profile-link');
  if (!avatar || !name) return;

  const profile = match.data || {};
  const imageUrl = avatarUrlFor(profile);
  name.textContent = profile.displayName || user.displayName || 'Create a post';
  if (type) type.textContent = profile.accountType === 'fan' ? 'Scene Supporter' : (profile.accountType || 'Member');
  if (profileLink) profileLink.href = `profile.html?id=${encodeURIComponent(match.id)}`;

  if (imageUrl) {
    const currentImage = avatar.querySelector('img');
    if (currentImage?.src === imageUrl) return;
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = `${profile.displayName || 'Member'} profile image`;
    image.addEventListener('error', () => {
      avatar.textContent = (profile.displayName || 'BT').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'BT';
    });
    avatar.replaceChildren(image);
  } else {
    avatar.textContent = (profile.displayName || 'BT').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'BT';
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  const match = await resolveComposerProfile(user);
  if (!match) return;
  applyComposerProfile(match, user);
});
