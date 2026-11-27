import test from 'node:test';
import assert from 'node:assert/strict';
import { directoryImageMissing, mergePublishedProfiles } from '../botw-directory-merge.js';

const slugify = t => String(t || '').toLowerCase().trim().replace(/&/g, 'and').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const atp = {
  id: 'ascentToPowerUid',
  displayName: 'Ascent To Power',
  accountType: 'band',
  imageUrl: 'https://example.com/ascent-to-power.jpg',
  location: 'Lewiston, Maine',
  genre: 'Metal'
};

test('placeholder and missing images are treated as gaps', () => {
  assert.equal(directoryImageMissing(''), true);
  assert.equal(directoryImageMissing('IMG_9367.png'), true);
  assert.equal(directoryImageMissing('https://bandtroductions.com/IMG_9367.png'), true);
  assert.equal(directoryImageMissing('inbound8324947404328791301.png'), false);
  assert.equal(directoryImageMissing(atp.imageUrl), false);
});

test('published profiles fill a band that no longer has a static card', () => {
  const map = new Map();
  mergePublishedProfiles(map, [atp], slugify);
  const hit = map.get('ascent-to-power');
  assert.equal(hit.name, 'Ascent To Power');
  assert.equal(hit.image, atp.imageUrl);
  assert.equal(hit.url, 'profile.html?id=ascentToPowerUid');
  assert.match(hit.meta, /Lewiston/);
});

test('does not overwrite a static entry that already has a real image', () => {
  const map = new Map([
    ['ascent-to-power', {
      name: 'Ascent To Power',
      image: 'inbound8324947404328791301.png',
      url: 'ascent-to-power.html',
      meta: 'Lewiston, Maine'
    }]
  ]);
  mergePublishedProfiles(map, [atp], slugify);
  const hit = map.get('ascent-to-power');
  assert.equal(hit.image, 'inbound8324947404328791301.png');
  assert.equal(hit.url, 'ascent-to-power.html');
});

test('fills a placeholder static image and keeps a real static profile link', () => {
  const map = new Map([
    ['ascent-to-power', {
      name: 'Ascent To Power',
      image: 'IMG_9367.png',
      url: 'ascent-to-power.html',
      meta: ''
    }]
  ]);
  mergePublishedProfiles(map, [atp], slugify);
  const hit = map.get('ascent-to-power');
  assert.equal(hit.image, atp.imageUrl);
  assert.equal(hit.url, 'ascent-to-power.html');
  assert.match(hit.meta, /Lewiston/);
});

test('skips venues and accepts musician profiles', () => {
  const map = new Map();
  mergePublishedProfiles(map, [
    { id: 'venue1', displayName: 'Some Venue', accountType: 'venue', imageUrl: 'https://example.com/venue.jpg' },
    { id: 'mus1', displayName: 'Kendall James', accountType: 'musician', imageUrl: 'https://example.com/kj.jpg' }
  ], slugify);
  assert.equal(map.has('some-venue'), false);
  assert.equal(map.get('kendall-james').url, 'profile.html?id=mus1');
  assert.equal(map.get('kendall-james').image, 'https://example.com/kj.jpg');
});
