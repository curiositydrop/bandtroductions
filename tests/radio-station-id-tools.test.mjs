import test from 'node:test';import assert from 'node:assert/strict';
import {validateStationId,insertStationId,groupLinkedStationIds,shufflePlaylistWithStationIds} from '../radio-station-id-tools.mjs';
const song={type:'track',id:'song1',artistId:'band1',durationSeconds:180,audioUrl:'song.mp3'};
const id={id:'id1',artistId:'band1',audioUrl:'id.mp3',durationSeconds:12};
test('accepts valid ID and rejects silent or oversized ID',()=>{assert.equal(validateStationId(id).ok,true);assert.equal(validateStationId({...id,audioUrl:''}).ok,false);assert.equal(validateStationId({...id,durationSeconds:65}).ok,false);});
test('inserts a station ID between songs',()=>{const r=insertStationId([song,{...song,id:'song2'}],id,0);assert.equal(r.ok,true);assert.equal(r.items[1].type,'stationId');});
test('links ID to the next approved song',()=>{const r=insertStationId([song],id,-1,{linkToNextSong:true});assert.equal(r.items[0].linkedSongId,'song1');assert.equal(groupLinkedStationIds(r.items).length,1);});
test('rejects mismatched band when linking',()=>assert.equal(insertStationId([song],{...id,artistId:'other'},-1,{linkToNextSong:true}).reason,'invalid-song-link'));
test('warns rather than silently removing duplicate IDs',()=>{const first=insertStationId([song,{...song,id:'song2'}],id,-1);const second=insertStationId(first.items,id,1);assert.equal(second.warning,'duplicate-station-id');});

test('shuffle keeps station IDs directly before their song',()=>{const a={...song,id:'a'};const b={...song,id:'b'};const intro={...id,type:'stationId',linkedSongId:'a'};const r=shufflePlaylistWithStationIds([intro,a,b],()=>0);assert.equal(r.ok,true);assert.deepEqual(r.items.map(x=>x.id),['b','id1','a']);});
test('shuffle preserves sponsor boundaries',()=>{const a={...song,id:'a'},b={...song,id:'b'},s={type:'sponsor',id:'s'},c={...song,id:'c'};const r=shufflePlaylistWithStationIds([a,b,s,c],()=>0);assert.equal(r.ok,true);assert.deepEqual(r.items.map(x=>x.id),['b','a','s','c']);});
test('shuffle rejects orphaned or mislinked station IDs',()=>{assert.equal(shufflePlaylistWithStationIds([{...id,type:'stationId'}]).reason,'station-id-position');assert.equal(shufflePlaylistWithStationIds([{...id,type:'stationId',linkedSongId:'wrong'},song]).reason,'station-id-link');});
