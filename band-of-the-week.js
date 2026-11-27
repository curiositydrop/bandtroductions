// Band of the Week revamp page controller.
import { app, auth } from './firebase-dev.js';
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { isAdminAccount } from './admin-access.js';
import { BOTW, DRY_RUN, now, currentRound, roundFor, countdownParts, rankRound, loadVotes, castVote, loadCheers, cheer, loadRounds, loadConfig, finalizeRound, restingBands, loadDirectory, voteLink, slugify } from './botw-core.js?v=11';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const PENDING = 'botwPendingVote';
const FALLBACK = 'IMG_9367.png';

let user = null, guestUid = '', voteBusy = false, pendingBand = '', round = currentRound(), dir = new Map(), likes = {}, votes = [], cheers = {}, rounds = [], config = { cooldownWeeks: 0 }, ranked = { list: [], winners: [] }, resting = new Set();
const focusBand = slugify(params.get('vote') || '');
// Guest votes use a second Firebase app so anonymous auth never looks like a
// site login. The header, community, and profiles keep using the default app.
const GUEST_APP = 'botw-guest';
const GUEST_KEY = 'botwGuestUid';
let guestAuth = null, guestDb = null;

const info = id => dir.get(id) || { name: id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), image: FALLBACK, url: `${id}.html`, meta: 'Independent Music' };
const memberUid = () => (user && user.isAnonymous !== true && user.uid) ? user.uid : '';
const activeUid = () => memberUid() || guestUid;
const myVote = () => { const uid = activeUid(); return uid && votes.find(v => v.uid === uid); };
function toast(msg) { const t = $('bwToast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2600); }

async function loadLikes() {
  try { const d = await fetch('https://bandfanwall-default-rtdb.firebaseio.com/Bands.json').then(r => r.json()) || {}; return Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith('__')).map(([k, v]) => [k, Number(v?.likes || 0)])); } catch { return {}; }
}

function renderHero() {
  const badge = $('bwStateBadge');
  const s = round.state;
  badge.className = 'bw-live' + (s === 'voting' ? '' : s === 'results' ? ' gold' : ' off');
  badge.textContent = s === 'voting' ? '● VOTING LIVE' : s === 'results' ? '🏆 RESULTS' : 'COMING NOV 9';
  $('bwWeekLabel').textContent = round.label;
  $('bwSub').textContent = s === 'voting' ? 'One free vote per fan, every week. Most votes wins.' : s === 'results' ? 'Voting is closed. Here is your champion. New round opens Monday.' : 'The all-new Band of the Week launches Monday, Nov 9. Get your fans ready.';
  $('bwListTitle').textContent = s === 'voting' ? "This Week's Battle" : s === 'results' ? 'Final Standings' : 'The Contenders';
  tick();
}
function tick() {
  const s = round.state;
  const target = s === 'voting' ? round.closes : s === 'results' ? roundFor(round.next).opens : round.opens;
  const c = countdownParts(target);
  $('cdD').textContent = c.d; $('cdH').textContent = c.h; $('cdM').textContent = c.m; $('cdS').textContent = c.s;
  $('bwCountLabel').textContent = s === 'voting' ? 'until voting closes · Sat 11:59 PM ET' : s === 'results' ? 'until the next round opens' : 'until voting opens · Mon Nov 9';
  if (target - now() <= 0 && !DRY_RUN) { round = currentRound(); refresh(); }
}

