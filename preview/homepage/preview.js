'use strict';
// Presentation only. No data requests, audio, authentication, or real navigation.
const toast = document.getElementById('preview-toast');
let hideTimer;
document.addEventListener('click', event => {
  if (!event.target.closest('button')) return;
  toast.hidden = false;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { toast.hidden = true; }, 2400);
});
