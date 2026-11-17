// Listener-only shuffle for the all-day general rotation.
// Scheduled shows stay in their saved order, so a show's clock position does not move.
// A rotation that also contains station IDs or ads is left alone: those items are
// timed by their place in the list, and shuffling would move them.
const STORAGE_PREFIX = 'bt-radio-rotation-shuffle-v1:';

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

function windowMinutes(playlist) {
  const start = Number(playlist.startMinutes || 0);
  const end = Number(playlist.endMinutes ?? 1440);
  return end > start ? end - start : 1440 - start + end;
}

function isSong(item) {
  return (item?.type || 'track') === 'track';
}

// The general rotation is the full-day filler named like "BANDtroductions Rotation".
// Shorter playlists (Metal Mayhem Monday, Quick Mix, and the other dayparts) are shows.
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

export function shuffleRotationItems(items, random = Math.random) {
  const next = items.slice();
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return separateWrap(next);
}

const ordersByStorage = new WeakMap();
const ordersWithoutStorage = new Map();

function defaultStorage() {
  try { return globalThis.sessionStorage || null; } catch { return null; }
}

function orderBucket(storage) {
  if (!storage) return ordersWithoutStorage;
  let bucket = ordersByStorage.get(storage);
  if (!bucket) { bucket = new Map(); ordersByStorage.set(storage, bucket); }
  return bucket;
}

function readOrder(storage, key) {
  try {
    const raw = storage?.getItem(key);
    if (raw) {
      const saved = JSON.parse(raw);
      orderBucket(storage).set(key, saved);
      return saved;
    }
  } catch { /* fall through to the in-page order */ }
  return orderBucket(storage).get(key) || null;
}

function writeOrder(storage, key, value) {
  orderBucket(storage).set(key, value);
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* quota or private mode: this page still keeps the order */ }
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

// One Fisher-Yates order per listener session. Repeating calls reuse it, including
// after the rotation loops back to the first song.
export function sessionShuffledPlaylist(playlist, options = {}) {
  if (!isGeneralRotation(playlist)) return playlist;
  const storage = options.storage !== undefined ? options.storage : defaultStorage();
  const signature = playlist.items.map(songKey).join('\n');
  const key = STORAGE_PREFIX + (playlist.id || 'rotation');
  const saved = readOrder(storage, key);
  const restored = saved?.signature === signature ? rebuild(playlist.items, saved.order) : null;
  const items = restored || shuffleRotationItems(playlist.items, options.random);
  if (!restored) writeOrder(storage, key, { signature, order: items.map(songKey) });
  return { ...playlist, items };
}