function renderFeature() {
  const el = $('bwFeature');
  let tag, id, line;
  if (round.state === 'results' && ranked.winners.length) {
    const fin = rounds.find(r => r.weekId === round.weekId && !r.seed);
    id = (fin?.winners || ranked.winners)[0];
    const co = (fin?.winners || ranked.winners).length > 1;
    tag = `🏆 Band of the Week · ${round.shortLabel}`;
    const bits = [];
    if (co) bits.push('Co-winner');
    bits.push('Band of the Week champion');
    if (!fin) bits.push('unofficial until finalized');
    line = bits.join(' · ');
  } else if (round.state === 'prelaunch') {
    const seed = rounds.find(r => r.seed); if (!seed) { el.hidden = true; return; }
    id = seed.winners[0]; tag = '👑 Reigning Champ'; line = 'Pre-revamp leader. Can anyone dethrone them?';
  } else { el.hidden = true; return; }
  const b = info(id);
  el.innerHTML = `<img class="ft-img" src="${esc(b.image)}" alt="${esc(b.name)}" onerror="this.onerror=null;this.src='${FALLBACK}'"><div class="ft-body"><div class="ft-tag">${esc(tag)}</div><h2>${esc(b.name)}</h2><p>${esc(line)}</p><a class="bw-btn gold" href="${esc(b.url)}">View ${esc(b.name)} →</a></div>`;
  el.hidden = false;
}

function bandIds() {
  const ids = new Set([...dir.keys(), ...ranked.list.map(x => x.bandId)]);
  return [...ids];
}

