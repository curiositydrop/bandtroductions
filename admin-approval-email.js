const ADMIN_EMAIL = 'mbergeron79@gmail.com';
const FORM_ENDPOINT = `https://formsubmit.co/ajax/${encodeURIComponent(ADMIN_EMAIL)}`;
const ADMIN_REVIEW_URL = 'https://bandtroductions.com/admin.html';
const AUDITION_REVIEW_URL = 'https://bandtroductions.com/admin-auditions.html';
const BTV_REVIEW_URL = 'https://bandtroductions.com/btv.html#btv-admin';
const BTV_TYPE_LABELS = { video: 'Music Video', interview: 'Band Interview', live: 'Live Set' };

function filledRows(pairs) {
  return pairs.filter(([, value]) => String(value ?? '').trim());
}

export async function sendAdminApprovalEmail({ kind = 'profile', name = 'New profile', accountType = '', submittedBy = '', details = '', band = '', title = '', btvType = '', type = '', videoUrl = '', videoLink = '', submitterEmail = '', genre = '', submitter = '' } = {}) {
  if (kind === 'btv' || kind === 'radio-song' || kind === 'station-id') {
    return sendQueueApprovalEmail({ kind, band, title, btvType, type, videoUrl, videoLink, submitterEmail, genre, submitter });
  }

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

async function sendQueueApprovalEmail({ kind, band, title, btvType, type, videoUrl, videoLink, submitterEmail, genre, submitter }) {
  const isBtv = kind === 'btv';
  const isStationId = kind === 'station-id';
  const subject = isBtv
    ? `BANDtroductions BTV approval needed: ${band}`
    : isStationId
      ? `BANDtroductions station ID approval needed: ${[band, title].map((value) => String(value ?? '').trim()).filter(Boolean).join(' - ')}`
      : `BANDtroductions radio song approval needed: ${band} - ${title}`;
  const intro = isBtv
    ? 'A new BTV video is waiting for approval.'
    : isStationId
      ? 'A new radio station ID is waiting for approval.'
      : 'A new radio song is waiting for approval.';
  const reviewUrl = isBtv ? BTV_REVIEW_URL : ADMIN_REVIEW_URL;
  const typeLabel = BTV_TYPE_LABELS[btvType || type] || type || '';
  const rows = filledRows(isBtv
    ? [['Band', band], ['Title', title], ['Type', typeLabel], ['Video link', videoUrl || videoLink], ['Submitter email', submitterEmail]]
    : isStationId
      ? [['Band', band], ['Title', title], ['Type', typeLabel || 'Station ID'], ['Submitter email', submitterEmail || submitter]]
      : [['Band', band], ['Title', title], ['Genre', genre], ['Submitter', submitter]]);
  const lines = [
    intro,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `Review BANDtroductions admin: ${reviewUrl}`
  ].filter(Boolean);
  const fields = {};
  for (const [label, value] of rows) fields[label] = value;

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
        ...fields,
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
