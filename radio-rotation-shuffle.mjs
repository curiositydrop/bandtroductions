// Shared weekly order for Metal Mayhem Monday only.
// The Monday ET date seeds mulberry32, so every listener derives the same
// permutation that week. playlistPosition then maps the show clock onto that
// order. The general rotation and every other show are returned unchanged.
const SHOW_TIMEZONE = 'America/New_York';
const orderCache = new Map();

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

export function bandKey(item) {
  return String(item?.artist || '').trim().toLowerCase();
}

export function easternDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SHOW_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function seedFromDateKey(dateKey) {
  let hash = 2166136261;
  const text = `bandtroductions-metal-mayhem-monday:${dateKey}`;
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

function isTrack(item) {
  return (item?.type || 'track') === 'track';
}

// The Monday 7:00–10:00 PM ET show only. A same-named show in another window
// stays in saved order so its clock does not get a surprise permutation.
export function isMetalMayhemMonday(playlist) {
  if (!playlist || !Array.isArray(playlist.items) || playlist.items.length < 2) return false;
  const name = `${playlist.name || ''} ${playlist.upNextDisplayName || ''}`;
  if (!/metal\s+mayhem\s+monday/i.test(name)) return false;
  const days = Array.isArray(playlist.days) && playlist.days.length ? playlist.days : ['every'];
  if (days.length !== 1 || days[0] !== 'mon') return false;
  if (Number(playlist.startMinutes) !== 1140 || Number(playlist.endMinutes) !== 1320) return false;
  if (playlist.items.some(item => !isTrack(item))) return false;
  return true;
}

function fisherYates(items, random) {
  const next = items.slice();
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function sameBand(a, b) {
  const left = bandKey(a);
  const right = bandKey(b);
  return left !== '' && left === right;
}

// Spread bands apart. Always take the band with the most songs still waiting,
// skipping the band that just played when another band still has songs.
export function arrangeMetalMayhem(items, random) {
  const groups = new Map();
  for (const item of items) {
    const band = bandKey(item) || `\0${songKey(item)}`;
    if (!groups.has(band)) groups.set(band, []);
    groups.get(band).push(item);
  }
  for (const [band, list] of groups) groups.set(band, fisherYates(list, random));
  const rank = new Map();
  for (const band of groups.keys()) rank.set(band, random());
  const remaining = new Map([...groups].map(([band, list]) => [band, list.slice()]));
  const result = [];
  let previous = '';
  while (result.length < items.length) {
    const available = [...remaining.keys()].filter(band => remaining.get(band).length);
    const different = available.filter(band => band !== previous);
    const pool = different.length ? different : available;
    pool.sort((a, b) => remaining.get(b).length - remaining.get(a).length || rank.get(a) - rank.get(b) || a.localeCompare(b));
    const band = pool[0];
    result.push(remaining.get(band).shift());
    previous = band;
  }
  return separateIdenticalSongs(result);
}

function separateIdenticalSongs(items) {
  const next = items.slice();
  for (let i = 1; i < next.length; i++) {
    if (!sameSong(next[i - 1], next[i])) continue;
    for (let j = i + 1; j < next.length; j++) {
      if (sameSong(next[i - 1], next[j]) || sameBand(next[i - 1], next[j])) continue;
      if (i + 1 < next.length && j !== i + 1 && (sameSong(next[j], next[i + 1]) || sameBand(next[j], next[i + 1]))) continue;
      const left = j - 1 === i ? next[j] : next[j - 1];
      if (sameSong(next[i], left) || sameBand(next[i], left)) continue;
      if (j + 1 < next.length && (sameSong(next[i], next[j + 1]) || sameBand(next[i], next[j + 1]))) continue;
      [next[i], next[j]] = [next[j], next[i]];
      break;
    }
  }
  return next;
}

function showSignature(items) {
  return items.map(item => `${songKey(item)}@${Number(item?.durationSeconds)}|${bandKey(item)}`).join('\n');
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

export function sharedMetalMayhemPlaylist(playlist, date = new Date()) {
  if (!isMetalMayhemMonday(playlist)) return playlist;
  const dateKey = easternDateKey(date);
  const signature = showSignature(playlist.items);
  const cacheKey = `${signature}\n${dateKey}`;
  let keys = orderCache.get(cacheKey);
  if (!keys) {
    keys = arrangeMetalMayhem(playlist.items, mulberry32(seedFromDateKey(dateKey))).map(songKey);
    orderCache.set(cacheKey, keys);
  }
  const items = rebuild(playlist.items, keys);
  if (!items) return playlist;
  return { ...playlist, items, showDate: dateKey };
}
