'use strict';

// Keep every existing Website + Merch export, and route the one-time launch
// partner grant through its dedicated module so there is only one source of
// truth for its admin authorization and partner-matching logic.
const existing = require('./main');
const { grantLaunchPartnerAccess } = require('./launch-partner-grant');

module.exports = {
  ...existing,
  grantLaunchPartnerAccess
};
