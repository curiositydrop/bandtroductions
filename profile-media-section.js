import { db } from './firebase-dev.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const profileId = new URLSearchParams(location.search).get('id');

if (profileId) {
  const style = document.createElement('style');
  style.textContent = `
    #profile-content{width:calc(100% - 12px)!important;max-width:760px!important;min-width:0!important;padding:0!important;margin:0 auto!important;box-sizing:border-box!important;overflow-x:hidden}
    #profile-content>.profile-card{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}
    .profile-image-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px;width:100%;min-width:0}
    .profile-image-card{display:block;width:100%;min-width:0;aspect-ratio:1/1;border:1px solid #333;border-radius:12px;overflow:hidden;background:#080808;padding:0;cursor:pointer}
    .profile-image-card img{display:block;width:100%;height:100%;object-fit:cover}
    .profile-image-card[hidden]{display:none}
    .profile-image-more{display:flex;justify-content:center;margin-top:14px}
    .profile-lightbox{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.92)}
    .profile-lightbox[hidden]{display:none}
    .profile-lightbox img{display:block;max-width:min(96vw,1200px);max-height:88vh;object-fit:contain;border-radius:12px;background:#050505}
    .profile-lightbox-close{position:fixed;top:14px;right:14px;width:44px;height:44px;border:1px solid #777;border-radius:50%;background:#111;color:#fff;font-size:1.5rem;cursor:pointer}
    .profile-lightbox-caption{max-width:min(96vw,900px);margin:10px auto 0;color:#ddd;text-align:center}
    @media(max-width:340px){.profile-image-grid{gap:5px}}
  `;
  document.head.appendChild(style);

  const content = document.getElementById('profile-content');
  const section = document.createElement('section');
  section.className = 'profile-card';
  section.hidden = true;
  section.innerHTML = `
    <h2 style="margin:0">Images</h2>
    <div id="profile-image-grid" class="profile-image-grid"></div>
    <div id="profile-image-more" class="profile-image-more" hidden>
      <button id="toggle-profile-images" class="auth-button auth-button-secondary" type="button">Show More Images</button>
    </div>
  `;

  const moreVideos = document.getElementById('more-videos-section');
  if (moreVideos) moreVideos.insertAdjacentElement('afterend', section);
  else content?.appendChild(section);

  const lightbox = document.createElement('div');
  lightbox.className = 'profile-lightbox';
  lightbox.hidden = true;
  lightbox.innerHTML = `<button class="profile-lightbox-close" type="button" aria-label="Close image">×</button><div><img alt=""><p class="profile-lightbox-caption"></p></div>`;
  document.body.appendChild(lightbox);

  const grid = section.querySelector('#profile-image-grid');
  const moreWrap = section.querySelector('#profile-image-more');
  const toggleButton = section.querySelector('#toggle-profile-images');
  const lightboxImage = lightbox.querySelector('img');
  const lightboxCaption = lightbox.querySelector('.profile-lightbox-caption');
  let expanded = false;

  function openImage(item) {
    lightboxImage.src = item.url;
    lightboxImage.alt = item.caption || 'Profile image';
    lightboxCaption.textContent = item.caption || '';
    lightboxCaption.hidden = !item.caption;
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeImage() {
    lightbox.hidden = true;
    lightboxImage.removeAttribute('src');
    document.body.style.overflow = '';
  }

  lightbox.querySelector('.profile-lightbox-close').addEventListener('click', closeImage);
  lightbox.addEventListener('click', event => { if (event.target === lightbox) closeImage(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !lightbox.hidden) closeImage(); });

  function updateVisibility() {
    [...grid.children].forEach((card, index) => { card.hidden = !expanded && index >= 6; });
    toggleButton.textContent = expanded ? 'Show Fewer Images' : 'Show More Images';
  }

  toggleButton.addEventListener('click', () => {
    expanded = !expanded;
    updateVisibility();
  });

  getDoc(doc(db, 'profiles', profileId)).then(snapshot => {
    if (!snapshot.exists()) return;
    const images = (Array.isArray(snapshot.data().mediaItems) ? snapshot.data().mediaItems : [])
      .filter(item => item?.type === 'image' && item.url);

    if (!images.length) return;

    images.forEach(item => {
      const button = document.createElement('button');
      button.className = 'profile-image-card';
      button.type = 'button';
      button.setAttribute('aria-label', item.caption ? `Open ${item.caption}` : 'Open profile image');
      const image = document.createElement('img');
      image.src = item.url;
      image.alt = item.caption || 'Profile image';
      image.loading = 'lazy';
      button.appendChild(image);
      button.addEventListener('click', () => openImage(item));
      grid.appendChild(button);
    });

    section.hidden = false;
    moreWrap.hidden = images.length <= 6;
    updateVisibility();
  }).catch(error => console.error('Profile images could not be loaded:', error));
}
