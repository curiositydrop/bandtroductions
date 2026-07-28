import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const BAND_ID = 'burning-time';
const AUTHORIZED_EMAILS = ['kris@krishype.com', 'newleafpaintingcompany@gmail.com'];

const byId = (id) => document.getElementById(id);
const setText = (id, value) => {
  const element = byId(id);
  if (element && value) element.textContent = value;
};

function youtubeEmbed(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    let id = '';
    if (parsed.hostname.includes('youtu.be')) id = parsed.pathname.slice(1);
    if (parsed.hostname.includes('youtube.com')) id = parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop();
    return id ? `https://www.youtube.com/embed/${id}` : url;
  } catch {
    return url;
  }
}

function renderLinks(data) {
  const list = byId('band-profile-links');
  if (!list) return;
  const links = [
    ['Spotify', data.spotify],
    ['YouTube', data.youtube],
    ['Instagram', data.instagram],
    ['Facebook', data.facebook],
    ['Website', data.website]
  ].filter(([, url]) => Boolean(url));
  if (!links.length) return;
  list.replaceChildren(...links.map(([label, url]) => {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    anchor.textContent = label;
    return anchor;
  }));
}

function renderMembers(rawMembers) {
  if (!rawMembers) return;
  const list = byId('band-members-list');
  if (!list) return;
  const members = Array.isArray(rawMembers)
    ? rawMembers
    : String(rawMembers).split(/\n+/).map((member) => member.trim()).filter(Boolean);
  if (!members.length) return;
  list.replaceChildren(...members.map((member) => {
    const item = document.createElement('li');
    item.textContent = member;
    return item;
  }));
}

function renderProfile(data) {
  if (!data) return;
  const banner = byId('band-banner-image');
  const avatar = byId('band-avatar-image');
  if (banner && data.bannerImageUrl) banner.src = data.bannerImageUrl;
  if (avatar && data.imageUrl) avatar.src = data.imageUrl;

  setText('band-name', data.displayName);
  setText('band-meta', [data.genre, data.location].filter(Boolean).join(' • '));
  setText('band-bio', data.bio);
  setText('band-status', data.status);
  setText('band-location-status', data.location ? `📍 Based in ${data.location}` : '');
  setText('featured-release-title', data.featuredTitle);
  setText('featured-release-copy', data.featuredCopy);
  setText('booking-copy', data.bookingCopy);

  const featuredFrame = byId('featured-release-frame');
  if (featuredFrame && data.featuredVideoUrl) featuredFrame.src = youtubeEmbed(data.featuredVideoUrl);

  const bookingLink = byId('band-booking-email');
  if (bookingLink && data.bookingEmail) {
    bookingLink.href = `mailto:${data.bookingEmail}`;
    bookingLink.textContent = `Email ${data.displayName || 'Band'}`;
  }

  renderMembers(data.members);
  renderLinks(data);
}

function showEditButton() {
  const row = document.querySelector('.profile-action-row');
  if (!row || byId('edit-band-profile')) return;
  const link = document.createElement('a');
  link.id = 'edit-band-profile';
  link.className = 'profile-action support-action';
  link.href = 'edit-band-profile.html?band=burning-time';
  link.textContent = 'Edit Band Profile';
  row.appendChild(link);
}

async function initialize(user) {
  const email = String(user?.email || '').toLowerCase();
  const authorizedByEmail = AUTHORIZED_EMAILS.includes(email);

  if (user && authorizedByEmail) showEditButton();

  try {
    const snapshot = await getDoc(doc(db, 'bandProfiles', BAND_ID));
    const data = snapshot.exists() ? snapshot.data() : null;
    if (data) renderProfile(data);

    if (user && data?.ownerId === user.uid) showEditButton();
  } catch (error) {
    console.error('Could not load editable Burning Time profile:', error);
  }
}

onAuthStateChanged(auth, initialize);
