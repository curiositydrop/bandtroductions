const homeGrid = document.querySelector('.bt-card-grid');
const sponsorCard = homeGrid?.querySelector('.bt-sponsor-card');

if (homeGrid && sponsorCard && !homeGrid.querySelector('.bt-community-card')) {
  const communityCard = document.createElement('a');
  communityCard.className = 'bt-card bt-community-card';
  communityCard.href = 'community.html';
  communityCard.innerHTML = `
    <h3>🤘 Join the Community</h3>
    <p>Post updates, share music, and connect with bands, musicians, venues, and scene supporters.</p>
    <span>Enter →</span>
  `;

  sponsorCard.insertAdjacentElement('afterend', communityCard);
}

// Keep the no-app app layer isolated from the working homepage and global runtime.
// If this helper ever fails to load, the existing site continues normally.
if (!document.querySelector('script[data-bt-pwa]')) {
  const pwaScript = document.createElement('script');
  pwaScript.src = 'pwa-install.js?v=1';
  pwaScript.defer = true;
  pwaScript.dataset.btPwa = 'true';
  pwaScript.onerror = () => console.warn('BANDtroductions no-app app helper did not load.');
  document.head.appendChild(pwaScript);
}
