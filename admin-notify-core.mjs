export function safeNoticeId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

export function resolveAdminRecipients(profiles = []) {
  const recipients = new Map();
  for (const profile of profiles) {
    const profileId = String(profile?.id || '').trim();
    const recipientId = String(profile?.ownerId || profile?.userId || profile?.uid || profileId).trim();
    if (!recipientId) continue;
    if (!recipients.has(recipientId)) {
      recipients.set(recipientId, { recipientId, profileId: profileId || recipientId });
    }
  }
  return [...recipients.values()];
}

export function adminNoticeId(type, subjectId, recipientId) {
  return `${safeNoticeId(type)}_${safeNoticeId(recipientId)}_${safeNoticeId(subjectId)}`.slice(0, 700);
}

export function adminNoticeLink(type, { profileId = '', subjectId = '' } = {}) {
  if (type === 'new_account') {
    const id = profileId || subjectId;
    return id ? `profile.html?id=${encodeURIComponent(id)}` : 'admin.html';
  }
  if (type === 'radio-submission') return 'admin.html';
  if (type === 'btv-submission') return 'btv.html#btv-admin';
  if (type === 'collage-upload') return 'collage.html';
  return 'notifications.html';
}

export function signupNoticeMessage({ accountType = 'member', displayName = '', location = '', claim = false } = {}) {
  const who = String(displayName || '').trim() || 'New member';
  const type = String(accountType || 'member').trim() || 'member';
  const place = String(location || '').trim();
  const how = claim ? ' while claiming an existing profile' : '';
  return `New ${type} account${how}: ${who}${place ? ` · ${place}` : ''}.`;
}

export function songNoticeMessage({ artist = '', title = '', source = 'radio' } = {}) {
  const who = String(artist || '').trim() || 'An artist';
  const song = String(title || '').trim() || 'a song';
  const via = source === 'website' ? ' from their website' : ' from the radio form';
  return `${who} submitted "${song}"${via} for radio approval.`;
}

export function btvNoticeMessage({ band = '', title = '', kind = 'video' } = {}) {
  const who = String(band || '').trim() || 'An artist';
  const name = String(title || '').trim() || 'untitled';
  const label = String(kind || 'video').trim() || 'video';
  return `${who} submitted a BTV ${label} for approval: ${name}. It is not on air until approved.`;
}

export function collageNoticeMessage({ name = '' } = {}) {
  const who = String(name || '').trim() || 'A member';
  return `${who} added a photo to the public collage wall.`;
}

export function describeAdminNoticeFailure(result = {}) {
  if (result.ok) return '';
  if (result.code === 'no-admin') return 'No administrator profile is marked isAdmin, so the in-site notice was not saved.';
  if (result.code === 'permission-denied') return 'The in-site admin notice was blocked by database permissions.';
  const count = Array.isArray(result.failed) ? result.failed.length : 0;
  if (count) return `The in-site admin notice could not be saved for ${count} administrator${count === 1 ? '' : 's'}.`;
  return result.message || 'The in-site admin notice could not be saved.';
}

function failureResult(error) {
  const code = error?.code === 'permission-denied' ? 'permission-denied' : (error?.code || 'unknown');
  const result = { ok: false, code, recipients: [], written: [], failed: [], created: 0 };
  result.message = describeAdminNoticeFailure(result);
  return result;
}

export function buildAdminNotice({
  type,
  recipientId,
  subjectId,
  profileId = '',
  actorId = '',
  actorName = '',
  message
}) {
  return {
    id: adminNoticeId(type, subjectId, recipientId),
    data: {
      recipientId,
      actorId: actorId || '',
      actorName: actorName || 'BANDtroductions',
      type,
      message,
      linkUrl: adminNoticeLink(type, { profileId, subjectId }),
      relatedId: subjectId || '',
      relatedProfileId: profileId || '',
      adminNotice: true
    }
  };
}

export async function deliverAdminNotices(io, input) {
  let profiles;
  try {
    profiles = await io.listAdmins();
  } catch (error) {
    return failureResult(error);
  }
  const recipients = resolveAdminRecipients(profiles);
  if (!recipients.length) {
    const result = { ok: false, code: 'no-admin', recipients, written: [], failed: [], created: 0 };
    result.message = describeAdminNoticeFailure(result);
    return result;
  }
  const written = [];
  const failed = [];
  for (const recipient of recipients) {
    const notice = buildAdminNotice({ ...input, recipientId: recipient.recipientId });
    try {
      const write = await io.writeNotice(notice.id, notice.data);
      written.push({ id: notice.id, recipientId: recipient.recipientId, created: write?.created !== false });
    } catch (error) {
      failed.push({
        id: notice.id,
        recipientId: recipient.recipientId,
        code: error?.code || 'unknown',
        message: error?.message || 'write failed'
      });
    }
  }
  const denied = failed.length > 0 && failed.every(item => item.code === 'permission-denied');
  const result = {
    ok: failed.length === 0,
    code: failed.length === 0 ? 'ok' : (denied ? 'permission-denied' : 'partial'),
    recipients,
    written,
    failed,
    created: written.filter(item => item.created).length
  };
  result.message = describeAdminNoticeFailure(result);
  return result;
}
