import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getDatabase, ref, push } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";

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

const form = document.getElementById("radioSubmitForm");
const submitMessage = document.getElementById("submitMessage");

form.addEventListener("submit", async function (e) {
  e.preventDefault();

  const submission = {
    artist: document.getElementById("artist").value.trim(),
    contactName: document.getElementById("contactName").value.trim(),
    contactEmail: document.getElementById("contactEmail").value.trim(),

    title: document.getElementById("title").value.trim(),
    album: document.getElementById("album").value.trim() || "Single",
    genre: document.getElementById("genre").value,
    location: document.getElementById("location").value.trim(),

    profileUrl: document.getElementById("profileUrl").value.trim(),
    coverUrl: document.getElementById("coverUrl").value.trim(),
    audioUrl: document.getElementById("audioUrl").value.trim(),

    signedToLabel: document.getElementById("signedToLabel").value === "true",
    labelContact: document.getElementById("labelContact").value.trim(),
    notes: document.getElementById("notes").value.trim(),

    permissionConfirmed: document.getElementById("permissionConfirmed").checked,
    agreementAccepted: document.getElementById("agreementAccepted").checked,

    approved: false,
    submittedAt: Date.now(),

    isrc: "",
    label: "",
    releaseYear: "",
    songwriter: "",
    publisher: "",
    explicit: false
  };

  if (
    !submission.artist ||
    !submission.contactName ||
    !submission.contactEmail ||
    !submission.title ||
    !submission.genre ||
    !submission.audioUrl ||
    !submission.permissionConfirmed ||
    !submission.agreementAccepted
  ) {
    submitMessage.textContent = "Please fill out all required fields and accept the agreement.";
    submitMessage.style.color = "#ff7777";
    return;
  }

  try {
    await push(ref(db, "RadioSubmissions"), submission);

    submitMessage.textContent = "Song submitted! We'll review it for BANDtroductions Radio.";
    submitMessage.style.color = "#00c8b4";

    form.reset();
  } catch (error) {
    console.error(error);
    submitMessage.textContent = "Something went wrong. Please try again.";
    submitMessage.style.color = "#ff7777";
  }
});