function renderList() {
  const term = slugify($('bwSearch').value);
  const vmap = Object.fromEntries(ranked.list.map(x => [x.bandId, x]));
  const topVotes = ranked.list[0]?.votes || 0;
  const ids = bandIds().sort((a, b) => {
    const ia = ranked.list.findIndex(x => x.bandId === a), ib = ranked.list.findIndex(x => x.bandId === b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib);
    return (cheers[b] || 0) - (cheers[a] || 0) || info(a).name.localeCompare(info(b).name);
  }).filter(id => !term || slugify(info(id).name).includes(term));
  const mine = myVote();
  const open = round.state === 'voting';
  $('bwList').innerHTML = ids.map((id, i) => {
    const b = info(id), v = vmap[id]?.votes || 0, pct = topVotes ? Math.round(v / topVotes * 100) : 0;
    const lead = open && v > 0 && ranked.winners.includes(id);
    const behind = topVotes - v;
    const rank = v ? ranked.list.findIndex(x => x.bandId === id) + 1 : '–';
    const rest = resting.has(id);
    const voteBtn = !open ? `<button class="bw-btn vote" disabled>${round.state === 'prelaunch' ? 'Opens Nov 9' : 'Closed'}</button>`
      : rest ? `<button class="bw-btn vote" disabled>Resting champ</button>`
      : mine ? (mine.bandId === id ? `<button class="bw-btn voted" disabled>✓ Your vote</button>` : `<button class="bw-btn vote" disabled>Voted this week</button>`)
      : voteBusy ? `<button class="bw-btn vote" disabled>${pendingBand === id ? 'Voting…' : '🤘 Vote'}</button>`
      : `<button class="bw-btn vote" data-vote="${esc(id)}">🤘 Vote</button>`;
    return `<article class="bw-band${lead ? ' lead' : ''}${id === focusBand ? ' focus' : ''}${mine?.bandId === id ? ' mine' : ''}" id="band-${esc(id)}">
      <div class="bw-rank">${rank}</div><img src="${esc(b.image)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${FALLBACK}'">
      <div class="bw-info"><a class="nm" href="${esc(b.url)}">${esc(b.name)}</a><small>${esc(b.meta)}</small>
        <div class="bw-bar"><i style="width:${pct}%"></i></div>
        <div class="bw-stats"><span><b>${v}</b> vote${v === 1 ? '' : 's'}</span><span>🔥 <b>${cheers[id] || 0}</b> cheers</span>${open && v && behind > 0 ? `<span class="bw-behind">${behind} behind #1</span>` : lead ? '<span class="bw-behind">Leading</span>' : ''}</div></div>
      <div class="bw-acts">${voteBtn}<button class="bw-btn" data-cheer="${esc(id)}" ${open ? '' : 'disabled'}>🔥 Cheer</button><button class="bw-btn" data-share="${esc(id)}" aria-label="Share ${esc(b.name)}">↗</button></div></article>`;
  }).join('') || '<p class="bw-empty">No bands match.</p>';
}

function renderHof() {
  const shown = rounds.filter(r => r.winners?.length);
  const newestId = shown[0]?.weekId;
  const items = shown.flatMap(r => r.winners.map(w => ({ r, w })));
  $('bwHof').innerHTML = items.length ? items.map(({ r, w }) => {
    const b = info(w);
    const label = r.winners.length > 1 ? 'Co-winner' : (r.weekId === newestId ? 'Reigning Champ' : 'Champion');
    return `<a href="${esc(b.url)}"><img src="${esc(b.image)}" alt="${esc(b.name)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${FALLBACK}'"><div><small>${esc(label)}</small><b>${esc(b.name)}</b><em>${esc(r.label)}</em></div></a>`;
  }).join('') : '<p class="bw-empty">The first champion will be crowned Sunday, Nov 15.</p>';
}

function renderAdmin() {
  const el = $('bwAdmin');
  const admin = DRY_RUN ? params.get('admin') === '1' : isAdminAccount(user);
  if (!admin) { el.hidden = true; return; }
  // Admin can finalize the most recent closed round (Sunday, or later if missed).
  const target = round.state === 'voting' ? roundFor(round.prev) : round;
  const done = rounds.some(r => r.weekId === target.weekId && !r.seed);
  el.hidden = false;
  el.innerHTML = `<div class="bw-admin"><h2>Admin · Finalize Round</h2><p class="bw-sub">${esc(target.label)} — ${done ? 'already finalized ✓' : now() > target.closes ? 'closed, ready to finalize' : 'not closed yet'}${DRY_RUN ? ' (preview: saves locally only)' : ''}</p>
    <button class="bw-btn gold" id="bwFinalize" ${done || now() <= target.closes || target.weekId < BOTW.launchWeek ? 'disabled' : ''}>Finalize & save to Hall of Fame</button></div>`;
  $('bwFinalize')?.addEventListener('click', async () => {
    if (!confirm(`Finalize ${target.label}? This saves the results permanently.`)) return;
    const tv = await loadVotes(target.weekId);
    const r = rankRound(tv.filter(v => !resting.has(v.bandId)), likes);
    try { await finalizeRound(target, r, user?.uid || 'preview-admin'); toast('Round finalized 🏆'); await refresh(); } catch (e) { console.error(e); toast('Could not finalize: ' + (e.code || e.message)); }
  });
}

// ---------- modal / voting flow ----------
function sheet(html) { $('bwSheet').innerHTML = html; $('bwModal').hidden = false; }
$('bwModal').addEventListener('click', e => { if (e.target.id === 'bwModal' || e.target.dataset.close != null) $('bwModal').hidden = true; });

function guestServices() {
  if (guestAuth) return { guestAuth, guestDb };
  const existing = getApps().find(a => a.name === GUEST_APP);
  const opts = app.options || {};
  const guestApp = existing || initializeApp({
    apiKey: opts.apiKey, authDomain: opts.authDomain, projectId: opts.projectId,
    storageBucket: opts.storageBucket, messagingSenderId: opts.messagingSenderId, appId: opts.appId
  }, GUEST_APP);
  guestAuth = getAuth(guestApp);
  guestDb = getFirestore(guestApp);
  return { guestAuth, guestDb };
}

function readStoredGuest() {
  try { return localStorage.getItem(GUEST_KEY) || ''; } catch { return ''; }
}

// One anonymous uid per browser. Created on the first vote, then reused so
// the same browser cannot cast a second vote that week.
async function ensureGuest() {
  if (DRY_RUN) {
    let uid = readStoredGuest();
    if (!uid) {
      uid = `guest-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
      localStorage.setItem(GUEST_KEY, uid);
    }
    guestUid = uid;
    return { uid, firestore: null };
  }
  const services = guestServices();
  await services.guestAuth.authStateReady();
  let current = services.guestAuth.currentUser;
  if (!current) {
    try { await setPersistence(services.guestAuth, browserLocalPersistence); } catch (e) { console.warn('Guest vote will last for this visit only.', e); }
    current = (await signInAnonymously(services.guestAuth)).user;
  }
  await current.getIdToken();
  guestUid = current.uid;
  return { uid: current.uid, firestore: services.guestDb };
}

