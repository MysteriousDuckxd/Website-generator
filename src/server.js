'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const Store = require('./store');
const { generateSite } = require('./generator');
const cc = require('./callcenter');
const { parseCsv, normalizeBusinessInput, newId, slugify, toE164 } = require('./util');

const STATUSES = ['new', 'contacted', 'interested', 'callback', 'not_interested', 'won', 'do_not_call'];

function createApp({ store, config }) {
  const genOpts = { outputDir: config.outputDir, agencyName: config.agencyName, defaultCountryCode: config.defaultCountryCode };

  function uniqueSlug(base, id) {
    let slug = base;
    for (let i = 2; store.businesses.some((b) => b.slug === slug && b.id !== id); i++) slug = `${base}-${i}`;
    return slug;
  }

  function createBusiness(input) {
    const data = normalizeBusinessInput(input);
    if (!data.name) throw httpError(400, 'Every business needs a name');
    const b = { id: newId(), ...data, status: 'new', createdAt: new Date().toISOString() };
    b.slug = uniqueSlug(slugify(`${b.name}${b.city ? `-${b.city}` : ''}`), b.id);
    store.businesses.push(b);
    generate(b);
    return b;
  }

  function generate(b) {
    generateSite(b, genOpts);
    b.siteGeneratedAt = new Date().toISOString();
  }

  function view(b) {
    return {
      ...b,
      phoneE164: toE164(b.phone, config.defaultCountryCode),
      previewPath: `/sites/${b.slug}/`,
      publicSiteUrl: cc.siteUrl(b, config),
      callCheck: {
        bridge: cc.checkCallAllowed({ business: b, mode: 'bridge', store, config }),
        automated: cc.checkCallAllowed({ business: b, mode: 'automated', store, config }),
      },
      attempts: store.callsFor(b.id).length,
    };
  }

  // ---------------- routes ----------------
  const routes = [];
  const route = (method, pattern, handler) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
    routes.push({ method, re, keys, handler });
  };

  route('GET', '/api/config', () => ({
    agencyName: config.agencyName,
    yourName: config.yourName,
    ownerPhone: config.ownerPhone,
    publicUrl: config.publicUrl,
    twilioConfigured: config.twilioConfigured,
    dryRun: config.dryRun,
    callHours: `${config.callHoursStart}:00–${config.callHoursEnd}:00`,
    callDays: config.callDays,
    defaultTimezone: config.defaultTimezone,
    maxAttempts: config.maxAttempts,
    statuses: STATUSES,
  }));

  route('GET', '/api/businesses', () => store.businesses.map(view));

  route('POST', '/api/businesses', ({ body }) => {
    const items = Array.isArray(body) ? body : [body];
    const created = items.map(createBusiness);
    store.save();
    return created.map(view);
  });

  route('POST', '/api/import-csv', ({ rawBody }) => {
    const rows = parseCsv(rawBody);
    if (!rows.length) throw httpError(400, 'No rows found. The first line must be a header, e.g. name,category,phone,city');
    const created = [];
    const skipped = [];
    rows.forEach((r, i) => {
      try { created.push(createBusiness(r)); } catch (err) { skipped.push({ row: i + 2, reason: err.message }); }
    });
    store.save();
    return { created: created.map(view), skipped };
  });

  route('PUT', '/api/businesses/:id', ({ params, body }) => {
    const b = store.findBusiness(params.id);
    if (!b) throw httpError(404, 'Business not found');
    const allowed = normalizeBusinessInput({ ...b, ...body });
    // Only overwrite fields that were sent
    for (const k of Object.keys(allowed)) {
      const sent = Object.keys(body).some((x) => x.toLowerCase().replace(/[\s_-]/g, '') === k.toLowerCase());
      if (sent) b[k] = allowed[k];
    }
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) throw httpError(400, `status must be one of ${STATUSES.join(', ')}`);
      b.status = body.status;
      if (b.status === 'do_not_call') store.addDnc(toE164(b.phone, config.defaultCountryCode), 'marked in dashboard');
    }
    if (!b.name) throw httpError(400, 'Name is required');
    generate(b);
    store.save();
    return view(b);
  });

  route('DELETE', '/api/businesses/:id', ({ params }) => {
    const b = store.findBusiness(params.id);
    if (!b) throw httpError(404, 'Business not found');
    store.data.businesses = store.businesses.filter((x) => x.id !== b.id);
    fs.rmSync(path.join(config.outputDir, 'sites', b.slug), { recursive: true, force: true });
    store.save();
    return { ok: true };
  });

  route('POST', '/api/businesses/:id/generate', ({ params }) => {
    const b = store.findBusiness(params.id);
    if (!b) throw httpError(404, 'Business not found');
    generate(b);
    store.save();
    return view(b);
  });

  route('POST', '/api/generate-all', () => {
    store.businesses.forEach(generate);
    store.save();
    return { generated: store.businesses.length };
  });

  route('POST', '/api/businesses/:id/call', async ({ params, body }) => {
    const b = store.findBusiness(params.id);
    if (!b) throw httpError(404, 'Business not found');
    const call = await cc.placeCall({ business: b, mode: body.mode || 'bridge', store, config });
    return { call, business: view(b) };
  });

  route('GET', '/api/calls', () => [...store.calls].reverse());

  route('GET', '/api/dnc', () => store.dnc);
  route('POST', '/api/dnc', ({ body }) => {
    const phone = toE164(body.phone, config.defaultCountryCode);
    if (!phone) throw httpError(400, 'Invalid phone number');
    store.addDnc(phone, body.reason || 'manual');
    return store.dnc;
  });
  route('DELETE', '/api/dnc/:phone', ({ params }) => {
    store.removeDnc(decodeURIComponent(params.phone));
    return store.dnc;
  });

  // ---------------- Twilio webhooks ----------------
  function twilioGuard(req, url, body) {
    if (config.dryRun) return; // nothing real is calling us in dry-run
    const ok = cc.validTwilioSignature(config.twilio.authToken, req.headers['x-twilio-signature'], `${config.publicUrl}${url.pathname}${url.search}`, body);
    if (!ok) throw httpError(403, 'Invalid Twilio signature');
  }

  function callAndBusiness(url) {
    const call = store.findCall(url.searchParams.get('callId') || '');
    if (!call) throw httpError(404, 'Unknown call');
    return { call, business: store.findBusiness(call.businessId) || { name: call.businessName } };
  }

  route('POST', '/twilio/voice', ({ req, url, body }) => {
    twilioGuard(req, url, body);
    const { call, business } = callAndBusiness(url);
    call.events.push({ at: new Date().toISOString(), note: `answered${body.AnsweredBy ? ` by ${body.AnsweredBy}` : ''}` });
    if (/^machine/.test(body.AnsweredBy || '')) call.outcome = 'voicemail';
    store.save();
    return xml(cc.automatedGreetingTwiml(business, config, call.id, body.AnsweredBy));
  });

  route('POST', '/twilio/gather', async ({ req, url, body }) => {
    twilioGuard(req, url, body);
    const { call, business } = callAndBusiness(url);
    const result = cc.automatedGatherTwiml(business, config, body.Digits, { noInput: url.searchParams.has('noinput') });
    call.outcome = result.outcome;
    call.events.push({ at: new Date().toISOString(), note: `pressed ${body.Digits || 'nothing'} → ${result.outcome}` });
    if (business.id) {
      if (result.outcome === 'interested' || result.outcome === 'sent_link') business.status = 'interested';
      if (result.outcome === 'opted_out') {
        business.status = 'do_not_call';
        store.addDnc(call.to, 'pressed 9 on automated call');
      }
    }
    if (result.sendLink) {
      const link = cc.siteUrl(business, config);
      const text = `Hi from ${config.agencyName}! Here's the free website preview we made for ${business.name}: ${link}` +
        `${config.ownerPhone ? ` Questions? Call ${config.ownerPhone}.` : ''} Reply STOP to opt out.`;
      cc.sendSms({ to: call.to, body: text, config }).catch((err) => call.events.push({ at: new Date().toISOString(), note: `SMS failed: ${err.message}` }));
    }
    store.save();
    return xml(result.twiml);
  });

  route('POST', '/twilio/status', ({ req, url, body }) => {
    twilioGuard(req, url, body);
    const { call } = callAndBusiness(url);
    if (body.CallStatus) call.status = body.CallStatus;
    if (body.CallDuration) call.durationSec = Number(body.CallDuration);
    call.events.push({ at: new Date().toISOString(), note: `status: ${body.CallStatus}` });
    store.save();
    return { ok: true };
  });

  // ---------------- HTTP plumbing ----------------
  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        return sendFile(res, path.join(config.root, 'public', 'index.html'));
      }
      if (req.method === 'GET' && url.pathname.startsWith('/sites/')) {
        return serveSite(res, url.pathname, config.outputDir);
      }
      const match = routes
        .filter((r) => r.method === req.method)
        .map((r) => ({ r, m: r.re.exec(url.pathname) }))
        .find((x) => x.m);
      if (!match) throw httpError(404, 'Not found');
      const rawBody = await readBody(req);
      const body = parseBody(req, rawBody);
      const params = Object.fromEntries(match.r.keys.map((k, i) => [k, decodeURIComponent(match.m[i + 1])]));
      const out = await match.r.handler({ req, url, params, body, rawBody });
      if (out && out.__xml) {
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        return res.end(out.__xml);
      }
      sendJson(res, 200, out);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      sendJson(res, status, { error: err.message });
    }
  };
}

