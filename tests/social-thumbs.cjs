const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const context = vm.createContext({ URL });
vm.runInContext(fs.readFileSync(path.join(root, 'lib/shared.js'), 'utf8'), context);
const WC = vm.runInContext('WC', context);

test('source marks are bundled and assigned by hostname, not untrusted substrings', () => {
  assert.equal(WC.sourceIdentity('https://twitter.com/user/status/123').name, 'X');
  assert.equal(WC.sourceIdentity('https://x.com/user/status/123').mark, '𝕏');
  assert.equal(WC.sourceIdentity('https://www.instagram.com/p/123').name, 'Instagram');
  assert.equal(WC.sourceIdentity('https://evil.example/x.com/status/123'), null);
  assert.equal(WC.sourceIdentity('https://x.com.evil.example/status/123'), null);
  assert.doesNotMatch(WC.sourceBadge('https://x.com/post'), /https?:|<img/);
});

const source = fs.readFileSync(path.join(root, 'popup/popup.js'), 'utf8');

test('X popup prefers post media over avatar and unrelated article images', () => {
  const article = (id, imgs) => ({
    querySelectorAll(selector) {
      return selector === 'a[href*="/status/"]' ? [{ getAttribute: () => `/user/status/${id}` }] : imgs;
    },
    querySelector: () => null,
  });
  const avatar = { src: 'https://pbs.twimg.com/profile_images/123/avatar.jpg' };
  const media = { src: 'https://pbs.twimg.com/media/actual-photo.jpg' };
  const sandbox = vm.createContext({ URL, location: { hostname: 'x.com', pathname: '/user/status/456' },
    document: { title: 'Post', querySelector: (s) => s.includes('og:image') ? { getAttribute: () => avatar.src } : null,
      querySelectorAll: (s) => s === 'article' ? [article('123', [media]), article('456', [avatar, media])] : [] },
    window: { getSelection: () => '' } });
  const run = vm.runInContext('(' + source.match(/function pageExtractor\(\) \{[\s\S]*?\n\}/)[0] + ')', sandbox);
  assert.equal(run().image, media.src);
  sandbox.document.querySelectorAll = (s) => s === 'article' ? [article('456', [avatar])] : [];
  assert.equal(run().image, '');
  sandbox.document.querySelector = (s) => s.includes('og:image') ? { getAttribute: () => media.src } : null;
  assert.equal(run().image, media.src);
});
