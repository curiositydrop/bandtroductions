import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

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

const claimEmailOverrides = {
  'burning-time.html': 'kris@krishype.com'
};

const status = document.getElementById('claim-status');
const summary = document.getElementById('claim-summary');
const controls = document.getElementById('claim-controls');
const claimButton = document.getElementById('claim-button');
const manualForm = document.getElementById('manual-claim-form');
const manualButton = document.getElementById('manual-claim-button');
const roleInput = document.getElementById('claim-role');
const proofInput = document.getElementById('claim-proof');
const returnTo = `${location.pathname.split('/').pop()}${location.search}`;

let currentUser = null;
let requiredEmail = '';
let legacySeed = {};
let preparationPromise = null;
let legacyPageLoaded = false;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function pageKey() {
  return legacyPage.split('/').pop().toLowerCase();
}

function absoluteUrl(value, baseUrl) {
  if (!value) return '';
  try { return new URL(value, baseUrl || location.href).href; } catch { return value; }
}

function firstText(root, selectors) {
  for (const selector of selectors) {
    const element = root.querySelector(selector);
    const text = element?.textContent?.replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return '';
}

function firstAttribute(root, selectors, attribute, baseUrl) {
  for (const selector of selectors) {
    const element = root.querySelector(selector);
    const value = element?.getAttribute(attribute);
    if (value) return absoluteUrl(value, baseUrl);
  }
  return '';
}

function cleanLabel(text = '') {
  return String(text)
    .replace(/^(genre|style|location|town|instrument|instruments|role|type|venue type|capacity|booking|email)\s*:\s*/i, '')
    .replace(/^📍\s*(based in)?\s*/i, '')
    .trim();
}

function findLabeledText(root, labels) {
  const candidates = [...root.querySelectorAll('p,li,div,span')];
  for (const element of candidates) {
    const text = element.textContent?.replace(/\s+/g, ' ').trim() || '';
    if (labels.some(label => text.toLowerCase().startsWith(label.toLowerCase()))) return cleanLabel(text);
  }
  return '';
}

function youtubeWatchUrl(src = '') {
  try {
    const url = new URL(src, location.href);
    if (url.hostname.includes('youtube.com') && url.pathname.includes('/embed/')) {
      const id = url.pathname.split('/embed/')[1]?.split('/')[0];
      return id ? `https://www.youtube.com/watch?v=${id}` : src;
    }
    if (url.hostname.includes('youtu.be')) return src;
    if (url.hostname.includes('youtube.com')) return src;
  } catch {}
  return src;
}

function collectMedia(documentRoot, baseUrl) {
  const frames = [...documentRoot.querySelectorAll('iframe[src]')];
  const dataVideos = [...documentRoot.querySelectorAll('[data-video]')]
    .map(element => absoluteUrl(element.getAttribute('data-video'), baseUrl));
  const videos = [
    ...frames.map(frame => youtubeWatchUrl(absoluteUrl(frame.getAttribute('src'), baseUrl))),
    ...dataVideos.map(youtubeWatchUrl)
  ].filter(url => /youtube\.com|youtu\.be|vimeo\.com/i.test(url));
  return [...new Set(videos)];
}

function collectLinks(documentRoot, baseUrl) {
  const links = {};
  [...documentRoot.querySelectorAll('a[href]')].forEach(anchor => {
    const href = absoluteUrl(anchor.getAttribute('href'), baseUrl);
    const label = anchor.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';
    if (!href || href.startsWith('mailto:')) return;
    if (!links.website && (/website|official site/.test(label))) links.website = href;
    if (!links.spotify && /spotify/.test(label)) links.spotify = href;
    if (!links.youtube && /youtube|watch/.test(label)) links.youtube = href;
    if (!links.instagram && /instagram/.test(label)) links.instagram = href;
    if (!links.facebook && /facebook/.test(label)) links.facebook = href;
  });
  return links;
}

function collectEmail(documentRoot) {
  const mailLinks = [...documentRoot.querySelectorAll('a[href^="mailto:"]')];
  const preferred = mailLinks.find(link => /booking|contact|email/i.test(link.textContent || '')) || mailLinks[0];
  return normalizeEmail(preferred?.getAttribute('href')?.replace(/^mailto:/i, '').split('?')[0] || '');
}

function directoryFallbackSeed() {
  const seed = {
    accountType,
    displayName: profileName,
    imageUrl,
    location: locationText,
    genre,
    instruments,
    venueType
  };
  Object.keys(seed).forEach(key => { if (!seed[key]) delete seed[key]; });
  return seed;
}

function extractLegacySeed(html, baseUrl) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const media = collectMedia(parsed, baseUrl);
  const links = collectLinks(parsed, baseUrl);
  const detailItems = [...parsed.querySelectorAll('#band-members-list li,.band-members li,.members li')]
    .map(item => item.textContent?.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const listMembers = detailItems
    .filter(text => !/^(genre|style|location|town|instrument|instruments|type|venue type|capacity)\s*:/i.test(text))
    .join('; ');

  const displayName = firstText(parsed, [
    '#band-name','#musician-name','#venue-name','.profile-action-card h1','.profile-header h1','.band-hero h1','main h1','h1'
  ]) || profileName;
  const bio = firstText(parsed, [
    '#band-bio','#musician-bio','#venue-bio','.profile-bio','.bio','.about-copy','.profile-details-card p','.band-info > p'
  ]);
  const image = firstAttribute(parsed, [
    '#band-avatar-image','#musician-avatar-image','#venue-avatar-image','.profile-avatar-card img','.profile-avatar img','.profile-image img','.band-media img','main img'
  ], 'src', baseUrl) || imageUrl;
  const banner = firstAttribute(parsed, [
    '#band-banner-image','#musician-banner-image','#venue-banner-image','.profile-banner-img','.profile-banner img','.banner img'
  ], 'src', baseUrl);
  const pageLocation = cleanLabel(firstText(parsed, [
    '#band-location-status','#musician-location-status','#venue-location-status','.profile-location','.location','.band-hero p'
  ]) || findLabeledText(parsed, ['Location:', 'Town:', 'Based in'])) || locationText;
  const pageGenre = cleanLabel(findLabeledText(parsed, ['Genre:', 'Style:'])) || genre;
  const pageInstruments = cleanLabel(findLabeledText(parsed, ['Instrument:', 'Instruments:', 'Role:'])) || instruments;
  const pageVenueType = cleanLabel(findLabeledText(parsed, ['Venue type:', 'Type:'])) || venueType;
  const yearFormed = cleanLabel(findLabeledText(parsed, ['Year formed:', 'Formed:']));
  const capacity = cleanLabel(findLabeledText(parsed, ['Capacity:']));
  const bookingEmail = collectEmail(parsed);

  const seed = {
    accountType,
    displayName,
    location: pageLocation,
    genre: pageGenre,
    instruments: pageInstruments,
    venueType: pageVenueType,
    imageUrl: image,
    bannerImageUrl: banner,
    bio,
    members: listMembers,
    yearFormed,
    capacity,
    bookingEmail,
    website: links.website || '',
    spotify: links.spotify || '',
    youtube: links.youtube || '',
    instagram: links.instagram || '',
    facebook: links.facebook || '',
    mediaLink: media[0] || '',
    featuredTitle: firstText(parsed, ['#featured-release-title','.profile-featured-video h2','.featured-video h2']) || '',
    additionalMedia: media.slice(1).map((url, index) => ({ title: `More Video ${index + 1}`, url })),
    mediaItems: media.slice(1).map((url, index) => ({ type: 'video', url, caption: `More Video ${index + 1}` }))
  };

  Object.keys(seed).forEach(key => {
    if (seed[key] === '' || (Array.isArray(seed[key]) && !seed[key].length)) delete seed[key];
  });

  return { seed, email: bookingEmail };
}

async function prepareLegacyProfile() {
  if (preparationPromise) return preparationPromise;
  preparationPromise = (async () => {
    const override = normalizeEmail(claimEmailOverrides[pageKey()]);
    requiredEmail = override || linkEmail;
    legacySeed = directoryFallbackSeed();
    legacyPageLoaded = false;

    try {
      const pageUrl = absoluteUrl(legacyPage, location.href);
      const response = await fetch(pageUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Legacy page returned ${response.status}`);
      const html = await response.text();
      const extracted = extractLegacySeed(html, pageUrl);
      legacySeed = { ...legacySeed, ...extracted.seed };
      legacyPageLoaded = true;
      if (!requiredEmail) requiredEmail = extracted.email;
    } catch (error) {
      console.warn('Legacy page could not be fully read; using directory information and verified review fallback:', error);
    }

    return { requiredEmail, legacySeed, legacyPageLoaded };
  })();
  return preparationPromise;
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
  meta.textContent = [accountType, locationText, genre || instruments || venueType].filter(Boolean).join(' • ');
  copy.append(title, meta);
  summary.appendChild(copy);
}

function showSignedOutPrompt(message = '') {
  const login = `login.html?returnTo=${encodeURIComponent(returnTo)}`;
  const signup = `signup.html?returnTo=${encodeURIComponent(returnTo)}`;
  const intro = message ? `${message}<br>` : '';
  status.innerHTML = `${intro}Please <a href="${signup}">create an account</a>, or <a href="${login}">log in</a> if you already have one.`;
}

function showManualClaim() {
  controls.hidden = true;
  if (!currentUser) {
    manualForm.hidden = true;
    showSignedOutPrompt('This profile needs a quick ownership review before it can be transferred.');
    return;
  }
  status.innerHTML = `<strong>We found the profile.</strong><br>${legacyPageLoaded ? 'Its ownership email is not available in a usable format.' : 'The older profile page is incomplete or unavailable.'} Submit the verification request below and it will appear in the BANDtroductions admin queue.`;
  manualForm.hidden = false;
}

function buildProfileData() {
  const seed = legacySeed || {};
  return {
    ...seed,
    accountType: seed.accountType || accountType,
    displayName: seed.displayName || profileName,
    imageUrl: seed.imageUrl || imageUrl,
    location: seed.location || locationText,
    genre: seed.genre || genre,
    instruments: seed.instruments || instruments,
    venueType: seed.venueType || venueType,
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
}

buildSummary();

onAuthStateChanged(auth, async user => {
  currentUser = user;
  controls.hidden = true;
  manualForm.hidden = true;
  if (!legacyPage || !profileName || !['band', 'musician', 'venue'].includes(accountType)) {
    status.textContent = 'This claim link is missing required profile information.';
    return;
  }

  status.textContent = 'Checking the existing profile…';
  await prepareLegacyProfile();

  if (!requiredEmail) {
    showManualClaim();
    return;
  }
  if (!user) {
    showSignedOutPrompt('Use the same email address already associated with this profile.');
    return;
  }
  const signedInEmail = normalizeEmail(user.email);
  if (signedInEmail !== requiredEmail) {
    status.innerHTML = `You are logged in as <strong>${user.email || 'an account without an email'}</strong>, but that email does not match the email associated with <strong>${profileName}</strong>. Log out and use the correct account. If the old contact email is no longer accessible, contact BANDtroductions for a verified manual transfer.`;
    return;
  }
  status.innerHTML = `<strong>We found you!</strong><br>Your account matches the existing <strong>${profileName}</strong> profile. Click <strong>Finalize Claim</strong> to connect it.`;
  controls.hidden = false;
});

claimButton.addEventListener('click', async () => {
  if (!currentUser) return;
  await prepareLegacyProfile();
  if (!requiredEmail || normalizeEmail(currentUser.email) !== requiredEmail) {
    status.textContent = 'Your account email does not match the email associated with this profile.';
    return;
  }
  claimButton.disabled = true;
  status.textContent = 'Connecting the existing profile to your account…';
  try {
    const profileData = buildProfileData();
    await setDoc(doc(db, 'profiles', currentUser.uid), profileData);
    await setDoc(doc(db, 'users', currentUser.uid), {
      accountType: profileData.accountType,
      displayName: profileData.displayName,
      activeProfileId: currentUser.uid,
      profileComplete: true,
      claimedLegacyProfile: true,
      updatedAt: serverTimestamp()
    }, { merge: true });
    controls.hidden = true;
    status.innerHTML = `<strong>Profile claimed!</strong><br>${profileData.displayName} is now connected to your account. Loading your profile…`;
    setTimeout(() => { window.location.href = `profile.html?id=${encodeURIComponent(currentUser.uid)}`; }, 800);
  } catch (error) {
    console.error('Profile claim failed:', error);
    const code = error?.code ? ` (${error.code})` : '';
    status.textContent = `The profile could not be connected${code}. Please try again.`;
    claimButton.disabled = false;
  }
});

manualForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser) {
    showSignedOutPrompt('Log in before submitting an ownership request.');
    return;
  }
  const role = roleInput.value.trim();
  const proof = proofInput.value.trim();
  if (!role || !proof) return;

  manualButton.disabled = true;
  status.textContent = 'Submitting your ownership request…';
  try {
    await prepareLegacyProfile();
    await addDoc(collection(db, 'profileClaims'), {
      claimantId: currentUser.uid,
      claimantEmail: currentUser.email || '',
      profileName,
      accountType,
      legacyPage,
      imageUrl: legacySeed.imageUrl || imageUrl,
      location: legacySeed.location || locationText,
      genre: legacySeed.genre || genre,
      instruments: legacySeed.instruments || instruments,
      venueType: legacySeed.venueType || venueType,
      legacySeed,
      role,
      proof,
      status: 'pending',
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    manualForm.hidden = true;
    status.innerHTML = `<strong>Claim submitted.</strong><br>Your request is waiting for BANDtroductions review. The existing profile has not been changed.`;
  } catch (error) {
    console.error('Manual profile claim failed:', error);
    const code = error?.code ? ` (${error.code})` : '';
    status.textContent = `The request could not be submitted${code}. Please try again.`;
    manualButton.disabled = false;
  }
});