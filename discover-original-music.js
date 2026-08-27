import { db } from './firebase-dev.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const SOURCE_PAGES = ['bands.html', 'musicians.html'];
const EXCLUDED_LEGACY_PROFILES = new Set(['april-wood-shakira.html']);
const EXCLUDED_ACT_NAMES = new Set(['april wood/shakira']);
const grid = document.getElementById('discover-grid');
const summary = document.getElementById('discover-summary');
const search = document.getElementById('discover-search');
const genre = document.getElementById('discover-genre');
const dialog = document.getElementById('discover-player');
const iframe = document.getElementById('discover-iframe');
const playerTitle = document.getElementById('discover-player-title');
const playerMeta = document.getElementById('discover-player-meta');
const profileLink = document.getElementById('discover-profile-link');
const youtubeLink = document.getElementById('discover-youtube-link');
const closeButton = document.getElementById('discover-close');
const filters = new URLSearchParams(location.search);
const venueName = (filters.get('venue') || '').trim();
let allVideos = [];

function clean(value) {
  return String(value || '').trim();
}

function normalized(value) {
  return clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function searchableWords(value) {
  return normalized(value).replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchesSearch(video, searchTerm) {
  const haystack = normalized([video.artistName, video.location, video.genre].join(' '));
  if (!searchTerm) return true;

  // Profiles use both "Maine" and "ME". Treat either state search as the same filter.
  if (searchTerm === 'maine' || searchTerm === 'me') {
    const words = searchableWords(haystack);
    return words.includes('maine') || words.includes('me');
  }

  return haystack.includes(searchTerm);
}

function profileMeta(profile) {
  return [profile.location, profile.genre || profile.instruments].map(clean).filter(Boolean).join(' • ');
}

function configureVenueHeading() {
  if (!venueName) return;
  document.title = `Who Should Play at ${venueName}? | BANDtroductions`;
  document.getElementById('discover-heading').textContent = `Who Should Play at ${venueName}?`;
  document.getElementById('discover-intro').textContent = `Watch original bands and musicians, explore their profiles, and discover who you would like to see perform at ${venueName}.`;
}

async function fetchPage(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.text();
}

function legacyCardsFromHtml(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return [...parsed.querySelectorAll('.profile-card')].map(card => {
    const paragraphs = [...card.querySelectorAll('p')].map(element => clean(element.textContent));
    const locationLine = paragraphs.find(line => /^location\s*:/i.test(line)) || '';
    const genreLine = paragraphs.find(line => /^(genre|style)\s*:/i.test(line)) || '';
    return {
      artistName: clean(card.querySelector('h3')?.textContent) || 'Original Artist',
      image: card.querySelector('img')?.getAttribute('src') || '',
      profileUrl: card.querySelector('a.button')?.getAttribute('href') || '',
      location: locationLine.replace(/^location\s*:\s*/i, ''),
      genre: clean(card.dataset.genre) || genreLine.replace(/^(genre|style)\s*:\s*/i, ''),
      dataVideo: clean(card.dataset.video)
    };
  }).filter(card => card.profileUrl && !EXCLUDED_LEGACY_PROFILES.has(card.profileUrl.toLowerCase()));
}

async function videosFromLegacyCard(card) {
  const candidates = [card.dataVideo];
  try {
    const html = await fetchPage(card.profileUrl);
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    parsed.querySelectorAll('iframe[src],a[href]').forEach(element => {
      candidates.push(element.getAttribute('src') || element.getAttribute('href') || '');
    });
  } catch (error) {
    console.warn('Could not inspect legacy profile video:', card.profileUrl, error);
  }

  const ids = [];
  candidates.forEach(value => {
    BTProfileVideos.youtubeIdsFromValue(value).forEach(id => {
      if (!ids.includes(id)) ids.push(id);
    });
  });

  const videoId = ids[0];
  if (!videoId) return [];
  return [{
    videoId,
    artistName: card.artistName,
    videoTitle: 'Featured Video',
    image: card.image,
    thumbnailUrl: BTProfileVideos.youtubeThumbnail(videoId),
    profileUrl: card.profileUrl,
    location: card.location,
    genre: card.genre,
    accountType: 'legacy'
  }];
}

async function loadLegacyVideos() {
  const pageResults = await Promise.allSettled(SOURCE_PAGES.map(fetchPage));
  const cards = pageResults.flatMap(result => result.status === 'fulfilled' ? legacyCardsFromHtml(result.value) : []);
  const videoResults = await Promise.all(cards.map(videosFromLegacyCard));
  return videoResults.flat();
}

async function loadFirebaseVideos() {
  const snapshot = await getDocs(query(collection(db, 'profiles'), where('published', '==', true)));
  const videos = [];

  snapshot.forEach(profileDocument => {
    const profile = profileDocument.data() || {};
    const accountType = normalized(profile.accountType || profile.profileType);
    if (accountType !== 'band' && accountType !== 'musician') return;
    if (profile.venueDiscoveryEligible === false) return;

    const artistName = clean(profile.displayName || profile.bandName || profile.name) || 'Original Artist';
    if (EXCLUDED_ACT_NAMES.has(normalized(artistName))) return;
    const featuredVideo = BTProfileVideos.collectProfileVideos(profile)[0];
    if (!featuredVideo) return;
    videos.push({
      videoId: featuredVideo.videoId,
      artistName,
      videoTitle: 'Featured Video',
      image: profile.imageUrl || profile.avatarUrl || profile.photoURL || '',
      thumbnailUrl: featuredVideo.thumbnailUrl,
      profileUrl: `profile.html?id=${encodeURIComponent(profileDocument.id)}`,
      location: clean(profile.location),
      genre: clean(profile.genre || profile.instruments),
      accountType
    });
  });

  return videos;
}

function combineVideos(firebaseVideos, legacyVideos) {
  const byArtist = new Map();
  [...firebaseVideos, ...legacyVideos].forEach(video => {
    const artistKey = normalized(video.artistName);
    if (!video.videoId || !artistKey || EXCLUDED_ACT_NAMES.has(artistKey) || byArtist.has(artistKey)) return;
    byArtist.set(artistKey, video);
  });
  return [...byArtist.values()].sort((a, b) => a.artistName.localeCompare(b.artistName));
}

function openVideo(video) {
  iframe.src = `https://www.youtube.com/embed/${video.videoId}?autoplay=1&rel=0`;
  playerTitle.textContent = video.artistName;
  playerMeta.textContent = [video.location, video.genre, video.videoTitle !== 'Featured Video' ? video.videoTitle : ''].filter(Boolean).join(' • ');
  profileLink.href = video.profileUrl;
  youtubeLink.href = `https://www.youtube.com/watch?v=${video.videoId}`;
  dialog.showModal();
  window.dispatchEvent(new CustomEvent('bandtroductions:venue-video-opened', {
    detail: {
      artistName: video.artistName,
      profileUrl: video.profileUrl,
      videoId: video.videoId
    }
  }));
}

function closeVideo() {
  iframe.src = '';
  dialog.close();
}

function videoCard(video) {
  const card = document.createElement('article');
  card.className = 'discover-card';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Watch ${video.artistName}`);

  const thumb = document.createElement('div');
  thumb.className = 'discover-thumb';
  const image = document.createElement('img');
  image.src = video.thumbnailUrl || video.image || 'IMG_9383.jpeg';
  image.alt = `${video.artistName} video thumbnail`;
  image.loading = 'lazy';
  image.addEventListener('error', () => {
    if (video.image && image.src !== video.image) image.src = video.image;
    else image.src = 'IMG_9383.jpeg';
  }, { once: true });
  const play = document.createElement('span');
  play.className = 'discover-play';
  play.setAttribute('aria-hidden', 'true');
  play.textContent = '▶';
  thumb.append(image, play);

  const copy = document.createElement('div');
  copy.className = 'discover-card-copy';
  const heading = document.createElement('h2');
  heading.textContent = video.artistName;
  const meta = document.createElement('p');
  meta.textContent = [video.location, video.genre].filter(Boolean).join(' • ') || 'Original Music';
  copy.append(heading, meta);
  card.append(thumb, copy);

  card.addEventListener('click', () => openVideo(video));
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openVideo(video);
    }
  });
  return card;
}

function render() {
  const searchTerm = normalized(search.value);
  const selectedGenre = normalized(genre.value);
  const visible = allVideos.filter(video => {
    const searchMatch = matchesSearch(video, searchTerm);
    const genreMatch = selectedGenre === 'all' || normalized(video.genre).includes(selectedGenre);
    return searchMatch && genreMatch;
  });

  grid.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'discover-empty';
    empty.textContent = allVideos.length ? 'No original acts match those filters yet.' : 'No profile videos are available yet.';
    grid.appendChild(empty);
  } else {
    visible.forEach(video => grid.appendChild(videoCard(video)));
  }
  summary.textContent = `${visible.length} video${visible.length === 1 ? '' : 's'} from original bands and musicians`;
}

async function load() {
  configureVenueHeading();
  const [firebaseResult, legacyResult] = await Promise.allSettled([loadFirebaseVideos(), loadLegacyVideos()]);
  const firebaseVideos = firebaseResult.status === 'fulfilled' ? firebaseResult.value : [];
  const legacyVideos = legacyResult.status === 'fulfilled' ? legacyResult.value : [];
  if (firebaseResult.status === 'rejected') console.error('Firebase profile videos could not be loaded:', firebaseResult.reason);
  if (legacyResult.status === 'rejected') console.error('Legacy profile videos could not be loaded:', legacyResult.reason);
  allVideos = combineVideos(firebaseVideos, legacyVideos);
  render();
}

search.addEventListener('input', render);
genre.addEventListener('change', render);
closeButton.addEventListener('click', closeVideo);
dialog.addEventListener('click', event => {
  if (event.target === dialog) closeVideo();
});
dialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeVideo();
});

load();
