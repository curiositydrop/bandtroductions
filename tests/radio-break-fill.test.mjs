import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { planCommercialBreak, commercialAtOffset } from '../radio-break-planner.mjs';
import {
  BREAK_LENGTH_SECONDS,
  FILL_FADE_SECONDS,
  DEFAULT_BREAK_FILL_SECONDS,
  DEFAULT_BREAK_FILL_URL,
  breakFillContentType,
  paidAdSeconds,
  resolveBreakFill,
  planBreakFill,
  currentBreakFill,
  clampFillSeek,
  syncBreakFillAudio,
  clearBreakFillAudio
} from '../radio-break-fill.mjs';

const bed = resolveBreakFill(null);
const ad = (durationSeconds, extra = {}) => ({ active: true, sponsorName: 'Sponsor', audioUrl: 'https://example.com/ad.mp3', durationSeconds, ...extra });

function engineContext(location) {
  const context = {
    planCommercialBreak,
    commercialAtOffset,
    paidAdSeconds,
    Intl, Date, Number, String, Object, Array, Math,
    fetch: () => Promise.reject(Error('not used')),
    location,
    URLSearchParams
  };
  vm.createContext(context);
  const src = readFileSync('radio-schedule-engine.js', 'utf8').replace(/^import .*;\s*/gm, '').replace(/export /g, '');
  vm.runInContext(src + ';globalThis.testing={sponsorBreak,betweenShowGap,previewBreakOffset,previewDemoAdSeconds,withPreviewTestBreak};', context);
  return context.testing;
}

const live = engineContext({ hostname: 'bandtroductions.com', search: '' });
const playlists = {
  previous: { name: 'Early Show', active: true, startMinutes: 660, endMinutes: 720, days: ['fri'], items: [{ audioUrl: 'a' }] },
  next: { name: 'Late Show', active: true, startMinutes: 721, endMinutes: 780, days: ['fri'], items: [{ audioUrl: 'b' }] }
};
const noon = (second, ms = 0) => new Date(Date.UTC(2026, 10, 6, 17, 0, second, ms));

test('default bed is the built-in placeholder until a custom file is saved', () => {
  assert.equal(bed.audioUrl, DEFAULT_BREAK_FILL_URL);
  assert.equal(bed.durationSeconds, DEFAULT_BREAK_FILL_SECONDS);
  assert.equal(bed.source, 'default');
  assert.equal(resolveBreakFill({ enabled: false }), null);
  const custom = resolveBreakFill({ enabled: true, audioUrl: 'https://example.com/bed.m4a', durationSeconds: 30, label: 'Promo' });
  assert.equal(custom.source, 'custom');
  assert.equal(custom.durationSeconds, 30);
});

test('0, 1, and 2 ads leave the right fill window, and a full minute leaves none', () => {
  assert.equal(paidAdSeconds({ active: true, ads: [] }), 0);
  assert.equal(paidAdSeconds({ active: false, audioUrl: 'https://example.com/a.mp3', durationSeconds: 18 }), 0);
  assert.equal(paidAdSeconds(ad(18)), 18);
  assert.equal(paidAdSeconds({ active: true, ads: [ad(20), ad(25)] }), 45);
  assert.equal(paidAdSeconds({ active: true, ads: [ad(30), ad(30)] }), 60);
  assert.equal(paidAdSeconds({ active: true, ads: [ad(20), ad(20), ad(20)] }), 0);

  const none = planBreakFill({ breakOffsetSeconds: 0, adSeconds: 0, fill: bed });
  assert.equal(none.phase, 'fill');
  assert.equal(none.clipOffsetSeconds, 0);
  assert.equal(none.loop, true);

  const duringAd = planBreakFill({ breakOffsetSeconds: 10, adSeconds: 18, fill: bed });
  assert.equal(duringAd.phase, 'ad');
  const afterOne = planBreakFill({ breakOffsetSeconds: 18, adSeconds: 18, fill: bed });
  assert.equal(afterOne.phase, 'fill');
  assert.equal(afterOne.clipOffsetSeconds, 0);

  const duringTwo = planBreakFill({ breakOffsetSeconds: 44.9, adSeconds: 45, fill: bed });
  assert.equal(duringTwo.phase, 'ad');
  const afterTwo = planBreakFill({ breakOffsetSeconds: 45, adSeconds: 45, fill: bed });
  assert.equal(afterTwo.phase, 'fill');
  assert.equal(afterTwo.clipOffsetSeconds, 0);
  assert.equal(planBreakFill({ breakOffsetSeconds: 50, adSeconds: 45, fill: bed }).clipOffsetSeconds, 5);

  for (const offset of [0, 30, 59.9]) {
    assert.equal(planBreakFill({ breakOffsetSeconds: offset, adSeconds: 60, fill: bed }).phase, 'none');
  }
});

