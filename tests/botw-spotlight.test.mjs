import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  LAUNCH_WEEK,
  bandPhotoAvailable,
  escapeHtml,
  joinNames,
  mentionsRadioHour,
  pageFile,
  pickFinalizedChamp,
  safeHref,
  seenStorageKey,
  spotlightAllowed
} from '../botw-spotlight.js';

const finalized = (weekId, winners, extra = {}) => ({ weekId, winners, finalizedAt: { seconds: 1 }, label: `Week ${weekId}`, ...extra });

test('reigning champ is the newest finalized round, never the seed', () => {
  const champ = pickFinalizedChamp([
    { seed: true, weekId: '2026-11-16', winners: ['newer-seed'], label: 'seed' },
    finalized('2026-11-09', ['ascent-to-power'], { label: 'Week of November 9–15' }),
    finalized('2026-11-02', ['older-band']),
    { weekId: '2026-11-23', winners: ['not-final'] }
  ]);
  assert.equal(champ.weekId, '2026-11-09');
  assert.deepEqual(champ.winners, ['ascent-to-power']);
  assert.equal(champ.label, 'Week of November 9–15');
  assert.equal('results' in champ, false);
  assert.equal('totalVotes' in champ, false);
  assert.equal(pickFinalizedChamp([{ seed: true, weekId: '2026-11-02', winners: ['ascent-to-power'] }]), null);
  assert.equal(pickFinalizedChamp([]), null);
  assert.equal(pickFinalizedChamp(null), null);
});

test('radio hour line is only for rounds finalized from the revamp forward', () => {
  assert.equal(LAUNCH_WEEK, '2026-11-09');
  assert.equal(mentionsRadioHour(finalized('2026-11-09', ['ascent-to-power'])), true);
  assert.equal(mentionsRadioHour(finalized('2026-11-16', ['next'])), true);
  assert.equal(mentionsRadioHour(finalized('2026-11-02', ['old'])), false);
  assert.equal(mentionsRadioHour({ seed: true, weekId: '2026-11-16', winners: ['x'], finalizedAt: 1 }), false);
  assert.equal(mentionsRadioHour({ weekId: '2026-11-09', winners: ['x'] }), false);
});

test('seen key is the round plus sorted winner ids', () => {
  assert.equal(seenStorageKey({ weekId: '2026-11-09', winners: ['b', 'a'] }), 'btBotwSpotlight:2026-11-09:a,b');
  assert.equal(seenStorageKey({ weekId: '2026-11-09', winners: ['ascent-to-power'] }), 'btBotwSpotlight:2026-11-09:ascent-to-power');
});

test('spotlight stays off admin, voting, signup, checkout, and band websites', () => {
  assert.equal(pageFile('/'), 'index.html');
  assert.equal(pageFile('/bands.html'), 'bands.html');
  assert.equal(spotlightAllowed('/', ''), true);
  assert.equal(spotlightAllowed('/index.html', ''), true);
  assert.equal(spotlightAllowed('/bands.html', ''), true);
  assert.equal(spotlightAllowed('/musicians.html', ''), true);
  assert.equal(spotlightAllowed('/radio.html', ''), true);
  assert.equal(spotlightAllowed('/about.html', ''), true);
  assert.equal(spotlightAllowed('/venues.html', ''), true);
  assert.equal(spotlightAllowed('/merch.html', ''), true);
  assert.equal(spotlightAllowed('/band-of-the-week.html', ''), false);
  assert.equal(spotlightAllowed('/admin.html', ''), false);
  assert.equal(spotlightAllowed('/admin-auditions.html', ''), false);
  assert.equal(spotlightAllowed('/signup.html', ''), false);
  assert.equal(spotlightAllowed('/sign-up.html', ''), false);
  assert.equal(spotlightAllowed('/login.html', ''), false);
  assert.equal(spotlightAllowed('/plans.html', ''), false);
  assert.equal(spotlightAllowed('/payment-success.html', ''), false);
  assert.equal(spotlightAllowed('/gear-payment.html', ''), false);
  assert.equal(spotlightAllowed('/website.html', '?id=abc'), false);
  assert.equal(spotlightAllowed('/website-pilot.html', ''), false);
  assert.equal(spotlightAllowed('/website-merch-success.html', ''), false);
  assert.equal(spotlightAllowed('/profile-setup.html', ''), false);
  assert.equal(spotlightAllowed('/claim-profile.html', ''), false);
  assert.equal(spotlightAllowed('/merch.html', '?manage=1&band=abc'), false);
  assert.equal(spotlightAllowed('/preview/venue-discovery/index.html', ''), false);
  assert.equal(spotlightAllowed('/_preview/venue-discovery/index.html', ''), false);
});

test('names, photos, and links stay safe and do not invent a portrait', () => {
  assert.equal(joinNames(['Ascent To Power']), 'Ascent To Power');
  assert.equal(joinNames(['A', 'B']), 'A and B');
  assert.equal(joinNames(['A', 'B', 'C']), 'A, B, and C');
  assert.equal(bandPhotoAvailable(''), false);
  assert.equal(bandPhotoAvailable('IMG_9367.png'), false);
  assert.equal(bandPhotoAvailable('https://bandtroductions.com/IMG_9367.png'), false);
  assert.equal(bandPhotoAvailable('inbound8324947404328791301.png'), true);
  assert.equal(escapeHtml(`A & B < ">'`), 'A &amp; B &lt; &quot;&gt;&#39;');
  assert.equal(safeHref('ascent-to-power.html'), 'ascent-to-power.html');
  assert.equal(safeHref('javascript:alert(1)'), '');
  assert.equal(safeHref('//evil.example/phish'), '');
});

test('pages that should show it reference the spotlight, and blocked flows do not need a new script of their own', () => {
  const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
  const globalJs = read('global.js');
  const header = read('global-header-v2.js');
  const spotlight = read('botw-spotlight.js');
  assert.match(globalJs, /import\('\.\/botw-spotlight\.js\?v=1'\)/);
  assert.match(header, /import\('\.\/botw-spotlight\.js\?v=1'\)/);
  assert.match(read('index.html'), /global-header-v2\.js\?v=20261119-botw/);
  assert.match(read('bands.html'), /global\.js\?v=20261119-botw/);
  assert.match(read('musicians.html'), /global\.js\?v=20261119-botw/);
  assert.equal(spotlight.includes('totalVotes'), false);
  assert.equal(spotlight.includes('.pause('), false);
  assert.equal(spotlight.includes('audioPlayer'), false);
  assert.match(spotlight, /loading="lazy"/);
  assert.match(spotlight, /role="dialog"/);
  assert.match(spotlight, /aria-modal="true"/);
  assert.match(read('botw-spotlight.css'), /prefers-reduced-motion:\s*reduce/);
});
