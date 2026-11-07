import test from 'node:test';import assert from 'node:assert/strict';
import {validateStationId,insertStationId,groupLinkedStationIds} from '../radio-station-id-tools.mjs';
const song={type:'track',id:'song1',artistId:'band1',durationSeconds:180,audioUrl:'song.mp3'};
const id={id:'id1',artistId:'band1',audioUrl:'id.mp3',durationSeconds:12};
test('accepts valid ID and rejects silent or oversized ID',()=>{assert.equal(validateStationId(id).ok,true);assert.equal(validateStationId({...id,audioUrl:''}).ok,false);assert.equal(validateStationId({...id,durationSeconds:65}).ok,false);});
test('inserts a station ID between songs',()=>{const r=insertStationId([song,{...song,id:'song2'}],id,0);assert.equal(r.ok,true);assert.equal(r.items[1].type,'stationId');});
test('links ID to the next approved song',()=>{const r=insertStationId([song],id,-1,{linkToNextSong:true});assert.equal(r.items[0].linkedSongId,'song1');assert.equal(groupLinkedStationIds(r.items).length,1);});
test('rejects mismatched band when linking',()=>assert.equal(insertStationId([song],{...id,artistId:'other'},-1,{linkToNextSong:true}).reason,'invalid-song-link'));
test('warns rather than silently removing duplicate IDs',()=>{const first=insertStationId([song],id,-1);const second=insertStationId(first.items,id,2);assert.equal(second.warning,'duplicate-station-id');});
