import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { planCommercialBreak, commercialAtOffset } from '../radio-break-planner.mjs';
import {
  BREAK_LENGTH_SECONDS,
  FILL_FADE_SECONDS,
  breakFillContentType,
  paidAdSeconds,
  resolveBreakFill,
  planBreakFill,
  planBreakFillSave,
  previewableBreakFill,
  currentBreakFill,
  clampFillSeek,
  syncBreakFillAudio,
  clearBreakFillAudio,
  releaseFillAudio,
  isApprovedFillUrl,
  fillBlockedByFailure
} from '../radio-break-fill.mjs';

const STORAGE = 'https://firebasestorage.googleapis.com/v0/b/bandtroductions-dev.firebasestorage.app/o/between-show-ads%2Fadmin%2Fpromo.m4a?alt=media&token=abc';
const bed = resolveBreakFill({ enabled: true, audioUrl: STORAGE, durationSeconds: 12, label: 'Promo' });
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

test('missing, disabled, placeholder, and foreign audio stay off', () => {
  assert.equal(resolveBreakFill(null), null);
  assert.equal(resolveBreakFill(undefined), null);
  assert.equal(resolveBreakFill({}), null);
  assert.equal(resolveBreakFill({ enabled: false, audioUrl: STORAGE, durationSeconds: 12 }), null);
  assert.equal(resolveBreakFill({ audioUrl: STORAGE, durationSeconds: 12 }), null);
  assert.equal(resolveBreakFill({ enabled: true, audioUrl: '/assets/radio/break-fill-default.wav', durationSeconds: 12 }), null);
  assert.equal(resolveBreakFill({ enabled: true, audioUrl: 'https://bandtroductions.com/assets/radio/break-fill-default.wav', durationSeconds: 12 }), null);
  assert.equal(resolveBreakFill({ enabled: true, audioUrl: 'https://example.com/bed.m4a', durationSeconds: 30 }), null);
  assert.equal(resolveBreakFill({ enabled: true, audioUrl: STORAGE, durationSeconds: 0 }), null);
  assert.equal(bed.audioUrl, STORAGE);
  assert.equal(bed.source, 'custom');
  assert.equal(existsSync('assets/radio/break-fill-default.wav'), false);
  const gap = { offsetSecondsExact: 10, endedShow: 'Early', nextShow: 'Late', nextStartMinutes: 721 };
  assert.equal(currentBreakFill({ sponsorConfig: { active: true, ads: [] }, fillConfig: undefined, gap }), null);
  assert.equal(currentBreakFill({ sponsorConfig: { active: true }, fillConfig: { enabled: true, audioUrl: '/assets/radio/break-fill-default.wav', durationSeconds: 12 }, gap }), null);
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
  assert.equal(late.clipOffsetSeconds, 32 % 12);
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
  const short = resolveBreakFill({ enabled: true, audioUrl: STORAGE.replace('promo.m4a', 'short.mp3'), durationSeconds: 5 });
  const looped = planBreakFill({ breakOffsetSeconds: 22, adSeconds: 0, fill: short });
  assert.equal(looped.loop, true);
  assert.equal(looped.clipOffsetSeconds, 2);
  const long = resolveBreakFill({ enabled: true, audioUrl: STORAGE.replace('promo.m4a', 'long.mp3'), durationSeconds: 90 });
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
  assert.equal(currentBreakFill({ sponsorConfig: legacy, fillConfig: null, gap }), null);
  const late = currentBreakFill({ sponsorConfig: legacy, fillConfig: { enabled: true, audioUrl: STORAGE, durationSeconds: 12 }, gap });
  assert.equal(late.phase, 'fill');
  assert.equal(late.clipOffsetSeconds, 32 % 12);
  assert.equal(late.nextShow, 'Late Show');
  assert.equal(currentBreakFill({ sponsorConfig: legacy, fillConfig: { enabled: false }, gap }), null);

  const empty = { active: true, ads: [] };
  assert.equal(live.sponsorBreak(playlists, empty, noon(30)), null);
  const openGap = live.betweenShowGap(playlists, noon(30));
  assert.equal(currentBreakFill({ sponsorConfig: empty, fillConfig: null, gap: openGap }), null);
  const open = currentBreakFill({ sponsorConfig: empty, fillConfig: { enabled: true, audioUrl: STORAGE, durationSeconds: 12 }, gap: openGap });
  assert.equal(open.phase, 'fill');
  assert.equal(open.adSeconds, 0);
  assert.equal(open.clipOffsetSeconds, 30 % 12);

  const two = { active: true, ads: [ad(20), ad(25)] };
  assert.equal(live.sponsorBreak(playlists, two, noon(55)).clipPlaying, false);
  assert.equal(planBreakFill({ breakOffsetSeconds: 55, adSeconds: paidAdSeconds(two), fill: bed }).clipOffsetSeconds, 10 % 12);

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
  assert.equal(currentBreakFill({
    previewOffset: offset,
    previewAdSeconds: 18,
    previewNextStart: 721
  }), null);
  const joined = currentBreakFill({
    fillConfig: { enabled: true, audioUrl: STORAGE, durationSeconds: 12 },
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
  assert.equal(currentBreakFill({ previewOffset: fillOnly.previewBreakOffset(), previewAdSeconds: 0, previewNextStart: 1 }), null);
  const whole = currentBreakFill({
    fillConfig: { enabled: true, audioUrl: STORAGE, durationSeconds: 12 },
    previewOffset: fillOnly.previewBreakOffset(),
    previewAdSeconds: 0,
    previewNextStart: 1
  });
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
  assert.match(audio.src, /promo\.m4a/);
  assert.equal(syncBreakFillAudio(audio, { ...late, audioUrl: '/assets/radio/break-fill-default.wav' }, { shouldPlay: true }), false);
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

test('a saved bed can be previewed without choosing a replacement', () => {
  const savedOff = { enabled: false, audioUrl: STORAGE, durationSeconds: 22, label: 'Promo' };
  assert.equal(resolveBreakFill(savedOff), null);
  assert.equal(previewableBreakFill(savedOff).audioUrl, STORAGE);
  assert.equal(previewableBreakFill({ enabled: true, audioUrl: STORAGE, durationSeconds: 22 }).audioUrl, STORAGE);
  assert.equal(previewableBreakFill(null), null);
  assert.equal(previewableBreakFill({ enabled: true, audioUrl: '/assets/radio/break-fill-default.wav', durationSeconds: 12 }), null);
  assert.equal(previewableBreakFill({ audioUrl: 'https://example.com/bed.m4a', durationSeconds: 12 }), null);
  const again = planBreakFillSave({ enabled: true, existing: savedOff, fileReady: false, label: 'Promo' });
  assert.equal(again.ok, true);
  assert.equal(again.needsUpload, false);
  assert.equal(again.breakFill.audioUrl, STORAGE);
  assert.match(readFileSync('radio-break-fill-manager.js', 'utf8'), /previewableBreakFill\(stored\)/);
});

test('save cannot enable a bed without an approved upload', () => {
  assert.equal(planBreakFillSave({ enabled: true, existing: null, fileReady: false }).reason, 'upload-required');
  assert.equal(planBreakFillSave({ enabled: true, existing: { enabled: true, audioUrl: '/assets/radio/break-fill-default.wav', durationSeconds: 12 }, fileReady: false }).reason, 'upload-required');
  const uploaded = planBreakFillSave({ enabled: true, fileReady: true, durationSeconds: 22.5, label: 'Promo' });
  assert.equal(uploaded.ok, true);
  assert.equal(uploaded.needsUpload, true);
  const again = planBreakFillSave({ enabled: true, existing: { enabled: true, audioUrl: STORAGE, durationSeconds: 12, label: 'Promo' }, fileReady: false });
  assert.equal(again.ok, true);
  assert.equal(again.breakFill.audioUrl, STORAGE);
  const off = planBreakFillSave({ enabled: false, existing: { enabled: true, audioUrl: STORAGE, durationSeconds: 12 } });
  assert.equal(off.breakFill.enabled, false);
  assert.equal(isApprovedFillUrl(off.breakFill.audioUrl), true);
  assert.equal(planBreakFillSave({ enabled: false, existing: { audioUrl: '/assets/radio/break-fill-default.wav' } }).breakFill.audioUrl, '');
});

test('ads are not shortened for the bed, and a bad ad list is left untouched', () => {
  const legacy = { active: true, audioUrl: 'https://example.com/ad.mp3', durationSeconds: 18, sponsorName: 'Keep' };
  assert.equal(planBreakFill({ breakOffsetSeconds: 17.95, adSeconds: paidAdSeconds(legacy), fill: bed }).phase, 'ad');
  assert.equal(planBreakFill({ breakOffsetSeconds: 18, adSeconds: paidAdSeconds(legacy), fill: bed }).phase, 'fill');
  const two = { active: true, ads: [ad(20), ad(25)] };
  const before = JSON.stringify(two);
  assert.equal(planBreakFill({ breakOffsetSeconds: 44.999, adSeconds: paidAdSeconds(two), fill: bed }).phase, 'ad');
  assert.equal(planBreakFill({ breakOffsetSeconds: 45, adSeconds: paidAdSeconds(two), fill: bed }).clipOffsetSeconds, 0);
  assert.equal(live.sponsorBreak(playlists, two, noon(10)).clipPlaying, true);
  assert.equal(JSON.stringify(two), before);
  const over = { active: true, ads: [ad(40), ad(30), ad(10)] };
  const overBefore = JSON.stringify(over);
  assert.equal(live.sponsorBreak(playlists, over, noon(5)), null);
  assert.equal(paidAdSeconds(over), 0);
  assert.equal(JSON.stringify(over), overBefore);
  assert.equal(planBreakFill({ breakOffsetSeconds: 59.9, adSeconds: 60, fill: bed }).phase, 'none');
});

test('remaining 10, 20, 40, and 60 seconds fade only at the end', () => {
  for (const remaining of [60, 40, 20, 10]) {
    const plan = planBreakFill({ breakOffsetSeconds: 60 - remaining, adSeconds: 0, fill: bed });
    assert.equal(plan.phase, 'fill');
    assert.equal(plan.remainingSeconds, remaining);
    assert.equal(plan.volume, 1);
  }
  let previous = 1;
  for (const offset of [58.8, 59.2, 59.6, 59.9]) {
    const volume = planBreakFill({ breakOffsetSeconds: offset, adSeconds: 0, fill: bed }).volume;
    assert.ok(volume < previous);
    previous = volume;
  }
  assert.equal(planBreakFill({ breakOffsetSeconds: 60, adSeconds: 0, fill: bed }).phase, 'none');
});

test('a failed or late fill load cannot hold the next show', () => {
  const plays = [];
  const listeners = {};
  const audio = {
    playsInline: false, loop: false, muted: false, volume: 1, paused: true, readyState: 0, currentTime: 0, duration: 12, src: 'pending',
    dataset: {},
    setAttribute() {},
    removeAttribute(name) { if (name === 'src') this.src = ''; },
    load() { this.readyState = 0; },
    play() { plays.push('play'); this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); }
  };
  const fill = planBreakFill({ breakOffsetSeconds: 50, adSeconds: 0, fill: bed });
  syncBreakFillAudio(audio, fill, { shouldPlay: true, current: () => null });
  assert.equal(plays.length, 1);
  listeners.loadedmetadata.forEach(fn => fn());
  assert.equal(plays.length, 1);
  assert.equal(audio.paused, true);
  assert.equal(audio.src, '');
  const broken = {
    ...audio,
    dataset: {},
    src: '',
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); }
  };
  plays.length = 0;
  syncBreakFillAudio(broken, fill, { shouldPlay: true, current: () => fill });
  listeners.error.forEach(fn => fn());
  assert.equal(fillBlockedByFailure(broken, fill), true);
  assert.equal(syncBreakFillAudio(broken, fill, { shouldPlay: true, current: () => fill }), false);
  releaseFillAudio(broken);
  assert.equal(broken.paused, true);
  assert.equal(broken.volume, 1);
});

test('control room save stays off on preview and aac is only prepared in the rules file', () => {
  const manager = readFileSync('radio-break-fill-manager.js', 'utf8');
  const admin = readFileSync('admin.html', 'utf8');
  const rules = readFileSync('storage.rules', 'utf8');
  assert.match(admin, /radio-break-fill-manager\.js/);
  assert.match(manager, /Preview is read-only\. No station data changed\./);
  assert.match(manager, /between-show-ads\//);
  assert.match(manager, /breakFill: next/);
  assert.match(manager, /planBreakFillSave/);
  assert.doesNotMatch(manager, /break-fill-default/);
  assert.doesNotMatch(manager, /Use built-in bed/);
  assert.match(readFileSync('radio-page.js', 'utf8'), /releaseFillAudio/);
  assert.match(readFileSync('dashboard-radio-firestore.js', 'utf8'), /releaseFillAudio/);
  for (const untouched of ['radio-break-planner.mjs', 'radio-two-ad-editor.js', 'radio-station-id-library.js', 'sponsor-break.json', 'between-show-ad-manager.js']) {
    assert.equal(existsSync(untouched), true);
  }
  const previewGuard = manager.indexOf('if (preview)');
  const write = manager.indexOf('breakFill: next');
  assert.ok(previewGuard > -1 && previewGuard < write);
  assert.match(rules, /audio\/\(mpeg\|mp4\|x-m4a\|m4a\|wav\|x-wav\|wave\|aac\|x-aac\)/);
  assert.match(rules, /Do not deploy rules from/);
});
