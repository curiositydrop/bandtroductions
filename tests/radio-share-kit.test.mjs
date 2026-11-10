import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SHARE_KIT_EVENTS,
  SHARE_KIT_LINE,
  SHARE_KIT_UTM,
  buildShareLink,
  destinationForTrack,
  groupApprovedBands,
  isApprovedSong,
  offerShareKit,
  ownsProfile,
  shareKitFileName,
  songCountForProfile,
  tracksFromMap
} from '../radio-share-kit-core.mjs';

const PROFILE = 'bandOwner123';
const approved = (extra = {}) => ({
  id: 'song-1',
  approved: true,
  reviewStatus: 'approved',
  artist: 'Harbor Lights',
  title: 'Night Shift',
  websiteProfileId: PROFILE,
  contactEmail: 'private@example.com',
  notes: 'do not share',
  audioStoragePath: 'radio-submissions/secret.mp3',
  coverUrl: 'https://example.com/cover.jpg',
  ...extra
});

test('approved songs are the control-room flag, not pending or rejected rows', () => {
  assert.equal(isApprovedSong(approved()), true);
  assert.equal(isApprovedSong(approved({ approved: false, reviewStatus: 'approved' })), false);
  assert.equal(isApprovedSong(approved({ approved: false, reviewStatus: 'pending' })), false);
  assert.equal(isApprovedSong({ id: '__station', approved: true, playlists: {} }), false);
  assert.equal(isApprovedSong({ id: 'song-1', reviewStatus: 'approved' }), false);
});

test('bands group by profile id and drop private submission fields', () => {
  const bands = groupApprovedBands([
    approved(),
    approved({ id: 'song-2', title: 'Second' }),
    approved({ id: 'other', websiteProfileId: 'otherBand', artist: 'Other' }),
    approved({ id: 'pending', approved: false }),
    { id: 'admin-upload', approved: true, submittedByUid: 'adminUid', profileUrl: '', artist: 'Admin Show', contactEmail: 'admin@example.com' }
  ]);
  assert.deepEqual(bands.map(band => band.profileId), [PROFILE, 'otherBand']);
  const harbor = bands.find(band => band.profileId === PROFILE);
  assert.equal(harbor.songCount, 2);
  assert.equal(harbor.artist, 'Harbor Lights');
  assert.equal(harbor.coverUrl, 'https://example.com/cover.jpg');
  assert.equal('contactEmail' in harbor, false);
  assert.equal('notes' in harbor, false);
  assert.equal('audioStoragePath' in harbor, false);
  assert.equal(bands.some(band => band.artist === 'Admin Show'), false);
});

test('profile links accept the live site and preview-host profile.html?id=', () => {
  assert.equal(destinationForTrack({ websiteProfileId: PROFILE }).profileId, PROFILE);
  assert.equal(destinationForTrack({
    profileUrl: 'https://bandtroductions.com/profile.html?id=' + PROFILE
  }).profileId, PROFILE);
  assert.equal(destinationForTrack({
    profileUrl: 'https://bandtroductions-dev--share-kit-abc.web.app/profile.html?id=' + PROFILE
  }).profileId, PROFILE);
  assert.equal(destinationForTrack({
    profileUrl: 'https://www.bandtroductions.com/profile.html?id=' + PROFILE
  }).key, `id:${PROFILE}`);
  assert.deepEqual(destinationForTrack({ profileUrl: 'https://bandtroductions.com/burning-time.html' }), {
    key: 'page:burning-time.html',
    profileId: '',
    path: 'burning-time.html'
  });
  assert.equal(destinationForTrack({ profileUrl: 'https://bandtroductions.com/admin.html' }), null);
  assert.equal(destinationForTrack({ profileUrl: 'javascript:alert(1)' }), null);
});

test('legacy RadioTracks map ignores the station node', () => {
  const bands = groupApprovedBands(tracksFromMap({
    __station: { playlists: { morning: {} } },
    'harbor-song': { approved: true, artist: 'Harbor Lights', profileUrl: `https://bandtroductions.com/profile.html?id=${PROFILE}` },
    'waiting': { approved: false, artist: 'Nope', websiteProfileId: PROFILE }
  }));
  assert.equal(bands.length, 1);
  assert.equal(bands[0].songCount, 1);
  assert.equal(bands[0].profileId, PROFILE);
});

test('share links use the public profile and the radio share kit UTM convention', () => {
  const link = new URL(buildShareLink({ profileId: PROFILE }));
  assert.equal(link.origin, 'https://bandtroductions.com');
  assert.equal(link.pathname, '/profile.html');
  assert.equal(link.searchParams.get('id'), PROFILE);
  assert.equal(link.searchParams.get('utm_source'), SHARE_KIT_UTM.utm_source);
  assert.equal(link.searchParams.get('utm_medium'), SHARE_KIT_UTM.utm_medium);
  assert.equal(link.searchParams.get('utm_campaign'), SHARE_KIT_UTM.utm_campaign);
  assert.equal(link.searchParams.get('utm_content'), PROFILE);
  assert.equal(SHARE_KIT_UTM.utm_source, 'band_share');
  assert.equal(SHARE_KIT_UTM.utm_medium, 'social');
  assert.equal(SHARE_KIT_UTM.utm_campaign, 'radio_share_kit');
  const legacy = new URL(buildShareLink({ path: 'burning-time.html' }));
  assert.equal(legacy.pathname, '/burning-time.html');
  assert.equal(legacy.searchParams.get('utm_campaign'), 'radio_share_kit');
  assert.equal(legacy.searchParams.get('utm_content'), 'burning-time.html');
  assert.equal(buildShareLink({ profileId: 'bad id' }).includes('bad id'), false);
});

