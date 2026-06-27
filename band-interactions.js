import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  runTransaction,
  push
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";

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

// =======================
// 🔥 GET BAND DYNAMICALLY
// =======================

const band = document.body.dataset.band;

console.log("BANDtroductions Firebase band slug:", band);

if (!band) {
  console.error("Missing data-band on <body>. Firebase paths cannot be created.");
  throw new Error("Missing data-band on body.");
}

// =======================
// 👀 VIEW TRACKING
// =======================

const viewRef = ref(db, `Bands/${band}/analytics/views`);
const viewKey = `viewed_${band}`;

if (!sessionStorage.getItem(viewKey)) {
  runTransaction(viewRef, (current) => {
    return (current || 0) + 1;
  })
    .then(() => {
      sessionStorage.setItem(viewKey, "true");
      console.log(`View saved for ${band}`);
    })
    .catch((error) => {
      console.error(`View tracking failed for ${band}:`, error);
    });
}

// =======================
// 🔥 SUPPORT CLICK TRACKING
// =======================

const supportClicksRef = ref(db, `Bands/${band}/analytics/supportClicks`);

window.trackSupportClick = function () {
  return runTransaction(supportClicksRef, (current) => {
    return (current || 0) + 1;
  })
    .then(() => {
      console.log(`Support click saved for ${band}`);
    })
    .catch((error) => {
      console.error(`Support click failed for ${band}:`, error);
    });
};

const supportBtns = document.querySelectorAll(".support-action:not(.create-profile-action)");

supportBtns.forEach((supportBtn) => {
  supportBtn.addEventListener("click", () => {
    window.trackSupportClick();
  });
});

// =======================
// 🚀 CREATE PROFILE CLICK TRACKING
// =======================

const createProfileBtn = document.querySelector(".create-profile-action");
const createProfileClicksRef = ref(db, `Bands/${band}/analytics/createProfileClicks`);

if (createProfileBtn) {
  createProfileBtn.addEventListener("click", () => {
    runTransaction(createProfileClicksRef, (current) => {
      return (current || 0) + 1;
    })
      .then(() => {
        console.log(`Create profile click saved for ${band}`);
      })
      .catch((error) => {
        console.error(`Create profile click failed for ${band}:`, error);
      });
  });
}

// =======================
// 📤 SHARE CLICK TRACKING
// =======================

const shareBtn = document.querySelector(".share-action");
const shareClicksRef = ref(db, `Bands/${band}/analytics/shareClicks`);

