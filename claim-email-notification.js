import { auth } from './firebase-dev.js';
import { sendAdminApprovalEmail } from './admin-approval-email.js?v=1';

const status = document.getElementById('claim-status');
let notificationSent = false;

function isSuccessfulClaimMessage(text = '') {
  const normalized = String(text).toLowerCase();
  return normalized.includes('claim submitted') || normalized.includes('ownership request is now waiting') || normalized.includes('request is waiting for bandtroductions review');
}

async function notifyAdminIfNeeded() {
  if (notificationSent || !status || !isSuccessfulClaimMessage(status.textContent)) return;
  notificationSent = true;

  const params = new URLSearchParams(location.search);
  const name = params.get('name') || 'Existing Profile';
  const accountType = (params.get('type') || '').toLowerCase();
  const user = auth.currentUser;

  await sendAdminApprovalEmail({
    kind: 'claim',
    name,
    accountType,
    submittedBy: user?.email || '',
    details: `Legacy profile: ${params.get('page') || 'unknown'}`
  });
}

if (status) {
  new MutationObserver(notifyAdminIfNeeded).observe(status, {
    childList: true,
    subtree: true,
    characterData: true
  });
  notifyAdminIfNeeded();
}
