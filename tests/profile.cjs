const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'profile.js'), 'utf8');
const Profile = vm.runInNewContext(source + '\nProfile');

test('local profile defaults to a neutral, valid identity', () => {
  const profile = Profile.normalize(null);
  assert.equal(profile.name, '');
  assert.equal(profile.bio, '');
  assert.equal(profile.color, Profile.COLORS[0]);
  assert.equal(Profile.initials(profile), '✦');
});

test('profile trims and bounds user text and restricts avatar colors', () => {
  const profile = Profile.normalize({ name: '  Ada Lovelace  ', bio: '  Collecting ideas  ', color: 'red; background:url(x)' });
  assert.equal(profile.name, 'Ada Lovelace');
  assert.equal(profile.bio, 'Collecting ideas');
  assert.equal(profile.color, Profile.COLORS[0]);
  assert.equal(Profile.initials(profile), 'AL');
  assert.equal(Profile.normalize({ name: 'a'.repeat(100), bio: 'b'.repeat(200) }).name.length, 40);
  assert.equal(Profile.normalize({ bio: 'b'.repeat(200) }).bio.length, 120);
});
