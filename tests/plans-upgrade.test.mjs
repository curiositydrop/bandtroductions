import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isUpgradeReturn, safeSameOriginReturn } from '../safe-return.js';
import { decideUpgrade, loginUpgradeHref, signupUpgradeHref, websiteCheckoutHref } from '../plans-upgrade.js';

const plans = fs.readFileSync(new URL('../plans.html', import.meta.url), 'utf8');
const website = fs.readFileSync(new URL('../website.html', import.meta.url), 'utf8');
const analytics = fs.readFileSync(new URL('../bt-analytics.js', import.meta.url), 'utf8');
const signup = fs.readFileSync(new URL('../signup.html', import.meta.url), 'utf8');

test('return targets stay on this site', () => {
  assert.equal(safeSameOriginReturn('plans.html?upgrade=1'), 'plans.html?upgrade=1');
  assert.equal(safeSameOriginReturn('profile.html?id=abc&classic=1'), 'profile.html?id=abc&classic=1');
  assert.equal(safeSameOriginReturn('btv.html#btv-upload'), 'btv.html#btv-upload');
  assert.equal(safeSameOriginReturn('/website-pilot.html?id=x&edit=1'), 'website-pilot.html?id=x&edit=1');
  assert.equal(safeSameOriginReturn('claim-profile.html?type=band&name=Old%20Band'), 'claim-profile.html?type=band&name=Old%20Band');
  assert.equal(safeSameOriginReturn('submit-band/index.html'), 'submit-band/index.html');
  for (const evil of [
    'https://evil.example/phish',
    'http://evil.example',
    '//evil.example',
    'javascript:alert(1)',
    'data:text/html,hi',
    '/\\evil.example',
    '\\evil.example',
    'plans.html\nSet-Cookie:x',
    'mailto:a@b.com',
    'https://bandtroductions.com.evil.example/plans.html'
  ]) {
    assert.equal(safeSameOriginReturn(evil, 'index.html'), 'index.html', evil);
    assert.equal(isUpgradeReturn(evil), false, evil);
  }
  assert.equal(isUpgradeReturn('plans.html?upgrade=1'), true);
  assert.equal(isUpgradeReturn('plans.html?upgrade=1&extra=1'), true);
  assert.equal(isUpgradeReturn('plans.html?upgrade=2'), false);
  assert.equal(isUpgradeReturn('website.html?upgrade=1'), false);
});

test('eligible owners go to website checkout and other roles do not', () => {
  const loggedOut = decideUpgrade({ user: null });
  assert.equal(loggedOut.href, signupUpgradeHref());
  assert.equal(loggedOut.loginHref, loginUpgradeHref());
  assert.equal(loggedOut.redirect, false);
  assert.match(decodeURIComponent(loggedOut.href), /plans\.html\?upgrade=1/);

  const band = decideUpgrade({
    user: { uid: 'band-1' },
    profileId: 'band-1',
    profile: { accountType: 'band', ownerId: 'band-1', published: true, displayName: 'Test Band' }
  });
  assert.equal(band.state, 'eligible');
  assert.equal(band.href, websiteCheckoutHref('band-1'));
  assert.equal(band.redirect, true);
  assert.equal(band.href.includes('profile.html'), false);
  assert.equal(band.href.includes('classic=1'), false);

  const musician = decideUpgrade({
    user: { uid: 'mus-1' },
    profileId: 'mus-1',
    profile: { accountType: 'musician', published: true }
  });
  assert.equal(musician.href, 'website.html?id=mus-1');

  const active = decideUpgrade({
    user: { uid: 'band-1' },
    profileId: 'band-1',
    profile: { accountType: 'band', published: true, websiteEnabled: true, websitePlanStatus: 'active' }
  });
  assert.equal(active.state, 'active');
  assert.equal(active.href, 'website.html?id=band-1');
  assert.match(active.label, /website/i);

  const unpublished = decideUpgrade({
    user: { uid: 'band-1' },
    profileId: 'band-1',
    profile: { accountType: 'band', published: false }
  });
  assert.equal(unpublished.state, 'unpublished');
  assert.equal(unpublished.redirect, false);
  assert.match(unpublished.href, /^profile-setup\.html/);
  assert.equal(unpublished.href.includes('website.html'), false);

  for (const type of ['fan', 'venue']) {
    const decision = decideUpgrade({
      user: { uid: 'fan-1' },
      profileId: 'fan-1',
      profile: { accountType: type, published: true }
    });
    assert.equal(decision.state, 'ineligible');
    assert.equal(decision.href, '');
    assert.equal(decision.redirect, false);
    assert.match(decision.message, new RegExp(type));
  }

  const stranger = decideUpgrade({
    user: { uid: 'fan-1' },
    profileId: 'band-1',
    profile: { accountType: 'band', ownerId: 'band-1', published: true }
  });
  assert.equal(stranger.state, 'ineligible');
  assert.equal(stranger.href, '');
});

test('plans page sells the existing offer and only tracked upgrade intent', () => {
  assert.match(plans, /Your band’s official website, without building one\./);
  assert.match(plans, /\$15 <small>\/ month<\/small>/);
  assert.match(plans, /Get 2 Months FREE!/);
  assert.match(plans, /Pay just \$15 for your first month\. Months 2 and 3 are FREE, then just \$15\/month\./);
  assert.match(plans, /Offer ends December 31, 2026\./);
  assert.match(plans, /Band Website \+ Merch/);
  assert.equal(plans.includes('custom-domain'), false);
  assert.equal(plans.includes('custom domain'), false);
  assert.equal(/airplay|radio/i.test(plans), false);
  assert.match(plans, /data-bt-event="upgrade_intent"/);
  assert.match(plans, /Lethal CreeD/);
  assert.match(plans, /website\.html\?id=EH63rrsL2kPDjevdR5GsWEtsne92/);
  assert.equal(plans.includes('website-pilot.html?id=EH63rrsL2kPDjevdR5GsWEtsne92'), false);
  assert.equal(plans.includes('profile.html?id='), false);
  assert.match(analytics, /upgrade_intent/);
  assert.match(fs.readFileSync(new URL('../bt-offer.js', import.meta.url), 'utf8'), /buy\.stripe\.com\/14AaEQbcy0tsfzP3mj6oo0g/);
  assert.equal(website.includes('buy.stripe.com/14AaEQbcy0tsfzP3mj6oo0g'), false);
  assert.match(website, /ACTIVE=new Set\(\['active','trialing','comped'\]\)/);
  assert.match(website, /launchSite\(params\.get\('edit'\)==='1'\)/);
  assert.match(website, /await window\.btTrack\('begin_checkout',checkoutParams\(offer\),\{beacon:true\}\)/);
  assert.equal(website.includes("plan:'website_merch'"), false);
  assert.equal(fs.readFileSync(new URL('../merch.js', import.meta.url), 'utf8').includes("plan: 'website_merch'"), false);
  assert.match(analytics, /p\.transport_type='beacon'/);
  assert.match(analytics, /p\.event_timeout=800/);
  assert.match(analytics, /sessionStorage/);
  assert.match(analytics, /localStorage\.removeItem\('bt_internal'\)/);
  assert.match(analytics, /btTrackPurchase/);
  assert.equal(analytics.includes("buy.stripe.com"), false);
  assert.match(website, /sellerAgreementAccepted:true/);
  assert.match(website, /prepareArtistUpgrade/);
  assert.match(signup, /upgradeIntent && artistAccount/);
  assert.equal(signup.includes('custom domain'), false);
});