function watchGuest() {
  if (DRY_RUN) { guestUid = readStoredGuest(); renderList(); return; }
  onAuthStateChanged(guestServices().guestAuth, u => { guestUid = u?.uid || ''; renderList(); });
}

async function resolveVoter() {
  if (!DRY_RUN) {
    await auth.authStateReady();
    const member = auth.currentUser;
    if (member && !member.isAnonymous) { user = member; return { uid: member.uid, guest: false }; }
  } else if (memberUid()) {
    return { uid: memberUid(), guest: false };
  } else if (sessionStorage.getItem('botwPreviewUser')) {
    user = { uid: 'preview-fan', email: 'fan@example.test' };
    return { uid: user.uid, guest: false };
  }
  const guest = await ensureGuest();
  return { uid: guest.uid, guest: true, firestore: guest.firestore };
}

async function doVote(id) {
  if (voteBusy) return;
  if (round.state !== 'voting') return toast('Voting is closed for this week.');
  if (myVote()) return toast('You already voted this week. Come back Monday!');
  voteBusy = true; pendingBand = id; renderList();
  let counted = null;
  try {
    const voter = await resolveVoter();
    if (!DRY_RUN && voter.guest && !voter.firestore) throw Object.assign(new Error('guest-db-missing'), { code: 'guest-db-missing' });
    await castVote(round.weekId, id, voter.uid, voter.guest && voter.firestore ? { firestore: voter.firestore } : undefined);
    localStorage.removeItem(PENDING);
    counted = voter;
    votes = await loadVotes(round.weekId);
    recompute();
  } catch (e) {
    votes = await loadVotes(round.weekId).catch(() => votes);
    recompute();
    if (!counted) {
      if (e.code === 'already-voted' || (e.code === 'permission-denied' && myVote())) toast('You already voted this week. Come back Monday!');
      else { console.error(e); toast('Vote failed — please try again.'); }
    }
  } finally {
    voteBusy = false; pendingBand = '';
  }
  renderList();
  if (counted) votedCard(id, { offerJoin: counted.guest });
}

async function applyPending() {
  let p = null; try { p = JSON.parse(localStorage.getItem(PENDING)); } catch {}
  if (!user || !p || p.weekId !== round.weekId) return renderList();
  if (myVote()) { localStorage.removeItem(PENDING); return renderList(); }
  await doVote(p.bandId);
}

function drawCard(b, rankText) {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1080; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 1080); g.addColorStop(0, '#2a0010'); g.addColorStop(1, '#050505'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1080);
  const finish = () => {
    x.fillStyle = '#ff004c'; x.font = '900 54px Arial'; x.textAlign = 'center'; x.fillText('I VOTED 🤘', 540, 120);
    x.fillStyle = '#fff'; x.font = '900 84px Arial'; x.fillText(b.name.toUpperCase().slice(0, 22), 540, 860);
    x.fillStyle = '#ccc'; x.font = '700 40px Arial'; x.fillText(`for Band of the Week · ${round.shortLabel}`, 540, 930);
    x.fillStyle = '#ffcc33'; x.font = '900 36px Arial'; x.fillText(rankText, 540, 985); x.fillStyle = '#888'; x.font = '700 32px Arial'; x.fillText('bandtroductions.com · vote before Sat 11:59 PM ET', 540, 1045);
  };
  return new Promise(res => { const im = new Image(); im.onload = () => { const s = Math.min(im.width, im.height); x.save(); x.beginPath(); x.roundRect(240, 170, 600, 600, 40); x.clip(); x.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 240, 170, 600, 600); x.restore(); finish(); res(c); }; im.onerror = () => { finish(); res(c); }; im.src = b.image; });
}

