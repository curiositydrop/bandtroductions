import { notifySiteAdmins, signupNoticeMessage } from './admin-notify.js';

export async function createAdminAccountNotification({
  userId,
  profileId,
  displayName,
  accountType,
  location = ''
} = {}) {
  const subjectId = profileId || userId;
  const result = await notifySiteAdmins({
    type: 'new_account',
    subjectId,
    profileId: subjectId,
    actorId: userId || subjectId,
    actorName: displayName,
    message: signupNoticeMessage({ accountType, displayName, location })
  });
  if (!result.ok) {
    const error = new Error(result.message);
    error.code = result.code;
    throw error;
  }
  return true;
}
