import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  resolveAdminRecipients,
  adminNoticeId,
  adminNoticeLink,
  signupNoticeMessage,
  songNoticeMessage,
  btvNoticeMessage,
  collageNoticeMessage,
  deliverAdminNotices
} from '../admin-notify-core.mjs';
import { sendAdminApprovalEmail } from '../admin-approval-email.js';

const admins = [
  { id: 'profile-mike', ownerId: 'uid-mike' },
  { id: 'profile-other', ownerId: 'uid-other', userId: 'ignored' },
  { id: 'profile-mike-again', ownerId: 'uid-mike' },
  { id: 'legacy-admin' }
];

const recipients = resolveAdminRecipients(admins);
assert.deepEqual(recipients.map(item => item.recipientId), ['uid-mike', 'uid-other', 'legacy-admin']);
assert.equal(resolveAdminRecipients([]).length, 0);
assert.equal(resolveAdminRecipients([{ id: '' }]).length, 0);

for (const role of ['band', 'musician', 'venue', 'fan']) {
  const message = signupNoticeMessage({ accountType: role, displayName: 'Test Act', location: 'Portland, Maine' });
  assert.match(message, new RegExp(`New ${role} account: Test Act`));
  assert.match(message, /Portland, Maine/);
}
assert.match(signupNoticeMessage({ accountType: 'band', displayName: 'Claimed', claim: true }), /claiming an existing profile/);

assert.equal(adminNoticeLink('new_account', { profileId: 'uid-new' }), 'profile.html?id=uid-new');
assert.equal(adminNoticeLink('radio-submission', {}), 'admin.html');
assert.equal(adminNoticeLink('btv-submission', {}), 'btv.html#btv-admin');
assert.equal(adminNoticeLink('collage-upload', {}), 'collage.html');
assert.match(songNoticeMessage({ artist: 'Band', title: 'Song', source: 'website' }), /from their website/);
assert.match(songNoticeMessage({ artist: 'Band', title: 'Song', source: 'radio' }), /from the radio form/);
assert.match(btvNoticeMessage({ band: 'Band', title: 'Clip', kind: 'interview' }), /not on air until approved/);
assert.match(collageNoticeMessage({ name: 'Fan' }), /public collage wall/);

function memoryIo(profiles, { deny = false, failRecipient = '' } = {}) {
  const store = new Map();
  return {
    store,
    listAdmins: async () => profiles,
    writeNotice: async (id, data) => {
      if (deny) {
        const error = new Error('Missing or insufficient permissions.');
        error.code = 'permission-denied';
        throw error;
      }
      if (failRecipient && data.recipientId === failRecipient) throw new Error('write failed');
      if (store.has(id)) return { created: false };
      store.set(id, data);
      return { created: true };
    }
  };
}

const io = memoryIo(admins);
const first = await deliverAdminNotices(io, {
  type: 'new_account',
  subjectId: 'uid-new',
  profileId: 'uid-new',
  actorId: 'uid-new',
  actorName: 'Test Act',
  message: signupNoticeMessage({ accountType: 'band', displayName: 'Test Act' })
});
assert.equal(first.ok, true);
assert.equal(first.created, 3);
assert.equal(io.store.size, 3);
for (const record of io.store.values()) {
  assert.equal(record.type, 'new_account');
  assert.equal(record.linkUrl, 'profile.html?id=uid-new');
  assert.equal(record.recipientId === 'uid-mike' || record.recipientId === 'uid-other' || record.recipientId === 'legacy-admin', true);
}
const again = await deliverAdminNotices(io, {
  type: 'new_account',
  subjectId: 'uid-new',
  profileId: 'uid-new',
  actorId: 'uid-new',
  actorName: 'Test Act',
  message: signupNoticeMessage({ accountType: 'band', displayName: 'Test Act' })
});
assert.equal(again.ok, true);
assert.equal(again.created, 0);
assert.equal(io.store.size, 3);
assert.equal(adminNoticeId('new_account', 'uid-new', 'uid-mike'), adminNoticeId('new_account', 'uid-new', 'uid-mike'));

