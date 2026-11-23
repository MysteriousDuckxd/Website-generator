#!/usr/bin/env node
'use strict';
/**
 * Builds dist/website-generator.html: one self-contained HTML file that runs the
 * same generator as the app, entirely in the browser (no server, no install).
 *   npm run build:html
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const MODULES = { './util': 'src/util.js', './generator': 'src/generator.js', './zip': 'src/zip.js' };

let bundle = 'var __mods = {};\n';
for (const [id, file] of Object.entries(MODULES)) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  bundle += `__mods[${JSON.stringify(id)}] = function (module, exports, require) {\n${src}\n};\n`;
}
bundle += `
var __cache = {};
function __require(id) {
  if (id === 'fs' || id === 'path') return {};
  if (id === 'crypto') {
    return { randomBytes: function (n) { return { toString: function () {
      return Array.from(window.crypto.getRandomValues(new Uint8Array(n)), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    } }; } };
  }
  if (!__mods[id]) throw new Error('Unknown module ' + id);
  if (!__cache[id]) { var m = { exports: {} }; __cache[id] = m; __mods[id](m, m.exports, __require); }
  return __cache[id].exports;
}
`;
// A literal "</script" inside the bundle would end the <script> element early.
bundle = bundle.replace(/<\/script/gi, '<\\/script');
if (/<!--/.test(bundle)) throw new Error('Bundle contains "<!--", which is unsafe inside <script>');

const template = fs.readFileSync(path.join(root, 'standalone', 'template.html'), 'utf8');
if (!template.includes('/*__BUNDLE__*/')) throw new Error('Template is missing the /*__BUNDLE__*/ marker');
const html = template.split('/*__BUNDLE__*/').join(bundle);

const out = path.join(root, 'dist', 'website-generator.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Built ${path.relative(process.cwd(), out)} (${(html.length / 1024).toFixed(0)} KB)`);
