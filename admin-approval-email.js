const ADMIN_EMAIL = 'mbergeron79@gmail.com';
const FORM_ENDPOINT = `https://formsubmit.co/ajax/${encodeURIComponent(ADMIN_EMAIL)}`;

export async function sendAdminApprovalEmail({ kind = 'profile', name = 'New profile', accountType = '', submittedBy = '', details = '' } = {}) {
  const subject = kind === 'claim'
    ? `BANDtroductions ownership claim: ${name}`
    : `BANDtroductions profile approval needed: ${name}`;

  const lines = [
    `A new ${kind === 'claim' ? 'profile ownership claim' : 'profile'} is waiting for approval.`,
    '',
    `Name: ${name}`,
    accountType ? `Account type: ${accountType}` : '',
    submittedBy ? `Submitted by: ${submittedBy}` : '',
    details ? `Details: ${details}` : '',
    '',
    `Review it here: ${location.origin}${location.pathname.replace(/[^/]*$/, '')}admin.html`
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
    console.warn('Admin approval email could not be sent:', error);
    return false;
  }
}
