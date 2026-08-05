import { auth } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';

const params = new URLSearchParams(location.search);
const viewedProfileId = params.get('id');
const actions = document.querySelector('.profile-actions');

if (actions && viewedProfileId) {
  const messageLink = document.createElement('a');
  messageLink.id = 'message-profile';
  messageLink.className = 'auth-button auth-button-secondary';
  messageLink.textContent = 'Message';
  messageLink.href = `messages.html?to=${encodeURIComponent(viewedProfileId)}`;
  messageLink.hidden = true;
  actions.appendChild(messageLink);

  onAuthStateChanged(auth, user => {
    if (!user) {
      messageLink.hidden = true;
      return;
    }
    messageLink.hidden = user.uid === viewedProfileId;
  });
}
