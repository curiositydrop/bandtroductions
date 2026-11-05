/**
 * BANDtroductions Show Collage Wall (preview)
 *
 * Preview-safe data path (NO new Storage/Firestore rules required):
 *   Storage: profile-media/{uid}/collage-{ts}-{name}
 *   Firestore media docs with gallery: 'collage'
 *   Hidden starter seeds: profiles/{adminUid}.collageHiddenSeedIds (admin update, public read)
 *
 * Production TODO (Mike must approve before deploying rules):
 *   Prefer dedicated collage/{uid}/{file} Storage path + collageItems collection.
 *   See COLLAGE-PREVIEW-NOTES.md
 */
import { auth, db, storage } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
  deleteObject
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_WALL = 48;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ADMIN_EMAILS = new Set(['mbergeron79@gmail.com', 'mbegeron79@gmail.com']);
const ADMIN_UID = 'PJXufsvdCCgRpfKcLtxPH3jEQN83';

const SEED_ASSET_V = '20261105-generic';
const SEED = [
  { id: 'seed-01', url: `assets/collage/seed-01.jpg?v=${SEED_ASSET_V}`, displayName: 'Scene seed', createdAtMs: 1 },
  { id: 'seed-02', url: `assets/collage/seed-02.jpg?v=${SEED_ASSET_V}`, displayName: 'Scene seed', createdAtMs: 2 },
  { id: 'seed-03', url: `assets/collage/seed-03.jpg?v=${SEED_ASSET_V}`, displayName: 'Scene seed', createdAtMs: 3 },
  { id: 'seed-04', url: `assets/collage/seed-04.jpg?v=${SEED_ASSET_V}`, displayName: 'Scene seed', createdAtMs: 4 },
  { id: 'seed-05', url: `assets/collage/seed-05.jpg?v=${SEED_ASSET_V}`, displayName: 'Scene seed', createdAtMs: 5 },
  { id: 'seed-06', url: `assets/collage/seed-06.jpg?v=${SEED_ASSET_V}`, displayName: 'Scene seed', createdAtMs: 6 },
  { id: 'seed-07', url: `assets/collage/seed-07.jpg?v=${SEED_ASSET_V}`, displayName: 'Scene seed', createdAtMs: 7 },
  { id: 'seed-08', url: `assets/collage/seed-08.jpg?v=${SEED_ASSET_V}`, displayName: 'Scene seed', createdAtMs: 8 }
];

// Starter hides live on the admin profile. That doc is publicly readable
// (published profile) and existing profile rules already limit updates to the
// owner and admins, so no new Firestore rules are required.
const HIDDEN_SEED_FIELD = 'collageHiddenSeedIds';

const wallEl = document.getElementById('collage-wall');
const emptyEl = document.getElementById('collage-empty');
const statusEl = document.getElementById('collage-status');
const countEl = document.getElementById('collage-count');
const addBtn = document.getElementById('collage-add-btn');
const saveBtn = document.getElementById('collage-save-btn');
const fileInput = document.getElementById('collage-file');
const consentPanel = document.getElementById('collage-consent');
const consentContinue = document.getElementById('collage-consent-continue');
const CONSENT_IDS = ['collage-own', 'collage-safe', 'collage-promo', 'collage-public'];
const authBox = document.getElementById('collage-auth-box');
const adminStrip = document.getElementById('collage-admin');
const adminSelected = document.getElementById('collage-admin-selected');

let currentUser = null;
let isAdmin = false;
let items = [];
let latestLive = [];
let hiddenSeedIds = new Set();
let knownIds = new Set();
let selectedId = null;
let uploading = false;
let consentUnlocked = false;
let layoutSeed = hashStr('bandtroductions-collage-v1');

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function setStatus(msg, kind = '') {
  statusEl.textContent = msg || '';
  statusEl.className = 'collage-status' + (kind ? ' ' + kind : '');
}
function cleanName(name) {
  return String(name || 'shot').replace(/[^a-z0-9._-]+/gi, '-').slice(-80);
}
function isHeic(file) {
  const t = (file.type || '').toLowerCase();
  const n = (file.name || '').toLowerCase();
  return t.includes('heic') || t.includes('heif') || n.endsWith('.heic') || n.endsWith('.heif');
}
function tsMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function captionFor(item) {
  const name = String(item.displayName || item.ownerName || 'Scene').trim();
  return name.length > 22 ? name.slice(0, 20) + '…' : name || 'Scene';
}

