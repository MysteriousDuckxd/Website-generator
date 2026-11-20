'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { toE164, parseCsv, normalizeBusinessInput, slugify } = require('../src/util');

test('normalizes phone numbers', () => {
  assert.equal(toE164('(512) 555-0142'), '+15125550142');
  assert.equal(toE164('1-512-555-0142'), '+15125550142');
  assert.equal(toE164('+44 20 7946 0958'), '+442079460958');
  assert.equal(toE164('555-0142'), '');
  assert.equal(toE164(''), '');
});

test('parses CSV with quotes', () => {
  const rows = parseCsv('name,services\n"Joe, Inc","a;""b"""\n\nAnn,c\n');
  assert.deepEqual(rows, [{ name: 'Joe, Inc', services: 'a;"b"' }, { name: 'Ann', services: 'c' }]);
});

test('maps loose field names', () => {
  const b = normalizeBusinessInput({ 'Business Name': 'X', Owner: 'Y', 'Phone Number': '1', Services: 'a; b', consent: 'yes' });
  assert.equal(b.name, 'X');
  assert.equal(b.ownerName, 'Y');
  assert.equal(b.phone, '1');
  assert.deepEqual(b.services, ['a', 'b']);
  assert.equal(b.consentToAutomatedCalls, true);
});

test('slugify', () => {
  assert.equal(slugify("Joe's Café & Bar"), 'joe-s-cafe-and-bar');
});
