import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
import {
  bandKey,
  easternDateKey,
  isMetalMayhemMonday,
  mulberry32,
  sameSong,
  seedFromDateKey,
  sharedMetalMayhemPlaylist,
  songKey
} from '../radio-rotation-shuffle.mjs';

register(new URL('./radio-engine-loader.mjs', import.meta.url), import.meta.url);
const { activePlaylist, playlistPosition, betweenShowGap } = await import('../radio-schedule-engine.js');

const song = (id, artist = id, durationSeconds = 180) => ({ type: 'track', id, title: id, artist, audioUrl: `${id}.mp3`, durationSeconds });
const tracks = (band, count, durationSeconds = 180) => Array.from({ length: count }, (_, n) => song(`${band}-${n}`, band, durationSeconds));
const rotation = {
  id: 'playlist-rotation',
  name: 'BANDtroductions Rotation',
  days: ['every'],
  startMinutes: 0,
  endMinutes: 1439,
  active: true,
  items: ['a', 'b', 'c', 'd', 'e', 'f'].map(id => song(id))
};
const metalItems = [...tracks('Lethal CreeD', 4, 200), ...tracks('Ascent To Power', 2, 180), ...tracks('DR Groove', 2, 220)];
const metal = {
  id: 'playlist-metal',
  name: 'Metal Mayhem Monday',
  days: ['mon'],
  startMinutes: 1140,
  endMinutes: 1320,
  active: true,
  items: metalItems
};
const quick = {
  id: 'playlist-quick',
  name: 'Quick MIx',
  days: ['mon'],
  startMinutes: 1321,
  endMinutes: 1378,
  active: true,
  items: [song('q1'), song('q2'), song('q3')]
};
const blended = {
  id: 'playlist-blended',
  name: 'Blended Mix',
  days: ['every'],
  startMinutes: 1385,
  endMinutes: 2,
  active: true,
  items: [song('blend1', 'Blend', 240), song('blend2', 'Blend', 240), song('blend3', 'Blend', 240)]
};
const playlists = { rotation, metal, quick, blended };
const mondayNight = new Date('2026-11-17T00:30:00Z'); // Monday 7:30 PM ET
const mondayLater = new Date('2026-11-17T02:00:00Z'); // Monday 9:00 PM ET
const nextMonday = new Date('2026-11-24T00:30:00Z'); // Monday 7:30 PM ET, one week later
const mondayBreak = new Date('2026-11-17T03:00:00Z'); // Monday 10:00 PM ET
const mondayEarly = new Date('2026-11-16T08:00:00Z'); // Monday 3:00 AM ET

function adjacentSameBand(items) {
  let count = 0;
  for (let i = 1; i < items.length; i++) if (bandKey(items[i - 1]) && bandKey(items[i - 1]) === bandKey(items[i])) count++;
  return count;
}
function adjacentSameSong(items) {
  let count = 0;
  for (let i = 1; i < items.length; i++) if (sameSong(items[i - 1], items[i])) count++;
  return count;
}
const duration = items => items.reduce((sum, item) => sum + Number(item.durationSeconds), 0);

test('only Metal Mayhem Monday is eligible', () => {
  assert.equal(isMetalMayhemMonday(metal), true);
  assert.equal(isMetalMayhemMonday(rotation), false);
  assert.equal(isMetalMayhemMonday(quick), false);
  assert.equal(isMetalMayhemMonday(blended), false);
  assert.equal(isMetalMayhemMonday({ ...metal, startMinutes: 1160 }), false);
  assert.equal(isMetalMayhemMonday({ ...metal, days: ['mon', 'tue'] }), false);
  assert.equal(isMetalMayhemMonday({ ...metal, items: [...metal.items, { type: 'stationId', id: 'id1', artist: 'Lethal CreeD', audioUrl: 'id.mp3', durationSeconds: 12 }] }), false);
});

test('the general rotation and the other shows stay in saved order', () => {
  assert.equal(sharedMetalMayhemPlaylist(rotation, mondayEarly), rotation);
  assert.deepEqual(rotation.items.map(item => item.id), ['a', 'b', 'c', 'd', 'e', 'f']);
  const early = activePlaylist(playlists, mondayEarly);
  assert.equal(early.id, rotation.id);
  assert.equal(sharedMetalMayhemPlaylist(early, mondayEarly), early);

  const duringQuick = new Date('2026-11-17T03:05:00Z');
  const quickShow = activePlaylist(playlists, duringQuick);
  assert.equal(quickShow.name, 'Quick MIx');
  assert.equal(sharedMetalMayhemPlaylist(quickShow, duringQuick), quickShow);
  assert.equal(sharedMetalMayhemPlaylist(blended, mondayNight), blended);

  const gapBefore = betweenShowGap(playlists, mondayBreak);
  sharedMetalMayhemPlaylist(metal, mondayBreak);
  assert.deepEqual(betweenShowGap(playlists, mondayBreak), gapBefore);
  assert.equal(gapBefore.endedId, metal.id);
  assert.equal(gapBefore.nextId, quick.id);
  assert.equal(metal.startMinutes, 1140);
  assert.equal(metal.endMinutes, 1320);
});

