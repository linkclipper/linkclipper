const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'shortcuts.js'), 'utf8');
const Shortcuts = vm.runInNewContext(source + '\nShortcuts');
const key = (name, modifiers = {}) => ({ key: name, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...modifiers });

test('default palette shortcut accepts Ctrl or Command, but not an extra modifier', () => {
  assert.equal(Shortcuts.matches(key('p', { ctrlKey: true, shiftKey: true }), Shortcuts.DEFAULT), true);
  assert.equal(Shortcuts.matches(key('P', { metaKey: true, shiftKey: true }), Shortcuts.DEFAULT), true);
  assert.equal(Shortcuts.matches(key('p', { ctrlKey: true, shiftKey: true, altKey: true }), Shortcuts.DEFAULT), false);
  assert.equal(Shortcuts.matches(key('p', { ctrlKey: true }), Shortcuts.DEFAULT), false);
});

test('alternate shortcut, disabled mode, and held-key repeat', () => {
  assert.equal(Shortcuts.matches(key('k', { altKey: true }), 'Alt+K'), true);
  assert.equal(Shortcuts.matches(key('k', { ctrlKey: true }), 'Mod+K'), true);
  assert.equal(Shortcuts.matches(key('k', { ctrlKey: true }), 'Off'), false);
  assert.equal(Shortcuts.matches(key('k', { ctrlKey: true, repeat: true }), 'Mod+K'), false);
  assert.equal(Shortcuts.valid('Shift+S'), false);
});

test('records and matches user-chosen combinations', () => {
  const chosen = Shortcuts.fromEvent(key('g', { metaKey: true, shiftKey: true }));
  assert.equal(chosen, 'Mod+Shift+G');
  assert.equal(Shortcuts.valid(chosen), true);
  assert.equal(Shortcuts.matches(key('g', { ctrlKey: true, shiftKey: true }), chosen), true);
  assert.equal(Shortcuts.fromEvent(key('g', { ctrlKey: true, altKey: true })), null);
  assert.equal(Shortcuts.fromEvent(key('g')), null);
});
