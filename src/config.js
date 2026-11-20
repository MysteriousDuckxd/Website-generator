'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Minimal .env loader (no dependencies). Real environment variables win.
function loadDotEnv(file = path.join(ROOT, '.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let value = m[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadDotEnv();

const env = (k, d = '') => (process.env[k] ?? d).toString().trim();
const num = (k, d) => {
  const n = Number(env(k, String(d)));
  return Number.isFinite(n) ? n : d;
};

const twilioConfigured = Boolean(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_FROM_NUMBER'));

const config = {
  root: ROOT,
  dataDir: path.join(ROOT, env('DATA_DIR', 'data')),
  outputDir: path.join(ROOT, env('OUTPUT_DIR', 'output')),
  port: num('PORT', 3000),
  publicUrl: env('PUBLIC_URL').replace(/\/+$/, ''),
  agencyName: env('AGENCY_NAME', 'Main Street Web Studio'),
  yourName: env('YOUR_NAME'),
  ownerPhone: env('OWNER_PHONE'),
  twilio: {
    accountSid: env('TWILIO_ACCOUNT_SID'),
    authToken: env('TWILIO_AUTH_TOKEN'),
    fromNumber: env('TWILIO_FROM_NUMBER'),
  },
  twilioConfigured,
  dryRun: !twilioConfigured || env('DRY_RUN', '1') !== '0',
  defaultCountryCode: env('DEFAULT_COUNTRY_CODE', '1'),
  defaultTimezone: env('DEFAULT_TIMEZONE', 'America/New_York'),
  callHoursStart: num('CALL_HOURS_START', 9),
  callHoursEnd: num('CALL_HOURS_END', 17),
  callDays: env('CALL_DAYS', '1,2,3,4,5').split(',').map(Number).filter((n) => n >= 0 && n <= 6),
  maxAttempts: num('MAX_ATTEMPTS_PER_BUSINESS', 3),
  minHoursBetweenAttempts: num('MIN_HOURS_BETWEEN_ATTEMPTS', 24),
};

module.exports = config;
