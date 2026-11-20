'use strict';
const crypto = require('crypto');

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// For XML (TwiML) the same escaping works.
const escapeXml = escapeHtml;

function slugify(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'business';
}

/** Normalize a phone number to E.164 (+15551234567). Returns '' if it can't. */
function toE164(raw, defaultCountryCode = '1') {
  if (!raw) return '';
  const s = String(raw).trim();
  const digits = s.replace(/\D/g, '');
  if (s.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : '';
  if (s.startsWith('00')) return toE164(`+${digits.slice(2)}`);
  if (defaultCountryCode === '1') {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return '';
  }
  const national = digits.replace(/^0+/, '');
  return national.length >= 6 ? `+${defaultCountryCode}${national}` : '';
}

/** Small CSV parser supporting quoted fields, escaped quotes and newlines inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
}

/** Map loosely-named CSV/JSON fields onto our business shape. */
function normalizeBusinessInput(input) {
  const get = (...keys) => {
    for (const k of keys) {
      const hit = Object.keys(input).find((x) => x.toLowerCase().replace(/[\s_-]/g, '') === k);
      if (hit && input[hit] !== undefined && input[hit] !== '') return input[hit];
    }
    return '';
  };
  const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/[;|\n]/)).map((x) => String(x).trim()).filter(Boolean);
  const bool = (v) => v === true || /^(1|true|yes|y)$/i.test(String(v).trim());
  return {
    name: String(get('name', 'businessname', 'business')).trim(),
    category: String(get('category', 'type', 'industry')).trim(),
    ownerName: String(get('ownername', 'owner', 'contact', 'contactname')).trim(),
    phone: String(get('phone', 'phonenumber', 'tel', 'telephone')).trim(),
    email: String(get('email', 'emailaddress')).trim(),
    address: String(get('address', 'street', 'streetaddress')).trim(),
    city: String(get('city', 'town', 'location')).trim(),
    state: String(get('state', 'region', 'province')).trim(),
    zip: String(get('zip', 'zipcode', 'postalcode', 'postcode')).trim(),
    tagline: String(get('tagline', 'slogan')).trim(),
    description: String(get('description', 'about', 'bio')).trim(),
    services: list(get('services', 'menu', 'offerings')),
    hours: list(get('hours', 'openinghours', 'businesshours')),
    photo: String(get('photo', 'photourl', 'image', 'imageurl', 'heroimage')).trim(),
    timezone: String(get('timezone', 'tz')).trim(),
    consentToAutomatedCalls: bool(get('consenttoautomatedcalls', 'consent', 'automatedconsent')),
    notes: String(get('notes', 'note')).trim(),
  };
}

const newId = () => crypto.randomBytes(6).toString('hex');

module.exports = { escapeHtml, escapeXml, slugify, toE164, parseCsv, normalizeBusinessInput, newId };
