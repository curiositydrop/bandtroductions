document.addEventListener("DOMContentLoaded", function () {
  const voteButtons = document.querySelectorAll(".vote-btn");

  voteButtons.forEach(button => {
    const bandId = button.dataset.band;
    const bandName = button.dataset.name;
    const voteKey = "bandtroductions_vote_" + bandId;
    const message = document.getElementById("vote-message-" + bandId);

    if (localStorage.getItem(voteKey)) {
      button.textContent = "Voted 🤘";
      button.disabled = true;

      if (message) {
        message.innerHTML = `🤘 You voted for ${bandName} — now show them some love 🔥 <br><small>Tap “Support” to back the band</small>`;
      }
    }

    button.addEventListener("click", function () {
      if (localStorage.getItem(voteKey)) {
        if (message) {
          message.innerHTML = `🤘 You voted for ${bandName} — now show them some love 🔥 <br><small>Tap “Support” to back the band</small>`;
        }
        return;
      }

      localStorage.setItem(voteKey, "true");

      button.textContent = "Voted 🤘";
      button.disabled = true;

      if (message) {
        message.textContent = "Vote counted for " + bandName + "! 🤘";
      }
    });
  });
});
