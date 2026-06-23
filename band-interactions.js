import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getDatabase, ref, onValue, runTransaction, push } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyApLiiJsKTw1Fp8J3aQatMqiSZoP_6EycE",
  authDomain: "bandfanwall.firebaseapp.com",
  databaseURL: "https://bandfanwall-default-rtdb.firebaseio.com",
  projectId: "bandfanwall",
  storageBucket: "bandfanwall.firebasestorage.app",
  messagingSenderId: "619241154826",
  appId: "1:619241154826:web:25ddc58eef094e3c0732f3"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 🔥 Get band dynamically
const band = document.body.dataset.band;

// =======================
// 👀 VIEW TRACKING
// =======================

const viewRef = ref(db, `Bands/${band}/analytics/views`);
const viewKey = `viewed_${band}`;

if (!sessionStorage.getItem(viewKey)) {
  sessionStorage.setItem(viewKey, 'true');

  runTransaction(viewRef, (current) => {
    return (current || 0) + 1;
  });
}

// =======================
// 🔥 SUPPORT CLICK TRACKING
// =======================

const supportClicksRef = ref(db, `Bands/${band}/analytics/supportClicks`);

window.trackSupportClick = function () {
  runTransaction(supportClicksRef, (current) => {
    return (current || 0) + 1;
  });
};

const supportBtn = document.querySelector('.support-action');

if (supportBtn) {
  supportBtn.addEventListener('click', () => {
    window.trackSupportClick();
  });
}

// =======================
// 🚀 CREATE PROFILE CLICK TRACKING
// =======================

const createProfileBtn = document.querySelector('.create-profile-action');
const createProfileClicksRef = ref(db, `Bands/${band}/analytics/createProfileClicks`);

if (createProfileBtn) {
  createProfileBtn.addEventListener('click', () => {
    runTransaction(createProfileClicksRef, (current) => {
      return (current || 0) + 1;
    });
  });
}

// =======================
// 📤 SHARE CLICK TRACKING
// =======================

const shareBtn = document.querySelector('.share-action');
const shareClicksRef = ref(db, `Bands/${band}/analytics/shareClicks`);

if (shareBtn) {
  shareBtn.addEventListener('click', () => {
    runTransaction(shareClicksRef, (current) => {
      return (current || 0) + 1;
    });
  });
}

// =======================
// 👍 LIKE SYSTEM
// =======================

const likesRef = ref(db, `Bands/${band}/likes`);
const likeBtn = document.getElementById(`like-btn-${band}`);
const likeStorageKey = `liked_${band}`;

if (likeBtn) {
  onValue(likesRef, (snapshot) => {
    const count = snapshot.val() || 0;

    if (localStorage.getItem(likeStorageKey)) {
      likeBtn.innerHTML = `🔥 Liked (${count})`;
      likeBtn.style.opacity = '0.7';
    } else {
      likeBtn.innerHTML = `🤘 Like (${count})`;
      likeBtn.style.opacity = '1';
    }
  });

  likeBtn.addEventListener('click', () => {
    if (!localStorage.getItem(likeStorageKey)) {
      localStorage.setItem(likeStorageKey, 'true');

      runTransaction(likesRef, (current) => (current || 0) + 1);
    }
  });
}

// =======================
// 🤘 VOTE SYSTEM
// =======================

const votesRef = ref(db, `Bands/${band}/votes`);
const voteBtn = document.querySelector('.vote-btn');
const voteMessage = document.getElementById(`vote-message-${band}`);
const voteStorageKey = `voted_${band}`;

if (voteBtn) {
  onValue(votesRef, () => {
    if (localStorage.getItem(voteStorageKey)) {
      voteBtn.textContent = 'Voted 🤘';
      voteBtn.style.opacity = '0.7';

      if (voteMessage) {
        voteMessage.innerHTML = `🤘 You voted — now show them some love 🔥<br><small>Tap "Support" to back the band</small>`;
      }
    } else {
      voteBtn.textContent = 'Vote';
      voteBtn.style.opacity = '1';
    }
  });

  voteBtn.addEventListener('click', () => {
    if (!localStorage.getItem(voteStorageKey)) {
      localStorage.setItem(voteStorageKey, 'true');

      runTransaction(votesRef, (current) => (current || 0) + 1);
    }
  });
}

// =======================
// 💬 COMMENTS
// =======================

const commentsRef = ref(db, `Bands/${band}/comments`);

const nameInput = document.getElementById('comment-name');
const messageInput = document.getElementById('comment-message');
const postBtn = document.getElementById('post-comment-btn');
const commentFeed = document.getElementById('comment-feed');

if (commentFeed) {
  onValue(commentsRef, (snapshot) => {
    const data = snapshot.val();
    commentFeed.innerHTML = '';

    if (!data) {
      commentFeed.innerHTML = `<p><strong>BANDtroductions:</strong> Be the first to show some love 🤘</p>`;
      return;
    }

    const commentsArray = Object.values(data)
      .filter(c => c.name && c.message)
      .reverse();

    commentsArray.forEach(comment => {
      const div = document.createElement('div');

      div.style.marginBottom = '12px';
      div.style.padding = '14px';
      div.style.borderRadius = '12px';
      div.style.background = '#111';
      div.style.border = '1px solid rgba(0, 200, 180, 0.25)';

      div.innerHTML = `
        <p style="margin:0 0 6px; color:#00c8b4; font-weight:800;">
          ${comment.name}
        </p>
        <p style="margin:0; color:#eee;">
          ${comment.message}
        </p>
      `;

      commentFeed.appendChild(div);
    });
  });
}

if (postBtn) {
  postBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const message = messageInput.value.trim();

    if (!name || !message) return;

    push(commentsRef, {
      name,
      message,
      createdAt: Date.now()
    });

    nameInput.value = '';
    messageInput.value = '';
  });
}
