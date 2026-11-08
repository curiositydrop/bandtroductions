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
import { notifySiteAdmins, collageNoticeMessage } from './admin-notify.js?v=1';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_WALL = 48;
const MAX_PLACE = 36;
const MAX_CUSTOM = 32;
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
let pendingFile = null;
let editingItem = null;
const labelsPanel = document.getElementById('collage-labels');
const labelUser = document.getElementById('collage-label-user');
const labelPlace = document.getElementById('collage-label-place');
const labelCustom = document.getElementById('collage-label-custom');
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
function usernameFor(user) {
  return String(user?.email || '').split('@')[0].trim().slice(0, 40) || 'Member';
}
function captionFor(item) {
  return String(item.username || item.displayName || 'Scene').trim();
}
function safeLabel(value, max) {
  return String(value || '').replace(/[\\r\\n\\t]+/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, max);
}
function canEdit(item) {
  return !isSeedId(item.id) && !!currentUser &&
    (isAdmin || item.ownerId === currentUser.uid);
}
// Grid-based placement reserves a separate cell for each Polaroid. The card
// scales to its cell, including the full three-line caption and rotation,
// preventing the heavy overlaps from the old jittered positions.
function layoutPositions(count, wallW, wallH) {
  const rand = mulberry32(layoutSeed + count * 97);
  const usableW = Math.max(1, wallW - 24);
  const usableH = Math.max(1, wallH - 24);
  let best = null;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cellW = usableW / cols, cellH = usableH / rows;
    const width = Math.min(148, cellW * .85, (cellH * .85 - 20) / 1.35);
    if (!best || width > best.width) best = { cols, rows, cellW, cellH, width };
  }
  const width = Math.max(1, best.width);
  const positions = [];
  for (let i = 0; i < count; i++) {
    const col = i % best.cols, row = Math.floor(i / best.cols);
    const rot = (rand() - .5) * 8;
    positions.push({
      left: 12 + col * best.cellW + (best.cellW - width) / 2,
      top: 12 + row * best.cellH + (best.cellH - (width * 1.35 + 20)) / 2,
      rot
    });
  }
  return { width, positions };
}
function placePolaroids() {
  const cards = [...wallEl.querySelectorAll('.polaroid')];
  if (!cards.length) return;
  const wallW = wallEl.clientWidth, wallH = wallEl.clientHeight;
  if (wallW < 8 || wallH < 8) return;
  const layout = layoutPositions(cards.length, wallW, wallH);
  wallEl.style.setProperty('--polaroid-width', layout.width.toFixed(2) + 'px');
  cards.forEach((el, idx) => {
    const pos = layout.positions[idx];
    el.style.left = pos.left.toFixed(2) + 'px';
    el.style.top = pos.top.toFixed(2) + 'px';
    el.style.transform = 'rotate(' + pos.rot.toFixed(2) + 'deg)';
  });
}
function openLabels(file = null, item = null) {
  pendingFile = file;
  editingItem = item;
  labelUser.value = item?.username || usernameFor(currentUser);
  labelPlace.value = item?.venueLocation || '';
  labelCustom.value = item?.customCaption || '';
  document.getElementById('collage-labels-heading').textContent =
    item ? 'Edit your Polaroid label' : 'Label your new Polaroid';
  document.getElementById('collage-label-save').textContent =
    item ? 'Save label' : 'Upload photo';
  labelsPanel.hidden = false;
  labelsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
document.getElementById('collage-label-cancel').addEventListener('click', () => {
  labelsPanel.hidden = true; pendingFile = null; editingItem = null; fileInput.value = '';
});
document.getElementById('collage-label-save').addEventListener('click', async () => {
  const venueLocation = safeLabel(labelPlace.value, MAX_PLACE);
  const customCaption = safeLabel(labelCustom.value, MAX_CUSTOM);
  const username = labelUser.value;
  const button = document.getElementById('collage-label-save');
  if (editingItem) {
    if (!canEdit(editingItem)) return setStatus('Only the photo owner or admin can edit this label.', 'error');
    button.disabled = true;
    try {
      await updateDoc(doc(db, 'media', editingItem.id), {
        venueLocation, customCaption, updatedAt: serverTimestamp()
      });
      labelsPanel.hidden = true; editingItem = null;
      setStatus('Polaroid label updated.', 'ok');
    } catch (e) {
      console.error('Collage label edit failed', e);
      setStatus('Label edit blocked. Firestore media update permissions may need adjusting.', 'error');
    } finally { button.disabled = false; }
  } else if (pendingFile) {
    const file = pendingFile;
    pendingFile = null;
    labelsPanel.hidden = true;
    await handleUpload(file, { username, venueLocation, customCaption });
  }
});

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
    for (const [value, kind] of [
      [captionFor(item), 'username'],
      [item.venueLocation || '', 'place'],
      [item.customCaption || '', 'custom']
    ]) {
      const line = document.createElement('span');
      line.className = 'cap-line ' + kind;
      line.textContent = value || '\\u00a0';
      line.title = value;
      cap.appendChild(line);
    }
    el.append(img, cap);
    if (isAdmin) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => selectForAdmin(item));
    } else if (canEdit(item)) {
      el.style.cursor = 'pointer';
      el.title = 'Tap to edit your Polaroid label';
      el.addEventListener('click', () => openLabels(null, item));
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
  if (canEdit(item)) {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Edit label';
    edit.addEventListener('click', () => openLabels(null, item));
    adminSelected.append(edit);
  }
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
      username: data.username || String(data.ownerEmail || '').split('@')[0] || data.displayName || data.ownerName || 'Member',
      venueLocation: data.venueLocation || '',
      customCaption: data.customCaption || '',
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

async function handleUpload(file, labels = {}) {
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
    const saved = await addDoc(collection(db, 'media'), {
      ownerId: currentUser.uid,
      ownerName: displayName,
      displayName,
      username: usernameFor(currentUser),
      venueLocation: safeLabel(labels.venueLocation, MAX_PLACE),
      customCaption: safeLabel(labels.customCaption, MAX_CUSTOM),
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
    const notice = await notifySiteAdmins({
      type: 'collage-upload',
      subjectId: saved.id,
      profileId: currentUser.uid,
      actorId: currentUser.uid,
      actorName: displayName,
      message: collageNoticeMessage({ name: displayName })
    });
    setStatus(notice.ok
      ? 'You’re on the wall. Welcome to forever.'
      : `You’re on the wall. ${notice.message}`, notice.ok ? 'ok' : 'warn');
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
  if (file) openLabels(file);
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