test('Monday listeners share one order, and next Monday is different', () => {
  assert.equal(easternDateKey(mondayNight), '2026-11-16');
  assert.equal(easternDateKey(nextMonday), '2026-11-23');
  assert.notEqual(seedFromDateKey('2026-11-16'), seedFromDateKey('2026-11-23'));
  assert.equal(mulberry32(seedFromDateKey('2026-11-16'))(), mulberry32(seedFromDateKey('2026-11-16'))());

  const show = activePlaylist(playlists, mondayNight);
  assert.equal(show.id, metal.id);
  const first = sharedMetalMayhemPlaylist(show, mondayNight);
  const second = sharedMetalMayhemPlaylist(show, new Date(mondayNight.getTime()));
  const later = sharedMetalMayhemPlaylist(show, mondayLater);
  assert.equal(first.showDate, '2026-11-16');
  assert.equal(first.startMinutes, 1140);
  assert.equal(first.endMinutes, 1320);
  assert.deepEqual(first.items.map(songKey), second.items.map(songKey));
  assert.deepEqual(first.items.map(songKey), later.items.map(songKey));
  assert.deepEqual(first.items.map(songKey).sort(), show.items.map(songKey).sort());
  assert.equal(duration(first.items), duration(show.items));
  assert.equal(adjacentSameBand(first.items), 0);
  assert.equal(adjacentSameSong(first.items), 0);
  assert.deepEqual(show.items.map(item => item.id), metalItems.map(item => item.id));
  const at730 = playlistPosition(first, new Date('2026-11-17T00:31:07Z'));
  const at900 = playlistPosition(later, new Date('2026-11-17T02:07:13Z'));
  assert.deepEqual(at730, playlistPosition(second, new Date('2026-11-17T00:31:07Z')));
  assert.notDeepEqual([at900.index, at900.offsetSeconds], [at730.index, at730.offsetSeconds]);
  assert.notDeepEqual(first.items.map(songKey), sharedMetalMayhemPlaylist(show, nextMonday).items.map(songKey));

  globalThis.sessionStorage = {
    getItem() { throw new Error('sessionStorage read'); },
    setItem() { throw new Error('sessionStorage write'); }
  };
  assert.equal(sharedMetalMayhemPlaylist(show, mondayNight).showDate, '2026-11-16');
  delete globalThis.sessionStorage;
});

test('two sessions hear the same Metal Mayhem song and offset', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const probe = iso => {
    const run = spawnSync(process.execPath, ['tests/radio-rotation-session-probe.mjs', iso], { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    return JSON.parse(run.stdout);
  };
  const left = probe('2026-11-17T00:30:00Z');
  const right = probe('2026-11-17T00:30:00Z');
  assert.deepEqual(left, right);
  assert.equal(left.date, '2026-11-16');
  assert.equal(left.start, 1140);
  assert.equal(left.end, 1320);
  assert.equal(typeof left.offset, 'number');
  assert.ok(left.song);
  const later = probe('2026-11-17T02:07:13Z');
  assert.deepEqual(later.order, left.order);
  assert.notDeepEqual([later.index, later.offset], [left.index, left.offset]);
});

test('the live band mix can be spread without changing a 3 hour runtime', () => {
  const liveMix = [
    ...tracks('Lethal CreeD', 16, 235),
    ...tracks('Ascent To Power', 9, 230),
    ...tracks('DR Groove', 9, 225),
    ...tracks('Prophecy Of Ash', 6, 240),
    ...tracks('Burning Time', 2, 200),
    ...tracks('ANGEL DOWN', 2, 210),
    ...tracks('Pressured Speech', 2, 250)
  ];
  liveMix.push(song('Lethal CreeD-0', 'Lethal CreeD', 235));
  const threeHours = liveMix.map((item, index) => ({ ...item, durationSeconds: index === 0 ? 10800 - 200 * (liveMix.length - 1) : 200 }));
  assert.equal(duration(threeHours), 10800);
  const show = { ...metal, items: threeHours };
  for (const iso of ['2026-11-16', '2026-11-23', '2026-11-30']) {
    const played = sharedMetalMayhemPlaylist(show, new Date(`${iso}T23:30:00Z`));
    assert.equal(duration(played.items), 10800);
    assert.equal(played.startMinutes, 1140);
    assert.equal(played.endMinutes, 1320);
    assert.equal(adjacentSameBand(played.items), 0);
    assert.equal(adjacentSameSong(played.items), 0);
    assert.deepEqual(played.items.map(songKey).sort(), show.items.map(songKey).sort());
  }
  const oneBand = sharedMetalMayhemPlaylist({ ...metal, items: tracks('Lethal CreeD', 6, 1800) }, mondayNight);
  assert.equal(oneBand.items.length, 6);
  assert.equal(duration(oneBand.items), 10800);
});
