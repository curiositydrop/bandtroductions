import { auth } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';

const style = document.createElement('style');
style.textContent = `
  .community-intro {
    margin-bottom: 8px !important;
  }
  #guest-prompt.community-guest {
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
  #community-loading-skeleton {
    display: grid;
    gap: 10px;
    margin: 8px 0 10px;
  }
  .community-loading-card {
    min-height: 112px;
    border: 1px solid #2f625e;
    border-radius: 14px;
    background: linear-gradient(145deg,#171717,#111);
    padding: 14px;
    overflow: hidden;
  }
  .community-loading-line {
    height: 12px;
    border-radius: 999px;
    margin-bottom: 10px;
    background: linear-gradient(90deg,#202020 20%,#2b2b2b 40%,#202020 60%);
    background-size: 220% 100%;
    animation: bt-community-loading 1.15s linear infinite;
  }
  .community-loading-line.short { width: 38%; }
  .community-loading-line.medium { width: 68%; }
  .community-loading-line.long { width: 92%; }
  @keyframes bt-community-loading {
    from { background-position: 100% 0; }
    to { background-position: -100% 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .community-loading-line { animation: none; }
  }
  @media (max-width: 520px) {
    #guest-prompt .community-actions { width: 100%; }
    #guest-prompt .auth-button { flex: 1; }
  }
`;
document.head.appendChild(style);

function configureGuestPrompt() {
  const prompt = document.getElementById('guest-prompt');
  if (!prompt || prompt.dataset.guestCopyReady === 'true') return;
  prompt.dataset.guestCopyReady = 'true';

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

function installLoadingPolish() {
  const feed = document.getElementById('feed');
  const feedStatus = document.getElementById('feed-status');
  const tools = document.querySelector('.community-tools-wrap');
  const composer = document.getElementById('post-composer');
  const composerName = document.getElementById('composer-name');
  if (!feed || !feedStatus || !tools) return;

  let skeleton = document.getElementById('community-loading-skeleton');
  if (!skeleton) {
    skeleton = document.createElement('section');
    skeleton.id = 'community-loading-skeleton';
    skeleton.setAttribute('aria-label', 'Loading community posts');
    skeleton.innerHTML = `
      <div class="community-loading-card">
        <div class="community-loading-line short"></div>
        <div class="community-loading-line long"></div>
        <div class="community-loading-line medium"></div>
      </div>
      <div class="community-loading-card">
        <div class="community-loading-line short"></div>
        <div class="community-loading-line medium"></div>
        <div class="community-loading-line long"></div>
      </div>`;
    tools.insertAdjacentElement('beforebegin', skeleton);
  }

  const started = Date.now();
  let finished = false;

  const composerReady = () => !composer || composer.hidden || ((composerName?.textContent || '').trim() && (composerName?.textContent || '').trim() !== 'Create a post');

  const finish = () => {
    if (finished) return;
    finished = true;
    skeleton?.remove();
    document.documentElement.classList.remove('bt-community-booting');
    if (composer && !composerReady()) {
      composer.style.visibility = 'hidden';
      const composerObserver = new MutationObserver(() => {
        if (composerReady()) {
          composer.style.visibility = '';
          composerObserver.disconnect();
        }
      });
      composerObserver.observe(composer, { subtree:true, childList:true, attributes:true, characterData:true });
      setTimeout(() => { composer.style.visibility=''; composerObserver.disconnect(); }, 2500);
    }
  };

  const inspect = () => {
    const hasPosts = Boolean(feed.querySelector('.community-post'));
    const statusText = (feedStatus.textContent || '').trim();
    const saysEmpty = /no posts yet/i.test(statusText);
    const stillLoading = /loading the community feed/i.test(statusText);

    if (hasPosts) {
      finish();
      return;
    }

    if (saysEmpty && Date.now() - started < 3200) {
      feedStatus.textContent = 'Loading the community feed…';
      feedStatus.hidden = false;
      return;
    }

    if (!stillLoading && !saysEmpty) finish();
    if (saysEmpty && Date.now() - started >= 3200) finish();
  };

  const observer = new MutationObserver(inspect);
  observer.observe(feed, { childList:true, subtree:true });
  observer.observe(feedStatus, { childList:true, subtree:true, attributes:true, characterData:true });
  inspect();
  setTimeout(() => { inspect(); if (!finished) finish(); observer.disconnect(); }, 3800);
}

function applyCommunityState(user) {
  const feed = document.getElementById('feed');
  const toolsWrap = document.querySelector('.community-tools-wrap');

  configureGuestPrompt();

  // community.html owns the actual prompt/composer visibility. This module only
  // keeps guest mode readable and polishes the startup transition.
  if (feed) {
    feed.hidden = false;
    feed.style.display = '';
  }
  if (toolsWrap) toolsWrap.hidden = false;

  document.body.classList.toggle('community-read-only', !user);
}

installLoadingPolish();
onAuthStateChanged(auth, applyCommunityState);