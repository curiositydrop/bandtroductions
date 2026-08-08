import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

export const ADMIN_EMAIL = 'mbergeron79@gmail.com';
export const LEGACY_ADMIN_EMAIL = 'mbegeron79@gmail.com';
export const SCENE_SUPPORTER_EMAIL = 'newleafpaintingcompany@gmail.com';

const normalized = (value) => String(value || '').trim().toLowerCase();

export function isAdminAccount(user) {
  const email = normalized(user?.email);
  return Boolean(user && (email === ADMIN_EMAIL || email === LEGACY_ADMIN_EMAIL));
}

async function normalizeWelcomePostAuthors(user) {
  if (!isAdminAccount(user) || sessionStorage.getItem('bt-welcome-author-normalized') === '1') return;
  try {
    const snapshot = await getDocs(collection(db, 'posts'));
    const fixes = [];
    snapshot.docs.forEach((postDoc) => {
      const post = postDoc.data() || {};
      const isWelcome = Boolean(post.welcomedProfileId) || postDoc.id.startsWith('welcome_');
      if (!isWelcome) return;
      if (post.authorId === user.uid && post.authorName === 'BANDtroductions Admin' && post.systemPost === true) return;
      fixes.push(updateDoc(doc(db, 'posts', postDoc.id), {
        authorId: user.uid,
        authorName: 'BANDtroductions Admin',
        accountType: 'fan',
        systemPost: true,
        updatedAt: serverTimestamp()
      }));
    });
    if (fixes.length) await Promise.all(fixes);
    sessionStorage.setItem('bt-welcome-author-normalized', '1');
  } catch (error) {
    console.warn('Could not normalize existing welcome-post authors:', error);
  }
}

async function normalizeAccountRoles(user) {
  if (!user) return;
  const email = normalized(user.email);

  if (isAdminAccount(user)) {
    const userData = {
      accountType: 'fan',
      displayName: 'BANDtroductions Admin',
      activeProfileId: user.uid,
      profileComplete: true,
      sceneSupporter: false,
      isAdmin: true,
      claimedLegacyProfile: false,
      updatedAt: serverTimestamp()
    };
    const profileData = {
      ownerId: user.uid,
      accountType: 'fan',
      displayName: 'BANDtroductions Admin',
      profileEmoji: '🤘',
      bio: 'BANDtroductions administrator.',
      imageUrl: '',
      bannerImageUrl: '',
      sceneSupporter: false,
      isAdmin: true,
      claimedLegacyProfile: false,
      legacyPage: '',
      claimEmail: '',
      approvalStatus: 'approved',
      published: true,
      updatedAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, 'users', user.uid), userData, { merge: true });
      await setDoc(doc(db, 'profiles', user.uid), profileData, { merge: true });
      await normalizeWelcomePostAuthors(user);
      if (document.querySelector('.admin-shell')) import('./admin-profile-type-control.js?v=1').catch(error=>console.warn('Profile type control unavailable:',error));
      window.dispatchEvent(new CustomEvent('bandtroductions-role-ready', { detail: { role: 'admin', userId: user.uid } }));
    } catch (error) {
      console.error('Could not normalize the administrator account:', error);
    }
    return;
  }

  if (email === SCENE_SUPPORTER_EMAIL) {
    const userData = {
      accountType: 'fan',
      displayName: 'New Leaf Painting Company',
      activeProfileId: user.uid,
      profileComplete: true,
      sceneSupporter: true,
      isAdmin: false,
      claimedLegacyProfile: false,
      updatedAt: serverTimestamp()
    };
    const profileData = {
      ownerId: user.uid,
      accountType: 'fan',
      displayName: 'New Leaf Painting Company',
      profileEmoji: '🍃',
      bio: 'Scene Supporter of independent and local music.',
      sceneSupporter: true,
      isAdmin: false,
      claimedLegacyProfile: false,
      legacyPage: '',
      claimEmail: '',
      approvalStatus: 'approved',
      published: true,
      updatedAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, 'users', user.uid), userData, { merge: true });
      await setDoc(doc(db, 'profiles', user.uid), profileData, { merge: true });
    } catch (error) {
      console.error('Could not normalize the Scene Supporter account:', error);
    }

    try {
      await deleteDoc(doc(db, 'admins', user.uid));
    } catch (error) {
      if (error?.code !== 'permission-denied' && error?.code !== 'not-found') console.error('Could not remove the old administrator record:', error);
    }
    window.dispatchEvent(new CustomEvent('bandtroductions-role-ready', { detail: { role: 'scene-supporter', userId: user.uid } }));
  }
}

onAuthStateChanged(auth, normalizeAccountRoles);