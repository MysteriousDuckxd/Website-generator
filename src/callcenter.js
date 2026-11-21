'use strict';
const crypto = require('crypto');
const { escapeXml: x, toE164, newId } = require('./util');

/**
 * Two call modes:
 *
 *  - "bridge"    : Twilio rings YOUR phone first, then connects you live to the
 *                  business. You talk to them yourself. Works without PUBLIC_URL.
 *  - "automated" : Twilio calls the business and plays a pitch with a menu
 *                  (1 = talk to you now, 2 = text me the link, 9 = don't call again).
 *                  Uses a synthetic voice, so it is only allowed for businesses
 *                  marked consentToAutomatedCalls (see README "Calling rules").
 */
const MODES = ['bridge', 'automated'];

/** Current hour/weekday in an IANA timezone. */
function localTime(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour').value);
  const wd = parts.find((p) => p.type === 'weekday').value;
  return { hour, day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd) };
}

/**
 * Decide whether we may call this business right now.
 * Returns { ok: true, to } or { ok: false, reason }.
 */
function checkCallAllowed({ business, mode, store, config, now = new Date() }) {
  if (!MODES.includes(mode)) return { ok: false, reason: `Unknown call mode "${mode}"` };
  const to = toE164(business.phone, config.defaultCountryCode);
  if (!to) return { ok: false, reason: 'Business has no valid phone number' };
  if (store.isOnDnc(to)) return { ok: false, reason: 'Number is on your do-not-call list' };
  if (business.status === 'do_not_call') return { ok: false, reason: 'Business is marked do-not-call' };
  if (business.status === 'won') return { ok: false, reason: 'Business is already a customer' };

  if (mode === 'bridge' && !toE164(config.ownerPhone, config.defaultCountryCode)) {
    return { ok: false, reason: 'Set OWNER_PHONE in .env so bridge calls can ring you first' };
  }
  if (mode === 'automated') {
    if (!business.consentToAutomatedCalls) {
      return { ok: false, reason: 'Automated (pre-recorded/AI voice) calls need the business’s prior consent. Use a bridge call instead, or mark consent if you have it.' };
    }
    if (!config.publicUrl) return { ok: false, reason: 'Set PUBLIC_URL in .env so Twilio can reach the call menu' };
  }

  const tz = business.timezone || config.defaultTimezone;
  let lt;
  try { lt = localTime(now, tz); } catch { return { ok: false, reason: `Invalid timezone "${tz}"` }; }
  if (!config.callDays.includes(lt.day) || lt.hour < config.callHoursStart || lt.hour >= config.callHoursEnd) {
    return { ok: false, reason: `Outside calling hours for this business (${tz}: allowed ${config.callHoursStart}:00–${config.callHoursEnd}:00 on configured days)` };
  }

  const attempts = store.callsFor(business.id).filter((c) => c.status !== 'blocked');
  if (attempts.length >= config.maxAttempts) return { ok: false, reason: `Already tried ${attempts.length} times (max ${config.maxAttempts})` };
  const last = attempts.map((c) => Date.parse(c.createdAt)).sort((a, b) => b - a)[0];
  if (last && now - last < config.minHoursBetweenAttempts * 3600e3) {
    return { ok: false, reason: `Last attempt was less than ${config.minHoursBetweenAttempts}h ago` };
  }
  return { ok: true, to };
}

// ---------------------------------------------------------------------------
// TwiML (the call scripts)
// ---------------------------------------------------------------------------

const say = (text) => `<Say voice="Polly.Joanna">${x(text)}</Say>`;
const twiml = (inner) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;

function siteUrl(business, config) {
  return config.publicUrl && business.slug ? `${config.publicUrl}/sites/${business.slug}/` : '';
}

/** Bridge: played to YOU, then dials the business. */
function bridgeTwiml(business, config, to) {
  const intro = `Connecting you to ${business.name}${business.ownerName ? `. Ask for ${business.ownerName}` : ''}.`;
  return twiml(`${say(intro)}<Dial callerId="${x(config.twilio.fromNumber)}" timeout="25">${x(to)}</Dial>${say('The call has ended.')}`);
}

/** Automated: what the business hears when they pick up. */
function automatedGreetingTwiml(business, config, callId, answeredBy = '') {
  const sender = config.yourName ? `${config.yourName} from ${config.agencyName}` : config.agencyName;
  const callback = config.ownerPhone || config.twilio.fromNumber;
  if (/^machine/.test(answeredBy)) {
    return twiml(say(
      `Hi, this is an automated message from ${sender} for ${business.name}. ` +
      `We built a free preview of a new website for your business and would love to show it to you. ` +
      `Call us back at ${spellPhone(callback)}. To stop future calls, call that number and ask to be removed. Thank you!`,
    ) + '<Hangup/>');
  }
  const action = `${config.publicUrl}/twilio/gather?callId=${encodeURIComponent(callId)}`;
  const pitch =
    `Hi, this is an automated call from ${sender}, calling for ${business.name}. ` +
    `We put together a free preview of a brand new website for your business, no strings attached. ` +
    `Press 1 to speak with ${config.yourName || 'us'} now. ` +
    `Press 2 and we'll text you the link to your preview. ` +
    `Press 9 and we won't call you again.`;
  return twiml(
    `<Gather numDigits="1" timeout="8" action="${x(action)}" method="POST">${say(pitch)}</Gather>` +
    `<Redirect method="POST">${x(`${action}&noinput=1`)}</Redirect>`,
  );
}

