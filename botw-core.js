// Band of the Week (revamp) shared logic: ET week math, tallying, tie-breaks, data access.
// Per-round official votes live in Firestore (bandtroductions-dev, same project as accounts)
// so rules can enforce one vote per account per round. Legacy all-time RTDB Bands/{id}/votes are never written.
import { db } from './firebase-dev.js';
import { collection, doc, getDoc, getDocs, query, where, setDoc, serverTimestamp, runTransaction, orderBy } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

export const BOTW = {
  launchWeek: '2026-11-09',      // first revamped round (Mon)
  tz: 'America/New_York',
  cooldownWeeks: 0,              // optional: winners sit out N rounds (0 = off); overridable by botwConfig/settings
  siteOrigin: 'https://bandtroductions.com'
};

const params = new URLSearchParams(location.search);
// Preview/dry-run: anything not on the production host never writes to Firestore.
export const DRY_RUN = !/(^|\.)bandtroductions\.com$/i.test(location.hostname) || params.get('dry') === '1';
export const DEMO = DRY_RUN && params.get('demo') === '1';
export function now() { const n = params.get('now'); return (DRY_RUN && n) ? new Date(n) : new Date(); }

export const slugify = t => String(t || '').toLowerCase().trim().replace(/&/g, 'and').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const pad = n => String(n).padStart(2, '0');

function etParts(date) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: BOTW.tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, wd: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(p.weekday) + 1 };
}
// Convert an ET wall-clock time to a real instant (handles DST).
export function etToDate(y, m, d, h = 0, mi = 0, s = 0) {
  let t = Date.UTC(y, m - 1, d, h, mi, s);
  for (let i = 0; i < 2; i++) {
    const p = etParts(new Date(t));
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
    t += Date.UTC(y, m - 1, d, h, mi, s) - asUtc;
  }
  return new Date(t);
}
const addDays = (y, m, d, n) => { const x = new Date(Date.UTC(y, m - 1, d + n)); return [x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()]; };
export const weekIdOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

export function roundFor(weekId) {
  const [y, m, d] = weekId.split('-').map(Number);
  const opens = etToDate(y, m, d, 0, 0, 0);
  const [sy, sm, sd] = addDays(y, m, d, 5);
  const closes = etToDate(sy, sm, sd, 23, 59, 59);
  const [ny, nm, nd] = addDays(y, m, d, 7);
  const next = weekIdOf(ny, nm, nd);
  const [py, pm, pd] = addDays(y, m, d, -7);
  const fmt = (dt, o) => dt.toLocaleDateString('en-US', { timeZone: BOTW.tz, ...o });
  const endDay = etToDate(...addDays(y, m, d, 6), 12);
  const label = `Week of ${fmt(opens, { month: 'long', day: 'numeric' })}–${fmt(endDay, { month: opens.getMonth() === endDay.getMonth() ? undefined : 'long', day: 'numeric' }).trim()}`;
  return { weekId, opens, closes, next, prev: weekIdOf(py, pm, pd), label, shortLabel: label.replace('Week of ', '') };
}

// state: 'prelaunch' | 'voting' | 'results' (Sunday)
export function currentRound(at = now()) {
  const p = etParts(at);
  const [y, m, d] = addDays(p.y, p.m, p.d, -(p.wd - 1));
  let r = roundFor(weekIdOf(y, m, d));
  if (r.weekId < BOTW.launchWeek) return { ...roundFor(BOTW.launchWeek), state: 'prelaunch' };
  return { ...r, state: at >= r.opens && at <= r.closes ? 'voting' : 'results' };
}

export function countdownParts(target, at = now()) {
  let s = Math.max(0, Math.floor((target - at) / 1000));
  const dd = Math.floor(s / 86400); s -= dd * 86400; const hh = Math.floor(s / 3600); s -= hh * 3600; const mm = Math.floor(s / 60);
  return { d: dd, h: hh, m: mm, s: s % 60 };
}

// Tie-break: most votes > first to reach that total > most likes (all-time) > co-winners.
export function rankRound(votes, likesById = {}) {
  const by = {};
  votes.slice().sort((a, b) => a.t - b.t).forEach(v => { (by[v.bandId] ||= { bandId: v.bandId, votes: 0, reachedAt: 0 }); by[v.bandId].votes++; by[v.bandId].reachedAt = v.t; });
  const list = Object.values(by).map(x => ({ ...x, likes: Number(likesById[x.bandId] || 0) }));
  const cmp = (a, b) => b.votes - a.votes || a.reachedAt - b.reachedAt || b.likes - a.likes;
  list.sort(cmp);
  const top = list[0];
  const winners = top ? list.filter(x => cmp(x, top) === 0).map(x => x.bandId) : [];
  return { list, winners };
}

// ---------- data access (DRY_RUN uses localStorage only) ----------
const LS = 'botwDry:';
const lsGet = (k, f) => { try { return JSON.parse(localStorage.getItem(LS + k)) ?? f; } catch { return f; } };
const lsSet = (k, v) => localStorage.setItem(LS + k, JSON.stringify(v));

function demoVotes(weekId) {
  if (!DEMO) return [];
  const base = roundFor(weekId).opens.getTime();
  const mk = (b, n, off) => Array.from({ length: n }, (_, i) => ({ bandId: b, uid: `demo-${b}-${i}`, t: base + off + i * 3600e3 }));
  return [...mk('ascent-to-power', 7, 1e6), ...mk('paradise-is-cancelled', 5, 2e6), ...mk('i-the-conqueror', 3, 3e6), ...mk('kendall-james', 2, 4e6)];
}

