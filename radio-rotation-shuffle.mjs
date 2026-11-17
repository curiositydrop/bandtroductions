// Shared daily order for the all-day general rotation.
// The ET calendar date seeds mulberry32, so every listener derives the same
// permutation. playlistPosition then maps seconds since local midnight onto
// that order, which is how tuning in joins the song already in progress.
// Nothing here is stored per listener. Scheduled shows are returned unchanged.
const ROTATION_TIMEZONE = 'America/New_York';
const ROTATION_EPOCH = '2026-01-01';
const playedCache = new Map();

export function songKey(item) {
  if (item?.id) return `id:${item.id}`;
  if (item?.audioUrl) return `url:${item.audioUrl}`;
  return `meta:${item?.artist || ''}|${item?.title || ''}|${item?.durationSeconds || ''}`;
}

export function sameSong(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  if (a.audioUrl && b.audioUrl && a.audioUrl === b.audioUrl) return true;
  const title = String(a.title || '').trim().toLowerCase();
  const artist = String(a.artist || '').trim().toLowerCase();
  return title !== '' && title === String(b.title || '').trim().toLowerCase() && artist === String(b.artist || '').trim().toLowerCase();
}

export function easternDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ROTATION_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function previousDateKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() - 1);
  return utc.toISOString().slice(0, 10);
}

export function seedFromDateKey(dateKey) {
  let hash = 2166136261;
  const text = `bandtroductions-rotation:${dateKey}`;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state = state + 0x6D2B79F5 | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function windowMinutes(playlist) {
  const start = Number(playlist.startMinutes || 0);
  const end = Number(playlist.endMinutes ?? 1440);
  return end > start ? end - start : 1440 - start + end;
}

function isSong(item) {
  return (item?.type || 'track') === 'track';
}

// Full-day playlist whose name is the rotation, made only of songs.
// Metal Mayhem Monday, Quick Mix, and the other dayparts are shorter shows.
export function isGeneralRotation(playlist) {
  if (!playlist || !Array.isArray(playlist.items) || playlist.items.length < 2) return false;
  if (windowMinutes(playlist) < 1439) return false;
  const name = `${playlist.name || ''} ${playlist.upNextDisplayName || ''}`;
  if (!/rotation/i.test(name)) return false;
  if (playlist.items.some(item => !isSong(item))) return false;
  return true;
}

function separateWrap(items) {
  if (items.length < 3 || !sameSong(items[0], items[items.length - 1])) return items;
  for (let i = 1; i < items.length - 1; i++) {
    if (sameSong(items[i], items[0])) continue;
    [items[i], items[items.length - 1]] = [items[items.length - 1], items[i]];
    return items;
  }
  return items;
}

function avoidBoundaryRepeat(items, previousSong) {
  if (!previousSong || items.length < 2 || !sameSong(items[0], previousSong)) return items;
  for (let i = 1; i < items.length; i++) {
    const candidate = items[i];
    if (sameSong(candidate, previousSong)) continue;
    const lastAfterSwap = i === items.length - 1 ? items[0] : items[items.length - 1];
    if (sameSong(candidate, lastAfterSwap)) continue;
    [items[0], items[i]] = [items[i], items[0]];
    return items;
  }
  return items;
}

export function shuffleRotationItems(items, random = Math.random) {
  const next = items.slice();
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return separateWrap(next);
}

function songAtElapsed(items, elapsedSeconds) {
  const durations = items.map(item => Number(item?.durationSeconds));
  if (!durations.length || durations.some(duration => !Number.isFinite(duration) || duration <= 0)) return null;
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  let offset = ((elapsedSeconds % total) + total) % total;
  for (let index = 0; index < items.length; index++) {
    if (offset < durations[index]) return { index, item: items[index], offsetSeconds: offset };
    offset -= durations[index];
  }
  return { index: 0, item: items[0], offsetSeconds: 0 };
}

function rotationSignature(items) {
  return items.map(item => `${songKey(item)}@${Number(item?.durationSeconds)}`).join('\n');
}

function rebuild(items, order) {
  if (!Array.isArray(order) || order.length !== items.length) return null;
  const buckets = new Map();
  for (const item of items) {
    const key = songKey(item);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }
  const rebuilt = [];
  for (const key of order) {
    const item = buckets.get(key)?.shift();
    if (!item) return null;
    rebuilt.push(item);
  }
  return rebuilt.length === items.length ? rebuilt : null;
}

function playedKeys(items, dateKey, signature) {
  const cacheKey = `${signature}\n${dateKey}`;
  const cached = playedCache.get(cacheKey);
  if (cached) return cached;
  let order = shuffleRotationItems(items, mulberry32(seedFromDateKey(dateKey)));
  if (dateKey > ROTATION_EPOCH) {
    const previous = rebuild(items, playedKeys(items, previousDateKey(dateKey), signature));
    const ending = previous ? songAtElapsed(previous, 86399) : null;
    order = avoidBoundaryRepeat(order, ending?.item);
  }
  const keys = order.map(songKey);
  playedCache.set(cacheKey, keys);
  return keys;
}

export function sharedRotationPlaylist(playlist, date = new Date()) {
  if (!isGeneralRotation(playlist)) return playlist;
  const dateKey = easternDateKey(date);
  const signature = rotationSignature(playlist.items);
  const items = rebuild(playlist.items, playedKeys(playlist.items, dateKey, signature));
  if (!items) return playlist;
  return { ...playlist, items, rotationDate: dateKey };
}
