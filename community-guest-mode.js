import { auth } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';

const style = document.createElement('style');
style.textContent = `
  .community-intro {
    margin-bottom: 8px !important;
  }
  #guest-prompt.community-guest {
    display: block;
    margin: 0 0 10px !important;
    padding: 11px 13px !important;
    border-radius: 13px !important;
  }
  #guest-prompt[hidden] { display: none !important; }
  #guest-prompt .community-guest-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  #guest-prompt p {
    margin: 0;
    font-size: .88rem;
    line-height: 1.35;
  }
  #guest-prompt .community-actions {
    display: flex;
    gap: 7px;
    flex-wrap: wrap;
  }
  #guest-prompt .auth-button {
    width: auto !important;
    min-height: 34px !important;
    padding: 7px 12px !important;
    font-size: .78rem !important;
  }
  body.community-read-only #post-composer {
    display: none !important;
  }
  body.community-read-only .post-comments a[href*="login"] {
    color: #0ccfbd !important;
    font-weight: 900 !important;
    text-decoration-color: #0ccfbd !important;
  }
  @media (max-width: 520px) {
    #guest-prompt .community-actions { width: 100%; }
    #guest-prompt .auth-button { flex: 1; }
  }
`;
document.head.appendChild(style);

function configureGuestPrompt() {
  const prompt = document.getElementById('guest-prompt');
  if (!prompt) return;

  const row = prompt.querySelector('.community-guest-row') || prompt;
  let message = row.querySelector('p');
  if (!message) {
    message = document.createElement('p');
    row.prepend(message);
  }
  message.textContent = 'Browsing read-only. Want to join the conversation?';

  let actions = row.querySelector('.community-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'community-actions';
    row.appendChild(actions);
  }

  let login = actions.querySelector('a[href*="login"]');
  if (!login) {
    login = document.createElement('a');
    login.href = 'login.html';
    login.className = 'auth-button';
    actions.prepend(login);
  }
  login.textContent = 'Log In';

  let signup = actions.querySelector('a[href*="signup"]');
  if (!signup) {
    signup = document.createElement('a');
    signup.href = 'signup.html';
    signup.className = 'auth-button auth-button-secondary';
    actions.appendChild(signup);
  }
  signup.textContent = 'Create Account';
}

function applyCommunityState(user) {
  const prompt = document.getElementById('guest-prompt');
  const composer = document.getElementById('post-composer');
  const feed = document.getElementById('feed');
  const toolsWrap = document.querySelector('.community-tools-wrap');

  configureGuestPrompt();

  if (prompt) prompt.hidden = Boolean(user);
  if (composer) composer.hidden = !user;

  if (feed) {
    feed.hidden = false;
    feed.style.display = '';
  }
  if (toolsWrap) toolsWrap.hidden = false;

  document.body.classList.toggle('community-read-only', !user);
}

onAuthStateChanged(auth, applyCommunityState);