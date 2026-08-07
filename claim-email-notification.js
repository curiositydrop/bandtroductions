import { auth } from './firebase-dev.js';
import { sendAdminApprovalEmail } from './admin-approval-email.js?v=2';

const status = document.getElementById('claim-status');
let notificationSent = false;

function successfulClaim(text = '') {
  const normalized = String(text).toLowerCase();
  return normalized.includes('profile claimed!') ||
    normalized.includes('claim submitted.') ||
    normalized.includes('request is waiting for bandtroductions review');
}

async function notifyAdminIfNeeded() {
  if (notificationSent || !status || !successfulClaim(status.textContent)) return;
  notificationSent = true;

  const params = new URLSearchParams(location.search);
  const name = params.get('name') || 'Existing Profile';
  const accountType = (params.get('type') || '').toLowerCase();
  const legacyPage = params.get('page') || 'unknown';
  const user = auth.currentUser;
  const automatic = String(status.textContent).toLowerCase().includes('profile claimed!');

  await sendAdminApprovalEmail({
    kind: 'claim',
    name,
    accountType,
    submittedBy: user?.email || '',
    details: `${automatic ? 'Legacy profile claim completed' : 'Legacy profile claim submitted for review'}. Legacy profile: ${legacyPage}`
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