// ---------------- helpers ----------------
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const xml = (s) => ({ __xml: s });

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendFile(res, file, type = 'text/html; charset=utf-8') {
  fs.readFile(file, (err, buf) => {
    if (err) return sendJson(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': type });
    res.end(buf);
  });
}

function serveSite(res, pathname, outputDir) {
  const m = /^\/sites\/([a-z0-9-]+)\/?(index\.html)?$/.exec(pathname);
  if (!m) return sendJson(res, 404, { error: 'Not found' });
  if (!pathname.endsWith('/') && !m[2]) {
    res.writeHead(301, { Location: `${pathname}/` });
    return res.end();
  }
  sendFile(res, path.join(outputDir, 'sites', m[1], 'index.html'));
}

function readBody(req, limit = 2e6) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(httpError(413, 'Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseBody(req, raw) {
  if (!raw) return {};
  const type = req.headers['content-type'] || '';
  if (type.includes('application/json')) {
    try { return JSON.parse(raw); } catch { throw httpError(400, 'Invalid JSON'); }
  }
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  return {};
}

if (require.main === module) {
  const store = new Store(path.join(config.dataDir, 'db.json'));
  http.createServer(createApp({ store, config })).listen(config.port, () => {
    console.log(`\n  Dashboard:  http://localhost:${config.port}`);
    console.log(`  Calls:      ${config.dryRun ? 'DRY RUN (simulated — set Twilio keys and DRY_RUN=0 to dial for real)' : 'LIVE via Twilio'}`);
    if (!config.publicUrl) console.log('  PUBLIC_URL: not set — preview links and automated calls need a public URL');
    console.log('');
  });
}

module.exports = { createApp };
