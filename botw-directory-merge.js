// Merge published Firestore profiles into the Band of the Week directory map.
// Pure helpers, no Firebase — loadDirectory in botw-core.js supplies the docs.

export const DIRECTORY_PLACEHOLDER = /(?:^|\/)IMG_9367\.png(?:\?.*)?$/i;

export function directoryImageMissing(src) {
  const value = String(src || '').trim();
  return !value || DIRECTORY_PLACEHOLDER.test(value);
}

function profileOf(item) {
  return item?.profile && typeof item.profile === 'object' ? item.profile : (item || {});
}

function profileName(profile) {
  return String(profile.displayName || profile.bandName || profile.name || '').trim();
}

function profileImage(profile) {
  return String(
    profile.imageUrl ||
    profile.avatarUrl ||
    profile.photoURL ||
    profile.profileImageUrl ||
    profile.profileImage ||
    profile.avatar ||
    ''
  ).trim();
}

function profileType(profile) {
  return String(profile.accountType || profile.profileType || '').toLowerCase();
}

function profileUrl(id) {
  return `profile.html?id=${encodeURIComponent(id)}`;
}

function profileMeta(profile) {
  return [profile.location, profile.genre || profile.instruments]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join(' • ');
}

// Fill gaps only: never replace a static entry that already has a real image.
export function mergePublishedProfiles(map, profiles, slugifyName) {
  const slugify = typeof slugifyName === 'function'
    ? slugifyName
    : (t => String(t || '').toLowerCase().trim().replace(/&/g, 'and').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));

  for (const item of Array.isArray(profiles) ? profiles : []) {
    const id = item?.id;
    if (!id) continue;
    const profile = profileOf(item);
    const type = profileType(profile);
    if (type !== 'band' && type !== 'musician') continue;
    const name = profileName(profile);
    if (!name) continue;
    const slug = slugify(name);
    if (!slug) continue;
    const image = profileImage(profile);
    const realImage = image && !directoryImageMissing(image) ? image : '';
    const url = profileUrl(id);
    const meta = profileMeta(profile);
    const existing = map.get(slug);
    if (existing) {
      if (!directoryImageMissing(existing.image)) continue;
      if (realImage) existing.image = realImage;
      if (!existing.url || existing.url === '#') existing.url = url;
      if (!existing.meta && meta) existing.meta = meta;
      continue;
    }
    map.set(slug, {
      name,
      image: realImage || 'IMG_9367.png',
      url,
      meta
    });
  }
  return map;
}
