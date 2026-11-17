import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
import {
  easternDateKey,
  isGeneralRotation,
  mulberry32,
  sameSong,
  seedFromDateKey,
  sharedRotationPlaylist,
  shuffleRotationItems,
  songKey
} from '../radio-rotation-shuffle.mjs';

register(new URL('./radio-engine-loader.mjs', import.meta.url), import.meta.url);
const { activePlaylist, playlistPosition, betweenShowGap } = await import('../radio-schedule-engine.js');

const song = (id, durationSeconds = 180) => ({ type: 'track', id, title: id, artist: id, audioUrl: `${id}.mp3`, durationSeconds });
const rotation = {
  id: 'playlist-rotation',
  name: 'BANDtroductions Rotation',
  days: ['every'],
  startMinutes: 0,
  endMinutes: 1439,
  active: true,
  items: ['a', 'b', 'c', 'd', 'e', 'f'].map(id => song(id))
};
const metal = {
  id: 'playlist-metal',
  name: 'Metal Mayhem Monday',
  days: ['mon'],
  startMinutes: 1140,
  endMinutes: 1320,
  active: true,
  items: [song('m1', 200), { type: 'stationId', id: 'id-metal', audioUrl: 'id.mp3', durationSeconds: 12, linkedSongId: 'm2' }, song('m2', 180), song('m3', 210)]
};
const quick = {
  id: 'playlist-quick',
  name: 'Quick MIx',
  days: ['mon'],
  startMinutes: 1321,
  endMinutes: 1378,
  active: true,
  items: [song('q1', 160), song('q2', 170), song('q3', 150)]
};
const blended = {
  id: 'playlist-blended',
  name: 'Blended Mix',
  days: ['every'],
  startMinutes: 1385,
  endMinutes: 2,
  active: true,
  items: [song('blend1', 240), song('blend2', 240), song('blend3', 240)]
};
const playlists = { rotation, metal, quick, blended };
const mondayNight = new Date('2026-11-17T00:30:00Z'); // Monday 7:30 PM ET
const mondayBreak = new Date('2026-11-17T03:00:00Z'); // Monday 10:00 PM ET
const mondayEarly = new Date('2026-11-16T08:00:00Z'); // Monday 3:00 AM ET
const beforeMidnight = new Date('2026-11-17T04:59:59Z'); // Monday 11:59:59 PM ET
const midnight = new Date('2026-11-17T05:00:00Z'); // Tuesday 12:00:00 AM ET

test('scheduled shows are not the general rotation', () => {
  assert.equal(isGeneralRotation(rotation), true);
  assert.equal(isGeneralRotation(metal), false);
  assert.equal(isGeneralRotation(quick), false);
  assert.equal(isGeneralRotation(blended), false);
  assert.equal(isGeneralRotation({ ...rotation, name: 'All Request Day' }), false);
  assert.equal(isGeneralRotation({ ...metal, name: 'Rotation Special' }), false);
  assert.equal(isGeneralRotation({ ...rotation, items: [song('a'), { type: 'stationId', id: 'id1', audioUrl: 'id.mp3', durationSeconds: 8 }, song('b')] }), false);
  assert.equal(isGeneralRotation({ ...rotation, items: [song('a'), { type: 'sponsor', id: 'ad', audioUrl: 'ad.mp3', durationSeconds: 20 }] }), false);
});

