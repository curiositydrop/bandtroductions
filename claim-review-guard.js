import { auth, db } from './firebase-dev.js';
import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const params = new URLSearchParams(location.search);
const legacyPage = params.get('page') || '';
const profileName = params.get('name') || 'Existing Profile';
const accountType = (params.get('type') || '').toLowerCase();
const imageUrl = params.get('image') || '';
const locationText = params.get('location') || '';
const genre = params.get('genre') || '';
const instruments = params.get('instruments') || '';
const venueType = params.get('venueType') || '';
const button = document.getElementById('claim-button');
const controls = document.getElementById('claim-controls');
const status = document.getElementById('claim-status');

function absoluteUrl(value, baseUrl = location.href) {
  if (!value) return '';
  try { return new URL(value, baseUrl).href; } catch { return value; }
}

function firstText(root, selectors) {
  for (const selector of selectors) {
    const value = root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
    if (value) return value;
  }
  return '';
}

function firstImage(root, selectors, baseUrl) {
  for (const selector of selectors) {
    const value = root.querySelector(selector)?.getAttribute('src');
    if (value) return absoluteUrl(value, baseUrl);
  }
  return '';
}

function labeledText(root, labels) {
  for (const element of root.querySelectorAll('p,li,div,span')) {
    const text = element.textContent?.replace(/\s+/g, ' ').trim() || '';
    if (labels.some(label => text.toLowerCase().startsWith(label.toLowerCase()))) {
      return text.replace(/^[^:]+:\s*/, '').trim();
    }
  }
  return '';
}

function youtubeUrl(src = '') {
  try {
    const url = new URL(src, location.href);
    if (url.hostname.includes('youtube.com') && url.pathname.includes('/embed/')) {
      const id = url.pathname.split('/embed/')[1]?.split('/')[0];
      return id ? `https://www.youtube.com/watch?v=${id}` : src;
    }
  } catch {}
  return src;
}

async function buildLegacySeed() {
  const seed = {
    accountType,
    displayName: profileName,
    imageUrl,
    location: locationText,
    genre,
    instruments,
    venueType
  };

  try {
    const pageUrl = absoluteUrl(legacyPage);
    const response = await fetch(pageUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Legacy page returned ${response.status}`);
    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
    const media = [...parsed.querySelectorAll('iframe[src],[data-video]')]
      .map(element => youtubeUrl(absoluteUrl(element.getAttribute('src') || element.getAttribute('data-video'), pageUrl)))
      .filter(url => /youtube\.com|youtu\.be|vimeo\.com/i.test(url));
    const mailto = parsed.querySelector('a[href^="mailto:"]')?.getAttribute('href')?.replace(/^mailto:/i, '').split('?')[0] || '';

    Object.assign(seed, {
      displayName: firstText(parsed, ['.profile-action-card h1','.profile-header h1','main h1','h1']) || profileName,
      bio: firstText(parsed, ['.profile-details-card p','.profile-bio','.bio','.about-copy']) || '',
      imageUrl: firstImage(parsed, ['.profile-avatar-card img','.profile-avatar img','.profile-image img','main img'], pageUrl) || imageUrl,
      bannerImageUrl: firstImage(parsed, ['.profile-banner-img','.profile-banner img','.banner img'], pageUrl) || '',
      location: labeledText(parsed, ['Location:','Town:','Based in']) || locationText,
      genre: labeledText(parsed, ['Genre:','Style:']) || genre,
      instruments: labeledText(parsed, ['Instrument:','Instruments:','Role:']) || instruments,
      venueType: labeledText(parsed, ['Venue type:','Type:']) || venueType,
      bookingEmail: mailto,
      mediaLink: media[0] || '',
      additionalMedia: media.slice(1).map((url, index) => ({ title: `More Video ${index + 1}`, url })),
      mediaItems: media.slice(1).map((url, index) => ({ type: 'video', url, caption: `More Video ${index + 1}` }))
    });
  } catch (error) {
    console.warn('Could not fully read the legacy profile for the claim queue:', error);
  }

  Object.keys(seed).forEach(key => {
    if (seed[key] === '' || (Array.isArray(seed[key]) && !seed[key].length)) delete seed[key];
  });
  return seed;
}

async function hasPendingClaim(userId) {
  const snapshot = await getDocs(query(
    collection(db, 'profileClaims'),
    where('claimantId', '==', userId),
    where('legacyPage', '==', legacyPage),
    where('status', '==', 'pending')
  ));
  return !snapshot.empty;
}

button?.addEventListener('click', async event => {
  event.preventDefault();
  event.stopImmediatePropagation();

  const user = auth.currentUser;
  if (!user) return;

  button.disabled = true;
  status.textContent = 'Submitting your verified ownership claim for approval…';

  try {
    if (await hasPendingClaim(user.uid)) {
      controls.hidden = true;
      status.innerHTML = '<strong>Claim already submitted.</strong><br>Your ownership request is waiting in the BANDtroductions Admin queue.';
      return;
    }

    const legacySeed = await buildLegacySeed();
    await addDoc(collection(db, 'profileClaims'), {
      claimantId: user.uid,
      claimantEmail: user.email || '',
      profileName,
      accountType,
      legacyPage,
      imageUrl: legacySeed.imageUrl || imageUrl,
      location: legacySeed.location || locationText,
      genre: legacySeed.genre || genre,
      instruments: legacySeed.instruments || instruments,
      venueType: legacySeed.venueType || venueType,
      legacySeed,
      role: 'Email-matched legacy profile owner',
      proof: 'The signed-in account email matches the contact email stored on the legacy profile.',
      verificationMethod: 'matching-account-email',
      status: 'pending',
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    controls.hidden = true;
    status.innerHTML = '<strong>Claim submitted.</strong><br>Your verified ownership request is now waiting in the BANDtroductions Admin queue. The profile will transfer only after approval.';
  } catch (error) {
    console.error('Verified legacy claim submission failed:', error);
    status.textContent = 'The ownership request could not be submitted. Please try again.';
    button.disabled = false;
  }
}, true);
