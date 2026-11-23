'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { makeZip, crc32 } = require('../src/zip');

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('produces a zip that standard tools can read', () => {
  const files = [{ name: 'a-site/index.html', data: '<p>Hello</p>' }, { name: 'café/index.html', data: 'ünïcode ✓' }];
  const file = path.join(os.tmpdir(), `zip-test-${process.pid}.zip`);
  fs.writeFileSync(file, makeZip(files));
  const out = execFileSync('python3', ['-I', '-c', `
import zipfile, sys, json
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
print(json.dumps({n: z.read(n).decode('utf-8') for n in z.namelist()}))`, file]).toString();
  assert.deepEqual(JSON.parse(out), { 'a-site/index.html': '<p>Hello</p>', 'café/index.html': 'ünïcode ✓' });
  fs.unlinkSync(file);
});
