(async function addLiveProfilesToBandfeed() {
  function waitForLegacyLoad() {
    const loading = document.getElementById('loadingMessage');
    if (!loading || loading.style.display === 'none' || /No videos found yet/i.test(loading.textContent || '')) {
      return Promise.resolve();
    }

    return new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.removeEventListener('bandfeed:legacy-loaded', finish);
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(finish, 30000);
      window.addEventListener('bandfeed:legacy-loaded', finish, { once: true });
    });
  }

  try {
    await waitForLegacyLoad();
    const [{ db }, { collection, getDocs, query, where }] = await Promise.all([
      import('./firebase-dev.js'),
      import('https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js')
    ]);
    const snapshot = await getDocs(query(collection(db, 'profiles'), where('published', '==', true)));
    const existingVideoIds = new Set((bandfeedItems || [])
      .map(item => String(item.videoId || '').toLowerCase())
      .filter(Boolean));
    const additions = [];

    snapshot.docs.forEach(profileDocument => {
      const profile = profileDocument.data() || {};
      const type = String(profile.accountType || profile.profileType || '').toLowerCase();
      if (type !== 'band' && type !== 'musician') return;

      const artistName = profile.displayName || profile.bandName || profile.name || 'BANDtroductions Artist';
      const profileUrl = `profile.html?id=${encodeURIComponent(profileDocument.id)}`;
      const image = profile.imageUrl || profile.avatarUrl || profile.photoURL || profile.profileImageUrl || 'IMG_9383.jpeg';
      const meta = [profile.location, profile.genre || profile.instruments].filter(Boolean).join(' • ') || 'BANDtroductions Social';

      BTProfileVideos.collectProfileVideos(profile).forEach((video, videoIndex) => {
        const videoKey = String(video.videoId).toLowerCase();
        if (!videoKey || existingVideoIds.has(videoKey)) return;
        const videoTitle = videoIndex === 0 || !video.title || video.title === 'Featured Video'
          ? artistName
          : `${artistName} — ${video.title}`;
        additions.push({
          title: videoTitle,
          artistName,
          image,
          profileUrl,
          meta,
          embedUrl: video.embedUrl,
          videoId: video.videoId,
          fallbackUrl: null
        });
        existingVideoIds.add(videoKey);
      });
    });

    additions.sort((a, b) => a.artistName.localeCompare(b.artistName));
    if (!additions.length) return;

    const startIndex = bandfeedItems.length;
    bandfeedItems.push(...additions);
    additions.forEach((item, offset) => browserContainer.appendChild(createVideoItem(item, startIndex + offset)));
    if (loadingMessage) loadingMessage.style.display = 'none';
    if (!player) buildPlayerIfReady();
    console.log(`BANDfeed added ${additions.length} live profile video(s).`);
  } catch (error) {
    console.warn('Live BANDfeed profiles could not be loaded.', error);
  }
})();
