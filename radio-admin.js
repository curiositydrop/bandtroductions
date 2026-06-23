import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  remove
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

const adminContainer = document.getElementById("adminSubmissions");
const submissionsRef = ref(db, "RadioSubmissions");

function yesNo(value) {
  return value ? "Yes" : "No";
}

function safe(value) {
  return value || "";
}

onValue(submissionsRef, (snapshot) => {
  const data = snapshot.val();

  adminContainer.innerHTML = "";

  if (!data) {
    adminContainer.innerHTML = "<p>No submissions found.</p>";
    return;
  }

  Object.entries(data).reverse().forEach(([key, song]) => {
    const submittedDate = song.submittedAt
      ? new Date(song.submittedAt).toLocaleString()
      : "";

    const card = document.createElement("div");
    card.className = "submission-card";

    card.innerHTML = `
      <h2>${safe(song.artist) || "Unknown Artist"}</h2>

      <p><strong>Song Title:</strong> ${safe(song.title)}</p>
      <p><strong>Album:</strong> ${safe(song.album)}</p>
      <p><strong>Genre:</strong> ${safe(song.genre)}</p>
      <p><strong>Location:</strong> ${safe(song.location)}</p>

      <hr>

      <p><strong>Contact Name:</strong> ${safe(song.contactName)}</p>
      <p><strong>Contact Email:</strong> 
        ${song.contactEmail ? `<a href="mailto:${song.contactEmail}" style="color:#00c8b4;">${song.contactEmail}</a>` : ""}
      </p>

      <hr>

      <p><strong>BANDtroductions Profile:</strong> 
        ${song.profileUrl ? `<a href="${song.profileUrl}" target="_blank" style="color:#00c8b4;">${song.profileUrl}</a>` : ""}
      </p>

      <p><strong>Cover Image:</strong> ${safe(song.coverUrl)}</p>
      <p><strong>Audio MP3:</strong> ${safe(song.audioUrl)}</p>

      ${
        song.audioUrl
          ? `<audio controls style="width:100%; margin-top:10px;">
              <source src="${song.audioUrl}" type="audio/mpeg">
              Your browser does not support the audio element.
            </audio>`
          : ""
      }

      <hr>

      <p><strong>Signed to Label:</strong> ${yesNo(song.signedToLabel)}</p>
      <p><strong>Label Info:</strong> ${safe(song.labelContact)}</p>

      <p><strong>Permission Confirmed:</strong> ${yesNo(song.permissionConfirmed)}</p>
      <p><strong>Agreement Accepted:</strong> ${yesNo(song.agreementAccepted)}</p>

      <p><strong>Notes:</strong> ${safe(song.notes)}</p>

      <p><strong>Submitted:</strong> ${submittedDate}</p>

      <button class="admin-btn approve-btn" data-key="${key}">
        Approve Song
      </button>

      <button class="admin-btn delete delete-btn" data-key="${key}">
        Delete Submission
      </button>
    `;

    adminContainer.appendChild(card);
  });

  document.querySelectorAll(".approve-btn").forEach(button => {
    button.addEventListener("click", async () => {
      const submissionKey = button.dataset.key;
      const song = data[submissionKey];

      const trackKey =
        `${song.artist}-${song.title}`
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");

      try {
        await set(ref(db, `RadioTracks/${trackKey}`), {
          ...song,
          approved: true,
          approvedAt: Date.now()
        });

        await remove(ref(db, `RadioSubmissions/${submissionKey}`));

        alert(`${song.title} approved and added to RadioTracks`);
      } catch (error) {
        console.error(error);
        alert("Approval failed");
      }
    });
  });

  document.querySelectorAll(".delete-btn").forEach(button => {
    button.addEventListener("click", async () => {
      const submissionKey = button.dataset.key;
      const song = data[submissionKey];

      const confirmDelete = confirm(
        `Delete submission for "${song.title}" by ${song.artist}?`
      );

      if (!confirmDelete) return;

      try {
        await remove(ref(db, `RadioSubmissions/${submissionKey}`));
        alert("Submission deleted.");
      } catch (error) {
        console.error(error);
        alert("Delete failed.");
      }
    });
  });
});
