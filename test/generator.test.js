'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { renderSite, pickPreset } = require('../src/generator');

test('picks a preset from the category', () => {
  assert.equal(pickPreset('Plumber').key, 'trades');
  assert.equal(pickPreset('Coffee shop').key, 'cafe');
  assert.equal(pickPreset('Hair Salon').key, 'beauty');
  assert.equal(pickPreset('Something unusual').key, 'general');
});

test('renders a complete site with escaped content', () => {
  const html = renderSite({ name: 'Joe <b>&</b> Sons', category: 'plumber', phone: '512-555-0142', city: 'Austin', services: ['Leaks'] });
  assert.match(html, /<!doctype html>/);
  assert.match(html, /Joe &lt;b&gt;&amp;&lt;\/b&gt; Sons/);
  assert.doesNotMatch(html, /Joe <b>/);
  assert.match(html, /tel:\+15125550142/);
  assert.match(html, /\(512\) 555-0142/);
  assert.match(html, /Leaks/);
  assert.match(html, /"@type":"LocalBusiness"/);
  assert.match(html, /Austin/);
});

test('fills in defaults when info is sparse', () => {
  const html = renderSite({ name: 'Green Acres', category: 'landscaping' });
  assert.match(html, /Lawn care/);
  assert.match(html, /locally owned landscaping/);
  assert.doesNotMatch(html, /tel:/);
});

test('JSON-LD cannot break out of its script tag', () => {
  const html = renderSite({ name: '</script><script>alert(1)</script>' });
  const ld = html.split('application/ld+json">')[1].split('</script>')[0];
  assert.doesNotMatch(ld, /<\/script/);
});