/** Automated: handle the key the business pressed. Returns { twiml, outcome }. */
function automatedGatherTwiml(business, config, digit, { noInput = false } = {}) {
  if (noInput || !digit) {
    return {
      outcome: 'no_response',
      twiml: twiml(say(`No problem. If you'd like to see your free website preview, call us at ${spellPhone(config.ownerPhone || config.twilio.fromNumber)}. Have a great day!`) + '<Hangup/>'),
    };
  }
  switch (digit) {
    case '1':
      return {
        outcome: 'interested',
        twiml: twiml(
          say('Great, connecting you now.') +
          `<Dial callerId="${x(config.twilio.fromNumber)}" timeout="25">${x(toE164(config.ownerPhone, config.defaultCountryCode))}</Dial>` +
          say(`Sorry, we couldn't connect you right now. We'll call you back shortly. Goodbye!`),
        ),
      };
    case '2':
      return {
        outcome: 'sent_link',
        sendLink: true,
        twiml: twiml(say(`Perfect, we're texting you the link now. Thanks, and have a great day!`) + '<Hangup/>'),
      };
    case '9':
      return {
        outcome: 'opted_out',
        twiml: twiml(say(`Understood. You've been removed from our list and we won't call again. Goodbye.`) + '<Hangup/>'),
      };
    default:
      return {
        outcome: 'no_response',
        twiml: twiml(say(`Sorry, I didn't catch that. Feel free to call us any time at ${spellPhone(config.ownerPhone || config.twilio.fromNumber)}. Goodbye!`) + '<Hangup/>'),
      };
  }
}

/** "+15551234567" -> "5 5 5, 1 2 3, 4 5 6 7" so the voice reads digits slowly. */
function spellPhone(e164 = '') {
  const d = String(e164).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (d.length === 10) return `${d.slice(0, 3).split('').join(' ')}, ${d.slice(3, 6).split('').join(' ')}, ${d.slice(6).split('').join(' ')}`;
  return d.split('').join(' ');
}

// ---------------------------------------------------------------------------
// Twilio REST + webhook signature validation (no SDK needed)
// ---------------------------------------------------------------------------

async function twilioRequest(config, resource, params) {
  const { accountSid, authToken } = config.twilio;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/${resource}.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(Object.entries(params).filter(([k, v]) => !k.startsWith('__') && v !== undefined)),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Twilio's free trial rejects some call options (inline Twiml, status
    // callbacks, machine detection). Retry once with only To/From/Url, serving
    // inline TwiML through Twilio's echo twimlet instead.
    if (resource === 'Calls' && res.status === 400 && /trial accounts have limited parameter access/i.test(body.message || '') && !params.__trialRetry) {
      const minimal = { To: params.To, From: params.From, Url: params.Url || trialTwimlUrl(params.Twiml), __trialRetry: true };
      const retry = await twilioRequest(config, resource, minimal);
      retry.trialFallback = true;
      return retry;
    }
    throw new Error(`Twilio ${res.status}: ${body.message || 'request failed'}`);
  }
  return body;
}

/** A URL that returns the given TwiML (Twilio's hosted echo twimlet). */
const trialTwimlUrl = (twimlXml) => `https://twimlets.com/echo?Twiml=${encodeURIComponent(twimlXml)}`;

