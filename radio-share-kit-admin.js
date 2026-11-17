// Read-only Radio Control Room panel. Uses the same approved-song reads the
// playlist studio already uses. It never writes schedules, songs, or ads.
import { auth, db as socialDb } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, doc, getDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getDatabase, ref, onValue } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { isAdminAccount } from './admin-access.js';
import { mountShareKit } from './radio-share-kit.js';
import {
  groupApprovedBands,
  profileImageUrl,
  tracksFromMap
} from './radio-share-kit-core.mjs';

const RADIO_RTDB = {
  apiKey: 'AIzaSyApLiiJsKTw1Fp8J3aQatMqiSZoP_6EycE',
  authDomain: 'bandfanwall.firebaseapp.com',
  databaseURL: 'https://bandfanwall-default-rtdb.firebaseio.com',
  projectId: 'bandfanwall'
};

const stops = [];
const profiles = new Map();
let firestoreTracks = {};
let legacyTracks = {};
let panel = null;
let selectedKey = '';
let renderSerial = 0;

function radioApp() {
  return getApps().find(item => item.name === 'shareKitRadioRead') || initializeApp(RADIO_RTDB, 'shareKitRadioRead');
}

function knownProfile(profileId) {
  const value = profiles.get(profileId);
  if (!value || typeof value.then === 'function') return null;
  return value;
}

function bands() {
  const library = [
    ...tracksFromMap(firestoreTracks),
    ...tracksFromMap(legacyTracks)
  ];
  return groupApprovedBands(library).map(band => {
    const known = knownProfile(band.profileId);
    return {
      ...band,
      name: known?.name || band.artist || band.profileId || band.path.replace('.html', '').replace(/-/g, ' '),
      image: known?.image || band.coverUrl || ''
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function rememberProfile(profileId) {
  if (!profileId) return Promise.resolve();
  const existing = profiles.get(profileId);
  if (existing && typeof existing.then === 'function') return existing;
  if (existing) return Promise.resolve(existing);
  const pending = getDoc(doc(socialDb, 'profiles', profileId)).then(snap => {
    const data = snap.exists() ? snap.data() : {};
    const value = {
      name: data.displayName || data.name || '',
      image: profileImageUrl(data)
    };
    profiles.set(profileId, value);
    return value;
  }).catch(error => {
    console.warn('Share kit profile name unavailable', error?.code || error?.message || error);
    const value = { name: '', image: '' };
    profiles.set(profileId, value);
    return value;
  });
  profiles.set(profileId, pending);
  return pending;
}

function ensurePanel() {
  const room = document.getElementById('crr');
  if (!room) return null;
  let section = document.getElementById('radio-share-kit-admin');
  if (section) return section;
  section = document.createElement('section');
  section.id = 'radio-share-kit-admin';
  section.className = 'crr-panel';
  section.innerHTML = `<div class="crr-head"><div><h3>Radio Share Kit</h3><div class="crr-muted">Read-only. Bands with at least one approved song can hand fans a profile link. This does not change playlists, approvals, or ads.</div></div></div><div class="rsk-admin-tools" style="display:grid;gap:8px;margin-top:10px"><input id="rsk-admin-search" type="search" placeholder="Find a band" aria-label="Find a band"><select id="rsk-admin-band" aria-label="Band with approved radio songs"></select><div id="rsk-admin-card"></div><p id="rsk-admin-empty" class="crr-empty" hidden>No bands with an approved radio song yet.</p></div>`;
  room.prepend(section);
  const refresh = () => { render().catch(error => console.warn('Radio share kit could not render', error)); };
  section.querySelector('#rsk-admin-search').addEventListener('input', refresh);
  section.querySelector('#rsk-admin-band').addEventListener('change', event => {
    selectedKey = event.target.value;
    refresh();
  });
  return section;
}

async function render() {
  const serial = ++renderSerial;
  panel = ensurePanel();
  if (!panel) return;
  const list = bands();
  await Promise.all(list.map(band => rememberProfile(band.profileId)));
  if (serial !== renderSerial) return;
  const named = bands();
  const query = (panel.querySelector('#rsk-admin-search')?.value || '').trim().toLowerCase();
  const visible = named.filter(band => !query || `${band.name} ${band.artist} ${band.profileId}`.toLowerCase().includes(query));
  const select = panel.querySelector('#rsk-admin-band');
  const empty = panel.querySelector('#rsk-admin-empty');
  const card = panel.querySelector('#rsk-admin-card');
  select.replaceChildren();
  if (!visible.length) {
    empty.hidden = false;
    empty.textContent = named.length ? 'No band matches that search.' : 'No bands with an approved radio song yet.';
    card.replaceChildren();
    card.dataset.bandKey = '';
    return;
  }
  empty.hidden = true;
  if (!visible.some(band => band.key === selectedKey)) selectedKey = visible[0].key;
  for (const band of visible) {
    const option = document.createElement('option');
    option.value = band.key;
    option.textContent = `${band.name} · ${band.songCount} approved`;
    option.selected = band.key === selectedKey;
    select.appendChild(option);
  }
  const band = visible.find(item => item.key === selectedKey);
  const signature = band ? `${band.key}|${band.songCount}|${band.name}|${band.image}` : '';
  if (!band || card.dataset.bandKey === signature) return;
  card.dataset.bandKey = signature;
  card.replaceChildren();
  const mount = document.createElement('div');
  card.appendChild(mount);
  await mountShareKit(mount, { ...band, surface: 'admin' });
}

function watch() {
  const refresh = () => { render().catch(error => console.warn('Radio share kit could not render', error)); };
  stops.push(onSnapshot(collection(socialDb, 'radioApprovedTracks'), snap => {
    firestoreTracks = {};
    snap.forEach(item => { firestoreTracks[item.id] = item.data() || {}; });
    refresh();
  }, error => console.warn('Approved radio songs could not be read', error?.code || error?.message || error)));
  stops.push(onValue(ref(getDatabase(radioApp()), 'RadioTracks'), snap => {
    legacyTracks = snap.val() || {};
    refresh();
  }, error => console.warn('Legacy radio songs could not be read', error?.code || error?.message || error)));
}

function attachWhenReady() {
  const refresh = () => { render().catch(error => console.warn('Radio share kit could not render', error)); };
  if (document.getElementById('crr')) {
    refresh();
    return;
  }
  const body = document.getElementById('cr-radio-body') || document.body;
  const observer = new MutationObserver(() => {
    if (!document.getElementById('crr')) return;
    observer.disconnect();
    refresh();
  });
  observer.observe(body, { childList: true, subtree: true });
  stops.push(() => observer.disconnect());
}

onAuthStateChanged(auth, user => {
  stops.splice(0).forEach(stop => stop());
  stops.length = 0;
  panel?.remove();
  panel = null;
  firestoreTracks = {};
  legacyTracks = {};
  if (!isAdminAccount(user)) return;
  watch();
  attachWhenReady();
});