const none = await deliverAdminNotices(memoryIo([]), { type: 'collage-upload', subjectId: 'photo-1', actorName: 'Fan', message: collageNoticeMessage({ name: 'Fan' }) });
assert.equal(none.ok, false);
assert.equal(none.code, 'no-admin');

const denied = await deliverAdminNotices(memoryIo(admins, { deny: true }), { type: 'btv-submission', subjectId: 'vid-1', message: btvNoticeMessage({ kind: 'video' }) });
assert.equal(denied.ok, false);
assert.equal(denied.code, 'permission-denied');
assert.equal(denied.written.length, 0);

const partial = await deliverAdminNotices(memoryIo(admins, { failRecipient: 'uid-other' }), { type: 'radio-submission', subjectId: 'song-1', message: songNoticeMessage({ artist: 'Band', title: 'Song' }) });
assert.equal(partial.ok, false);
assert.equal(partial.code, 'partial');
assert.equal(partial.written.length, 2);
assert.equal(partial.failed.length, 1);

const lookup = await deliverAdminNotices({
  listAdmins: async () => { const error = new Error('denied'); error.code = 'permission-denied'; throw error; },
  writeNotice: async () => { throw new Error('should not write'); }
}, { type: 'new_account', subjectId: 'x', message: 'x' });
assert.equal(lookup.code, 'permission-denied');

for (const [type, subjectId, link] of [
  ['radio-submission', 'song-9', 'admin.html'],
  ['btv-submission', 'vid-9', 'btv.html#btv-admin'],
  ['collage-upload', 'photo-9', 'collage.html']
]) {
  const bucket = memoryIo([{ id: 'admin-profile', ownerId: 'uid-mike' }]);
  const result = await deliverAdminNotices(bucket, { type, subjectId, actorId: 'member', actorName: 'Member', message: `${type} notice` });
  assert.equal(result.ok, true);
  const saved = [...bucket.store.values()][0];
  assert.equal(saved.linkUrl, link);
  assert.equal(saved.recipientId, 'uid-mike');
  assert.equal(saved.type, type);
}

