import { app, auth } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';

const ADMIN_EMAILS = new Set(['mbergeron79@gmail.com', 'mbegeron79@gmail.com']);
const functions = getFunctions(app, 'us-central1');
const grantLaunchPartnerAccess = httpsCallable(functions, 'grantLaunchPartnerAccess');
const button = document.getElementById('grant-partners');
const status = document.getElementById('partner-status');
let currentUser = null;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('error', Boolean(isError));
}

onAuthStateChanged(auth, user => {
  currentUser = user;
  const email = String(user?.email || '').trim().toLowerCase();
  const allowed = Boolean(user && ADMIN_EMAILS.has(email));
  button.disabled = !allowed;
  if (!user) setStatus('Sign in with the BANDtroductions administrator account to use this tool.', true);
  else if (!allowed) setStatus('This account does not have administrator access.', true);
  else setStatus('Ready. This action is safe to run more than once.');
});

button.addEventListener('click', async () => {
  if (!currentUser || button.disabled) return;
  if (!confirm('Grant permanent comped Website + Merch access to Angel Down and Ascent To Power?')) return;
  button.disabled = true;
  setStatus('Granting launch-partner access…');
  try {
    const result = await grantLaunchPartnerAccess();
    const activated = Array.isArray(result.data?.activated) ? result.data.activated : [];
    const missing = Array.isArray(result.data?.missing) ? result.data.missing : [];
    const names = activated.map(item => item.displayName).join(' and ');
    if (missing.length) {
      setStatus(`${names ? `${names} activated. ` : ''}Could not find an exact profile match for: ${missing.join(', ')}. No charge was created.`, true);
    } else {
      setStatus(`${names || 'Both launch partners'} now have permanent comped Website + Merch access. No Stripe charge was created.`);
    }
  } catch (error) {
    console.error(error);
    const message = String(error?.message || '').replace(/^Firebase(?:Error)?:\s*/i, '').replace(/\s*\([^)]*\)\.?$/, '').trim();
    setStatus(message || 'Launch-partner access could not be granted. Nothing was charged.', true);
  } finally {
    const email = String(auth.currentUser?.email || '').trim().toLowerCase();
    button.disabled = !ADMIN_EMAILS.has(email);
  }
});