// .frame-mat clips overflow. Keep the whole Polaroid — white border, caption,
// tilt, and the 1.08 pop — inside the mat with a small margin.
const EDGE_MARGIN = 8;
const MAX_POLAROID_SCALE = 1.08;

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}
function polaroidOutset(cardW, cardH, rotDeg) {
  const rad = Math.abs(rotDeg) * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const boxW = Math.max(cardW * cos + cardH * sin, cardW * MAX_POLAROID_SCALE);
  const boxH = Math.max(cardW * sin + cardH * cos, cardH * MAX_POLAROID_SCALE);
  return {
    x: Math.ceil(Math.max(0, (boxW - cardW) / 2)),
    y: Math.ceil(Math.max(0, (boxH - cardH) / 2))
  };
}
function axisRange(wall, card, outset) {
  const min = EDGE_MARGIN + outset;
  const max = wall - card - outset - EDGE_MARGIN;
  if (max >= min) return { min, max };
  const centered = (wall - card) / 2;
  return { min: centered, max: centered };
}
function layoutPositions(count, wallW, wallH, cardW, cardH) {
  const rand = mulberry32(layoutSeed + count * 97);
  const positions = [];
  const cols = count <= 8 ? 3 : count <= 18 ? 4 : 5;
  const rows = Math.max(1, Math.ceil(count / cols));
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const jitterX = (rand() - 0.5) * (0.7 / cols);
    const jitterY = (rand() - 0.5) * (0.55 / rows);
    const rot = (rand() - 0.5) * 16;
    const outset = polaroidOutset(cardW, cardH, rot);
    const xRange = axisRange(wallW, cardW, outset.x);
    const yRange = axisRange(wallH, cardH, outset.y);
    const nx = clamp01((col + 0.5) / cols + jitterX);
    const ny = clamp01((row + 0.5) / rows + jitterY);
    positions.push({
      left: xRange.min + nx * (xRange.max - xRange.min),
      top: yRange.min + ny * (yRange.max - yRange.min),
      rot
    });
  }
  return positions;
}
function placePolaroids() {
  const cards = [...wallEl.querySelectorAll('.polaroid')];
  if (!cards.length) return;
  const wallW = wallEl.clientWidth;
  const wallH = wallEl.clientHeight;
  if (wallW < 8 || wallH < 8) return;
  const cardW = cards[0].offsetWidth;
  const cardH = cards[0].offsetHeight;
  if (!cardW || !cardH) return;
  const positions = layoutPositions(cards.length, wallW, wallH, cardW, cardH);
  cards.forEach((el, idx) => {
    const pos = positions[idx];
    if (!pos) return;
    el.style.left = `${pos.left.toFixed(2)}px`;
    el.style.top = `${pos.top.toFixed(2)}px`;
    el.style.transform = `rotate(${pos.rot.toFixed(2)}deg)`;
  });
}

function renderWall(highlightId) {
  const list = items.slice(0, MAX_WALL);
  wallEl.replaceChildren();
  emptyEl.hidden = list.length > 0;
  list.forEach((item) => {
    const el = document.createElement('figure');
    el.className = 'polaroid' +
      (item.id === highlightId ? ' is-new' : '') +
      (item.id === selectedId ? ' is-selected' : '');
    el.dataset.id = item.id;
    el.title = captionFor(item);
    const img = document.createElement('img');
    img.src = item.url;
    img.alt = captionFor(item);
    img.loading = 'lazy';
    img.decoding = 'async';
    const cap = document.createElement('figcaption');
    cap.className = 'cap';
    cap.textContent = captionFor(item);
    el.append(img, cap);
    if (isAdmin) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => selectForAdmin(item));
    }
    wallEl.appendChild(el);
  });
  placePolaroids();
  const liveCount = list.filter((x) => !String(x.id).startsWith('seed-')).length;
  if (liveCount) {
    countEl.textContent = `${liveCount} live shot${liveCount === 1 ? '' : 's'} on the wall` +
      (list.length > liveCount ? ` · showing with ${list.length - liveCount} starter Polaroids` : '') +
      (items.length > MAX_WALL ? ` · newest ${MAX_WALL}` : '');
  } else if (!list.length) {
    countEl.textContent = 'Wall is clear · your upload lands live for everyone';
  } else {
    countEl.textContent = `${list.length} starter Polaroids · your upload lands live for everyone`;
  }
}