const btv = fs.readFileSync(new URL('../btv.js', import.meta.url), 'utf8');
const btvSubmit = btv.slice(btv.indexOf("addEventListener('submit'"));
assert.ok(btvSubmit.indexOf("btvStatus: 'pending'") < btvSubmit.indexOf('notifySiteAdmins'));
assert.match(btvSubmit, /if \(!canUploadBtv\(\)\)/);
assert.match(btv, /x\.status === 'approved'/);
assert.match(btv, /UPLOAD_TYPES = new Set\(\['band', 'musician', 'artist', 'venue'\]\)/);
assert.doesNotMatch(btv, /UPLOAD_TYPES = new Set\(\[[^\]]*fan/);

const collage = fs.readFileSync(new URL('../collage.js', import.meta.url), 'utf8');
const collageUpload = collage.slice(collage.indexOf('async function handleUpload'));
assert.ok(collageUpload.indexOf('published: true') < collageUpload.indexOf('notifySiteAdmins'));
assert.match(collage, /collage-own/);
assert.match(collage, /collage-safe/);
assert.match(collage, /collage-promo/);
assert.match(collage, /collage-public/);

const radio = fs.readFileSync(new URL('../radio-submit.js', import.meta.url), 'utf8');
assert.ok(radio.indexOf('addDoc(collection(db,"radioSubmissions")') < radio.indexOf('await notifyAdminsOfRadioSubmission'));
assert.match(radio, /reviewStatus:'pending'/);
assert.doesNotMatch(radio, /addDoc\(collection\(db,"notifications"\)/);

const website = fs.readFileSync(new URL('../website-features.js', import.meta.url), 'utf8');
assert.match(website, /songNoticeMessage\(\{artist,title,source:'website'\}\)/);
assert.doesNotMatch(website, /recipientId:d\.id/);

const signup = fs.readFileSync(new URL('../signup.html', import.meta.url), 'utf8');
assert.match(signup, /notifySiteAdmins\(/);
assert.doesNotMatch(signup, /await sendAdminApprovalEmail/);
assert.match(signup, /needsApproval = false/);

function assertApprovalEmailNotAwaited(source, kind) {
  const call = new RegExp(`sendAdminApprovalEmail\\(\\{[\\s\\S]*?kind:\\s*['"]${kind}['"][\\s\\S]*?\\}\\)\\.catch\\(`);
  assert.match(source, call, `${kind} approval email is attempted and errors are caught`);
  assert.doesNotMatch(source, /await\s+sendAdminApprovalEmail/, `${kind} approval email is not awaited`);
}

assertApprovalEmailNotAwaited(btv, 'btv');
assert.ok(btvSubmit.indexOf("gallery: 'btv'") < btvSubmit.indexOf("kind: 'btv'"));
assert.ok(btvSubmit.indexOf("kind: 'btv'") < btvSubmit.indexOf('notifySiteAdmins'));
assert.match(btv, /notifySiteAdmins/);

assertApprovalEmailNotAwaited(radio, 'radio-song');
assert.ok(radio.indexOf('addDoc(collection(db,"radioSubmissions")') < radio.indexOf("kind:'radio-song'"));
assert.ok(radio.indexOf("kind:'radio-song'") < radio.indexOf('await notifyAdminsOfRadioSubmission'));

assertApprovalEmailNotAwaited(website, 'radio-song');
assert.ok(website.indexOf("collection(db,'radioSubmissions')") < website.indexOf("kind:'radio-song'"));
assert.ok(website.indexOf("kind:'radio-song'") < website.indexOf('await notifyAdmins('));
assert.match(website, /songNoticeMessage\(\{artist,title,source:'website'\}\)/);

const FORM_ENDPOINT = 'https://formsubmit.co/ajax/mbergeron79%40gmail.com';

async function captureEmail(payload, response = { ok: true, status: 200 }) {
  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    if (response instanceof Error) throw response;
    return response;
  };
  try {
    const started = sendAdminApprovalEmail(payload);
    assert.equal(typeof started.then, 'function');
    const result = await started;
    return { result, call: calls[0], calls };
  } finally {
    globalThis.fetch = previous;
  }
}

const signupMail = await captureEmail({ kind: 'signup', name: 'Test Act', accountType: 'band', submittedBy: 'fan@example.com', details: 'New profile saved and is now live (auto-approved).' });
assert.equal(signupMail.result, true);
assert.equal(signupMail.call.url, FORM_ENDPOINT);
assert.equal(signupMail.call.options.method, 'POST');
assert.equal(signupMail.call.options.headers['Content-Type'], 'application/json');
assert.equal(signupMail.call.body._template, 'table');
assert.equal(signupMail.call.body._captcha, 'false');
assert.equal(signupMail.call.body._subject, 'BANDtroductions new account: Test Act');
assert.equal(signupMail.call.body.name, 'Test Act');
assert.equal(signupMail.call.body.accountType, 'band');
assert.equal(signupMail.call.body.submittedBy, 'fan@example.com');
assert.match(signupMail.call.body.message, /A new BANDtroductions account was created\./);
assert.match(signupMail.call.body.message, /Review BANDtroductions admin: https:\/\/bandtroductions\.com\/admin\.html/);
assert.equal(signupMail.call.body.Band, undefined);

const auditionMail = await captureEmail({ kind: 'audition', name: 'Night Shift', accountType: 'band', submittedBy: 'band@example.com', details: 'Looking for guitar.' });
assert.equal(auditionMail.call.body._subject, 'BANDtroductions Audition Room approval: Night Shift');
assert.match(auditionMail.call.body.message, /https:\/\/bandtroductions\.com\/admin-auditions\.html/);

for (const [btvType, label] of [['video', 'Music Video'], ['interview', 'Band Interview'], ['live', 'Live Set']]) {
  const mailed = await captureEmail({
    kind: 'btv',
    band: 'Night Shift',
    title: 'Alley Light',
    btvType,
    videoUrl: 'https://youtu.be/abcdefghijk',
    submitterEmail: 'band@example.com'
  });
  assert.equal(mailed.result, true);
  assert.equal(mailed.calls.length, 1);
  assert.equal(mailed.call.url, FORM_ENDPOINT);
  assert.equal(mailed.call.body._subject, 'BANDtroductions BTV approval needed: Night Shift');
  assert.equal(mailed.call.body._template, 'table');
  assert.equal(mailed.call.body._captcha, 'false');
  assert.equal(mailed.call.body.Band, 'Night Shift');
  assert.equal(mailed.call.body.Title, 'Alley Light');
  assert.equal(mailed.call.body.Type, label);
  assert.equal(mailed.call.body['Video link'], 'https://youtu.be/abcdefghijk');
  assert.equal(mailed.call.body['Submitter email'], 'band@example.com');
  assert.equal(mailed.call.body.name, undefined);
  assert.equal(mailed.call.body.accountType, undefined);
  assert.equal(mailed.call.body.submittedBy, undefined);
  assert.match(mailed.call.body.message, /A new BTV video is waiting for approval\./);
  assert.match(mailed.call.body.message, new RegExp(`Type: ${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(mailed.call.body.message, /Review BANDtroductions admin: https:\/\/bandtroductions\.com\/btv\.html#btv-admin/);
}

const partialBtv = await captureEmail({ kind: 'btv', band: 'Night Shift', title: '  ', btvType: 'video', videoUrl: '', submitterEmail: '' });
assert.equal(partialBtv.call.body.Band, 'Night Shift');
assert.equal(partialBtv.call.body.Type, 'Music Video');
assert.equal(partialBtv.call.body.Title, undefined);
assert.equal(partialBtv.call.body['Video link'], undefined);
assert.equal(partialBtv.call.body['Submitter email'], undefined);
assert.doesNotMatch(partialBtv.call.body.message, /Title:/);
assert.doesNotMatch(partialBtv.call.body.message, /Video link:/);
assert.doesNotMatch(partialBtv.call.body.message, /Submitter email:/);

const songMail = await captureEmail({ kind: 'radio-song', band: 'Night Shift', title: 'Alley Light', genre: 'Metal', submitter: 'band@example.com' });
assert.equal(songMail.result, true);
assert.equal(songMail.call.url, FORM_ENDPOINT);
assert.equal(songMail.call.body._subject, 'BANDtroductions radio song approval needed: Night Shift - Alley Light');
assert.equal(songMail.call.body._template, 'table');
assert.equal(songMail.call.body._captcha, 'false');
assert.equal(songMail.call.body.Band, 'Night Shift');
assert.equal(songMail.call.body.Title, 'Alley Light');
assert.equal(songMail.call.body.Genre, 'Metal');
assert.equal(songMail.call.body.Submitter, 'band@example.com');
assert.equal(songMail.call.body.name, undefined);
assert.equal(songMail.call.body['Video link'], undefined);
assert.match(songMail.call.body.message, /A new radio song is waiting for approval\./);
assert.match(songMail.call.body.message, /Review BANDtroductions admin: https:\/\/bandtroductions\.com\/admin\.html/);
assert.doesNotMatch(songMail.call.body.message, /btv\.html/);

const sparseSong = await captureEmail({ kind: 'radio-song', band: 'Night Shift', title: 'Alley Light', genre: '', submitter: '   ' });
assert.equal(sparseSong.call.body.Genre, undefined);
assert.equal(sparseSong.call.body.Submitter, undefined);
assert.match(sparseSong.call.body.message, /Band: Night Shift/);
assert.match(sparseSong.call.body.message, /Title: Alley Light/);
assert.doesNotMatch(sparseSong.call.body.message, /Genre:/);
assert.doesNotMatch(sparseSong.call.body.message, /Submitter:/);

const failed = await captureEmail({ kind: 'btv', band: 'Night Shift', title: 'Alley Light', btvType: 'video' }, new Error('network down'));
assert.equal(failed.result, false);
assert.equal(failed.calls.length, 1);

const rejected = await captureEmail({ kind: 'radio-song', band: 'Night Shift', title: 'Alley Light' }, { ok: false, status: 522 });
assert.equal(rejected.result, false);

console.log('PASS admin notice recipients, idempotency, links, permission failures, upload gates, and approval emails');
