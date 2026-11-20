'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const Store = require('../src/store');
const cc = require('../src/callcenter');

const baseConfig = {
  defaultCountryCode: '1', defaultTimezone: 'America/New_York', callHoursStart: 9, callHoursEnd: 17,
  callDays: [1, 2, 3, 4, 5], maxAttempts: 3, minHoursBetweenAttempts: 24, ownerPhone: '512-555-0100',
  publicUrl: 'https://example.test', agencyName: 'Test Studio', yourName: 'Sam', dryRun: true,
  twilio: { accountSid: 'AC1', authToken: 'secret', fromNumber: '+15125550199' },
};
const tmpStore = () => new Store(path.join(os.tmpdir(), `cc-test-${crypto.randomUUID()}.json`));
// Wednesday 2026-11-18, 15:00 UTC = 10:00 New York
const WED_10AM_NY = new Date('2026-11-18T15:00:00Z');
const biz = (over = {}) => ({ id: 'b1', name: 'Joe Plumbing', phone: '512-555-0142', status: 'new', ...over });

test('allows a bridge call in business hours', () => {
  const r = cc.checkCallAllowed({ business: biz(), mode: 'bridge', store: tmpStore(), config: baseConfig, now: WED_10AM_NY });
  assert.deepEqual(r, { ok: true, to: '+15125550142' });
});

test('blocks outside calling hours, using the business timezone', () => {
  const r = cc.checkCallAllowed({ business: biz({ timezone: 'America/Los_Angeles' }), mode: 'bridge', store: tmpStore(), config: baseConfig, now: WED_10AM_NY });
  assert.equal(r.ok, false); // 7am in LA
  assert.match(r.reason, /calling hours/);
  const sat = cc.checkCallAllowed({ business: biz(), mode: 'bridge', store: tmpStore(), config: baseConfig, now: new Date('2026-11-21T15:00:00Z') });
  assert.equal(sat.ok, false);
});

test('blocks numbers on the do-not-call list', () => {
  const store = tmpStore();
  store.addDnc('+15125550142');
  const r = cc.checkCallAllowed({ business: biz(), mode: 'bridge', store, config: baseConfig, now: WED_10AM_NY });
  assert.equal(r.ok, false);
  assert.match(r.reason, /do-not-call/);
});

test('automated calls require consent', () => {
  const store = tmpStore();
  assert.equal(cc.checkCallAllowed({ business: biz(), mode: 'automated', store, config: baseConfig, now: WED_10AM_NY }).ok, false);
  assert.equal(cc.checkCallAllowed({ business: biz({ consentToAutomatedCalls: true }), mode: 'automated', store, config: baseConfig, now: WED_10AM_NY }).ok, true);
});

test('limits attempts and spacing', async () => {
  const store = tmpStore();
  const b = biz();
  store.businesses.push(b);
  await cc.placeCall({ business: b, mode: 'bridge', store, config: baseConfig, now: WED_10AM_NY });
  assert.equal(store.calls[0].status, 'simulated');
  assert.equal(b.status, 'contacted');
  await assert.rejects(cc.placeCall({ business: b, mode: 'bridge', store, config: baseConfig, now: new Date(WED_10AM_NY.getTime() + 3600e3) }), /less than 24h/);
});

test('gather handles key presses', () => {
  const b = biz();
  assert.equal(cc.automatedGatherTwiml(b, baseConfig, '1').outcome, 'interested');
  assert.match(cc.automatedGatherTwiml(b, baseConfig, '1').twiml, /<Dial[^>]*>\+15125550100<\/Dial>/);
  assert.equal(cc.automatedGatherTwiml(b, baseConfig, '2').sendLink, true);
  assert.equal(cc.automatedGatherTwiml(b, baseConfig, '9').outcome, 'opted_out');
  assert.equal(cc.automatedGatherTwiml(b, baseConfig, '', { noInput: true }).outcome, 'no_response');
});

test('greeting discloses it is automated and offers opt-out', () => {
  const t = cc.automatedGreetingTwiml(biz({ name: 'A & B' }), baseConfig, 'c1');
  assert.match(t, /automated call/);
  assert.match(t, /Press 9/);
  assert.match(t, /A &amp; B/);
  assert.match(t, /callId=c1&amp;noinput=1/);
});

test('validates Twilio signatures', () => {
  const url = 'https://example.test/twilio/voice?callId=x';
  const params = { CallSid: 'CA1', Digits: '1' };
  const sig = crypto.createHmac('sha1', 'secret').update(url + 'CallSidCA1Digits1').digest('base64');
  assert.equal(cc.validTwilioSignature('secret', sig, url, params), true);
  assert.equal(cc.validTwilioSignature('secret', sig, url, { ...params, Digits: '9' }), false);
});

test('test call needs Twilio and a phone, and builds a playable script', async () => {
  const store = tmpStore();
  await assert.rejects(cc.placeTestCall({ store, config: { ...baseConfig, twilioConfigured: false } }), /Twilio/);
  await assert.rejects(cc.placeTestCall({ store, config: { ...baseConfig, ownerPhone: '' } }), /OWNER_PHONE/);
  const orig = global.fetch;
  let sent;
  global.fetch = async (url, opts) => { sent = new URLSearchParams(opts.body); return { ok: true, json: async () => ({ sid: 'CA123', status: 'queued' }) }; };
  try {
    const call = await cc.placeTestCall({ store, config: { ...baseConfig, twilioConfigured: true, publicUrl: '' } });
    assert.equal(call.twilioSid, 'CA123');
    assert.equal(sent.get('To'), '+15125550100');
    assert.match(sent.get('Twiml'), /^<\?xml.*<Response><Say.*test call.*Sample Business.*<\/Response>$/);
  } finally { global.fetch = orig; }
});
