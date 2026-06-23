import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyApLiiJsKTw1Fp8J3aQatMqiSZoP_6EycE",
  authDomain: "bandfanwall.firebaseapp.com",
  databaseURL: "https://bandfanwall-default-rtdb.firebaseio.com",
  projectId: "bandfanwall",
  storageBucket: "bandfanwall.firebasestorage.app",
  messagingSenderId: "619241154826",
  appId: "1:619241154826:web:25ddc58eef094e3c0732f3"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getDatabase(app);

const band = document.body.dataset.band;

if (band) {
  const profileRef = ref(db, `Bands/${band}`);

  onValue(profileRef, (snapshot) => {
    const profile = snapshot.val();

    if (!profile) {
      console.log(`No profile data found for ${band}.`);
      return;
    }

    setText("band-name", profile.name);
    setText("band-meta", profile.meta);
    setText("band-badge", profile.badge);
    setText("featured-title", profile.featuredTitle);
    setText("featured-description", profile.featuredDescription);
    setText("band-bio", profile.bio);
    setText("band-availability", profile.availability);
    setText("band-location", profile.location);
    setText("booking-text", profile.bookingText);

    if (profile.name) {
      setText("learn-more-summary", `Learn more about ${profile.name}`);
      document.title = `${profile.name} | BANDtroductions`;
    }

    setImage("band-banner", profile.bannerImage, profile.name ? `${profile.name} banner image` : "");
    setImage("band-avatar", profile.avatarImage, profile.name ? `${profile.name} profile image` : "");

    setIframe("featured-video", profile.featuredVideo);

    updateMembers(profile.members);
    updateLinks(profile.links);
    updateBookingEmail(profile.bookingEmail, profile.name);
  });
}

function setText(id, value) {
  const el = document.getElementById(id);

  if (el && value !== undefined && value !== null && value !== "") {
    el.textContent = value;
  }
}

function setImage(id, src, alt) {
  const el = document.getElementById(id);

  if (el && src) {
    el.src = src;

    if (alt) {
      el.alt = alt;
    }
  }
}

function setIframe(id, src) {
  const el = document.getElementById(id);

  if (el && src) {
    el.src = src;
  }
}

function updateMembers(members) {
  const membersList = document.getElementById("band-members");

  if (!membersList || !Array.isArray(members)) return;

  membersList.innerHTML = "";

  members.forEach((member) => {
    const li = document.createElement("li");
    li.textContent = member;
    membersList.appendChild(li);
  });
}

function updateLinks(links) {
  const linksBox = document.getElementById("band-links");

  if (!linksBox || !Array.isArray(links)) return;

  linksBox.innerHTML = "";

  links.forEach((link) => {
    if (!link.label || !link.url) return;

    const a = document.createElement("a");
    a.href = link.url;
    a.textContent = link.label;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    linksBox.appendChild(a);
  });
}

function updateBookingEmail(email, bandName) {
  const emailLink = document.getElementById("booking-email");

  if (!emailLink || !email) return;

  const subject = encodeURIComponent("Booking Inquiry via BANDtroductions");

  emailLink.href = `mailto:${email}?subject=${subject}`;
  emailLink.textContent = bandName ? `Email ${bandName}` : "Email Band";
}
