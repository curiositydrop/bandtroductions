import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getDatabase, ref as dbRef, push } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
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
const profileUrl = document.getElementById("profileUrl");
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

function memberProfileUrl(uid) {
  return new URL(`profile.html?id=${encodeURIComponent(uid)}`, location.href).href;
}

function populateMemberFields() {
  if (!currentMember || !memberRecord) return;
  const displayName = memberRecord.displayName || currentMember.displayName || "BANDtroductions Member";
  const email = memberRecord.email || currentMember.email || "";

  memberName.value = displayName;
  contactEmail.value = email;
  contactName.value = displayName;
  artist.value = displayName;
  profileUrl.value = memberProfileUrl(currentMember.uid);

  const locationInput = document.getElementById("location");
  if (locationInput && !locationInput.value) {
    const savedLocation = memberRecord.location || memberRecord.cityState || memberRecord.city || "";
    if (savedLocation) locationInput.value = savedLocation;
  }
}

async function notifyAdminsOfRadioSubmission({ artistName, title }) {
  try {
    const adminSnapshot = await getDocs(query(collection(db, "profiles"), where("isAdmin", "==", true)));
    if (adminSnapshot.empty) return;

    const message = `${artistName} submitted “${title}” for BANDtroductions Radio approval.`;
    await Promise.all(adminSnapshot.docs.map(adminDoc => addDoc(collection(db, "notifications"), {
      recipientId: adminDoc.id,
      actorId: currentMember?.uid || "",
      actorName: memberName.value.trim() || artistName,
      type: "radio-submission",
      message,
      linkUrl: "radio-admin.html",
      read: false,
      createdAt: serverTimestamp()
    })));
  } catch (error) {
    console.warn("Radio submission saved, but the admin notification could not be created.", error);
  }
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
    populateMemberFields();

    memberGate.innerHTML = `<strong>Verified BANDtroductions member:</strong> ${memberName.value}<br><span style="color:#aaa;">Signed in as ${contactEmail.value}</span>`;
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
  const coverFile = document.getElementById("coverFile").files?.[0] || null;
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

  if (coverFile) {
    const allowedImage = ["image/jpeg", "image/png", "image/webp"].includes(coverFile.type) || /\.(jpe?g|png|webp)$/i.test(coverFile.name);
    if (!allowedImage) {
      setMessage("Cover art must be a JPG, PNG, or WebP image.");
      return;
    }
    if (coverFile.size > 10 * 1024 * 1024) {
      setMessage("Cover art must be 10 MB or smaller.");
      return;
    }
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
    const safeBase = `${Date.now()}-${slugify(artistName)}-${slugify(title)}`;

    const audioUploadPath = `radio-submissions/${currentMember.uid}/${safeBase}.mp3`;
    const audioStorageRef = storageRef(storage, audioUploadPath);

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

    let coverUrl = "";
    let coverStoragePath = "";
    if (coverFile) {
      const extension = (coverFile.name.split(".").pop() || "jpg").toLowerCase();
      coverStoragePath = `radio-submissions/${currentMember.uid}/${safeBase}-cover.${extension}`;
      const coverStorageRef = storageRef(storage, coverStoragePath);
      await uploadBytes(coverStorageRef, coverFile, {
        contentType: coverFile.type || "image/jpeg",
        customMetadata: {
          submittedByUid: currentMember.uid,
          artist: artistName,
          title
        }
      });
      coverUrl = await getDownloadURL(coverStorageRef);
    }

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
      profileUrl: profileUrl.value,
      coverUrl,
      coverStoragePath,
      originalCoverFileName: coverFile?.name || "",
      audioUrl,
      audioStoragePath: audioUploadPath,
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
    await notifyAdminsOfRadioSubmission({ artistName, title });

    form.reset();
    populateMemberFields();
    setMessage("Thank you for your BANDtroductions Radio submission! We’ve received your song and will review it within 24–48 hours. If approved, it may be added to our radio rotation as playlist space and programming allow. Airplay timing and frequency are determined by BANDtroductions Radio.", true);
  } catch (error) {
    console.error("Radio submission failed", error);
    if (String(error?.code || "").includes("storage/unauthorized")) {
      setMessage("Your account is verified, but the upload was blocked by storage permissions. Please contact BANDtroductions so we can finish enabling radio uploads.");
    } else {
      setMessage("Something went wrong while submitting your song. Please try again.");
    }
  } finally {
    submitButton.disabled = false;
  }
});
