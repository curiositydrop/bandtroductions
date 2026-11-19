import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { bumpDraftEpoch, commitAsyncLibraryAdd, restorePlaylistEditorItems } from '../radio-playlist-draft.mjs';

function metalMayhemItems() {
  return Array.from({length:47}, (_, index) => ({
    type:'track',
    id:index === 19 ? 'testTrack' : `track-${index}`,
    title:index === 19 ? 'hard to follow' : `Track ${index + 1}`,
    artist:index === 19 ? 'Burning Time' : 'Artist',
    audioUrl:index === 19 ? 'https://example.com/burning-time.mp3' : `https://example.com/${index}.mp3`,
    durationSeconds:index === 19 ? 212 : 180
  }));
}

test('reopening keeps testTrack at its saved index, including a repeat', () => {
  const saved = metalMayhemItems();
  saved[4] = {...saved[19]};
  const editor = restorePlaylistEditorItems(saved);
  assert.equal(editor.length, 47);
  assert.equal(editor[19].id, 'testTrack');
  assert.equal(editor[4].id, 'testTrack');
  assert.equal(editor[4].title, 'hard to follow');
  assert.equal(editor.filter(item => item.id === 'testTrack').length, 2);
  assert.notEqual(editor.at(-1).id, 'testTrack');
  assert.deepEqual(editor.map(item => item.id), saved.map(item => item.id));
});

test('a track missing from the loaded library is not moved to the end', () => {
  const saved = [
    {type:'track', id:'a', durationSeconds:180, audioUrl:'https://example.com/a.mp3'},
    {type:'track', id:'testTrack', title:'hard to follow', artist:'Burning Time', durationSeconds:212, audioUrl:'https://example.com/burning-time.mp3'},
    {type:'track', id:'b', durationSeconds:180, audioUrl:'https://example.com/b.mp3'}
  ];
  const loadedLibrary = new Set(['a', 'b']);
  const editor = restorePlaylistEditorItems(saved);
  const appendedWhenLegacyLoaded = [
    ...saved.filter(item => loadedLibrary.has(item.id)),
    ...saved.filter(item => !loadedLibrary.has(item.id))
  ];
  assert.deepEqual(editor.map(item => item.id), ['a', 'testTrack', 'b']);
  assert.deepEqual(appendedWhenLegacyLoaded.map(item => item.id), ['a', 'b', 'testTrack']);
});

test('restore copies items so the editor cannot mutate the stored playlist', () => {
  const saved = [{id:'testTrack', title:'hard to follow', durationSeconds:212}];
  const editor = restorePlaylistEditorItems(saved);
  editor[0].title = 'changed in editor';
  editor.push({id:'extra'});
  assert.equal(saved[0].title, 'hard to follow');
  assert.equal(saved.length, 1);
  assert.deepEqual(restorePlaylistEditorItems(null), []);
});

test('a duration lookup still in flight does not append after restore', () => {
  const saved = metalMayhemItems();
  let epoch = 3;
  const startedWhileMeasuring = epoch;
  epoch = bumpDraftEpoch(epoch);
  const editor = restorePlaylistEditorItems(saved);
  const late = commitAsyncLibraryAdd(startedWhileMeasuring, epoch, editor, {...saved[19], durationSeconds:212});
  assert.equal(late.status, 'stale');
  assert.equal(late.items.length, 47);
  assert.equal(late.items[19].id, 'testTrack');
  assert.deepEqual(late.items.map(item => item.id), saved.map(item => item.id));
  const secondOpen = commitAsyncLibraryAdd(startedWhileMeasuring, bumpDraftEpoch(epoch), late.items, {...saved[19]});
  assert.equal(secondOpen.status, 'stale');
  assert.equal(secondOpen.items.filter(item => item.id === 'testTrack').length, 1);
});

test('station ids stay beside the saved track instead of being skipped', () => {
  const saved = [
    {type:'stationId', id:'id1', durationSeconds:8, audioUrl:'https://example.com/id.mp3', linkedSongId:'testTrack'},
    {type:'track', id:'testTrack', title:'hard to follow', artist:'Burning Time', durationSeconds:212, audioUrl:'https://example.com/burning-time.mp3'}
  ];
  assert.deepEqual(restorePlaylistEditorItems(saved).map(item => [item.type, item.id]), [['stationId','id1'],['track','testTrack']]);
});

test('Edit restores the saved array instead of clicking library Add', () => {
  const tools = fs.readFileSync(new URL('../radio-admin-playlist-tools.js', import.meta.url), 'utf8');
  const editor = fs.readFileSync(new URL('../control-room-radio-v2.js', import.meta.url), 'utf8');
  assert.match(tools, /bandtroductions:restore-playlist-draft/);
  assert.equal(tools.includes('findAddButton'), false);
  assert.equal(tools.includes('add.click()'), false);
  assert.match(editor, /bandtroductions:restore-playlist-draft/);
  assert.match(editor, /restorePlaylistEditorItems\(items\)/);
  assert.match(editor, /commitAsyncLibraryAdd/);
});

test('a library add still appends when the editor has not been replaced', () => {
  const draft = [{type:'track', id:'a', durationSeconds:180, audioUrl:'https://example.com/a.mp3'}];
  const added = commitAsyncLibraryAdd(1, 1, draft, {type:'track', id:'testTrack', title:'hard to follow', durationSeconds:212, audioUrl:'https://example.com/burning-time.mp3'});
  assert.equal(added.status, 'added');
  assert.deepEqual(added.items.map(item => item.id), ['a', 'testTrack']);
  const missingDuration = commitAsyncLibraryAdd(1, 1, draft, {type:'track', id:'testTrack', durationSeconds:0});
  assert.equal(missingDuration.status, 'invalid');
  assert.equal(missingDuration.items.length, 1);
});