test('the daily order is a pure function of the ET date', () => {
  assert.equal(easternDateKey(mondayEarly), '2026-11-16');
  assert.equal(easternDateKey(beforeMidnight), '2026-11-16');
  assert.equal(easternDateKey(midnight), '2026-11-17');
  assert.notEqual(seedFromDateKey('2026-11-16'), seedFromDateKey('2026-11-17'));
  const random = mulberry32(seedFromDateKey('2026-11-16'));
  assert.equal(random(), mulberry32(seedFromDateKey('2026-11-16'))());

  const first = sharedRotationPlaylist(rotation, mondayEarly);
  const second = sharedRotationPlaylist(rotation, new Date(mondayEarly.getTime()));
  const later = sharedRotationPlaylist(rotation, new Date('2026-11-16T09:00:00Z'));
  assert.equal(first.rotationDate, '2026-11-16');
  assert.deepEqual(first.items.map(songKey), second.items.map(songKey));
  assert.deepEqual(first.items.map(songKey), later.items.map(songKey));
  assert.deepEqual(first.items.map(songKey).sort(), rotation.items.map(songKey).sort());
  assert.equal(sameSong(first.items[0], first.items.at(-1)), false);
  assert.notDeepEqual(first.items.map(songKey), sharedRotationPlaylist(rotation, midnight).items.map(songKey));
  assert.deepEqual(rotation.items.map(item => item.id), ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(playlistPosition(first, mondayEarly), playlistPosition(second, mondayEarly));

  globalThis.sessionStorage = {
    getItem() { throw new Error('sessionStorage read'); },
    setItem() { throw new Error('sessionStorage write'); }
  };
  assert.equal(sharedRotationPlaylist(rotation, mondayEarly).rotationDate, '2026-11-16');
  delete globalThis.sessionStorage;
});

test('two sessions hear the same song and offset', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const probe = iso => {
    const run = spawnSync(process.execPath, ['tests/radio-rotation-session-probe.mjs', iso], { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    return JSON.parse(run.stdout);
  };
  const left = probe('2026-11-16T08:00:00Z');
  const right = probe('2026-11-16T08:00:00Z');
  assert.deepEqual(left, right);
  assert.equal(left.date, '2026-11-16');
  assert.equal(typeof left.index, 'number');
  assert.equal(typeof left.offset, 'number');
  assert.ok(left.song);
  const tenMinutesLater = probe('2026-11-16T08:10:00Z');
  assert.deepEqual(tenMinutesLater.order, left.order);
  assert.notEqual(tenMinutesLater.offset, left.offset);
});

test('midnight keeps a show continuous and does not replay the rotation song', () => {
  const duplicates = [song('same', 100), song('same', 100), song('other', 100), song('third', 100), song('fourth', 100)];
  for (let day = 2; day <= 28; day++) {
    const atMidnight = new Date(Date.UTC(2026, 10, day, 5, 0, 0));
    const lastSecond = new Date(atMidnight.getTime() - 1000);
    const nightOrder = sharedRotationPlaylist({ ...rotation, items: duplicates }, lastSecond);
    const morningOrder = sharedRotationPlaylist({ ...rotation, items: duplicates }, atMidnight);
    const endingSong = nightOrder.items[playlistPosition(nightOrder, lastSecond).index];
    assert.equal(playlistPosition(morningOrder, atMidnight).offsetSeconds, 0);
    assert.equal(sameSong(endingSong, morningOrder.items[0]), false);
    assert.equal(sameSong(morningOrder.items[0], morningOrder.items.at(-1)), false);
  }
  const night = sharedRotationPlaylist(rotation, beforeMidnight);
  const morning = sharedRotationPlaylist(rotation, midnight);
  const ending = playlistPosition(night, beforeMidnight);
  const starting = playlistPosition(morning, midnight);
  assert.equal(starting.index, 0);
  assert.equal(starting.offsetSeconds, 0);
  assert.equal(sameSong(night.items[ending.index], morning.items[0]), false);
  assert.equal(sameSong(morning.items[0], morning.items.at(-1)), false);

  const showBefore = activePlaylist(playlists, beforeMidnight);
  const showAfter = activePlaylist(playlists, midnight);
  assert.equal(showBefore.id, blended.id);
  assert.equal(showAfter.id, blended.id);
  const savedBefore = playlistPosition(showBefore, beforeMidnight);
  const savedAfter = playlistPosition(showAfter, midnight);
  assert.deepEqual(sharedRotationPlaylist(showBefore, beforeMidnight).items.map(item => item.id), ['blend1', 'blend2', 'blend3']);
  assert.equal(savedAfter.index, savedBefore.index);
  assert.equal(savedAfter.offsetSeconds, savedBefore.offsetSeconds + 1);
});

test('Metal Mayhem Monday and Quick Mix keep their order, timing, and break', () => {
  const show = activePlaylist(playlists, mondayNight);
  assert.equal(show.id, metal.id);
  const before = playlistPosition(show, mondayNight);
  const played = sharedRotationPlaylist(show, mondayNight);
  assert.equal(played, show);
  assert.deepEqual(played.items.map(item => item.id), ['m1', 'id-metal', 'm2', 'm3']);
  assert.deepEqual(playlistPosition(played, mondayNight), before);

  const duringQuick = new Date('2026-11-17T03:05:00Z'); // Monday 10:05 PM ET
  const quickShow = activePlaylist(playlists, duringQuick);
  assert.equal(quickShow.name, 'Quick MIx');
  assert.deepEqual(sharedRotationPlaylist(quickShow, duringQuick).items.map(item => item.id), ['q1', 'q2', 'q3']);

  const gapBefore = betweenShowGap(playlists, mondayBreak);
  sharedRotationPlaylist(rotation, mondayBreak);
  const gapAfter = betweenShowGap(playlists, mondayBreak);
  assert.equal(gapBefore.endedId, metal.id);
  assert.equal(gapBefore.nextId, quick.id);
  assert.deepEqual(gapAfter, gapBefore);

  const overnight = activePlaylist(playlists, mondayEarly);
  assert.equal(overnight.id, rotation.id);
  const heard = sharedRotationPlaylist(overnight, mondayEarly);
  assert.equal(heard.rotationDate, '2026-11-16');
  assert.deepEqual(playlistPosition(heard, mondayEarly).index, playlistPosition(sharedRotationPlaylist(rotation, mondayEarly), mondayEarly).index);
  assert.deepEqual(playlistPosition(metal, mondayNight), before);
});

test('Fisher-Yates wrap guard is deterministic', () => {
  const items = [song('a'), song('b'), song('a')];
  const shuffled = shuffleRotationItems(items, () => 0.999);
  assert.deepEqual(shuffled.map(songKey), ['id:a', 'id:a', 'id:b']);
  assert.equal(sameSong(shuffled[0], shuffled.at(-1)), false);
  assert.deepEqual(shuffleRotationItems(items, () => 0.999).map(songKey), shuffled.map(songKey));
});
