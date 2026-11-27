import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stripPublicPhones,
  isLookingForBand,
  lookingForBandLabel,
  publicListingText,
  compareFeaturedThenName,
  buildBandOpeningRecord
} from '../audition-room-utils.mjs';
import { websiteMerchAccess } from '../botw-comp-access.mjs';

test('stripPublicPhones removes US numbers from a display name', () => {
  assert.equal(stripPublicPhones('Scott Mullen 207-877-5525'), 'Scott Mullen');
  assert.equal(stripPublicPhones('Call (207) 555-0100 today'), 'Call today');
  assert.equal(stripPublicPhones('A band in 2024'), 'A band in 2024');
});

test('isLookingForBand treats yes and maybe as looking, and no as not', () => {
  assert.equal(isLookingForBand('yes'), true);
  assert.equal(isLookingForBand('maybe'), true);
  assert.equal(isLookingForBand('Open to opportunities'), true);
  assert.equal(isLookingForBand('no'), false);
  assert.equal(isLookingForBand(''), false);
});

test('lookingForBandLabel never echoes a raw yes/maybe or a phone number', () => {
  assert.equal(lookingForBandLabel('yes'), 'Looking for a band');
  assert.equal(lookingForBandLabel('maybe'), 'Open to joining a band');
  assert.equal(lookingForBandLabel('Need a metal band 555-123-4567'), 'Need a metal band');
});

test('publicListingText strips phones and keeps a fallback', () => {
  assert.equal(publicListingText('Portland, ME'), 'Portland, ME');
  assert.equal(publicListingText('2078775525', 'Location not listed'), 'Location not listed');
});

test('featured listings sort ahead of regular names', () => {
  const rows = [
    { name: 'Zebra', featured: false },
    { name: 'Alpha', featured: false },
    { name: 'Mid', featured: true }
  ].sort(compareFeaturedThenName);
  assert.deepEqual(rows.map(r => r.name), ['Mid', 'Alpha', 'Zebra']);
});

test('$15 website and active comps count as featured-eligible', () => {
  assert.equal(websiteMerchAccess({ websiteEnabled: true, websitePlanStatus: 'active' }), 'paid');
  assert.equal(websiteMerchAccess({ websiteEnabled: true, websitePlanStatus: 'trialing' }), 'paid');
  assert.equal(websiteMerchAccess({ websiteEnabled: true, websitePlanStatus: 'comped' }), 'paid');
  assert.equal(websiteMerchAccess({}, { expiresOn: '2099-12-31' }), 'comp');
  assert.equal(websiteMerchAccess({}, null), 'free');
});

test('band openings without a video omit video fields; musician records keep them', () => {
  assert.deepEqual(buildBandOpeningRecord({ type: 'band', hasVideo: false }), {});
  const withVideo = buildBandOpeningRecord({
    type: 'band',
    hasVideo: true,
    videoUrl: 'https://example.com/v',
    videoStoragePath: 'auditions/u/file.mp4',
    videoContentType: 'video/mp4',
    originalVideoFileName: 'file.mp4',
    videoBytes: 12
  });
  assert.equal(withVideo.videoUrl, 'https://example.com/v');
  const musician = buildBandOpeningRecord({
    type: 'musician',
    hasVideo: true,
    videoUrl: 'https://example.com/v',
    videoStoragePath: 'auditions/u/file.mp4',
    videoContentType: 'video/mp4',
    originalVideoFileName: 'file.mp4',
    videoBytes: 12
  });
  assert.equal(musician.videoStoragePath, 'auditions/u/file.mp4');
});