test('owner kit is only offered to the band or musician who owns an approved song', () => {
  const user = { uid: PROFILE };
  const band = { ownerId: PROFILE, accountType: 'band', published: true };
  assert.equal(ownsProfile(user, PROFILE, band), true);
  assert.equal(ownsProfile({ uid: 'fan' }, PROFILE, band), false);
  assert.equal(offerShareKit({ user, profileId: PROFILE, profile: band, songCount: 1 }), true);
  assert.equal(offerShareKit({ user, profileId: PROFILE, profile: band, songCount: 0 }), false);
  assert.equal(offerShareKit({ user, profileId: PROFILE, profile: { ...band, accountType: 'musician' }, songCount: 2 }), true);
  assert.equal(offerShareKit({ user, profileId: PROFILE, profile: { ...band, accountType: 'fan' }, songCount: 2 }), false);
  assert.equal(offerShareKit({ user, profileId: PROFILE, profile: { ...band, accountType: 'venue' }, songCount: 2 }), false);
  assert.equal(offerShareKit({ user: { uid: 'fan' }, profileId: PROFILE, profile: band, songCount: 3 }), false);
  assert.equal(offerShareKit({ user, profileId: 'other', profile: { ownerId: 'other', accountType: 'band' }, songCount: 1 }), false);
});

test('callable songs and legacy songs count once per id for that profile only', () => {
  const counted = songCountForProfile(PROFILE, {
    callableTracks: [{ id: 'song-1', title: 'Night Shift', coverUrl: 'https://cdn.example/a.jpg' }],
    libraryTracks: [
      approved({ id: 'song-1' }),
      approved({ id: 'song-9', websiteProfileId: 'else' }),
      { id: 'legacy', approved: true, profileUrl: `https://bandtroductions.com/profile.html?id=${PROFILE}`, coverUrl: 'not a url' }
    ]
  });
  assert.equal(counted.songCount, 2);
  assert.equal(counted.coverUrl, 'https://cdn.example/a.jpg');
  assert.equal(songCountForProfile('missing', { callableTracks: [], libraryTracks: [] }).songCount, 0);
});

test('events, filename, and wording stay stable', () => {
  assert.deepEqual(SHARE_KIT_EVENTS, {
    share: 'share_kit_share',
    download: 'share_kit_download',
    copy: 'share_kit_copy_link'
  });
  assert.equal(SHARE_KIT_LINE, "We're on BANDtroductions Radio!");
  assert.equal(shareKitFileName('Harbor Lights'), 'bandtroductions-radio-harbor-lights.png');
});

test('pages wire the kit without radio writes, and Band of the Week reuses the share card', () => {
  const botw = readFileSync('band-of-the-week.js', 'utf8');
  const card = readFileSync('share-card.js', 'utf8');
  const owner = readFileSync('radio-share-kit-owner.js', 'utf8');
  const admin = readFileSync('radio-share-kit-admin.js', 'utf8');
  const kit = readFileSync('radio-share-kit.js', 'utf8');
  const profile = readFileSync('profile.html', 'utf8');
  const website = readFileSync('website-pilot.html', 'utf8');
  const control = readFileSync('control-room-radio.js', 'utf8');
  const room = readFileSync('control-room-radio-v2.js', 'utf8');
  assert.match(botw, /drawShareCard\(/);
  assert.match(botw, /I VOTED 🤘/);
  assert.match(botw, /for Band of the Week/);
  assert.match(card, /1080/);
  assert.match(profile, /radio-share-kit-owner\.js/);
  assert.match(website, /radio-share-kit-owner\.js/);
  assert.match(control, /radio-share-kit-admin\.js/);
  assert.match(kit, /share_kit_share|SHARE_KIT_EVENTS/);
  assert.match(owner, /getWebsiteRadioTracks/);
  assert.doesNotMatch(owner, /radioApprovedTracks/);
  assert.doesNotMatch(owner, /setDoc|updateDoc|deleteDoc|uploadBytes/);
  const firestoreImport = admin.match(/import \{([^}]+)\} from 'https:\/\/www\.gstatic\.com\/firebasejs\/12\.16\.0\/firebase-firestore\.js'/)[1];
  const names = firestoreImport.split(',').map(part => part.trim());
  assert.deepEqual(names, ['collection', 'doc', 'getDoc', 'onSnapshot']);
  const databaseImport = admin.match(/import \{([^}]+)\} from 'https:\/\/www\.gstatic\.com\/firebasejs\/12\.16\.0\/firebase-database\.js'/)[1];
  assert.deepEqual(databaseImport.split(',').map(part => part.trim()), ['getDatabase', 'ref', 'onValue']);
  assert.doesNotMatch(admin, /setDoc|updateDoc|deleteDoc|uploadBytes/);
  assert.match(room, /function approveSong/);
  assert.match(room, /function savePlaylist/);
});
