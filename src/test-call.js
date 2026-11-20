#!/usr/bin/env node
'use strict';
// Call your own phone with the automated pitch:  npm run test-call -- [+15551234567]
const path = require('path');
const config = require('./config');
const Store = require('./store');
const { placeTestCall } = require('./callcenter');

const store = new Store(path.join(config.dataDir, 'db.json'));
placeTestCall({ business: store.businesses[0], store, config, to: process.argv[2] })
  .then((c) => console.log(`📞 Calling ${c.to} now (Twilio call ${c.twilioSid}). Pick up!`))
  .catch((err) => { console.error(`✗ ${err.message}`); process.exit(1); });
