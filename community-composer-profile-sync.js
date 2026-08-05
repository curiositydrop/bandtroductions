import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const avatarUrlFor = (profile = {}) => profile.imageUrl || profile.avatarUrl || profile.profileImageUrl || profile.photoURL || '';

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

    // Prefer the admin identity when it actually has artwork. Otherwise prefer
    // any owned profile with artwork before falling back to a text-only record.
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
    avatar.textContent = (profile.displayName || user.displayName || 'BT').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'BT';
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  const match = await resolveComposerProfile(user);
  if (!match) return;

  applyComposerProfile(match, user);

  // community.html also fills this card during its own auth pass. If that later
  // pass replaces the resolved artwork with initials, restore the same profile
  // identity immediately. This observes only the tiny composer card, not the feed.
  const avatar = document.getElementById('composer-avatar');
  const name = document.getElementById('composer-name');
  if (!avatar || !name) return;

  let repairing = false;
  const observer = new MutationObserver(() => {
    if (repairing) return;
    const wantedUrl = avatarUrlFor(match.data || {});
    const currentUrl = avatar.querySelector('img')?.src || '';
    const wantedName = match.data?.displayName || user.displayName || 'Create a post';
    if ((wantedUrl && currentUrl !== wantedUrl) || name.textContent.trim() !== wantedName) {
      repairing = true;
      applyComposerProfile(match, user);
      queueMicrotask(() => { repairing = false; });
    }
  });
  observer.observe(avatar, { childList: true, subtree: true, characterData: true });
  observer.observe(name, { childList: true, subtree: true, characterData: true });
});
