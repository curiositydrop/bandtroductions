/**
 * BTV (preview v1) — BANDtroductions Television
 * Data path reuses existing `media` collection rules (same as Collage preview):
 *   media docs: { gallery:'btv', mediaType:'video', btvStatus:'pending'|'approved', videoUrl, ... }
 * Only btvStatus=='approved' airs. Admin approves/removes from this page.
 * No new Storage/Firestore rules. Direct file upload = later (needs video Storage rule, Mike approval).
 */
import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { addDoc, collection, deleteDoc, doc, getDoc, limit, onSnapshot, query, serverTimestamp, updateDoc, where }
  from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { notifySiteAdmins, btvNoticeMessage } from './admin-notify.js?v=1';

const ADMIN_EMAILS = new Set(['mbergeron79@gmail.com', 'mbegeron79@gmail.com']);
const ADMIN_UID = 'PJXufsvdCCgRpfKcLtxPH3jEQN83';
const KIND = { video: 'Music Video', interview: 'Band Interview', live: 'Live Set' };
const SEED = [
  { id: 'seed-01', band: 'BANDtroductions', title: 'Get Found — Join Free', type: 'video', videoUrl: 'assets/btv/seed-01.mp4', thumb: 'assets/btv/seed-01.jpg' },
  { id: 'seed-02', band: 'BANDtroductions', title: 'The Scene (cinematic promo)', type: 'interview', videoUrl: 'assets/btv/seed-02.mp4', thumb: 'assets/btv/seed-02.jpg' }
];
const $ = (id) => document.getElementById(id);
const video = $('btv-video'), embed = $('btv-embed');
let list = [...SEED], idx = 0, user = null, isAdmin = false, lowerTimer;

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function ytId(u) { const m = String(u).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/); return m && m[1]; }
function vimeoId(u) { const m = String(u).match(/vimeo\.com\/(?:video\/)?(\d+)/); return m && m[1]; }
function embedUrl(u) {
  const y = ytId(u); if (y) return `https://www.youtube-nocookie.com/embed/${y}?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1`;
  const v = vimeoId(u); if (v) return `https://player.vimeo.com/video/${v}?autoplay=1&muted=1`;
  return null;
}
function thumbOf(it) { if (it.thumb) return it.thumb; const y = ytId(it.videoUrl); return y ? `https://i.ytimg.com/vi/${y}/hqdefault.jpg` : ''; }
function setStatus(t, c = '') { const s = $('btv-status'); s.textContent = t; s.className = 'btv-status ' + c; }

function showLower(it) {
  $('btv-kind').textContent = KIND[it.type] || 'Music Video';
  $('btv-band').textContent = it.band || 'Unknown artist';
  $('btv-song').innerHTML = it.type === 'interview' ? esc(it.title) : `<i>“</i>${esc(it.title)}<i>”</i>`;
  const l = $('btv-lower'); l.classList.remove('hide');
  clearTimeout(lowerTimer); lowerTimer = setTimeout(() => l.classList.add('hide'), 9000);
}

function play(i, autoplay = true) {
  if (!list.length) return;
  idx = (i + list.length) % list.length;
  const it = list[idx], e = embedUrl(it.videoUrl);
  if (e) { video.pause(); video.hidden = true; embed.hidden = false; embed.src = autoplay ? e : e.replace('autoplay=1', 'autoplay=0'); }
  else { embed.src = 'about:blank'; embed.hidden = true; video.hidden = false; video.src = it.videoUrl; if (it.thumb) video.poster = it.thumb; if (autoplay) video.play().catch(() => {}); }
  showLower(it); renderList();
  try { gtag('event', 'btv_play', { video_id: it.id }); } catch {}
}

function renderList() {
  $('btv-list').innerHTML = list.map((it, i) => `<button class="btv-item${i === idx ? ' on' : ''}" data-i="${i}">
    <div class="th" style="background-image:url('${esc(thumbOf(it))}')"><em>${esc(KIND[it.type] || 'Video')}</em></div>
    <div class="tx"><b>${esc(it.band)}</b>${esc(it.title)}</div></button>`).join('');
}
$('btv-list').addEventListener('click', (e) => { const b = e.target.closest('.btv-item'); if (b) play(+b.dataset.i); });
video.addEventListener('ended', () => play(idx + 1));
video.addEventListener('play', () => { $('btv-play').textContent = '⏸ Pause'; });
video.addEventListener('pause', () => { $('btv-play').textContent = '▶ Play'; });
$('btv-prev').onclick = () => play(idx - 1);
$('btv-next').onclick = () => play(idx + 1);
$('btv-play').onclick = () => { if (!video.hidden) { video.paused ? video.play() : video.pause(); } else play(idx); };
$('btv-mute').onclick = () => { video.muted = !video.muted; $('btv-mute').textContent = video.muted ? '🔇 Sound On' : '🔊 Mute'; if (video.paused && !video.hidden) video.play(); };
$('btv-full').onclick = () => { const s = $('btv-screen'); document.fullscreenElement ? document.exitFullscreen() : (s.requestFullscreen?.() || video.webkitEnterFullscreen?.()); };
$('btv-screen').addEventListener('mousemove', () => showLower(list[idx]));

function toItem(d) { const x = d.data() || {}; return { id: d.id, band: x.band || x.displayName, title: x.title, type: x.btvType || 'video', videoUrl: x.videoUrl || x.url, thumb: x.thumb || '', status: x.btvStatus, ownerName: x.ownerName }; }