function selectForAdmin(item) {
  selectedId = item.id;
  wallEl.querySelectorAll('.polaroid').forEach((el) => {
    el.classList.toggle('is-selected', el.dataset.id === item.id);
  });
  adminSelected.textContent = '';
  const label = document.createElement('span');
  label.textContent = ` Selected: ${captionFor(item)} `;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Remove';
  btn.addEventListener('click', () => removeItem(item));
  adminSelected.append(label, btn);
}

function isSeedId(id) {
  return String(id || '').startsWith('seed-');
}
function visibleSeeds() {
  return SEED.filter((seed) => !hiddenSeedIds.has(seed.id));
}
function publishWall(highlight) {
  const live = latestLive;
  const seeds = live.length >= 12 ? [] : visibleSeeds();
  items = [...live, ...seeds];
  if (selectedId && !items.some((item) => item.id === selectedId)) {
    selectedId = null;
    adminSelected.textContent = '';
  }
  renderWall(highlight || null);
}
function applyHiddenSeedIds(raw) {
  const next = new Set();
  if (Array.isArray(raw)) {
    raw.forEach((id) => {
      const value = String(id || '');
      if (isSeedId(value)) next.add(value);
    });
  }
  hiddenSeedIds = next;
  publishWall(null);
}

async function hideSeed(item) {
  if (!isAdmin || !isSeedId(item?.id)) return;
  if (!confirm(`Remove this starter Polaroid from the wall for everyone?\n${captionFor(item)}`)) return;
  setStatus('Removing starter…');
  try {
    await updateDoc(doc(db, 'profiles', ADMIN_UID), {
      [HIDDEN_SEED_FIELD]: arrayUnion(item.id),
      collageHiddenSeedIdsUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    hiddenSeedIds = new Set([...hiddenSeedIds, item.id]);
    publishWall(null);
    setStatus('Starter Polaroid removed. It stays off the wall after refresh.', 'ok');
  } catch (error) {
    console.error(error);
    setStatus(error?.code === 'permission-denied'
      ? 'Admin remove blocked by rules.'
      : 'Could not remove that starter Polaroid.', 'error');
  }
}

async function removeItem(item) {
  if (!isAdmin || !item?.id) return;
  if (isSeedId(item.id)) return hideSeed(item);
  if (!confirm(`Remove this Polaroid from the wall?\n${captionFor(item)}`)) return;
  setStatus('Removing…');
  try {
    await deleteDoc(doc(db, 'media', item.id));
    if (item.storagePath) {
      try { await deleteObject(storageRef(storage, item.storagePath)); } catch (e) {
        console.warn('Storage delete skipped', e);
      }
    }
    selectedId = null;
    adminSelected.textContent = '';
    setStatus('Removed.', 'ok');
  } catch (error) {
    console.error(error);
    setStatus(error?.code === 'permission-denied'
      ? 'Admin remove blocked by rules.'
      : 'Could not remove that photo.', 'error');
  }
}

function mergeLive(docs) {
  const live = docs.map((d) => {
    const data = d.data() || {};
    return {
      id: d.id,
      url: data.downloadUrl || data.url || '',
      displayName: data.displayName || data.ownerName || 'Member',
      ownerId: data.ownerId || data.uid || '',
      storagePath: data.storagePath || '',
      createdAtMs: tsMs(data.createdAt) || Date.now()
    };
  }).filter((x) => x.url);
  live.sort((a, b) => b.createdAtMs - a.createdAtMs || String(b.id).localeCompare(String(a.id)));

  const prevLiveIds = new Set([...knownIds].filter((id) => !String(id).startsWith('seed-')));
  let highlight = null;
  for (const item of live) {
    if (!prevLiveIds.has(item.id)) highlight = item.id;
  }
  knownIds = new Set(live.map((x) => x.id));

  // Seeds stay mixed with live shots until 12 real photos, and any seed an
  // admin has hidden stays off even when the live count is still under 12.
  latestLive = live;
  publishWall(highlight);
  if (highlight && !uploading) setStatus('New Polaroid just hit the wall.', 'ok');
}

function startLiveListener() {
  const q = query(
    collection(db, 'media'),
    where('gallery', '==', 'collage'),
    limit(80)
  );
  return onSnapshot(q, (snap) => {
    mergeLive(snap.docs);
  }, (error) => {
    console.warn('Collage live listener failed; showing seeds.', error);
    latestLive = [];
    knownIds = new Set();
    publishWall(null);
    setStatus('Live wall unavailable right now — starter Polaroids are up. Upload may still work when you are logged in.', 'error');
  });
}

function startHiddenSeedListener() {
  return onSnapshot(doc(db, 'profiles', ADMIN_UID), (snap) => {
    applyHiddenSeedIds(snap.exists() ? snap.data()?.[HIDDEN_SEED_FIELD] : []);
  }, (error) => {
    console.warn('Collage seed-hide list unavailable; starter Polaroids stay up.', error);
  });
}

async function loadDisplayName(user) {
  try {
    const snap = await getDoc(doc(db, 'profiles', user.uid));
    if (snap.exists()) {
      const p = snap.data() || {};
      return p.displayName || p.name || p.bandName || p.venueName || user.displayName || 'Member';
    }
  } catch {}
  return user.displayName || user.email?.split('@')[0] || 'Member';
}

async function compressImage(file) {
  if (file.type === 'image/gif') {
    return { blob: file, contentType: file.type, fileName: cleanName(file.name) };
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = reject;
      img.src = url;
    });
  }
  const iw = bitmap.width || bitmap.naturalWidth;
  const ih = bitmap.height || bitmap.naturalHeight;
  const scale = Math.min(1, 1600 / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) return { blob: file, contentType: file.type || 'image/jpeg', fileName: cleanName(file.name) };
  const base = cleanName(file.name).replace(/\.[^.]+$/, '') || 'shot';
  return { blob, contentType: 'image/jpeg', fileName: `${base}.jpg` };
}

