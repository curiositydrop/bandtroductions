(function exposeProfileVideoUtilities(global) {
  'use strict';

  const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{6,}$/;

  function cleanText(value) {
    return String(value || '').trim();
  }

  function possibleUrls(value) {
    const text = cleanText(value);
    if (!text) return [];

    const matches = text.match(/https?:\/\/[^\s<>"']+/gi) || [text];
    return matches.map(url => url.replace(/[),.;]+$/g, ''));
  }

  function youtubeIdFromUrl(value) {
    for (const candidate of possibleUrls(value)) {
      try {
        const parsed = new URL(candidate, global.location?.href || 'https://bandtroductions.com/');
        const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
        let id = '';

        if (host === 'youtu.be') {
          id = parsed.pathname.split('/').filter(Boolean)[0] || '';
        } else if (host.endsWith('youtube.com')) {
          const parts = parsed.pathname.split('/').filter(Boolean);
          if (parsed.pathname === '/watch') id = parsed.searchParams.get('v') || '';
          else if (['embed', 'shorts', 'live'].includes(parts[0])) id = parts[1] || '';
        }

        if (YOUTUBE_ID_PATTERN.test(id)) return id;
      } catch (_) {}
    }
    return '';
  }

  function youtubeIdsFromValue(value) {
    const ids = [];
    possibleUrls(value).forEach(candidate => {
      const id = youtubeIdFromUrl(candidate);
      if (id && !ids.includes(id)) ids.push(id);
    });
    return ids;
  }

  function youtubeEmbedUrl(value) {
    const id = youtubeIdFromUrl(value);
    return id ? `https://www.youtube.com/embed/${id}` : '';
  }

  function youtubeThumbnail(value, quality = 'hqdefault') {
    const id = YOUTUBE_ID_PATTERN.test(cleanText(value)) ? cleanText(value) : youtubeIdFromUrl(value);
    return id ? `https://i.ytimg.com/vi/${id}/${quality}.jpg` : '';
  }

  function profileVideoValues(profile = {}) {
    const values = [];
    const add = (value, title = '') => {
      if (value) values.push({ value, title: cleanText(title) });
    };

    add(
      profile.mediaLink || profile.videoUrl || profile.youtubeUrl || profile.videoLink || profile.performanceVideo || profile.mediaUrl,
      profile.featuredTitle || 'Featured Video'
    );

    const mediaItems = Array.isArray(profile.mediaItems) ? profile.mediaItems : [];
    mediaItems.forEach(item => {
      if (!item) return;
      if (typeof item === 'string') add(item, 'More Video');
      else if (String(item.type || 'video').toLowerCase() === 'video') add(item.url, item.caption || item.title || 'More Video');
    });

    const additionalMedia = Array.isArray(profile.additionalMedia) ? profile.additionalMedia : [];
    additionalMedia.forEach(item => {
      if (!item) return;
      if (typeof item === 'string') add(item, 'More Video');
      else add(item.url, item.title || item.caption || 'More Video');
    });

    return values;
  }

  function collectProfileVideos(profile = {}) {
    const seen = new Set();
    const videos = [];

    profileVideoValues(profile).forEach(item => {
      youtubeIdsFromValue(item.value).forEach((videoId, index) => {
        if (seen.has(videoId)) return;
        seen.add(videoId);
        videos.push({
          videoId,
          embedUrl: `https://www.youtube.com/embed/${videoId}`,
          thumbnailUrl: youtubeThumbnail(videoId),
          title: index ? `${item.title || 'More Video'} ${index + 1}` : (item.title || 'Featured Video')
        });
      });
    });

    return videos;
  }

  global.BTProfileVideos = Object.freeze({
    collectProfileVideos,
    possibleUrls,
    youtubeEmbedUrl,
    youtubeIdFromUrl,
    youtubeIdsFromValue,
    youtubeThumbnail
  });
})(globalThis);
