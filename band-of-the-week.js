import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const SOURCE_PAGES = [
  "bands.html",
  "musicians.html"
];

const FALLBACK_IMAGE = "IMG_9383.jpeg";

const currentWinnerName = document.getElementById("currentWinnerName");
const currentWinnerImage = document.getElementById("currentWinnerImage");
const currentWinnerMeta = document.getElementById("currentWinnerMeta");
const currentWinnerVotes = document.getElementById("currentWinnerVotes");
const currentWinnerLink = document.getElementById("currentWinnerLink");
const leaderboard = document.getElementById("botwLeaderboard");

let profileData = {};
let firebaseStats = null;

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function profileUrlToId(url) {
  if (!url) return "";

  const clean = url
    .split("?")[0]
    .split("#")[0]
    .replace(/^.*\//, "")
    .replace(".html", "");

  return slugify(clean);
}

function safeNumber(value) {
  return Number(value || 0);
}

function cleanImagePath(src) {
  if (!src) return FALLBACK_IMAGE;

  return String(src)
    .replace(/^https?:\/\/(www\.)?curiositydrop\.com\/bandtroductions\//i, "https://www.bandtroductions.com/")
    .trim();
}

function getBandNameFromFirebase(id, bandData) {
  return (
    bandData?.name ||
    bandData?.bandName ||
    bandData?.title ||
    bandData?.displayName ||
    id.replace(/-/g, " ")
  );
}

function getImageFromFirebase(bandData) {
  return cleanImagePath(
    bandData?.image ||
    bandData?.profileImage ||
    bandData?.photo ||
    bandData?.logo ||
    bandData?.avatar ||
    bandData?.banner ||
    ""
  );
}

function addProfileKey(key, card) {
  const cleanKey = slugify(key);
  if (!cleanKey) return;
  profileData[cleanKey] = card;
}

function findProfileInfo(id, bandData) {
  const possibleKeys = [
    id,
    slugify(id),
    bandData?.name,
    bandData?.bandName,
    bandData?.title,
    bandData?.displayName,
    profileUrlToId(bandData?.profileUrl),
    profileUrlToId(bandData?.url),
    profileUrlToId(bandData?.link)
  ].filter(Boolean);

  for (const key of possibleKeys) {
    const cleanKey = slugify(key);
    if (profileData[cleanKey]) {
      return profileData[cleanKey];
    }
  }

  const firebaseName = getBandNameFromFirebase(id, bandData);
  const firebaseImage = getImageFromFirebase(bandData);

  return {
    id,
    title: firebaseName,
    image: firebaseImage || FALLBACK_IMAGE,
    profileUrl: bandData?.profileUrl || bandData?.url || bandData?.link || "#",
    meta: bandData?.meta || bandData?.location || "Local Band"
  };
}

async function fetchHtml(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}`);
  return await response.text();
}

function parseCardsFromPage(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const cards = [...doc.querySelectorAll(".profile-card")];

  return cards.map(card => {
    const title = card.querySelector("h3")?.textContent?.trim() || "Untitled Artist";

    const img = card.querySelector("img");
    const image =
      img?.getAttribute("src") ||
      img?.getAttribute("data-src") ||
      FALLBACK_IMAGE;

    const profileUrl = card.querySelector("a.button")?.getAttribute("href") || "#";

    const metaLines = [...card.querySelectorAll("p")]
      .map(p => p.textContent.trim())
      .filter(Boolean);

    const meta = metaLines.join(" • ") || "Maine Music";

    const id =
      card.getAttribute("data-band-id") ||
      card.getAttribute("data-id") ||
      profileUrlToId(profileUrl) ||
      slugify(title);

    return {
      id: slugify(id),
      title,
      image: cleanImagePath(image),
      profileUrl,
      meta
    };
  }).filter(item => item.profileUrl && item.profileUrl !== "#");
}

async function loadProfileData() {
  const allCards = [];

  for (const page of SOURCE_PAGES) {
    try {
      const html = await fetchHtml(page);
      const cards = parseCardsFromPage(html);
      allCards.push(...cards);
    } catch (err) {
      console.log("Could not load source page:", page, err);
    }
  }

  profileData = {};

  allCards.forEach(card => {
    addProfileKey(card.id, card);
    addProfileKey(card.title, card);
    addProfileKey(profileUrlToId(card.profileUrl), card);
  });

  renderBOTW();
}

function buildRankedBands() {
  if (!firebaseStats) return [];

  return Object.entries(firebaseStats)
    .map(([id, bandData]) => {
      const votes = safeNumber(bandData.votes);
      const likes = safeNumber(bandData.likes);
      const views = safeNumber(bandData.analytics?.views);
      const supportClicks = safeNumber(bandData.analytics?.supportClicks);
      const shareClicks = safeNumber(bandData.analytics?.shareClicks);

      const score =
        (votes * 5) +
        (likes * 2) +
        (supportClicks * 10) +
        (shareClicks * 4) +
        (views * 0.25);

      const info = findProfileInfo(id, bandData);

      return {
        id,
        votes,
        likes,
        views,
        supportClicks,
        shareClicks,
        score,
        info
      };
    })
    .sort((a, b) => b.score - a.score);
}

function renderBOTW() {
  if (!firebaseStats) return;

  const rankedBands = buildRankedBands();

  if (!rankedBands.length) {
    currentWinnerName.textContent = "No votes yet";
    currentWinnerMeta.textContent = "Start voting to crown the first Band of the Week.";
    currentWinnerVotes.textContent = "";
    leaderboard.innerHTML = `<p class="botw-empty">No leaderboard data yet.</p>`;
    return;
  }

  const winner = rankedBands[0];

  currentWinnerName.textContent = winner.info.title;
  currentWinnerImage.src = winner.info.image || FALLBACK_IMAGE;
  currentWinnerImage.alt = winner.info.title;
  currentWinnerImage.onerror = () => {
    currentWinnerImage.src = FALLBACK_IMAGE;
  };

  currentWinnerMeta.textContent = winner.info.meta || "Maine Music";
  currentWinnerVotes.textContent =
    `${winner.votes} votes • ${winner.likes} likes • ${winner.views} views • Score: ${Math.round(winner.score)}`;
  currentWinnerLink.href = winner.info.profileUrl || "#";

  leaderboard.innerHTML = "";

  rankedBands.forEach((band, index) => {
    const row = document.createElement("div");
    row.className = "botw-winner";

    const img = document.createElement("img");
    img.src = band.info.image || FALLBACK_IMAGE;
    img.alt = band.info.title;
    img.onerror = () => {
      img.src = FALLBACK_IMAGE;
    };

    const content = document.createElement("div");

    const title = document.createElement("h3");
    title.textContent = `#${index + 1} ${band.info.title}`;

    const meta = document.createElement("p");
    meta.textContent = band.info.meta || "Maine Music";

    const stats = document.createElement("p");
    stats.textContent = `${band.votes} votes • ${band.likes} likes • ${band.views} views`;

    const score = document.createElement("p");
    score.textContent = `🔥 Score: ${Math.round(band.score)}`;

    const links = document.createElement("div");
    links.className = "band-links";

    const viewButton = document.createElement("a");
    viewButton.className = "button";
    viewButton.href = band.info.profileUrl || "#";
    viewButton.textContent = "View Band";

    links.appendChild(viewButton);
    content.appendChild(title);
    content.appendChild(meta);
    content.appendChild(stats);
    content.appendChild(score);
    content.appendChild(links);

    row.appendChild(img);
    row.appendChild(content);

    leaderboard.appendChild(row);
  });
}

const bandsRef = ref(db, "Bands");

onValue(bandsRef, (snapshot) => {
  firebaseStats = snapshot.val();

  if (!firebaseStats) {
    currentWinnerName.textContent = "No voting data yet";
    currentWinnerMeta.textContent = "Once bands receive votes, they’ll appear here.";
    currentWinnerVotes.textContent = "";
    leaderboard.innerHTML = `<p class="botw-empty">No leaderboard data yet.</p>`;
    return;
  }

  renderBOTW();
});

loadProfileData();