function consentChecked() {
  return CONSENT_IDS.every((id) => document.getElementById(id)?.checked);
}

function consentFlags() {
  return {
    ownershipAccepted: document.getElementById('collage-own').checked,
    noInappropriateContentAccepted: document.getElementById('collage-safe').checked,
    promoUseAccepted: document.getElementById('collage-promo').checked,
    collagePublicSaveAccepted: document.getElementById('collage-public').checked
  };
}

function showConsent() {
  consentUnlocked = false;
  consentPanel.hidden = false;
  consentPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function handleUpload(file) {
  if (!currentUser) {
    authBox.hidden = false;
    setStatus('Log in free to stick your shot on the wall.', 'error');
    return;
  }
  if (!consentUnlocked || !consentChecked()) {
    showConsent();
    setStatus('Check all four boxes, then continue, before this photo can go up.', 'error');
    fileInput.value = '';
    return;
  }
  if (!file) return;
  if (isHeic(file)) {
    setStatus('HEIC from iPhone isn’t supported yet — export/share as JPEG or PNG, then try again.', 'error');
    return;
  }
  if (!ALLOWED.has(file.type)) {
    setStatus('Use JPEG, PNG, WebP, or GIF.', 'error');
    return;
  }
  if (file.size > MAX_BYTES) {
    setStatus('That file is over 8 MB. Try a smaller shot.', 'error');
    return;
  }

  uploading = true;
  addBtn.disabled = true;
  setStatus('Prepping Polaroid…');
  try {
    const prepared = await compressImage(file);
    if (prepared.blob.size > MAX_BYTES) {
      throw new Error('still-too-large');
    }
    const displayName = await loadDisplayName(currentUser);
    const path = `profile-media/${currentUser.uid}/collage-${Date.now()}-${prepared.fileName}`;
    const objectRef = storageRef(storage, path);
    const task = uploadBytesResumable(objectRef, prepared.blob, {
      contentType: prepared.contentType,
      customMetadata: { ownerId: currentUser.uid, source: 'collage-wall', gallery: 'collage' }
    });
    await new Promise((resolve, reject) => {
      task.on('state_changed', (s) => {
        const safe = s.totalBytes ? Math.round((s.bytesTransferred / s.totalBytes) * 100) : 0;
        setStatus(`Uploading… ${safe}%`);
      }, reject, resolve);
    });
    const downloadUrl = await getDownloadURL(task.snapshot.ref);
    await addDoc(collection(db, 'media'), {
      ownerId: currentUser.uid,
      ownerName: displayName,
      displayName,
      mediaType: 'image',
      gallery: 'collage',
      downloadUrl,
      url: downloadUrl,
      storagePath: path,
      fileName: prepared.fileName,
      contentType: prepared.contentType,
      sizeBytes: prepared.blob.size,
      ...consentFlags(),
      published: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    setStatus('You’re on the wall. Welcome to forever.', 'ok');
  } catch (error) {
    console.error('Collage upload failed', error);
    const code = error?.code || '';
    if (code === 'permission-denied' || /unauthorized|storage\/unauthorized/i.test(String(error?.message || code))) {
      setStatus('Upload blocked by Storage/Firestore rules. Starter Polaroids still show — Mike needs to approve the collage rules for production (see COLLAGE-PREVIEW-NOTES.md).', 'error');
    } else if (error?.message === 'still-too-large') {
      setStatus('Even after compression that file is over 8 MB.', 'error');
    } else {
      setStatus('Upload failed. Check your connection and try again.', 'error');
    }
  } finally {
    uploading = false;
    addBtn.disabled = false;
    fileInput.value = '';
  }
}

async function saveCollage() {
  const target = document.getElementById('collage-frame');
  if (!target) return;
  if (typeof html2canvas !== 'function') {
    setStatus('Save tool still loading — try again in a second.', 'error');
    return;
  }
  saveBtn.disabled = true;
  setStatus('Rendering collage…');
  try {
    const canvas = await html2canvas(target, {
      backgroundColor: '#120e0a',
      scale: Math.min(2, window.devicePixelRatio || 1.5),
      useCORS: true,
      allowTaint: true,
      logging: false
    });
    const url = canvas.toDataURL('image/jpeg', 0.92);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bandtroductions-collage-${new Date().toISOString().slice(0, 10)}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus('Saved. Keep it on your phone and check back later.', 'ok');
  } catch (error) {
    console.error(error);
    setStatus('Could not save the collage image. Try again.', 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

function syncAuth(user) {
  currentUser = user || null;
  const email = String(user?.email || '').trim().toLowerCase();
  isAdmin = Boolean(user && (ADMIN_EMAILS.has(email) || user.uid === ADMIN_UID));
  authBox.hidden = Boolean(user);
  adminStrip.classList.toggle('visible', isAdmin);
  addBtn.textContent = '📸 Stick It On The Wall';
}

addBtn.addEventListener('click', () => {
  if (!currentUser) {
    authBox.hidden = false;
    consentPanel.hidden = true;
    setStatus('Free login required — create a profile and you’re in.', 'error');
    return;
  }
  if (!consentUnlocked || !consentChecked()) {
    showConsent();
    setStatus('Agree to all four, then continue.', 'error');
    return;
  }
  fileInput.click();
});
consentPanel.addEventListener('change', () => {
  if (!consentChecked()) consentUnlocked = false;
});
consentContinue.addEventListener('click', () => {
  if (!currentUser) {
    authBox.hidden = false;
    setStatus('Free login required — create a profile and you’re in.', 'error');
    return;
  }
  if (!consentChecked()) {
    consentUnlocked = false;
    setStatus('Check all four boxes to stick a photo on the wall.', 'error');
    return;
  }
  consentUnlocked = true;
  consentPanel.hidden = true;
  setStatus('');
  fileInput.click();
});
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) handleUpload(file);
});
saveBtn.addEventListener('click', saveCollage);

latestLive = [];
publishWall(null);
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => placePolaroids()).observe(wallEl);
} else {
  window.addEventListener('resize', placePolaroids);
}
document.fonts?.ready?.then(() => placePolaroids()).catch(() => {});
startHiddenSeedListener();
startLiveListener();
onAuthStateChanged(auth, (user) => {
  syncAuth(user);
  publishWall(null);
});
