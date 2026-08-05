import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const profileId = new URLSearchParams(location.search).get('id');
const content = document.getElementById('profile-content');
const status = document.getElementById('profile-status');
const editButton = document.getElementById('edit-profile');
const shareButton = document.getElementById('share-profile');
const sharePanel = document.getElementById('share-panel');
const shareStatus = document.getElementById('share-status');
let loadedProfile = null;
let signedInUser = null;
let signedInProfile = null;

const burningTimeMedia = {
  featuredTitle: 'Featured Release: “Hard to Follow”',
  mediaLink: 'https://www.youtube.com/watch?v=RyAK3AAX49g',
  additionalMedia: [
    { title: 'Burning Time — More Video', url: 'https://www.youtube.com/watch?v=o_a3zRmXjf0' },
    { title: 'Burning Time — More Video', url: 'https://www.youtube.com/watch?v=mAAIqAtM9lU' },
    { title: 'Burning Time — More Video', url: 'https://www.youtube.com/watch?v=Es5BP4jGlcc' },
    { title: 'Burning Time — More Video', url: 'https://www.youtube.com/watch?v=hg3FNy3xgGo' }
  ]
};

const layouts = {
  band: { kicker:'BAND PROFILE', about:'About the Band', snapshot:'Band Status & Information', links:'Links & Booking', details:[['genre','Genre'],['yearFormed','Year formed'],['members','Members'],['bookingEmail','Booking email']], badges:['genre','location'] },
  musician: { kicker:'MUSICIAN PROFILE', about:'About the Musician', snapshot:'Musician Status & Information', links:'Links & Contact', details:[['instruments','Instrument(s) / Role'],['experience','Experience'],['lookingForBand','Availability']], badges:['instruments','location'] },
  venue: { kicker:'VENUE PROFILE', about:'About the Venue', snapshot:'Venue Status & Information', links:'Links & Booking', details:[['venueType','Venue type'],['capacity','Capacity'],['venueBooking','Booking information']], badges:['venueType','location'] },
  fan: { kicker:'SCENE SUPPORTER', about:'About This Music Fan', snapshot:'Music Profile', links:'Links', details:[['favoriteGenres','Favorite genres'],['fanInterests','What they’re here for']], badges:[] }
};

function initialsFor(name) {
  return (name || '').trim().split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0]).join('').toUpperCase() || 'BT';
}

function preloadImage(url) {
  return new Promise(resolve => {
    if (!url) { resolve(); return; }
    const image = new Image();
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    image.onload = done;
    image.onerror = done;
    image.src = url;
    if (image.complete) done();
    setTimeout(done, 2200);
  });
}

function youtubeEmbedUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url, location.href);
    if (parsed.hostname.includes('youtu.be')) return `https://www.youtube.com/embed/${parsed.pathname.split('/').filter(Boolean)[0] || ''}`;
    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop();
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }
  } catch (_) {}
  return '';
}

function addBadge(value) {
  if (!value) return;
  const el = document.createElement('span');
  el.className = 'profile-badge';
  el.textContent = value;
  document.getElementById('profile-badges').appendChild(el);
}

function addDetail(label, value) {
  if (!value) return false;
  const el = document.createElement('div');
  el.className = 'profile-detail';
  const strong = document.createElement('strong');
  const span = document.createElement('span');
  strong.textContent = label;
  span.textContent = value;
  el.append(strong, span);
  document.getElementById('profile-details').appendChild(el);
  return true;
}

function addLink(label, url) {
  if (!url) return false;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.className = 'auth-button';
  a.textContent = label;
  document.getElementById('profile-links').appendChild(a);
  return true;
}

function renderVideo(container, url, title) {
  const embed = youtubeEmbedUrl(url);
  if (!embed) return false;
  const wrap = document.createElement('div');
  wrap.className = 'video-card';
  const frameWrap = document.createElement('div');
  frameWrap.className = 'video-embed';
  const iframe = document.createElement('iframe');
  iframe.src = embed;
  iframe.title = title || 'Embedded video';
  iframe.loading = 'lazy';
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.allowFullscreen = true;
  frameWrap.appendChild(iframe);
  wrap.appendChild(frameWrap);
  if (title) {
    const p = document.createElement('p');
    p.textContent = title;
    wrap.appendChild(p);
  }
  container.appendChild(wrap);
  return true;
}

