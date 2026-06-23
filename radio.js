import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getDatabase, ref, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";

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

let tracks = [];
let playlist = [];
let currentGenre = "all";
let currentIndex = 0;
let recentlyPlayed = [];

const audioPlayer = document.getElementById("audioPlayer");
const trackCover = document.getElementById("trackCover");
const trackTitle = document.getElementById("trackTitle");
const trackArtist = document.getElementById("trackArtist");
const profileLink = document.getElementById("profileLink");
const upNextList = document.getElementById("upNextList");
const recentList = document.getElementById("recentList");
const allGenreBtn = document.getElementById("allGenreBtn");
const genreSelect = document.getElementById("genreSelect");

const DEFAULT_COVER = "IMG_9367.png";

const radioTracksRef = ref(db, "RadioTracks");

onValue(radioTracksRef, (snapshot) => {
  const data = snapshot.val();

  if (!data) {
    tracks = [];
    playlist = [];
    showEmptyState();
    return;
  }

  tracks = Object.entries(data)
    .map(([id, track]) => ({
      id,

      title: track.title || "Untitled Track",
      artist: track.artist || "Unknown Artist",
      album: track.album || "Single",
      genre: normalizeGenre(track.genre || "other"),
      subgenre: normalizeGenre(track.subgenre || ""),

      coverUrl: track.coverUrl || track.cover || DEFAULT_COVER,
      audioUrl: track.audioUrl || track.audio || "",
      profileUrl: track.profileUrl || track.profile || "bands.html",

      approved: track.approved === true,

      isrc: track.isrc || "",
      label: track.label || "",
      releaseYear: track.releaseYear || "",
      songwriter: track.songwriter || "",
      publisher: track.publisher || "",
      explicit: track.explicit === true,

      bandId: track.bandId || "",
      submittedBy: track.submittedBy || "",
      permissionConfirmed: track.permissionConfirmed === true,
      signedToLabel: track.signedToLabel === true,
      labelContact: track.labelContact || "",
      dateAdded: track.dateAdded || 0,

      playCount: track.playCount || 0
    }))
    .filter(track => track.approved)
    .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));

  buildGenreDropdown();
  filterGenre(currentGenre);
});

function normalizeGenre(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function prettyGenre(value) {
  if (!value) return "";

  return String(value)
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildGenreDropdown() {
  if (!genreSelect) return;

  const selectedValue = genreSelect.value || "all";

  const genres = [...new Set(
    tracks
      .map(track => track.genre)
      .filter(genre => genre && genre !== "all")
  )].sort();

  genreSelect.innerHTML = `<option value="all">Select Genre</option>`;

  genres.forEach(genre => {
    const option = document.createElement("option");
    option.value = genre;
    option.textContent = prettyGenre(genre);
    genreSelect.appendChild(option);
  });

  if ([...genreSelect.options].some(option => option.value === selectedValue)) {
    genreSelect.value = selectedValue;
  } else {
    genreSelect.value = "all";
    currentGenre = "all";
  }
}

function filterGenre(genre) {
  currentGenre = normalizeGenre(genre || "all");

  playlist = currentGenre === "all"
    ? [...tracks]
    : tracks.filter(track => track.genre === currentGenre || track.subgenre === currentGenre);

  currentIndex = 0;

  if (allGenreBtn) {
    allGenreBtn.classList.toggle("active", currentGenre === "all");
  }

  if (genreSelect && currentGenre === "all") {
    genreSelect.value = "all";
  }

  if (!playlist.length) {
    showEmptyState();
    return;
  }

  loadTrack(currentIndex, false);
  renderRecentlyPlayed();
}

function loadTrack(index, shouldAutoplay = false) {
  const track = playlist[index];

  if (!track) {
    showEmptyState();
    return;
  }

  trackCover.src = track.coverUrl || DEFAULT_COVER;
  trackTitle.textContent = track.title;
  trackArtist.textContent = `${track.artist} • ${track.album}`;
  profileLink.href = track.profileUrl || "bands.html";

  if (track.audioUrl) {
    if (audioPlayer.src !== track.audioUrl) {
      audioPlayer.src = track.audioUrl;
      audioPlayer.load();
    }

    audioPlayer.onloadeddata = () => {
      console.log("Audio loaded successfully:", track.audioUrl);
    };

    audioPlayer.onerror = () => {
      console.error("Audio failed to load:", track.audioUrl);
    };

    if (shouldAutoplay) {
      audioPlayer.play().catch(error => {
        console.warn("Autoplay blocked or failed:", error);
      });
    }
  } else {
    audioPlayer.removeAttribute("src");
    audioPlayer.load();
  }

  renderUpNext();
}

function showEmptyState() {
  trackCover.src = DEFAULT_COVER;
  trackTitle.textContent = "BANDtroductions Radio Beta";
  trackArtist.textContent = "Tracks coming soon";
  profileLink.href = "bands.html";

  audioPlayer.removeAttribute("src");
  audioPlayer.load();

  if (upNextList) {
    upNextList.innerHTML = "<li>More tracks coming soon.</li>";
  }

  renderRecentlyPlayed();
}

function renderUpNext() {
  if (!upNextList) return;

  upNextList.innerHTML = "";

  const upcoming = playlist
    .filter((track, index) => index > currentIndex)
    .slice(0, 8);

  if (!upcoming.length) {
    upNextList.innerHTML = "<li>More tracks coming soon.</li>";
    return;
  }

  upcoming.forEach(track => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${escapeHtml(track.artist)}</span> — ${escapeHtml(track.title)}`;
    upNextList.appendChild(li);
  });
}

function renderRecentlyPlayed() {
  if (!recentList) return;

  recentList.innerHTML = "";

  if (!recentlyPlayed.length) {
    recentList.innerHTML = "<li>No tracks played yet.</li>";
    return;
  }

  recentlyPlayed.slice(0, 5).forEach(track => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${escapeHtml(track.artist)}</span> — ${escapeHtml(track.title)}`;
    recentList.appendChild(li);
  });
}

function trackPlay(track) {
  if (!track || !track.id) return;

  const playCountRef = ref(db, `RadioTracks/${track.id}/playCount`);

  runTransaction(playCountRef, (current) => {
    return (current || 0) + 1;
  });
}

if (allGenreBtn) {
  allGenreBtn.addEventListener("click", () => {
    if (genreSelect) genreSelect.value = "all";
    filterGenre("all");
  });
}

if (genreSelect) {
  genreSelect.addEventListener("change", function () {
    filterGenre(this.value);
  });
}

if (audioPlayer) {
  audioPlayer.addEventListener("play", () => {
    const track = playlist[currentIndex];

    console.log("Playing:", track?.title);
    trackPlay(track);
  });

  audioPlayer.addEventListener("ended", () => {
    const finishedTrack = playlist[currentIndex];

    if (finishedTrack) {
      recentlyPlayed.unshift(finishedTrack);
      recentlyPlayed = recentlyPlayed.slice(0, 5);
    }

    currentIndex++;

    if (currentIndex >= playlist.length) {
      currentIndex = 0;
    }

    loadTrack(currentIndex, true);
    renderRecentlyPlayed();
  });
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