async function votedCard(id, { offerJoin = false } = {}) {
  const b = info(id), pos = ranked.list.findIndex(x => x.bandId === id) + 1, me = ranked.list[pos - 1];
  const behind = (ranked.list[0]?.votes || 0) - (me?.votes || 0);
  const rankText = pos === 1 ? 'Currently #1!' : `#${pos} · ${behind} vote${behind === 1 ? '' : 's'} behind #1`;
  const ret = encodeURIComponent(`band-of-the-week.html?vote=${encodeURIComponent(id)}`);
  const join = offerJoin ? `<p>Want a free BANDtroductions profile?</p><div class="bw-choice"><a class="bw-btn vote" href="signup.html?returnTo=${ret}">Join free</a><button class="bw-btn" type="button" data-close>No thanks</button></div>` : '';
  const title = offerJoin ? 'Your vote counted!' : `Vote locked in for ${esc(b.name)} 🤘`;
  sheet(`<h3 id="bwModalTitle">${title}</h3>${join}<p>${offerJoin ? `Vote locked in for ${esc(b.name)}. ` : ''}${esc(rankText)}. Share it — every share brings more votes.</p><div id="bwCanvasWrap"></div>
    <div class="row"><button class="bw-btn vote" id="bwShareCard">Share my "I voted" card</button><button class="bw-btn" data-share="${esc(id)}">Copy vote link</button>${offerJoin ? '' : '<button class="bw-btn" data-close>Done</button>'}</div>`);
  const c = await drawCard(b, rankText); $('bwCanvasWrap').appendChild(c);
  $('bwShareCard').onclick = () => c.toBlob(async blob => {
    const file = new File([blob], `i-voted-${id}.png`, { type: 'image/png' });
    const data = { title: 'I voted!', text: `I voted for ${b.name} for Band of the Week! Vote here: ${voteLink(id)}`, files: [file] };
    if (navigator.canShare?.(data)) { try { await navigator.share(data); } catch {} }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); toast('Card saved — post it!'); }
  });
}

async function share(id) {
  const b = info(id), url = voteLink(id), text = `Vote for ${b.name} for BANDtroductions Band of the Week 🤘 (one free vote per week, closes Sat 11:59 PM ET)`;
  if (navigator.share) { try { await navigator.share({ title: 'Band of the Week', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast('Vote link copied!'); } catch { prompt('Copy this vote link:', url); }
}

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-vote],[data-cheer],[data-share]'); if (!t) return;
  if (t.dataset.vote) doVote(t.dataset.vote);
  else if (t.dataset.share) share(t.dataset.share);
  else if (t.dataset.cheer) {
    const id = t.dataset.cheer, k = `botwCheer:${round.weekId}:${id}`, n = Number(sessionStorage.getItem(k) || 0);
    if (n >= 5) return toast('Max cheers for now — get a friend to cheer too!');
    sessionStorage.setItem(k, n + 1); cheers[id] = (cheers[id] || 0) + 1; renderList(); toast('🔥 Cheer sent!');
    try { await cheer(round.weekId, id); } catch (err) { console.warn(err); }
  }
});
$('bwSearch').addEventListener('input', renderList);

function recompute() { ranked = rankRound(votes.filter(v => !resting.has(v.bandId)), likes); }

async function refresh() {
  renderHero();
  [votes, cheers, rounds, config] = await Promise.all([loadVotes(round.weekId).catch(() => []), loadCheers(round.weekId).catch(() => ({})), loadRounds(), loadConfig()]);
  resting = restingBands(rounds, round.weekId, config.cooldownWeeks);
  recompute(); renderFeature(); renderHof(); renderAdmin(); renderList();
}

(async () => {
  renderHero(); setInterval(tick, 1000);
  if (DRY_RUN) guestUid = readStoredGuest();
  [dir, likes] = await Promise.all([loadDirectory(), loadLikes()]);
  await refresh();
  if (focusBand) document.getElementById('band-' + focusBand)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (DRY_RUN && sessionStorage.getItem('botwPreviewUser')) user = { uid: 'preview-fan', email: 'fan@example.test' };
  watchGuest();
  onAuthStateChanged(auth, u => { if (u || !DRY_RUN) user = u || null; if (!user && DRY_RUN && sessionStorage.getItem('botwPreviewUser')) user = { uid: 'preview-fan' }; renderAdmin(); params.get('autovote') === '1' || localStorage.getItem(PENDING) ? applyPending() : renderList(); });
})();
