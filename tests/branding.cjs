const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('all extension surfaces use the LinkClipper mark, not a W roundel', () => {
  for (const page of ['dashboard/dashboard.html', 'dashboard/dev.html', 'popup/popup.html']) {
    assert.match(read(page), /\.\.\/icons\/mark\.svg/);
    assert.doesNotMatch(read(page), /class="logo">W</);
  }
  const overlay = read('content/overlay.js');
  const mark = read('icons/mark.svg');
  for (const d of [...mark.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1])) {
    assert.ok(overlay.includes(d), 'in-page mark matches vector source');
  }
  assert.doesNotMatch(overlay, /<text[^>]*>W<\/text>/);
});

test('toolbar icons have expected PNG dimensions', () => {
  for (const size of [16, 32, 48, 128]) {
    const bytes = fs.readFileSync(path.join(root, 'icons', `icon${size}.png`));
    assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
});
