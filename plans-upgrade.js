import { UPGRADE_RETURN } from './safe-return.js';

const ARTISTS = new Set(['band', 'musician']);
const ACTIVE = new Set(['active', 'trialing', 'comped']);

export function signupUpgradeHref() {
  return `signup.html?type=band&upgrade=1&returnTo=${encodeURIComponent(UPGRADE_RETURN)}`;
}

export function loginUpgradeHref() {
  return `login.html?type=band&upgrade=1&returnTo=${encodeURIComponent(UPGRADE_RETURN)}`;
}

export function profileOwnerId(profile, profileId) {
  return String(profile?.ownerId || profile?.userId || profile?.uid || profileId || '');
}

export function websiteCheckoutHref(profileId) {
  return `website.html?id=${encodeURIComponent(profileId)}`;
}

function planActive(profile) {
  const status = String(profile?.websitePlanStatus || profile?.artistPlan?.status || '').toLowerCase();
  return profile?.websiteEnabled === true && ACTIVE.has(status);
}

export function decideUpgrade({ user, profile, profileId }) {
  if (!user) {
    return {
      state: 'logged-out',
      href: signupUpgradeHref(),
      loginHref: loginUpgradeHref(),
      label: 'Create a free account to start',
      message: '',
      redirect: false
    };
  }

  const type = String(profile?.accountType || '').toLowerCase();
  const id = String(profileId || '');
  const owns = Boolean(profile) && (user.uid === id || user.uid === profileOwnerId(profile, id));
  if (!profile || !ARTISTS.has(type) || !owns) {
    const role = type === 'fan' ? 'fan' : type === 'venue' ? 'venue' : '';
    const message = !profile
      ? 'The website upgrade is for a published band or musician profile. This account does not have one yet, so checkout stays closed.'
      : !owns
        ? 'Checkout stays on the band or musician profile this account owns.'
        : role
          ? `The website upgrade is for band and musician profiles. This ${role} account stays free, and checkout is not available here.`
          : 'The website upgrade is for band and musician profiles. Checkout is not available for this account.';
    return { state: 'ineligible', href: '', loginHref: '', label: '', message, redirect: false };
  }

  if (profile.published !== true) {
    return {
      state: 'unpublished',
      href: `profile-setup.html?id=${encodeURIComponent(id)}&returnTo=${encodeURIComponent(UPGRADE_RETURN)}`,
      loginHref: '',
      label: 'Publish your profile first',
      message: 'Your free profile has to be published before the website upgrade can start. Checkout stays closed until then.',
      redirect: false
    };
  }

  const active = planActive(profile);
  return {
    state: active ? 'active' : 'eligible',
    href: websiteCheckoutHref(id),
    loginHref: '',
    label: active ? 'Open your website' : 'Continue to website checkout',
    message: active ? '' : 'The next page asks you to accept the seller agreement before any payment.',
    redirect: true
  };
}
