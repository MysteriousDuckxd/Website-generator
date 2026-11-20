#!/usr/bin/env node
'use strict';
/**
 * Generate websites straight from a file, without the dashboard:
 *   npm run generate -- examples/businesses.csv
 *   npm run generate -- examples/businesses.json
 * Sites are written to output/sites/<slug>/index.html
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { generateSite } = require('./generator');
const { parseCsv, normalizeBusinessInput } = require('./util');

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run generate -- <businesses.csv|businesses.json>');
  process.exit(1);
}
const text = fs.readFileSync(file, 'utf8');
const rows = file.toLowerCase().endsWith('.json') ? [].concat(JSON.parse(text)) : parseCsv(text);

let count = 0;
for (const row of rows) {
  const b = normalizeBusinessInput(row);
  if (!b.name) { console.warn('  skipped a row with no name'); continue; }
  const { file: out } = generateSite(b, { outputDir: config.outputDir, agencyName: config.agencyName, defaultCountryCode: config.defaultCountryCode });
  console.log(`  ✓ ${b.name.padEnd(32)} → ${path.relative(process.cwd(), out)}`);
  count++;
}
console.log(`\nGenerated ${count} site${count === 1 ? '' : 's'}.`);
