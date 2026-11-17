import { register } from 'node:module';

register(new URL('./radio-engine-loader.mjs', import.meta.url), import.meta.url);
const { sharedRotationPlaylist } = await import('../radio-rotation-shuffle.mjs');
const { playlistPosition } = await import('../radio-schedule-engine.js');

const song = id => ({ type: 'track', id, title: id, artist: id, audioUrl: `${id}.mp3`, durationSeconds: 180 });
const rotation = {
  id: 'playlist-rotation',
  name: 'BANDtroductions Rotation',
  days: ['every'],
  startMinutes: 0,
  endMinutes: 1439,
  active: true,
  items: ['a', 'b', 'c', 'd', 'e', 'f'].map(song)
};
const date = new Date(process.argv[2]);
const played = sharedRotationPlaylist(rotation, date);
const pos = playlistPosition(played, date);
console.log(JSON.stringify({
  date: played.rotationDate,
  order: played.items.map(item => item.id),
  index: pos.index,
  offset: pos.offsetSeconds,
  song: played.items[pos.index].id
}));
