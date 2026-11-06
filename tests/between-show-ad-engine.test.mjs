import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync('radio-schedule-engine.js','utf8')
  .replace(/^import .*;\s*/m,'')
  .replace(/export /g,'');
const context={Intl,Date,Number,String,Object,Array,Math,fetch:()=>Promise.reject(Error('not used')),location:{hostname:'bandtroductions.com',search:''},URLSearchParams};
vm.createContext(context);
vm.runInContext(src+';globalThis.testing={sponsorBreak,effectiveSponsorBreak};',context);
const {sponsorBreak,effectiveSponsorBreak}=context.testing;
const date=new Date('2026-11-06T17:00:05Z'); // Friday, noon EST
const playlists={
  previous:{active:true,startMinutes:660,endMinutes:720,days:['fri'],items:[{audioUrl:'a'}]},
  next:{active:true,startMinutes:721,endMinutes:780,days:['fri'],items:[{audioUrl:'b'}]}
};
const config={active:true,videoUrl:'https://example.com/ad.mp4',audioUrl:'https://example.com/ad.wav',durationSeconds:12,sponsorName:'Test',clickUrl:'https://example.com'};
const actual=sponsorBreak(playlists,config,date);
assert.ok(actual,'one-minute gap should create a sponsor break');
assert.equal(actual.audioUrl,config.audioUrl);
assert.equal(actual.videoUrl,config.videoUrl);
assert.equal(actual.durationSeconds,12);
assert.equal(actual.offsetSeconds,5);
assert.equal(sponsorBreak(playlists,{...config,active:false},date),null);
assert.equal(sponsorBreak(playlists,{...config,videoUrl:''},date),null);
assert.equal(sponsorBreak({},config,date),null);
assert.equal(effectiveSponsorBreak({sponsorBreak:config}),config);
assert.equal(effectiveSponsorBreak({sponsorBreak:{active:false}}).active,false);
console.log('Radio sponsor break compatibility tests passed');
