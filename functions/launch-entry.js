'use strict';

const existing = require('./launch-main');
const { grantLaunchPartnerAccess } = require('./launch-partner-grant');

module.exports = {
  ...existing,
  grantLaunchPartnerAccess
};
