'use strict';
const toast = document.getElementById('preview-toast');
let hideTimer;
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.classList.contains('text-link') || button.classList.contains('solid-button') || button.classList.contains('glass-button') || button.classList.contains('ghost-button') || button.classList.contains('icon-button') || button.closest('.player')) {
    toast.hidden = false;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { toast.hidden = true; }, 2200);
  }
});
