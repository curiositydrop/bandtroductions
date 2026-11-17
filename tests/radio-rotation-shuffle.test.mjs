import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { isGeneralRotation, sameSong, sessionShuffledPlaylist, shuffleRotationItems, songKey } from '../radio-rotation-shuffle.mjs';

register(new URL('./radio-engine-loader.mjs', import.meta.url), import.meta.url);
const { activePlaylist, playlistPosition, betweenShowGap } = await import('../radio-schedule-engine.js');

const song = (id, durationSeconds = 180) => ({ type: 'track', id, title: id, artist: id, audioUrl: `${id}.mp3`, durationSeconds });

function memoryStorage() {
  const map = new Map();
  return { getItem: key => map.has(key) ? map.get(key) : null, setItem: (key, value) => map.set(key, String(value)) };
}

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
const playlists = { rotation, metal, quick };
const mondayNight = new Date('2026-11-17T00:30:00Z'); // Monday 7:30 PM ET
const mondayBreak = new Date('2026-11-17T03:00:00Z'); // Monday 10:00 PM ET, metal ends and Quick Mix is next
const mondayEarly = new Date('2026-11-16T08:00:00Z'); // Monday 3:00 AM ET, rotation only

test('scheduled shows are not the general rotation', () => {
  assert.equal(isGeneralRotation(rotation), true);
  assert.equal(isGeneralRotation(metal), false);
  assert.equal(isGeneralRotation(quick), false);
  assert.equal(isGeneralRotation({ ...rotation, name: 'All Request Day' }), false);
  assert.equal(isGeneralRotation({ ...metal, name: 'Rotation Special' }), false);
  assert.equal(isGeneralRotation({ ...rotation, items: [song('a'), { type: 'stationId', id: 'id1', audioUrl: 'id.mp3', durationSeconds: 8 }, song('b')] }), false);
  assert.equal(isGeneralRotation({ ...rotation, items: [song('a'), { type: 'sponsor', id: 'ad', audioUrl: 'ad.mp3', durationSeconds: 20 }] }), false);
});

test('Fisher-Yates runs once per session and does not repeat across the wrap', () => {
  const items = [song('a'), song('b'), song('a')];
  const shuffled = shuffleRotationItems(items, () => 0.999);
  assert.deepEqual(shuffled.map(songKey), ['id:a', 'id:a', 'id:b']);
  assert.equal(sameSong(shuffled[0], shuffled.at(-1)), false);

  const storage = memoryStorage();
  let calls = 0;
  const first = sessionShuffledPlaylist(rotation, { storage, random: () => { calls += 1; return 0; } });
  assert.notDeepEqual(first.items.map(songKey), rotation.items.map(songKey));
  assert.deepEqual(first.items.map(songKey).sort(), rotation.items.map(songKey).sort());
  assert.equal(sameSong(first.items[0], first.items.at(-1)), false);
  assert.deepEqual(rotation.items.map(songKey), ['a', 'b', 'c', 'd', 'e', 'f'].map(id => `id:${id}`));
  const afterFirst = calls;
  const second = sessionShuffledPlaylist(rotation, { storage, random: () => { throw new Error('reshuffled'); } });
  assert.deepEqual(second.items.map(songKey), first.items.map(songKey));
  assert.equal(calls, afterFirst);

  const blocked = { getItem() { return null; }, setItem() { throw new Error('quota'); } };
  const kept = sessionShuffledPlaylist(rotation, { storage: blocked, random: () => 0 });
  const again = sessionShuffledPlaylist(rotation, { storage: blocked, random: () => { throw new Error('reshuffled'); } });
  assert.deepEqual(again.items.map(songKey), kept.items.map(songKey));
});

test('Metal Mayhem Monday and Quick Mix keep their order, timing, and break', () => {
  const storage = memoryStorage();
  const show = activePlaylist(playlists, mondayNight);
  assert.equal(show.id, metal.id);
  const before = playlistPosition(show, mondayNight);
  const played = sessionShuffledPlaylist(show, { storage, random: () => 0 });
  assert.equal(played, show);
  assert.deepEqual(played.items.map(item => item.id), ['m1', 'id-metal', 'm2', 'm3']);
  assert.deepEqual(playlistPosition(played, mondayNight), before);

  const duringQuick = new Date('2026-11-17T03:05:00Z'); // Monday 10:05 PM ET
  const quickShow = activePlaylist(playlists, duringQuick);
  assert.equal(quickShow.name, 'Quick MIx');
  assert.deepEqual(sessionShuffledPlaylist(quickShow, { storage, random: () => 0 }).items.map(item => item.id), ['q1', 'q2', 'q3']);

  const gapBefore = betweenShowGap(playlists, mondayBreak);
  sessionShuffledPlaylist(rotation, { storage, random: () => 0 });
  const gapAfter = betweenShowGap(playlists, mondayBreak);
  assert.equal(gapBefore.endedId, metal.id);
  assert.equal(gapBefore.nextId, quick.id);
  assert.deepEqual(gapAfter, gapBefore);

  const overnight = activePlaylist(playlists, mondayEarly);
  assert.equal(overnight.id, rotation.id);
  const heard = sessionShuffledPlaylist(overnight, { storage: memoryStorage(), random: () => 0 });
  assert.notDeepEqual(heard.items.map(item => item.id), rotation.items.map(item => item.id));
  assert.deepEqual(playlistPosition(metal, mondayNight), before);
});
