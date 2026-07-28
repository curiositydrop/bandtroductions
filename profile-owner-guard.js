import { auth } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';

const editButton = document.getElementById('edit-profile');
const profileId = new URLSearchParams(window.location.search).get('id');

if (editButton) {
  editButton.hidden = true;
  editButton.style.setProperty('display', 'none', 'important');
}

onAuthStateChanged(auth, (user) => {
  if (!editButton) return;

  const ownsProfile = Boolean(user && profileId && user.uid === profileId);
  editButton.hidden = !ownsProfile;
  editButton.style.setProperty('display', ownsProfile ? 'inline-flex' : 'none', 'important');
});
