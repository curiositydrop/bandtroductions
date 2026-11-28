import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURED_CACHE_KEY,
  featuredListsMatch,
  isSafeFeaturedHref,
  isSafeImageUrl,
  parseFeaturedCache,
  readFeaturedCache,
  serializeFeaturedList,
  toFeaturedCacheEntry,
  writeFeaturedCache
} from '../featured-cache.mjs';

const valid = {
  uid: '6IfVciKr3nVmaiDPVCAY0csBMGS2',
  name: 'ANGEL DOWN',
  imageUrl: 'https://example.com/angel.jpg',
  location: 'Montreal, Quebec, Canada',
  genre: 'Rock / Hard Rock',
  href: 'profile.html?id=6IfVciKr3nVmaiDPVCAY0csBMGS2'
};

function memoryStorage(start = {}) {
  const store = new Map(Object.entries(start));
  return {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
    data: store
  };
}

test('parses a valid featured cache and drops unsafe entries', () => {
  const parsed = parseFeaturedCache(JSON.stringify([
    valid,
    { uid: 'evil', name: 'X', imageUrl: 'https://example.com/x.jpg', location: '', genre: '', href: 'javascript:alert(1)' },
    { name: 'Missing uid', href: 'profile.html?id=nope' }
  ]));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].uid, valid.uid);
  assert.equal(parsed[0].href, valid.href);
});

test('rejects invalid cache payloads', () => {
  assert.deepEqual(parseFeaturedCache(null), []);
  assert.deepEqual(parseFeaturedCache('{'), []);
  assert.deepEqual(parseFeaturedCache('{}'), []);
  assert.deepEqual(parseFeaturedCache('[]'), []);
});

test('only allows in-site profile links and safe image URLs', () => {
  assert.equal(isSafeFeaturedHref('profile.html?id=abc'), true);
  assert.equal(isSafeFeaturedHref('javascript:alert(1)'), false);
  assert.equal(isSafeFeaturedHref('https://evil.example/profile.html?id=abc'), false);
  assert.equal(isSafeFeaturedHref('//evil.example/x'), false);
  assert.equal(isSafeImageUrl('https://firebasestorage.googleapis.com/v0/b/x/o/y'), true);
  assert.equal(isSafeImageUrl('javascript:alert(1)'), false);
  assert.equal(isSafeImageUrl(''), true);
});

test('read and write use the featured cache key and paid-list shape', () => {
  const storage = memoryStorage();
  const entry = toFeaturedCacheEntry(valid.uid, {
    displayName: valid.name,
    imageUrl: valid.imageUrl,
    location: valid.location,
    genre: valid.genre
  });
  writeFeaturedCache([entry], storage);
  assert.equal(storage.data.has(FEATURED_CACHE_KEY), true);
  const read = readFeaturedCache(storage);
  assert.equal(read.length, 1);
  assert.deepEqual(read[0], entry);
  assert.equal(featuredListsMatch(read, JSON.parse(serializeFeaturedList([entry]))), true);
  writeFeaturedCache([], storage);
  assert.equal(storage.data.has(FEATURED_CACHE_KEY), false);
});