test('late joiners hear the shared point in the bed, which ends at the next show', () => {
  const late = planBreakFill({ breakOffsetSeconds: 50, adSeconds: 18, fill: bed });
  assert.equal(late.phase, 'fill');
  assert.equal(late.elapsedFillSeconds, 32);
  assert.equal(late.clipOffsetSeconds, 32 % DEFAULT_BREAK_FILL_SECONDS);
  assert.equal(late.remainingSeconds, 10);
  assert.equal(late.volume, 1);

  const fade = planBreakFill({ breakOffsetSeconds: 59, adSeconds: 0, fill: bed });
  assert.equal(fade.fade, true);
  assert.ok(Math.abs(fade.volume - (1 / FILL_FADE_SECONDS)) < 1e-9);

  const almost = planBreakFill({ breakOffsetSeconds: 59.999, adSeconds: 0, fill: bed });
  assert.equal(almost.phase, 'fill');
  assert.ok(almost.volume < 0.01);
  assert.equal(planBreakFill({ breakOffsetSeconds: 60, adSeconds: 0, fill: bed }).phase, 'none');
  assert.equal(planBreakFill({ breakOffsetSeconds: 60, adSeconds: 18, fill: bed }).reason, 'outside-break');
});

test('a short bed loops and a long bed does not', () => {
  const short = resolveBreakFill({ enabled: true, audioUrl: 'https://example.com/short.mp3', durationSeconds: 5 });
  const looped = planBreakFill({ breakOffsetSeconds: 22, adSeconds: 0, fill: short });
  assert.equal(looped.loop, true);
  assert.equal(looped.clipOffsetSeconds, 2);
  const long = resolveBreakFill({ enabled: true, audioUrl: 'https://example.com/long.mp3', durationSeconds: 90 });
  const straight = planBreakFill({ breakOffsetSeconds: 40, adSeconds: 18, fill: long });
  assert.equal(straight.loop, false);
  assert.equal(straight.clipOffsetSeconds, 22);
  assert.equal(clampFillSeek(straight, 90), 22);
});

test('schedule gap lines up with ad playback and releases the minute to the next show', () => {
  const legacy = { active: true, audioUrl: 'https://example.com/ad.mp3', videoUrl: 'https://example.com/ad.mp4', durationSeconds: 18, sponsorName: 'Test' };
  const early = live.sponsorBreak(playlists, legacy, noon(5));
  assert.equal(early.clipPlaying, true);
  assert.equal(early.offsetSeconds, 5);
  assert.equal(planBreakFill({ breakOffsetSeconds: 5.9, adSeconds: paidAdSeconds(legacy), fill: bed }).phase, 'ad');

  const handoff = live.sponsorBreak(playlists, legacy, noon(18));
  assert.equal(handoff.clipPlaying, false);
  const fill = planBreakFill({ breakOffsetSeconds: 18, adSeconds: paidAdSeconds(legacy), fill: bed });
  assert.equal(fill.phase, 'fill');
  assert.equal(fill.clipOffsetSeconds, 0);

  const gap = live.betweenShowGap(playlists, noon(50));
  assert.equal(gap.offsetSecondsExact, 50);
  const late = currentBreakFill({ sponsorConfig: legacy, fillConfig: null, gap });
  assert.equal(late.phase, 'fill');
  assert.equal(late.clipOffsetSeconds, 32 % DEFAULT_BREAK_FILL_SECONDS);
  assert.equal(late.nextShow, 'Late Show');
  assert.equal(currentBreakFill({ sponsorConfig: legacy, fillConfig: { enabled: false }, gap }), null);

  const empty = { active: true, ads: [] };
  assert.equal(live.sponsorBreak(playlists, empty, noon(30)), null);
  const open = currentBreakFill({ sponsorConfig: empty, fillConfig: null, gap: live.betweenShowGap(playlists, noon(30)) });
  assert.equal(open.phase, 'fill');
  assert.equal(open.adSeconds, 0);
  assert.equal(open.clipOffsetSeconds, 30 % DEFAULT_BREAK_FILL_SECONDS);

  const two = { active: true, ads: [ad(20), ad(25)] };
  assert.equal(live.sponsorBreak(playlists, two, noon(55)).clipPlaying, false);
  assert.equal(planBreakFill({ breakOffsetSeconds: 55, adSeconds: paidAdSeconds(two), fill: bed }).clipOffsetSeconds, 10 % DEFAULT_BREAK_FILL_SECONDS);

  assert.equal(live.betweenShowGap(playlists, new Date('2026-11-06T17:01:00.000Z')), null);
  assert.equal(live.betweenShowGap(playlists, noon(59, 900)).offsetSecondsExact, 59.9);
  assert.equal(BREAK_LENGTH_SECONDS, 60);
});

