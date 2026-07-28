import { auth } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';

const style = document.createElement('style');
style.textContent = `
  html, body { overflow-x: hidden !important; }
  .profile-page { display:block !important; width:100% !important; max-width:none !important; margin:0 !important; padding:14px 0 30px !important; box-sizing:border-box !important; }
  #profile-content { position:relative !important; left:50% !important; transform:translateX(-50%) !important; width:min(calc(100vw - 16px),760px) !important; max-width:calc(100vw - 16px) !important; margin:0 !important; gap:10px !important; box-sizing:border-box !important; }
  .profile-card { width:100% !important; max-width:100% !important; box-sizing:border-box !important; margin:0 !important; border:1px solid #3b3b3b !important; border-radius:16px !important; box-shadow:0 8px 20px rgba(0,0,0,.28) !important; }
  .profile-card:not(.profile-cover) { padding:18px !important; background:linear-gradient(145deg,#1a1a1a,#121212) !important; }
  .profile-cover { padding:0 !important; border-color:#343434 !important; }
  .profile-cover::after { border-color:rgba(255,255,255,.08) !important; }
  .profile-avatar { border-color:#0ccfbd !important; }
  .profile-kicker,.profile-detail strong,.profile-feature-link span { color:#0ccfbd !important; }
  .profile-detail,.profile-feature-link { border-color:#333 !important; background:#0d0d0d !important; }
  .profile-badge,.profile-support-pill { border-color:#3a3a3a !important; background:#111 !important; }
  .profile-actions,.profile-links { width:100% !important; box-sizing:border-box !important; }
  .profile-actions .auth-button,.profile-links .auth-button { max-width:100% !important; border-radius:999px !important; }

  body.fan-profile .profile-name-row { display:flex !important; align-items:center !important; justify-content:center !important; gap:10px !important; }
  body.fan-profile .profile-name-emoji { order:-1 !important; margin:0 !important; }
  body.fan-profile .profile-title { order:0 !important; }
  body.fan-profile .profile-actions { grid-template-columns:repeat(3,minmax(0,1fr)) !important; gap:10px !important; }
  body.fan-profile .profile-actions > .auth-button { width:100% !important; min-width:0 !important; margin:0 !important; }

  @media (max-width:650px) {
    #profile-content { width:calc(100vw - 16px) !important; max-width:calc(100vw - 16px) !important; gap:10px !important; }
    .profile-card { border-radius:15px !important; }
    .profile-card:not(.profile-cover) { padding:16px !important; }
    .profile-cover { padding:0 !important; }
  }
`;
document.head.appendChild(style);

const nameRow = document.querySelector('.profile-name-row');
const emoji = document.getElementById('profile-name-emoji');
const title = document.getElementById('profile-name');
if (nameRow && emoji && title) nameRow.insertBefore(emoji, title);

const profileId = new URLSearchParams(window.location.search).get('id');
const editButton = document.getElementById('edit-profile');

onAuthStateChanged(auth, (user) => {
  if (!editButton) return;
  editButton.hidden = !user || !profileId || user.uid !== profileId;
});