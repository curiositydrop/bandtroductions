import { register } from 'node:module';

register(new URL('./radio-engine-loader.mjs', import.meta.url), import.meta.url);
const { sharedMetalMayhemPlaylist } = await import('../radio-rotation-shuffle.mjs');
const { playlistPosition } = await import('../radio-schedule-engine.js');

const track = (band, n, durationSeconds) => ({
  type: 'track',
  id: `${band}-${n}`,
  title: `${band} ${n}`,
  artist: band,
  audioUrl: `${band}-${n}.mp3`,
  durationSeconds
});
const items = [
  ...Array.from({ length: 4 }, (_, n) => track('Lethal CreeD', n, 200)),
  ...Array.from({ length: 2 }, (_, n) => track('Ascent To Power', n, 180)),
  ...Array.from({ length: 2 }, (_, n) => track('DR Groove', n, 220))
];
const metal = {
  id: 'playlist-metal',
  name: 'Metal Mayhem Monday',
  days: ['mon'],
  startMinutes: 1140,
  endMinutes: 1320,
  active: true,
  items
};
const date = new Date(process.argv[2]);
const played = sharedMetalMayhemPlaylist(metal, date);
const pos = playlistPosition(played, date);
console.log(JSON.stringify({
  date: played.showDate,
  order: played.items.map(item => item.id),
  index: pos.index,
  offset: pos.offsetSeconds,
  song: played.items[pos.index].id,
  start: played.startMinutes,
  end: played.endMinutes
}));