/** https://www.twilio.com/docs/usage/security#validating-requests */
function validTwilioSignature(authToken, signature, url, params = {}) {
  if (!signature || !authToken) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const expected = crypto.createHmac('sha1', authToken).update(data).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Place a call (or simulate it in dry-run mode). Records it in the store.
 * Returns the call record. Throws on Twilio errors (record status = 'failed').
 */
async function placeCall({ business, mode, store, config, now = new Date() }) {
  const check = checkCallAllowed({ business, mode, store, config, now });
  if (!check.ok) {
    const err = new Error(check.reason);
    err.status = 422;
    throw err;
  }

  const call = {
    id: newId(),
    businessId: business.id,
    businessName: business.name,
    mode,
    to: check.to,
    status: 'queued',
    outcome: '',
    dryRun: config.dryRun,
    createdAt: now.toISOString(),
    events: [],
  };

  const statusCallback = config.publicUrl ? `${config.publicUrl}/twilio/status?callId=${call.id}` : '';
  let params;
  if (mode === 'bridge') {
    params = { To: toE164(config.ownerPhone, config.defaultCountryCode), From: config.twilio.fromNumber, Twiml: bridgeTwiml(business, config, check.to) };
  } else {
    params = {
      To: check.to,
      From: config.twilio.fromNumber,
      Url: `${config.publicUrl}/twilio/voice?callId=${call.id}`,
      MachineDetection: 'DetectMessageEnd',
    };
  }
  if (statusCallback) {
    params.StatusCallback = statusCallback;
    params.StatusCallbackEvent = 'initiated ringing answered completed';
  }

  store.calls.push(call);
  if (business.status === 'new' || !business.status) business.status = 'contacted';
  business.lastCalledAt = call.createdAt;

  if (config.dryRun) {
    call.status = 'simulated';
    call.events.push({ at: now.toISOString(), note: 'Dry run — no real call placed', params: { ...params } });
    store.save();
    return call;
  }

  try {
    const res = await twilioRequest(config, 'Calls', params);
    call.twilioSid = res.sid;
    call.status = res.status || 'queued';
    if (res.trialFallback) call.events.push({ at: new Date().toISOString(), note: 'Twilio trial: sent with basic options only (no live status updates or machine detection)' });
  } catch (err) {
    call.status = 'failed';
    call.error = err.message;
    store.save();
    throw err;
  }
  store.save();
  return call;
}

/**
 * Call YOUR OWN phone so you can hear the automated pitch for a business.
 * Skips calling-hours/attempt rules (you're calling yourself) and runs even
 * when DRY_RUN=1, as long as Twilio is configured. With PUBLIC_URL set the
 * 1/2/9 menu works too; key presses on a test call never change lead status.
 */
async function placeTestCall({ business, store, config, to, now = new Date() }) {
  const target = toE164(to || config.ownerPhone, config.defaultCountryCode);
  if (!target) {
    const err = new Error('Set OWNER_PHONE in .env (or enter a number) for the test call');
    err.status = 422;
    throw err;
  }
  if (!config.twilioConfigured) {
    const err = new Error('Twilio isn’t set up yet. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER to .env');
    err.status = 422;
    throw err;
  }
  const sample = business || { name: 'Sample Business', slug: '' };
  const call = {
    id: newId(), test: true, businessId: business ? business.id : '', businessName: `TEST → ${sample.name}`,
    mode: 'automated', to: target, status: 'queued', outcome: '', dryRun: false, createdAt: now.toISOString(), events: [],
  };
  const intro = say('This is a test call from your call center. Here is what a business will hear.') + '<Pause length="1"/>';
  let inner;
  if (config.publicUrl) {
    // Reuse the real greeting (with working key menu) after the intro.
    inner = intro + automatedGreetingTwiml(sample, config, call.id).replace(/^.*?<Response>|<\/Response>$/g, '');
  } else {
    const sender = config.yourName ? `${config.yourName} from ${config.agencyName}` : config.agencyName;
    inner = intro + say(
      `Hi, this is an automated call from ${sender}, calling for ${sample.name}. ` +
      `We put together a free preview of a brand new website for your business, no strings attached. ` +
      `Press 1 to speak with ${config.yourName || 'us'} now. Press 2 and we'll text you the link to your preview. ` +
      `Press 9 and we won't call you again.`,
    ) + '<Pause length="1"/>' + say('End of test. The key menu will work once PUBLIC_URL is set. Goodbye!');
  }
  const params = { To: target, From: config.twilio.fromNumber, Twiml: twiml(inner) };
  if (config.publicUrl) {
    params.StatusCallback = `${config.publicUrl}/twilio/status?callId=${call.id}`;
    params.StatusCallbackEvent = 'initiated ringing answered completed';
  }
  store.calls.push(call);
  try {
    const res = await twilioRequest(config, 'Calls', params);
    call.twilioSid = res.sid;
    call.status = res.status || 'queued';
    if (res.trialFallback) call.events.push({ at: new Date().toISOString(), note: 'Twilio trial: sent with basic options only (no live status updates or machine detection)' });
  } catch (err) {
    call.status = 'failed';
    call.error = err.message;
    store.save();
    throw err;
  }
  store.save();
  return call;
}

async function sendSms({ to, body, config, force = false }) {
  if (config.dryRun && !force) return { simulated: true };
  return twilioRequest(config, 'Messages', { To: to, From: config.twilio.fromNumber, Body: body });
}

module.exports = {
  MODES,
  localTime,
  checkCallAllowed,
  bridgeTwiml,
  automatedGreetingTwiml,
  automatedGatherTwiml,
  validTwilioSignature,
  trialTwimlUrl,
  placeCall,
  placeTestCall,
  sendSms,
  siteUrl,
  spellPhone,
};