onSnapshot(query(collection(db, 'media'), where('gallery', '==', 'btv'), limit(100)), (snap) => {
  const all = snap.docs.map(toItem);
  const live = all.filter((x) => x.status === 'approved' && x.videoUrl);
  const cur = list[idx]?.id;
  list = [...live, ...SEED];
  const ni = list.findIndex((x) => x.id === cur); idx = ni >= 0 ? ni : 0;
  renderList(); renderPending(all.filter((x) => x.status === 'pending'));
}, (err) => console.warn('BTV listener failed; seeds only', err));

function renderPending(p) {
  if (!isAdmin) return;
  $('btv-pending').innerHTML = p.length ? p.map((x) => `<div class="p"><span><b>${esc(x.band)}</b> — ${esc(x.title)} (${esc(KIND[x.type])}) · <a href="${esc(x.videoUrl)}" target="_blank" rel="noopener" style="color:#25c7c1">link</a> · by ${esc(x.ownerName)}</span>
    <span><button class="btv-btn" data-ok="${x.id}">Approve</button> <button class="btv-btn" data-rm="${x.id}">Remove</button></span></div>`).join('') : 'None yet.';
}
$('btv-pending').addEventListener('click', async (e) => {
  const ok = e.target.dataset.ok, rm = e.target.dataset.rm;
  try {
    if (ok) await updateDoc(doc(db, 'media', ok), { btvStatus: 'approved', published: true, updatedAt: serverTimestamp() });
    if (rm && confirm('Remove this BTV submission?')) await deleteDoc(doc(db, 'media', rm));
  } catch (err) { alert('Admin action failed: ' + err.message); }
});

const UPLOAD_TYPES = new Set(['band', 'musician', 'artist', 'venue']);
const loggedOutAuthHtml = $('btv-auth').innerHTML;
let profile = null;
let accountType = '';
let authGen = 0;

function canUploadBtv() {
  return isAdmin || UPLOAD_TYPES.has(accountType);
}

function showUploadGate(mode) {
  const authBox = $('btv-auth');
  if (mode === 'in') {
    authBox.hidden = true;
    $('btv-form').hidden = false;
    return;
  }
  $('btv-form').hidden = true;
  authBox.hidden = false;
  authBox.innerHTML = mode === 'out'
    ? loggedOutAuthHtml
    : 'Fans can watch only. BTV uploads need a free band, musician, or venue account.';
}

async function loadAccountType(u) {
  profile = null;
  let type = '';
  try {
    const s = await getDoc(doc(db, 'profiles', u.uid));
    if (s.exists()) {
      profile = s.data();
      type = String(profile.profileType || profile.accountType || '').toLowerCase();
    }
  } catch {}
  if (!type) {
    try {
      const userDoc = await getDoc(doc(db, 'users', u.uid));
      if (userDoc.exists()) type = String(userDoc.data()?.accountType || userDoc.data()?.profileType || '').toLowerCase();
    } catch {}
  }
  return type;
}

onAuthStateChanged(auth, async (u) => {
  const gen = ++authGen;
  user = u; isAdmin = !!u && (u.uid === ADMIN_UID || ADMIN_EMAILS.has((u.email || '').toLowerCase()));
  $('btv-admin').classList.toggle('on', isAdmin);
  if (!u) {
    profile = null;
    accountType = '';
    showUploadGate('out');
    return;
  }
  accountType = await loadAccountType(u);
  if (gen !== authGen) return;
  if (!canUploadBtv()) {
    showUploadGate('watch');
    setStatus('Fans can watch BTV. Uploads are for free band, musician, and venue accounts.', 'err');
    return;
  }
  showUploadGate('in');
  setStatus('');
  const n = profile?.bandName || profile?.venueName || profile?.displayName || profile?.name || '';
  if (n && !$('btv-f-band').value) $('btv-f-band').value = n;
});

$('btv-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!user) return setStatus('Log in first.', 'err');
  if (!canUploadBtv()) return setStatus('BTV uploads are for free band, musician, and venue accounts. Fans can watch only.', 'err');
  const url = $('btv-f-url').value.trim();
  if (!embedUrl(url) && !/^https:\/\/.+\.(mp4|webm|mov)(\?.*)?$/i.test(url)) return setStatus('Use a YouTube, Vimeo, or direct https .mp4/.webm link.', 'err');
  const ownershipAccepted = $('btv-f-own').checked;
  const noInappropriateContentAccepted = $('btv-f-safe').checked;
  const promoUseAccepted = $('btv-f-promo').checked;
  if (!ownershipAccepted || !noInappropriateContentAccepted || !promoUseAccepted) return setStatus('Check all three rights boxes before submitting.', 'err');
  setStatus('Sending to BTV…');
  try {
    const band = $('btv-f-band').value.trim();
    const title = $('btv-f-title').value.trim();
    const kind = $('btv-f-type').value;
    const saved = await addDoc(collection(db, 'media'), {
      ownerId: user.uid, ownerName: band, displayName: band,
      gallery: 'btv', mediaType: 'video', btvType: kind, btvStatus: 'pending',
      band, title, videoUrl: url, url,
      ownershipAccepted, noInappropriateContentAccepted, promoUseAccepted,
      published: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    e.target.reset();
    const notice = await notifySiteAdmins({
      type: 'btv-submission',
      subjectId: saved.id,
      actorId: user.uid,
      actorName: band,
      message: btvNoticeMessage({ band, title, kind })
    });
    setStatus(notice.ok ? 'Got it! Your video is in the BTV review queue. 🤘' : `Your video is in the BTV review queue. ${notice.message}`, notice.ok ? 'ok' : 'warn');
    try { gtag('event', 'btv_submit'); } catch {}
  } catch (err) { console.error(err); setStatus('Could not submit right now: ' + err.message, 'err'); }
});

renderList(); play(0, true);
