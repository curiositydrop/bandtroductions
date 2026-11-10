// Shows the share kit only to the signed-in owner of a band/musician profile
// that already has an approved radio song. Reads stay on existing public paths.
import { app, auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getDatabase, ref, get } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { mountShareKit } from './radio-share-kit.js';
import {
  offerShareKit,
  profileImageUrl,
  songCountForProfile,
  tracksFromMap
} from './radio-share-kit-core.mjs';

const RADIO_RTDB = {
  apiKey: 'AIzaSyApLiiJsKTw1Fp8J3aQatMqiSZoP_6EycE',
  authDomain: 'bandfanwall.firebaseapp.com',
  databaseURL: 'https://bandfanwall-default-rtdb.firebaseio.com',
  projectId: 'bandfanwall'
};

function pageProfileId(user) {
  const requested = new URLSearchParams(location.search).get('id') || '';
  if (requested) return requested;
  if (document.getElementById('profile-content') && user?.uid) return user.uid;
  return '';
}

function slotFor(profileId) {
  const profile = document.getElementById('profile-content');
  if (profile) {
    let slot = document.getElementById('radio-share-kit');
    if (!slot) {
      slot = document.createElement('section');
      slot.id = 'radio-share-kit';
      slot.className = 'profile-card rsk';
      profile.insertBefore(slot, profile.firstChild);
    }
    return slot;
  }
  const main = document.getElementById('main');
  if (main) {
    let slot = document.getElementById('radio-share-kit');
    if (!slot) {
      slot = document.createElement('section');
      slot.id = 'radio-share-kit';
      slot.className = 'section rsk';
      const wrap = document.createElement('div');
      wrap.className = 'wrap';
      slot.appendChild(wrap);
      main.prepend(slot);
      return wrap;
    }
    return slot.querySelector('.wrap') || slot;
  }
  return null;
}

async function callableTracks(profileId) {
  const call = httpsCallable(getFunctions(app, 'us-central1'), 'getWebsiteRadioTracks');
  const result = await call({ profileId });
  const tracks = result?.data?.tracks;
  return Array.isArray(tracks) ? tracks : [];
}

async function legacyTracks() {
  const existing = getApps().find(item => item.name === 'shareKitRadioRead');
  const radioApp = existing || initializeApp(RADIO_RTDB, 'shareKitRadioRead');
  const snap = await get(ref(getDatabase(radioApp), 'RadioTracks'));
  return tracksFromMap(snap.val() || {});
}

async function showForOwner(user) {
  const profileId = pageProfileId(user);
  if (!profileId || !user) return;
  let profile;
  try {
    const snap = await getDoc(doc(db, 'profiles', profileId));
    if (!snap.exists()) return;
    profile = snap.data() || {};
  } catch (error) {
    console.warn('Radio share kit could not read this profile', error);
    return;
  }
  if (!offerShareKit({ user, profileId, profile, songCount: 1 })) return;

  let callable = [];
  let library = [];
  if (profile.published === true) {
    try { callable = await callableTracks(profileId); } catch (error) {
      console.warn('Approved-song check is unavailable', error?.code || error?.message || error);
    }
  }
  let counted = songCountForProfile(profileId, { callableTracks: callable, libraryTracks: library });
  if (counted.songCount < 1) {
    try { library = await legacyTracks(); } catch (error) {
      console.warn('Legacy radio library check is unavailable', error?.code || error?.message || error);
    }
    counted = songCountForProfile(profileId, { callableTracks: callable, libraryTracks: library });
  }
  const { songCount, coverUrl } = counted;
  if (!offerShareKit({ user, profileId, profile, songCount })) return;

  const slot = slotFor(profileId);
  if (!slot || slot.dataset.rskReady === '1') return;
  const name = profile.displayName || profile.name || 'Our band';
  await mountShareKit(slot, {
    name,
    image: profileImageUrl(profile) || coverUrl,
    profileId,
    songCount,
    surface: 'owner'
  });
}

onAuthStateChanged(auth, user => {
  if (!user) {
    document.getElementById('radio-share-kit')?.remove();
    return;
  }
  showForOwner(user).catch(error => console.warn('Radio share kit skipped', error));
});
