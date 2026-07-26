import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const params = new URLSearchParams(location.search);
const legacyPage = params.get('page') || '';
const profileName = params.get('name') || 'Existing Profile';
const accountType = (params.get('type') || '').toLowerCase();
const imageUrl = params.get('image') || '';
const locationText = params.get('location') || '';
const genre = params.get('genre') || '';
const instruments = params.get('instruments') || '';
const venueType = params.get('venueType') || '';
const linkEmail = normalizeEmail(params.get('email') || '');

const legacyClaimEmailOverrides = {
  'burning-time.html': 'bandtroductions@gmail.com'
};

const status = document.getElementById('claim-status');
const summary = document.getElementById('claim-summary');
const controls = document.getElementById('claim-controls');
const claimButton = document.getElementById('claim-button');
const returnTo = `${location.pathname.split('/').pop()}${location.search}`;

let currentUser = null;
let matchedProfileDoc = null;
let requiredEmail = '';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function buildSummary() {
  summary.replaceChildren();

  if (imageUrl) {
    const image = document.createElement('img');
    image.className = 'claim-image';
    image.src = imageUrl;
    image.alt = `${profileName} profile image`;
    summary.appendChild(image);
  }

  const copy = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = profileName;

  const meta = document.createElement('p');
  meta.className = 'approval-meta';
  meta.textContent = [accountType, locationText, genre || instruments || venueType]
    .filter(Boolean)
    .join(' • ');

  copy.append(title, meta);
  summary.appendChild(copy);
}

function legacyProfileId(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `legacy-${accountType}-${(hash >>> 0).toString(36)}`;
}

async function findLegacyProfileDoc() {
  const snapshot = await getDocs(
    query(collection(db, 'profiles'), where('legacyPage', '==', legacyPage))
  );
  return snapshot.empty ? null : snapshot.docs[0];
}

function getRequiredEmail(profileData = {}) {
  const pageKey = legacyPage.split('/').pop().toLowerCase();
  return normalizeEmail(
    legacyClaimEmailOverrides[pageKey] ||
    profileData.claimEmail ||
    profileData.legacyEmail ||
    profileData.contactEmail ||
    profileData.email ||
    linkEmail
  );
}

function openProfile(profileId) {
  window.location.href = `profile.html?id=${encodeURIComponent(profileId)}`;
}

function showSignedOutPrompt() {
  const login = `login.html?returnTo=${encodeURIComponent(returnTo)}`;
  const signup = `signup.html?returnTo=${encodeURIComponent(returnTo)}`;
  status.innerHTML = `Please <a href="${signup}">create an account</a> using the email address associated with this profile, or <a href="${login}">log in</a> if you already have one. You will return here automatically afterward.`;
}

buildSummary();

onAuthStateChanged(auth, async user => {
  currentUser = user;
  controls.hidden = true;

  if (!legacyPage || !profileName || !['band', 'musician', 'venue'].includes(accountType)) {
    status.textContent = 'This claim link is missing required profile information.';
    return;
  }

  if (!user) {
    showSignedOutPrompt();
    return;
  }

  try {
    matchedProfileDoc = await findLegacyProfileDoc();
    const existingProfile = matchedProfileDoc?.data() || {};
    requiredEmail = getRequiredEmail(existingProfile);

    if (existingProfile.ownerId === user.uid) {
      status.innerHTML = 'This profile is already connected to your account.';
      setTimeout(() => openProfile(matchedProfileDoc.id), 500);
      return;
    }

    if (existingProfile.ownerId && existingProfile.ownerId !== user.uid) {
      status.textContent = 'This profile has already been claimed. Contact BANDtroductions if ownership needs to be corrected.';
      return;
    }

    if (!requiredEmail) {
      status.textContent = 'This legacy profile does not yet have a claim email assigned. Contact BANDtroductions so the profile can be prepared for claiming.';
      return;
    }

    const signedInEmail = normalizeEmail(user.email);
    if (signedInEmail !== requiredEmail) {
      status.innerHTML = `You are logged in as <strong>${user.email || 'an account without an email'}</strong>, but that email does not match the one associated with <strong>${profileName}</strong>. Log out, then create or use the account with the profile's existing email address.`;
      return;
    }

    status.innerHTML = `<strong>We found you!</strong><br>Your account email matches the existing <strong>${profileName}</strong> profile. Click <strong>Finalize Claim</strong> to connect it to your account.`;
    controls.hidden = false;
  } catch (error) {
    console.error('Could not check profile ownership:', error);
    status.textContent = 'This profile could not be checked right now. Please try again.';
  }
});

claimButton.addEventListener('click', async () => {
  if (!currentUser) return;

  claimButton.disabled = true;
  status.textContent = 'Connecting the existing profile to your account…';

  try {
    matchedProfileDoc = await findLegacyProfileDoc();
    const existingProfile = matchedProfileDoc?.data() || {};
    requiredEmail = getRequiredEmail(existingProfile);

    if (existingProfile.ownerId && existingProfile.ownerId !== currentUser.uid) {
      throw new Error('This profile has already been claimed.');
    }

    if (!requiredEmail || normalizeEmail(currentUser.email) !== requiredEmail) {
      throw new Error('Your account email no longer matches the email associated with this profile.');
    }

    const profileRef = matchedProfileDoc
      ? matchedProfileDoc.ref
      : doc(db, 'profiles', legacyProfileId(legacyPage));

    const ownershipData = {
      ownerId: currentUser.uid,
      legacyPage,
      claimEmail: requiredEmail,
      claimedLegacyProfile: true,
      claimMethod: 'matching-account-email',
      claimedByEmail: currentUser.email || '',
      claimedAt: serverTimestamp(),
      approvalStatus: 'approved',
      published: true,
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    if (!matchedProfileDoc) {
      Object.assign(ownershipData, {
        accountType,
        displayName: profileName,
        imageUrl,
        location: locationText,
        genre,
        instruments,
        venueType
      });
    }

    await setDoc(profileRef, ownershipData, { merge: true });

    await setDoc(doc(db, 'users', currentUser.uid), {
      activeProfileId: profileRef.id,
      claimedLegacyProfile: true,
      updatedAt: serverTimestamp()
    }, { merge: true });

    controls.hidden = true;
    status.innerHTML = `<strong>Profile claimed!</strong><br>${profileName} is now connected to your account. Loading your profile…`;
    setTimeout(() => openProfile(profileRef.id), 900);
  } catch (error) {
    console.error('Profile claim failed:', error);
    status.textContent = error.message || 'The profile could not be connected to your account.';
    claimButton.disabled = false;
  }
});
