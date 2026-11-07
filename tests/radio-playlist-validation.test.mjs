import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlaylistItems } from '../radio-playlist-validation.mjs';
const song = (seconds=180) => ({audioUrl:'https://example.com/approved.mp3',durationSeconds:seconds});
test('accepts a valid playlist',()=>assert.equal(validatePlaylistItems([song(180)],600,660).ok,true));
test('rejects missing audio without silently dropping the song',()=>assert.equal(validatePlaylistItems([song(),{durationSeconds:120}],600,660).reason,'missing-audio'));
test('rejects unknown and zero durations rather than substituting 180s',()=>{for(const duration of [undefined,0,-1,NaN]) assert.equal(validatePlaylistItems([{audioUrl:'https://example.com/approved.mp3',durationSeconds:duration}],600,660).reason,'invalid-duration');});
test('rejects overfull schedule',()=>assert.equal(validatePlaylistItems([song(2000),song(2000)],600,660).reason,'overfull'));
test('handles overnight show window',()=>assert.equal(validatePlaylistItems([song(3600)],1380,60).ok,true));
test('rejects empty playlists',()=>assert.equal(validatePlaylistItems([],600,660).reason,'empty'));
test('allows full-day rotation from midnight to 24:00',()=>assert.equal(validatePlaylistItems([song(300)],0,1440).ok,true));
test('rejects out-of-range show times',()=>assert.equal(validatePlaylistItems([song()],-10,1500).reason,'invalid-window'));

test('station ID must precede a song',()=>{const id={type:'stationId',id:'id1',audioUrl:'id.mp3',durationSeconds:10};const track={...song(),type:'track',id:'track1'};assert.equal(validatePlaylistItems([track,id],600,660).reason,'station-id-position');assert.equal(validatePlaylistItems([id,track],600,660).ok,true);});
test('linked station ID must precede its linked song',()=>{const id={type:'stationId',audioUrl:'id.mp3',durationSeconds:10,linkedSongId:'other'};const track={...song(),type:'track',id:'track1'};assert.equal(validatePlaylistItems([id,track],600,660).reason,'station-id-link');});

test('commercials cannot be inserted inside music playlists',()=>{const sponsor={type:'sponsor',audioUrl:'ad.mp3',durationSeconds:15};assert.equal(validatePlaylistItems([song(),sponsor],600,660).reason,'commercial-in-playlist');});
