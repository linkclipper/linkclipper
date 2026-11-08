const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''));

test('quick-save shortcut invokes the existing action popup, not a background save', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.action.default_popup, 'popup/popup.html');
  assert.equal(manifest.commands._execute_action.suggested_key.default, 'Alt+Shift+L');
  assert.deepEqual(manifest.permissions, ['activeTab', 'storage', 'scripting']);
});

test('popup exposes a board picker and an explicit save control', () => {
  const html = fs.readFileSync(path.join(root, 'popup', 'popup.html'), 'utf8');
  assert.match(html, /id="boardSelect"/);
  assert.match(html, /id="saveBtn"[^>]*disabled/);
});