if (shareBtn) {
  shareBtn.addEventListener("click", () => {
    runTransaction(shareClicksRef, (current) => {
      return (current || 0) + 1;
    })
      .then(() => {
        console.log(`Share click saved for ${band}`);
      })
      .catch((error) => {
        console.error(`Share click failed for ${band}:`, error);
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
  onValue(
    likesRef,
    (snapshot) => {
      const count = snapshot.val() || 0;

      if (localStorage.getItem(likeStorageKey)) {
        likeBtn.innerHTML = `🔥 Liked (${count})`;
        likeBtn.style.opacity = "0.7";
      } else {
        likeBtn.innerHTML = `🤘 Like (${count})`;
        likeBtn.style.opacity = "1";
      }
    },
    (error) => {
      console.error(`Reading likes failed for ${band}:`, error);
    }
  );

  likeBtn.addEventListener("click", () => {
    if (localStorage.getItem(likeStorageKey)) {
      console.log(`Already liked ${band} on this device/browser.`);
      return;
    }

    likeBtn.disabled = true;
    likeBtn.style.opacity = "0.5";

    runTransaction(likesRef, (current) => {
      return (current || 0) + 1;
    })
      .then(() => {
        localStorage.setItem(likeStorageKey, "true");
        console.log(`Like saved for ${band}`);
      })
      .catch((error) => {
        console.error(`Like failed for ${band}:`, error);
        alert("The like did not save. Firebase may be blocking the request. Check the console for details.");
      })
      .finally(() => {
        likeBtn.disabled = false;
      });
  });
} else {
  console.warn(`Like button not found for ${band}. Expected ID: like-btn-${band}`);
}

// =======================
// 🤘 VOTE SYSTEM
// =======================

const votesRef = ref(db, `Bands/${band}/votes`);
const voteBtn = document.querySelector(".vote-btn");
const voteMessage = document.getElementById(`vote-message-${band}`);
const voteStorageKey = `voted_${band}`;

if (voteBtn) {
  onValue(
    votesRef,
    () => {
      if (localStorage.getItem(voteStorageKey)) {
        voteBtn.textContent = "Voted 🤘";
        voteBtn.style.opacity = "0.7";

        if (voteMessage) {
          voteMessage.innerHTML = `🤘 You voted — now show them some love 🔥<br><small>Tap "Support" to back the band</small>`;
        }
      } else {
        voteBtn.textContent = "Vote";
        voteBtn.style.opacity = "1";

        if (voteMessage) {
          voteMessage.innerHTML = "";
        }
      }
    },
    (error) => {
      console.error(`Reading votes failed for ${band}:`, error);
    }
  );

  voteBtn.addEventListener("click", () => {
    if (localStorage.getItem(voteStorageKey)) {
      console.log(`Already voted for ${band} on this device/browser.`);
      return;
    }

    voteBtn.disabled = true;
    voteBtn.style.opacity = "0.5";

    runTransaction(votesRef, (current) => {
      return (current || 0) + 1;
    })
      .then(() => {
        localStorage.setItem(voteStorageKey, "true");
        console.log(`Vote saved for ${band}`);
      })
      .catch((error) => {
        console.error(`Vote failed for ${band}:`, error);
        alert("The vote did not save. Firebase may be blocking the request. Check the console for details.");
      })
      .finally(() => {
        voteBtn.disabled = false;
      });
  });
} else {
  console.warn(`Vote button not found for ${band}.`);
}

// =======================
// 💬 COMMENTS
// =======================

const commentsRef = ref(db, `Bands/${band}/comments`);

const nameInput = document.getElementById("comment-name");
const messageInput = document.getElementById("comment-message");
const postBtn = document.getElementById("post-comment-btn");
const commentFeed = document.getElementById("comment-feed");

function renderDefaultCommentMessage() {
  if (!commentFeed) return;

  commentFeed.innerHTML = "";

  const p = document.createElement("p");
  const strong = document.createElement("strong");

  strong.textContent = "BANDtroductions:";
  p.appendChild(strong);
  p.appendChild(document.createTextNode(" Be the first to show some love 🤘"));

  commentFeed.appendChild(p);
}

if (commentFeed) {
  onValue(
    commentsRef,
    (snapshot) => {
      const data = snapshot.val();
      commentFeed.innerHTML = "";

      if (!data) {
        renderDefaultCommentMessage();
        return;
      }

      const commentsArray = Object.values(data)
        .filter((c) => c && c.name && c.message)
        .reverse();

      if (!commentsArray.length) {
        renderDefaultCommentMessage();
        return;
      }

      commentsArray.forEach((comment) => {
        const div = document.createElement("div");

        div.style.marginBottom = "12px";
        div.style.padding = "14px";
        div.style.borderRadius = "12px";
        div.style.background = "#111";
        div.style.border = "1px solid rgba(0, 200, 180, 0.25)";

        const nameP = document.createElement("p");
        nameP.style.margin = "0 0 6px";
        nameP.style.color = "#00c8b4";
        nameP.style.fontWeight = "800";
        nameP.textContent = comment.name;

        const messageP = document.createElement("p");
        messageP.style.margin = "0";
        messageP.style.color = "#eee";
        messageP.textContent = comment.message;

        div.appendChild(nameP);
        div.appendChild(messageP);

        commentFeed.appendChild(div);
      });
    },
    (error) => {
      console.error(`Reading comments failed for ${band}:`, error);
    }
  );
}

if (postBtn) {
  postBtn.addEventListener("click", () => {
    if (!nameInput || !messageInput) {
      console.error("Comment inputs are missing.");
      return;
    }

    const name = nameInput.value.trim();
    const message = messageInput.value.trim();

    if (!name || !message) {
      alert("Please enter your name and a comment first.");
      return;
    }

    postBtn.disabled = true;
    postBtn.textContent = "Posting...";

    push(commentsRef, {
      name,
      message,
      createdAt: Date.now()
    })
      .then(() => {
        console.log(`Comment saved for ${band}`);
        nameInput.value = "";
        messageInput.value = "";
      })
      .catch((error) => {
        console.error(`Comment failed for ${band}:`, error);
        alert("The comment did not save. Firebase may be blocking the request. Check the console for details.");
      })
      .finally(() => {
        postBtn.disabled = false;
        postBtn.textContent = "Post Comment";
      });
  });
} else {
  console.warn("Post comment button not found.");
}