async function loadProfile(user) {
  signedInUser = user;
  editButton.hidden = true;
  if (!profileId) {
    status.textContent = 'No profile was selected.';
    return;
  }

  try {
    const snap = await getDoc(doc(db, 'profiles', profileId));
    if (!snap.exists() || snap.data().published !== true) {
      status.textContent = 'This profile is not available.';
      return;
    }

    loadedProfile = snap.data();
    if (loadedProfile.legacyPage === 'burning-time.html') {
      loadedProfile = {
        ...burningTimeMedia,
        ...loadedProfile,
        additionalMedia: Array.isArray(loadedProfile.additionalMedia) && loadedProfile.additionalMedia.length
          ? loadedProfile.additionalMedia
          : burningTimeMedia.additionalMedia
      };
    }

    const banner = loadedProfile.bannerImageUrl || loadedProfile.coverImageUrl || '';
    const avatarUrl = loadedProfile.imageUrl || loadedProfile.avatarUrl || loadedProfile.photoURL || '';
    await Promise.all([preloadImage(banner), preloadImage(avatarUrl)]);

    const type = loadedProfile.accountType || 'fan';
    const layout = layouts[type] || layouts.fan;
    document.body.classList.toggle('fan-profile', type === 'fan');
    document.title = `${loadedProfile.displayName || 'Profile'} | BANDtroductions`;
    document.getElementById('profile-name').textContent = loadedProfile.displayName || 'BANDtroductions Member';
    document.getElementById('profile-type').textContent = layout.kicker;
    document.getElementById('profile-location').textContent = loadedProfile.location || '';
    document.getElementById('profile-bio').textContent = loadedProfile.bio || 'No bio has been added yet.';
    document.getElementById('about-heading').textContent = layout.about;
    document.getElementById('snapshot-heading').textContent = layout.snapshot;
    document.getElementById('links-heading').textContent = layout.links;
    document.getElementById('profile-support').hidden = type === 'fan';

    const cover = document.getElementById('profile-cover');
    cover.style.backgroundImage = banner
      ? `linear-gradient(to bottom,rgba(0,0,0,.05),rgba(0,0,0,.26)),url("${banner.replace(/"/g,'\\"')}")`
      : '';

    const avatar = document.getElementById('profile-avatar');
    avatar.replaceChildren();
    if (avatarUrl) {
      const img = document.createElement('img');
      img.src = avatarUrl;
      img.alt = `${loadedProfile.displayName || 'Member'} profile image`;
      img.addEventListener('error', () => { avatar.textContent = initialsFor(loadedProfile.displayName); });
      avatar.appendChild(img);
    } else {
      avatar.textContent = initialsFor(loadedProfile.displayName);
    }

    layout.badges.forEach(key => addBadge(loadedProfile[key]));
    let detailCount = 0;
    layout.details.forEach(([key,label]) => { if (addDetail(label, loadedProfile[key])) detailCount += 1; });
    document.getElementById('empty-details').hidden = detailCount > 0;

    const featuredContainer = document.getElementById('featured-video');
    if (renderVideo(featuredContainer, loadedProfile.mediaLink, loadedProfile.featuredTitle || `${loadedProfile.displayName} — Featured Video`)) {
      document.getElementById('featured-section').hidden = false;
      document.getElementById('featured-heading').textContent = loadedProfile.featuredTitle || 'Featured Music / Video';
    }

    const additional = Array.isArray(loadedProfile.additionalMedia) ? loadedProfile.additionalMedia : [];
    if (additional.length) {
      const grid = document.getElementById('more-video-grid');
      additional.forEach((item, index) => {
        const url = typeof item === 'string' ? item : item.url;
        const title = typeof item === 'string' ? `More Video ${index + 1}` : (item.title || `More Video ${index + 1}`);
        renderVideo(grid, url, title);
      });
      document.getElementById('more-videos-section').hidden = false;
    }

    let linkCount = 0;
    if (addLink('Visit Website', loadedProfile.website)) linkCount += 1;
    if (loadedProfile.bookingEmail && addLink('Email Booking', `mailto:${loadedProfile.bookingEmail}`)) linkCount += 1;
    document.getElementById('empty-links').hidden = linkCount > 0;

    if (user) {
      const profileSnap = await getDoc(doc(db, 'profiles', user.uid));
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      signedInProfile = profileSnap.exists() ? profileSnap.data() : (userSnap.exists() ? userSnap.data() : {});
      shareButton.hidden = false;
      editButton.hidden = loadedProfile.ownerId !== user.uid;
    }

    content.dataset.assetsReady = 'true';
    status.hidden = true;
    content.hidden = false;
  } catch (error) {
    console.error(error);
    status.textContent = 'We could not load this profile.';
  }
}

shareButton.addEventListener('click', () => {
  sharePanel.hidden = false;
  document.getElementById('share-message').focus();
});
document.getElementById('cancel-share').addEventListener('click', () => {
  sharePanel.hidden = true;
  shareStatus.textContent = '';
});
document.getElementById('confirm-share').addEventListener('click', async () => {
  if (!signedInUser || !signedInProfile || !loadedProfile) return;
  const button = document.getElementById('confirm-share');
  const message = document.getElementById('share-message').value.trim();
  button.disabled = true;
  shareStatus.textContent = 'Sharing profile…';
  try {
    await addDoc(collection(db, 'posts'), {
      authorId: signedInUser.uid,
      authorName: signedInProfile.displayName || signedInUser.displayName || 'BANDtroductions Member',
      accountType: signedInProfile.accountType || 'member',
      category: 'shared-profile',
      content: message || `Check out ${loadedProfile.displayName || 'this profile'} on BANDtroductions.`,
      linkUrl: `${location.origin}${location.pathname}?id=${encodeURIComponent(profileId)}`,
      published: true,
      createdAt: serverTimestamp()
    });
    shareStatus.textContent = 'Shared to the community.';
    document.getElementById('share-message').value = '';
  } catch (error) {
    console.error(error);
    shareStatus.textContent = 'The profile could not be shared right now.';
  } finally {
    button.disabled = false;
  }
});

onAuthStateChanged(auth, loadProfile);