test('preview test break follows adSeconds and does not run on the live host', () => {
  assert.equal(live.previewBreakOffset(), null);
  const preview = engineContext({
    hostname: 'bandtroductions-dev--break-fill.web.app',
    search: '?testBreak=1&adSeconds=18&breakOffset=50'
  });
  const offset = preview.previewBreakOffset();
  assert.ok(offset > 49 && offset < 52);
  assert.equal(preview.previewDemoAdSeconds({ active: true, durationSeconds: 12, audioUrl: 'x' }), 18);
  const simulated = preview.withPreviewTestBreak({ type: 'realBreak' }, { active: true, durationSeconds: 12, audioUrl: 'https://example.com/ad.mp3' });
  assert.equal(simulated.key, 'break|preview-test');
  assert.equal(simulated.clipPlaying, false);
  assert.equal(simulated.durationSeconds, 18);
  const joined = currentBreakFill({
    previewOffset: offset,
    previewAdSeconds: preview.previewDemoAdSeconds({ active: true, audioUrl: 'x', durationSeconds: 12 }),
    previewNextStart: 721
  });
  assert.equal(joined.phase, 'fill');
  assert.ok(Math.abs(joined.elapsedFillSeconds - (offset - 18)) < 0.05);

  const fillOnly = engineContext({
    hostname: 'localhost',
    search: '?testBreak=1&adSeconds=0&breakOffset=10'
  });
  assert.equal(fillOnly.withPreviewTestBreak(null, null), null);
  assert.equal(fillOnly.previewDemoAdSeconds(null), 0);
  const whole = currentBreakFill({ previewOffset: fillOnly.previewBreakOffset(), previewAdSeconds: 0, previewNextStart: 1 });
  assert.equal(whole.phase, 'fill');

  const packed = engineContext({
    hostname: '127.0.0.1',
    search: '?testBreak=1&adSeconds=60&breakOffset=20'
  });
  assert.equal(packed.withPreviewTestBreak(null, null).clipPlaying, true);
  assert.equal(currentBreakFill({ previewOffset: 20, previewAdSeconds: 60, previewNextStart: 1 }), null);
});

test('one audio element seeks to the shared offset and fades without a second player', () => {
  const listeners = {};
  const audio = {
    playsInline: false,
    loop: false,
    muted: false,
    volume: 1,
    paused: true,
    readyState: 0,
    currentTime: 0,
    duration: 12,
    src: '',
    dataset: {},
    setAttribute() {},
    load() { this.readyState = 1; },
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); }
  };
  const late = planBreakFill({ breakOffsetSeconds: 50, adSeconds: 18, fill: bed });
  assert.equal(syncBreakFillAudio(audio, late, { shouldPlay: true, muted: false }), true);
  assert.equal(audio.playsInline, true);
  assert.equal(audio.loop, true);
  assert.equal(audio.paused, false);
  assert.match(audio.src, /break-fill-default\.wav/);
  listeners.loadedmetadata.forEach(fn => fn());
  assert.equal(audio.currentTime, 32 % 12);
  const fading = planBreakFill({ breakOffsetSeconds: 59.2, adSeconds: 0, fill: bed });
  syncBreakFillAudio(audio, fading, { shouldPlay: true });
  assert.ok(audio.volume < 0.7 && audio.volume > 0.5);
  const done = planBreakFill({ breakOffsetSeconds: 59.999, adSeconds: 0, fill: bed });
  syncBreakFillAudio(audio, done, { shouldPlay: true });
  assert.equal(audio.paused, true);
  clearBreakFillAudio(audio);
  assert.equal(audio.loop, false);
  assert.equal(audio.volume, 1);
  assert.equal(audio.dataset.breakFillUrl, undefined);
});

test('accepts iPhone Voice Memo m4a plus mp3, wav, and aac, and rejects other files', () => {
  assert.equal(breakFillContentType('Voice Memo.m4a'), 'audio/mp4');
  assert.equal(breakFillContentType('bed.MP3'), 'audio/mpeg');
  assert.equal(breakFillContentType('bed.wav'), 'audio/wav');
  assert.equal(breakFillContentType('spot.aac'), 'audio/aac');
  assert.equal(breakFillContentType('clip.mp4'), '');
  assert.equal(breakFillContentType('notes.txt'), '');
});

test('built-in bed is a 12 second original wav', () => {
  const wav = readFileSync('assets/radio/break-fill-default.wav');
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 44100);
  const dataBytes = wav.readUInt32LE(40);
  assert.equal(dataBytes / (44100 * 2), DEFAULT_BREAK_FILL_SECONDS);
});

test('control room save stays off on preview and aac is only prepared in the rules file', () => {
  const manager = readFileSync('radio-break-fill-manager.js', 'utf8');
  const admin = readFileSync('admin.html', 'utf8');
  const rules = readFileSync('storage.rules', 'utf8');
  assert.match(admin, /radio-break-fill-manager\.js/);
  assert.match(manager, /Preview is read-only\. No station data changed\./);
  assert.match(manager, /between-show-ads\//);
  assert.match(manager, /breakFill: next/);
  const previewGuard = manager.indexOf('if (preview)');
  const write = manager.indexOf('breakFill: next');
  assert.ok(previewGuard > -1 && previewGuard < write);
  assert.match(rules, /audio\/\(mpeg\|mp4\|x-m4a\|m4a\|wav\|x-wav\|wave\|aac\|x-aac\)/);
  assert.match(rules, /Do not deploy rules from/);
});
