// Radio Share Kit rules: who may see it, which songs count, and the public link.
// No Firebase imports. Callers must already be allowed to read the records they pass in.

export const SHARE_KIT_UTM = Object.freeze({
  utm_source: 'band_share',
  utm_medium: 'social',
  utm_campaign: 'radio_share_kit'
});

export const SHARE_KIT_EVENTS = Object.freeze({
  share: 'share_kit_share',
  download: 'share_kit_download',
  copy: 'share_kit_copy_link'
});

export const SHARE_KIT_LINE = "We're on BANDtroductions Radio!";
export const PROFILE_ORIGIN = 'https://bandtroductions.com';
const PROFILE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const OWNER_TYPES = new Set(['band', 'musician']);

// Pages that are not a band profile, even if a track stored one as profileUrl.
const UTILITY_PAGES = new Set([
  'index.html', 'radio.html', 'radio-submit.html', 'radio-sponsor.html', 'radio-admin.html',
  'admin.html', 'login.html', 'signup.html', 'profile-setup.html', 'dashboard.html',
  'community.html', 'band-of-the-week.html', 'website.html', 'website-pilot.html',
  'website-upgrade-preview.html', 'messages.html', 'notifications.html', 'plans.html',
  'merch.html', 'faq.html', 'about.html', 'musicians.html', 'bands.html', 'venues.html',
  'create-profile.html', 'profile.html', 'radio-share-kit-preview.html'
]);

export function isApprovedSong(track) {
  if (!track || typeof track !== 'object' || Array.isArray(track)) return false;
  const id = String(track.id || '');
  if (!id || id === '__station' || id.startsWith('__')) return false;
  return track.approved === true;
}

function siteHost(hostname) {
  return String(hostname || '').replace(/^www\./, '').toLowerCase() === 'bandtroductions.com';
}

function profileIdFromUrl(value) {
  let url;
  try { url = new URL(value); } catch { return ''; }
  const file = url.pathname.split('/').filter(Boolean).pop() || '';
  if (file !== 'profile.html') return '';
  const id = url.searchParams.get('id') || '';
  return PROFILE_ID.test(id) ? id : '';
}

// Approved songs point at a band through websiteProfileId (website uploads)
// or profileUrl (radio-submit.html writes profile.html?id=<uid>, including from a preview host).
// submittedByUid is not a band: admin uploads store the admin's uid and an empty profileUrl.
export function destinationForTrack(track) {
  const explicit = String(track?.websiteProfileId || '').trim();
  if (PROFILE_ID.test(explicit)) {
    return {
      key: `id:${explicit}`,
      profileId: explicit,
      path: `profile.html?id=${encodeURIComponent(explicit)}`
    };
  }
  const fromProfileUrl = profileIdFromUrl(track?.profileUrl);
  if (fromProfileUrl) {
    return {
      key: `id:${fromProfileUrl}`,
      profileId: fromProfileUrl,
      path: `profile.html?id=${encodeURIComponent(fromProfileUrl)}`
    };
  }
  let url;
  try { url = new URL(String(track?.profileUrl || '')); } catch { return null; }
  if (!siteHost(url.hostname)) return null;
  const file = url.pathname.split('/').filter(Boolean).pop() || '';
  if (!file.endsWith('.html') || UTILITY_PAGES.has(file)) return null;
  return { key: `page:${file}`, profileId: '', path: file };
}

function httpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

export function tracksFromMap(map) {
  if (!map || typeof map !== 'object') return [];
  return Object.entries(map).map(([id, value]) => ({
    id,
    ...(value && typeof value === 'object' ? value : {})
  }));
}

// Public card fields only. Contact email, notes, storage paths, and audio URLs stay out.
export function groupApprovedBands(tracks) {
  const bands = new Map();
  for (const track of tracks || []) {
    if (!isApprovedSong(track)) continue;
    const destination = destinationForTrack(track);
    if (!destination) continue;
    const current = bands.get(destination.key) || {
      key: destination.key,
      profileId: destination.profileId,
      path: destination.path,
      songCount: 0,
      artist: '',
      coverUrl: ''
    };
    current.songCount += 1;
    if (!current.artist && track.artist) current.artist = String(track.artist).slice(0, 200);
    if (!current.coverUrl) current.coverUrl = httpUrl(track.coverUrl);
    bands.set(destination.key, current);
  }
  return [...bands.values()].sort((a, b) => (a.artist || a.profileId || a.path).localeCompare(b.artist || b.profileId || b.path));
}

export function ownsProfile(user, profileId, profile) {
  if (!user?.uid || !profileId) return false;
  const owner = String(profile?.ownerId || profile?.userId || profile?.uid || '').trim();
  return user.uid === profileId || Boolean(owner && user.uid === owner);
}

export function offerShareKit({ user, profileId, profile, songCount }) {
  if (!ownsProfile(user, profileId, profile)) return false;
  if (!Number.isFinite(songCount) || songCount < 1) return false;
  const type = String(profile?.accountType || 'band').trim().toLowerCase();
  return OWNER_TYPES.has(type);
}

// The website callable already returns approved public songs. Count those plus
// any matching legacy RadioTracks rows without double-counting an id.
export function songCountForProfile(profileId, { callableTracks = [], libraryTracks = [] } = {}) {
  if (!profileId) return { songCount: 0, coverUrl: '' };
  const ids = new Set();
  let coverUrl = '';
  for (const track of callableTracks || []) {
    if (!track || typeof track !== 'object') continue;
    if (track.approved === false) continue;
    const id = String(track.id || track.title || '').trim();
    if (!id) continue;
    ids.add(id);
    if (!coverUrl) coverUrl = httpUrl(track.coverUrl);
  }
  for (const track of libraryTracks || []) {
    if (!isApprovedSong(track)) continue;
    const destination = destinationForTrack(track);
    if (!destination || destination.profileId !== profileId) continue;
    ids.add(String(track.id));
    if (!coverUrl) coverUrl = httpUrl(track.coverUrl);
  }
  return { songCount: ids.size, coverUrl };
}

export function buildShareLink({ profileId = '', path = '' } = {}) {
  const id = PROFILE_ID.test(profileId) ? profileId : '';
  const target = id
    ? `${PROFILE_ORIGIN}/profile.html?id=${encodeURIComponent(id)}`
    : `${PROFILE_ORIGIN}/${String(path || '').replace(/^\//, '')}`;
  const url = new URL(target);
  url.searchParams.set('utm_source', SHARE_KIT_UTM.utm_source);
  url.searchParams.set('utm_medium', SHARE_KIT_UTM.utm_medium);
  url.searchParams.set('utm_campaign', SHARE_KIT_UTM.utm_campaign);
  const content = id || String(path || '').replace(/^\//, '');
  if (content) url.searchParams.set('utm_content', content);
  return url.href;
}

export function shareKitFileName(name) {
  const slug = String(name || 'band').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return `bandtroductions-radio-${slug || 'band'}.png`;
}

export function profileImageUrl(profile) {
  return httpUrl(profile?.imageUrl) || httpUrl(profile?.avatarUrl) || httpUrl(profile?.photoURL) || '';
}

export function bandInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const letters = (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || 'BT').slice(0, 2)).toUpperCase();
  return letters || 'BT';
}
