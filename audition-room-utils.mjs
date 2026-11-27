// Shared Audition Room helpers. Safe to import from the browser or Node tests.
// Strips phone numbers from public-facing listing text only.

const US_PHONE = /(?:\+?1[-.\s]*)?(?:\(?\d{3}\)?[-.\s]*\d{3}[-.\s]*\d{4})/g;
const INTL_PHONE = /\+\d{7,15}/g;

export function stripPublicPhones(value) {
  return String(value ?? '')
    .replace(US_PHONE, ' ')
    .replace(INTL_PHONE, ' ')
    .replace(/[.,;:/\-]+\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function isLookingForBand(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v || v === 'no' || v === 'n' || v === 'false') return false;
  return v === 'yes'
    || v === 'y'
    || v === 'true'
    || v === 'maybe'
    || v === 'open to opportunities'
    || v === 'open';
}

export function lookingForBandLabel(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'maybe' || v === 'open to opportunities' || v === 'open') return 'Open to joining a band';
  if (v === 'yes' || v === 'y' || v === 'true') return 'Looking for a band';
  return stripPublicPhones(value);
}

export function publicListingText(value, fallback = '') {
  return stripPublicPhones(value) || fallback;
}

export function compareFeaturedThenName(a, b) {
  if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1;
  return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
}

export function buildBandOpeningRecord({ type, hasVideo, videoUrl, videoStoragePath, videoContentType, originalVideoFileName, videoBytes }) {
  const record = {};
  if (hasVideo) {
    record.videoUrl = videoUrl;
    record.videoStoragePath = videoStoragePath;
    record.videoContentType = videoContentType;
    record.originalVideoFileName = originalVideoFileName;
    record.videoBytes = videoBytes;
  }
  // Musician auditions always include video fields. Band openings may omit them
  // until the prepared Firestore rules are approved and deployed.
  if (type === 'musician' || hasVideo) return record;
  return record;
}
