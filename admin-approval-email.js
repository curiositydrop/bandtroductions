const ADMIN_EMAIL = 'mbergeron79@gmail.com';
const FORM_ENDPOINT = `https://formsubmit.co/ajax/${encodeURIComponent(ADMIN_EMAIL)}`;
const ADMIN_REVIEW_URL = 'https://bandtroductions.com/admin.html';
const AUDITION_REVIEW_URL = 'https://bandtroductions.com/admin-auditions.html';

export async function sendAdminApprovalEmail({ kind = 'profile', name = 'New profile', accountType = '', submittedBy = '', details = '' } = {}) {
  const subject = kind === 'claim'
    ? `BANDtroductions ownership claim: ${name}`
    : kind === 'signup'
      ? `BANDtroductions new account: ${name}`
      : kind === 'radio-sponsor'
        ? `BANDtroductions Radio sponsor request: ${name}`
        : kind === 'audition'
          ? `BANDtroductions Audition Room approval: ${name}`
          : `BANDtroductions profile approval needed: ${name}`;

  const intro = kind === 'claim'
    ? 'A profile ownership claim was submitted.'
    : kind === 'signup'
      ? 'A new BANDtroductions account was created.'
      : kind === 'radio-sponsor'
        ? 'A new BANDtroductions Radio sponsorship request was submitted.'
        : kind === 'audition'
          ? 'A new Audition Room listing is waiting for approval.'
          : 'A new profile is waiting for approval.';

  const reviewUrl = kind === 'audition' ? AUDITION_REVIEW_URL : ADMIN_REVIEW_URL;
  const lines = [
    intro,
    '',
    `Name: ${name}`,
    accountType ? `Account type: ${accountType}` : '',
    submittedBy ? `Submitted by: ${submittedBy}` : '',
    details ? `Details: ${details}` : '',
    '',
    `Review BANDtroductions admin: ${reviewUrl}`
  ].filter(Boolean);

  try {
    const response = await fetch(FORM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        _subject: subject,
        _template: 'table',
        _captcha: 'false',
        name,
        accountType,
        submittedBy,
        message: lines.join('\n')
      })
    });

    if (!response.ok) throw new Error(`Approval email returned ${response.status}`);
    return true;
  } catch (error) {
    console.warn('Admin notification email could not be sent:', error);
    return false;
  }
}
