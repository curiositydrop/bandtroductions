import { db } from './firebase-dev.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const params = new URLSearchParams(location.search);
const form = document.getElementById('discover-venue-form');
const input = document.getElementById('discover-venue-input');
const locationInput = document.getElementById('discover-venue-location');
const options = document.getElementById('discover-venue-options');
const status = document.getElementById('discover-venue-status');
const searchPanel = document.getElementById('discover-venue-search');
const selectedPanel = document.getElementById('discover-selected-venue');
const selectedName = document.getElementById('discover-selected-venue-name');
const selectedLocation = document.getElementById('discover-selected-venue-location');
const changeButton = document.getElementById('discover-change-venue');
let venues = [];
let venueLookup = new Map();
let pendingActId = clean(params.get('act'));

function clean(value) {
  return String(value || '').trim();
}

function normalized(value) {
  return clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function slug(value) {
  return normalized(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}

function venueRecord({ name, location = '', profileUrl = '', id = '' }) {
  let venueName = clean(name);
  let venueLocation = clean(location);
  let venueId = clean(id) || slug([venueName, venueLocation].filter(Boolean).join('-'));

  // Keep the active Champions campaign and the legacy directory card under one venue identity.
  if (/^champions sports bar$/i.test(venueName) && /biddeford/i.test(venueLocation)) {
    venueName = 'Champions Bar & Grill';
    venueLocation = venueLocation || 'Biddeford, ME';
    venueId = 'champions-bar-grill';
  }

  if (!venueName) return null;
  return {
    id: venueId || slug(venueName),
    name: venueName,
    location: venueLocation,
    profileUrl: clean(profileUrl),
    display: venueLocation ? `${venueName} — ${venueLocation}` : venueName
  };
}

function legacyVenuesFromHtml(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return [...parsed.querySelectorAll('#venueGrid .profile-card')].map(card => {
    const lines = [...card.querySelectorAll('p')].map(element => clean(element.textContent));
    const town = lines.find(line => /^(town|location)\s*:/i.test(line)) || '';
    const profileUrl = card.querySelector('a.button[href]')?.getAttribute('href') || '';
    return venueRecord({
      name: card.querySelector('h3')?.textContent,
      location: town.replace(/^(town|location)\s*:\s*/i, ''),
      profileUrl,
      id: profileUrl ? `legacy-${slug(profileUrl.replace(/\.html(?:[?#].*)?$/i, ''))}` : ''
    });
  }).filter(Boolean);
}

async function loadLegacyVenues() {
  const response = await fetch(`venues.html?selector=${Date.now()}`);
  if (!response.ok) throw new Error('Venue directory could not be loaded.');
  return legacyVenuesFromHtml(await response.text());
}

async function loadFirebaseVenues() {
  const snapshot = await getDocs(query(collection(db, 'profiles'), where('published', '==', true)));
  const found = [];
  snapshot.forEach(profileDocument => {
    const profile = profileDocument.data() || {};
    if (normalized(profile.accountType) !== 'venue') return;
    const record = venueRecord({
      id: `profile-${profileDocument.id}`,
      name: profile.displayName || profile.venueName || profile.name,
      location: profile.location,
      profileUrl: `profile.html?id=${encodeURIComponent(profileDocument.id)}`
    });
    if (record) found.push(record);
  });
  return found;
}

function combineVenues(groups) {
  const byIdentity = new Map();
  groups.flat().forEach(venue => {
    const key = venue.id === 'champions-bar-grill'
      ? venue.id
      : slug(`${venue.name}-${venue.location}`);
    const existing = byIdentity.get(key);
    if (!existing || venue.id.startsWith('profile-') || (!existing.profileUrl && venue.profileUrl)) byIdentity.set(key, venue);
  });
  return [...byIdentity.values()].sort((a, b) => a.display.localeCompare(b.display));
}

function rebuildLookup() {
  venueLookup = new Map();
  venues.forEach(venue => {
    venueLookup.set(normalized(venue.display), venue);
    const nameKey = normalized(venue.name);
    if (!venueLookup.has(nameKey)) venueLookup.set(nameKey, venue);
  });
}

function renderOptions() {
  options.replaceChildren();
  venues.forEach(venue => {
    const option = document.createElement('option');
    option.value = venue.display;
    options.appendChild(option);
  });
}

function matchedVenue() {
  return venueLookup.get(normalized(input.value)) || null;
}

function syncVenueInput() {
  const match = matchedVenue();
  if (match) {
    locationInput.value = match.location;
    locationInput.readOnly = true;
    locationInput.required = false;
    status.textContent = `Using ${match.name}${match.location ? ` in ${match.location}` : ''}.`;
  } else {
    locationInput.readOnly = false;
    locationInput.required = Boolean(clean(input.value));
    status.textContent = clean(input.value)
      ? 'New venue—add its town and state so we contact the right place.'
      : `${venues.length} venues available, or type a new one.`;
  }
}

function showSelectedVenue() {
  const venueName = clean(params.get('venue'));
  if (!venueName) return false;
  const venueLocation = clean(params.get('venueLocation'));
  selectedName.textContent = venueName;
  selectedLocation.textContent = venueLocation ? ` · ${venueLocation}` : '';
  selectedPanel.hidden = false;
  searchPanel.hidden = true;
  return true;
}

function submitVenue(event) {
  event.preventDefault();
  const typedName = clean(input.value);
  if (!typedName) return;
  const match = matchedVenue();
  const venue = match || venueRecord({ name: typedName, location: locationInput.value });
  if (!venue || (!match && !venue.location)) {
    locationInput.required = true;
    locationInput.focus();
    status.textContent = 'Add the town and state for this new venue.';
    return;
  }

  const next = new URLSearchParams();
  next.set('venue', venue.name);
  next.set('venueId', venue.id);
  if (venue.location) next.set('venueLocation', venue.location);
  if (venue.profileUrl) next.set('venueProfile', venue.profileUrl);
  next.set('source', 'general-discovery');
  if (pendingActId) next.set('act', pendingActId);
  location.href = `${location.pathname}?${next.toString()}`;
}

input.addEventListener('input', syncVenueInput);
input.addEventListener('change', syncVenueInput);
form.addEventListener('submit', submitVenue);
changeButton.addEventListener('click', () => {
  selectedPanel.hidden = true;
  searchPanel.hidden = false;
  input.value = clean(params.get('venue'));
  locationInput.value = clean(params.get('venueLocation'));
  syncVenueInput();
  input.focus();
});

window.addEventListener('bandtroductions:venue-video-opened', event => {
  pendingActId = clean(event.detail?.actId) || slug(event.detail?.profileUrl || event.detail?.artistName || event.detail?.videoId);
});

async function start() {
  const selected = showSelectedVenue();
  const results = await Promise.allSettled([loadLegacyVenues(), loadFirebaseVenues()]);
  venues = combineVenues(results.flatMap(result => result.status === 'fulfilled' ? result.value : []));
  rebuildLookup();
  renderOptions();
  if (!selected) syncVenueInput();
}

start().catch(error => {
  console.error('Venue choices could not be loaded:', error);
  status.textContent = 'Type a venue name and town/state to continue.';
});