export async function loadVotes(weekId) {
  const dry = lsGet('votes:' + weekId, []);
  if (DRY_RUN) return [...demoVotes(weekId), ...dry];
  const snap = await getDocs(query(collection(db, 'botwVotes'), where('weekId', '==', weekId)));
  return snap.docs.map(d => ({ bandId: d.get('bandId'), uid: d.get('uid'), t: d.get('createdAt')?.toMillis?.() || Date.now() }));
}

export async function castVote(weekId, bandId, uid) {
  if (DRY_RUN) {
    const all = lsGet('votes:' + weekId, []);
    if (all.some(v => v.uid === uid)) throw Object.assign(new Error('already'), { code: 'already-voted' });
    all.push({ bandId, uid, t: Date.now() }); lsSet('votes:' + weekId, all); return;
  }
  const ref = doc(db, 'botwVotes', `${weekId}_${uid}`);
  const ex = await getDoc(ref);
  if (ex.exists()) throw Object.assign(new Error('already'), { code: 'already-voted', bandId: ex.get('bandId') });
  await setDoc(ref, { weekId, bandId, uid, createdAt: serverTimestamp() });
}

export async function loadCheers(weekId) {
  if (DRY_RUN) return lsGet('cheers:' + weekId, DEMO ? { 'ascent-to-power': 14, 'paradise-is-cancelled': 9, 'kendall-james': 4 } : {});
  const snap = await getDocs(query(collection(db, 'botwCheers'), where('weekId', '==', weekId)));
  return Object.fromEntries(snap.docs.map(d => [d.get('bandId'), d.get('count') || 0]));
}

export async function cheer(weekId, bandId) {
  if (DRY_RUN) { const c = lsGet('cheers:' + weekId, DEMO ? { 'ascent-to-power': 14, 'paradise-is-cancelled': 9, 'kendall-james': 4 } : {}); c[bandId] = (c[bandId] || 0) + 1; lsSet('cheers:' + weekId, c); return; }
  const ref = doc(db, 'botwCheers', `${weekId}_${bandId}`);
  await runTransaction(db, async tx => {
    const s = await tx.get(ref);
    if (s.exists()) tx.update(ref, { count: (s.get('count') || 0) + 1 });
    else tx.set(ref, { weekId, bandId, count: 1 });
  });
}

export async function loadRounds() {
  let rounds = [];
  if (DRY_RUN) rounds = Object.values(lsGet('rounds', {}));
  else { try { rounds = (await getDocs(query(collection(db, 'botwRounds'), orderBy('weekId', 'desc')))).docs.map(d => d.data()); } catch (e) { console.warn('botwRounds', e); } }
  // Seed (static file) is display-only and is shown until a real round exists for it.
  try {
    const seed = await fetch('data/botw-hof-seed.json', { cache: 'no-store' }).then(r => r.json());
    seed.rounds.forEach(s => { if (!rounds.some(r => r.weekId === s.weekId)) rounds.push(s); });
  } catch {}
  return rounds.sort((a, b) => String(b.weekId).localeCompare(String(a.weekId)));
}

export async function loadConfig() {
  if (DRY_RUN) return { cooldownWeeks: Number(params.get('cooldown') || BOTW.cooldownWeeks) };
  try { const s = await getDoc(doc(db, 'botwConfig', 'settings')); return { cooldownWeeks: BOTW.cooldownWeeks, ...(s.exists() ? s.data() : {}) }; } catch { return { cooldownWeeks: BOTW.cooldownWeeks }; }
}

export async function finalizeRound(round, ranked, byUid) {
  const rec = { weekId: round.weekId, label: round.label, winners: ranked.winners, results: ranked.list.map(x => ({ bandId: x.bandId, votes: x.votes, reachedAt: x.reachedAt, likes: x.likes })), totalVotes: ranked.list.reduce((a, x) => a + x.votes, 0), finalizedBy: byUid };
  if (DRY_RUN) { const r = lsGet('rounds', {}); r[round.weekId] = { ...rec, finalizedAt: Date.now() }; lsSet('rounds', r); return; }
  await setDoc(doc(db, 'botwRounds', round.weekId), { ...rec, finalizedAt: serverTimestamp() });
}

// Bands that are "resting" under the optional cooldown.
export function restingBands(rounds, weekId, cooldownWeeks) {
  if (!cooldownWeeks) return new Set();
  const recent = rounds.filter(r => !r.seed && r.weekId < weekId).slice(0, cooldownWeeks);
  return new Set(recent.flatMap(r => r.winners || []));
}

// Directory of band names/images/profile links (static band pages).
export async function loadDirectory() {
  const map = new Map();
  for (const page of ['bands.html', 'musicians.html']) {
    try {
      const html = await fetch(page).then(r => r.text());
      new DOMParser().parseFromString(html, 'text/html').querySelectorAll('.profile-card').forEach(c => {
        const name = c.querySelector('h3')?.textContent?.trim(); if (!name) return;
        const img = c.querySelector('img'); const meta = [...c.querySelectorAll('p')].map(p => p.textContent.trim()).filter(Boolean)[0] || '';
        map.set(slugify(name), { name, image: img?.getAttribute('src') || img?.getAttribute('data-src') || 'IMG_9367.png', url: c.querySelector('a.button')?.getAttribute('href') || '#', meta });
      });
    } catch (e) { console.warn('directory', page, e); }
  }
  return map;
}
export const voteLink = bandId => `${BOTW.siteOrigin}/band-of-the-week.html?vote=${encodeURIComponent(bandId)}`;
