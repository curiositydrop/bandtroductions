import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getDatabase, ref as dbRef, push } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";
import { auth, db, storage } from "./firebase-dev.js";

const radioQueueConfig = {
  apiKey: "AIzaSyApLiiJsKTw1Fp8J3aQatMqiSZoP_6EycE",
  authDomain: "bandfanwall.firebaseapp.com",
  databaseURL: "https://bandfanwall-default-rtdb.firebaseio.com",
  projectId: "bandfanwall",
  storageBucket: "bandfanwall.firebasestorage.app",
  messagingSenderId: "619241154826",
  appId: "1:619241154826:web:25ddc58eef094e3c0732f3"
};

const queueApp = initializeApp(radioQueueConfig, "radioQueueApp");
const queueDb = getDatabase(queueApp);

const form = document.getElementById("radioSubmitForm");
const memberGate = document.getElementById("memberGate");
const memberName = document.getElementById("memberName");
const contactEmail = document.getElementById("contactEmail");
const contactName = document.getElementById("contactName");
const artist = document.getElementById("artist");
const submitMessage = document.getElementById("submitMessage");
const submitButton = document.getElementById("submitButton");

let currentMember = null;
let memberRecord = null;

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "track";
}

function setMessage(text, ok = false) {
  submitMessage.textContent = text;
  submitMessage.style.color = ok ? "#00c8b4" : "#ff7777";
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    currentMember = null;
    memberRecord = null;
    form.classList.add("hidden");
    memberGate.innerHTML = `
      <strong>Members only.</strong><br>
      BANDtroductions Radio submissions require a BANDtroductions Social account.
      <div style="margin-top:10px;">
        <a class="member-link" href="login.html?returnTo=radio-submit.html">Log in</a>
        &nbsp;•&nbsp;
        <a class="member-link" href="signup.html?returnTo=radio-submit.html">Create an account</a>
      </div>`;
    return;
  }

  currentMember = user;

  try {
    const userSnapshot = await getDoc(doc(db, "users", user.uid));
    if (!userSnapshot.exists()) {
      form.classList.add("hidden");
      memberGate.innerHTML = `<strong>Account not found in BANDtroductions records.</strong><br>Please complete your BANDtroductions account before submitting music.`;
      return;
    }

    memberRecord = userSnapshot.data();
    const displayName = memberRecord.displayName || user.displayName || "BANDtroductions Member";
    const email = memberRecord.email || user.email || "";

    memberName.value = displayName;
    contactEmail.value = email;
    contactName.value = displayName;

    if (["band", "musician"].includes(memberRecord.accountType) && !artist.value) {
      artist.value = displayName;
    }

    memberGate.innerHTML = `<strong>Verified BANDtroductions member:</strong> ${displayName}<br><span style="color:#aaa;">Signed in as ${email}</span>`;
    form.classList.remove("hidden");
  } catch (error) {
    console.error("Could not verify member account", error);
    form.classList.add("hidden");
    memberGate.innerHTML = `<strong>We couldn't verify your BANDtroductions account right now.</strong><br>Please refresh and try again.`;
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentMember || !memberRecord) {
    setMessage("You must be logged into a valid BANDtroductions account to submit music.");
    return;
  }

  const audioFile = document.getElementById("audioFile").files?.[0];
  const permissionConfirmed = document.getElementById("permissionConfirmed").checked;
  const broadcastPermission = document.getElementById("broadcastPermission").checked;
  const agreementAccepted = document.getElementById("agreementAccepted").checked;

  if (!audioFile) {
    setMessage("Choose an MP3 file to submit.");
    return;
  }

  const isMp3 = audioFile.type === "audio/mpeg" || audioFile.name.toLowerCase().endsWith(".mp3");
  if (!isMp3) {
    setMessage("Please upload an MP3 file.");
    return;
  }

  const maxBytes = 25 * 1024 * 1024;
  if (audioFile.size > maxBytes) {
    setMessage("That MP3 is over 25 MB. Please upload a smaller file.");
    return;
  }

  if (!permissionConfirmed || !broadcastPermission || !agreementAccepted) {
    setMessage("Please accept all music-rights and broadcast permission checkboxes.");
    return;
  }

  submitButton.disabled = true;
  setMessage("Uploading your song and creating the radio submission…", true);

  try {
    const title = document.getElementById("title").value.trim();
    const artistName = artist.value.trim();
    const safeName = `${Date.now()}-${slugify(artistName)}-${slugify(title)}.mp3`;
    const uploadPath = `radio-submissions/${currentMember.uid}/${safeName}`;
    const audioStorageRef = storageRef(storage, uploadPath);

    await uploadBytes(audioStorageRef, audioFile, {
      contentType: "audio/mpeg",
      customMetadata: {
        submittedByUid: currentMember.uid,
        submittedByEmail: currentMember.email || "",
        artist: artistName,
        title
      }
    });

    const audioUrl = await getDownloadURL(audioStorageRef);

    const submission = {
      artist: artistName,
      contactName: contactName.value.trim(),
      contactEmail: contactEmail.value.trim(),
      memberDisplayName: memberName.value.trim(),
      memberAccountType: memberRecord.accountType || "",
      submittedByUid: currentMember.uid,
      submittedByVerifiedAccount: true,
      title,
      album: document.getElementById("album").value.trim() || "Single",
      genre: document.getElementById("genre").value,
      location: document.getElementById("location").value.trim(),
      profileUrl: document.getElementById("profileUrl").value.trim(),
      coverUrl: document.getElementById("coverUrl").value.trim(),
      audioUrl,
      audioStoragePath: uploadPath,
      originalAudioFileName: audioFile.name,
      signedToLabel: document.getElementById("signedToLabel").value === "true",
      labelContact: document.getElementById("labelContact").value.trim(),
      notes: document.getElementById("notes").value.trim(),
      permissionConfirmed,
      broadcastPermission,
      agreementAccepted,
      approved: false,
      submittedAt: Date.now(),
      isrc: "",
      label: "",
      releaseYear: "",
      songwriter: "",
      publisher: "",
      explicit: false
    };

    await push(dbRef(queueDb, "RadioSubmissions"), submission);

    form.reset();
    memberName.value = memberRecord.displayName || currentMember.displayName || "BANDtroductions Member";
    contactEmail.value = memberRecord.email || currentMember.email || "";
    contactName.value = memberName.value;
    if (["band", "musician"].includes(memberRecord.accountType)) artist.value = memberName.value;

    setMessage("Song submitted! We'll review it for BANDtroductions Radio.", true);
  } catch (error) {
    console.error("Radio submission failed", error);
    if (String(error?.code || "").includes("storage/unauthorized")) {
      setMessage("Your account is verified, but the audio upload was blocked by storage permissions. Please contact BANDtroductions so we can finish enabling radio uploads.");
    } else {
      setMessage("Something went wrong while submitting your song. Please try again.");
    }
  } finally {
    submitButton.disabled = false;
  }
});
