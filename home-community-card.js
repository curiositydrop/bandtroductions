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
