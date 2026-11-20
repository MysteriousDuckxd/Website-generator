'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { renderSite, pickPreset, PRESETS, DEFAULT_PRESET } = require('../src/generator');

test('picks a preset from the category', () => {
  assert.equal(pickPreset('Plumber').key, 'trades');
  assert.equal(pickPreset('Coffee shop').key, 'cafe');
  assert.equal(pickPreset('Hair Salon').key, 'beauty');
  assert.equal(pickPreset('Carpet cleaning').key, 'cleaning');
  assert.equal(pickPreset('Steakhouse').key, 'restaurant');
  assert.equal(pickPreset('Something unusual').key, 'general');
});

test('renders a complete site with escaped content', () => {
  const html = renderSite({ name: 'Joe <b>&</b> Sons', category: 'plumber', phone: '512-555-0142', city: 'Austin', services: ['Leaks: We fix them'] });
  assert.match(html, /<!doctype html>/);
  assert.match(html, /Joe &lt;b&gt;&amp;&lt;\/b&gt; Sons/);
  assert.doesNotMatch(html, /Joe <b>/);
  assert.match(html, /href="tel:\+15125550142"/);
  assert.match(html, /\(512\) 555-0142/);
  assert.match(html, /<h3>Leaks<\/h3>\s*<p>We fix them<\/p>/);
  assert.match(html, /"@type":"LocalBusiness"/);
  assert.match(html, /<title>Joe &lt;b&gt;&amp;&lt;\/b&gt; Sons \| plumber in Austin<\/title>/);
});

test('fills in defaults when info is sparse, without broken sections', () => {
  const html = renderSite({ name: 'Green Acres', category: 'landscaping' });
  assert.match(html, /Lawn care/);
  assert.match(html, /Green Acres is a local landscaping business\./);
  assert.match(html, /Landscaping and lawn care\./); // no dangling "across"
  assert.doesNotMatch(html, /tel:/);
  assert.doesNotMatch(html, /<iframe/);
  assert.doesNotMatch(html, /undefined|null|NaN/);
  assert.match(html, /hero-grid single/);
});

test('describes categories in natural English', () => {
  const { describeCategory } = require('../src/generator');
  assert.equal(describeCategory('Plumber'), 'a plumber');
  assert.equal(describeCategory('Accountant'), 'an accountant');
  assert.equal(describeCategory('Coffee shop'), 'a coffee shop');
  assert.equal(describeCategory('Landscaping'), 'a local landscaping business');
  assert.equal(describeCategory('Auto repair'), 'a local auto repair business');
  assert.equal(describeCategory('HVAC'), 'a local HVAC business');
  assert.equal(describeCategory('HVAC company'), 'an HVAC company');
  assert.equal(describeCategory('Cleaning service'), 'a cleaning service');
  assert.equal(describeCategory(''), 'a locally owned business');
});

test('every preset has a sensible button label', () => {
  for (const c of ['Coffee shop', 'Restaurant', 'Florist', 'Gym', 'Plumber', 'Barber']) {
    assert.doesNotMatch(renderSite({ name: 'X', category: c }), /View on the|View in store|View what/);
  }
  assert.equal(pickPreset('Barbershop').key, 'barber');
});

test('uses a photo only when it is a safe http(s) URL', () => {
  assert.match(renderSite({ name: 'A', photo: 'https://img.example/a.jpg' }), /<img src="https:\/\/img.example\/a.jpg"/);
  assert.doesNotMatch(renderSite({ name: 'A', photo: 'javascript:alert(1)' }), /<img/);
});

test('hours appear once: in the hero card, or in contact when there is a photo', () => {
  const b = { name: 'A', phone: '5125550142', hours: ['Mon–Fri 9am–5pm'] };
  const count = (h) => (h.match(/<table class="hours/g) || []).length;
  assert.equal(count(renderSite(b)), 1);
  assert.equal(count(renderSite({ ...b, photo: 'https://img.example/a.jpg' })), 1);
});

test('map and directions only appear with a street address', () => {
  const cityOnly = renderSite({ name: 'A', city: 'Columbus', state: 'OH', phone: '6145550163' });
  assert.doesNotMatch(cityOnly, /<iframe|Get directions/);
  assert.match(cityOnly, /Location<\/span>Columbus, OH/);
  const street = renderSite({ name: 'A', address: '1 Main St', city: 'Columbus' });
  assert.match(street, /<iframe class="map"/);
  assert.match(street, /Get directions/);
});

test('JSON-LD cannot break out of its script tag', () => {
  const html = renderSite({ name: '</script><script>alert(1)</script>' });
  const ld = html.split('application/ld+json">')[1].split('</script>')[0];
  assert.doesNotMatch(ld, /<\/script/);
});

// WCAG 2.x contrast
const lum = (hex) => {
  const [r, g, b] = hex.match(/\w\w/g).map((h) => parseInt(h, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('every palette meets WCAG AA contrast', () => {
  for (const p of [...PRESETS, DEFAULT_PRESET]) {
    const { accent, bg, ink } = p.colors;
    assert.ok(contrast('#ffffff', accent) >= 4.5, `${p.key}: white on accent ${contrast('#ffffff', accent).toFixed(2)}`);
    assert.ok(contrast(accent, bg) >= 4.5, `${p.key}: accent on background ${contrast(accent, bg).toFixed(2)}`);
    assert.ok(contrast(ink, bg) >= 7, `${p.key}: text on background`);
    assert.ok(contrast('#ffffff', ink) >= 7, `${p.key}: white on ink`);
  }
});
