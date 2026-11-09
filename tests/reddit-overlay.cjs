const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'content', 'overlay.js'), 'utf8').replace(/\r\n/g, '\n');
const payloadSource = source.match(/function redditPayload\(post\) \{[\s\S]*?\n  \}/)[0];
const adapterSource = source.match(/(\{\n      name: 'reddit',[\s\S]*?\n    \}),\n    \{\n      name: 'tiktok'/)[1];

test('Reddit payload saves the post permalink and its own title, not the feed URL or avatar', () => {
  const context = vm.createContext({
    URL,
    location: { href: 'https://www.reddit.com/r/programming/', origin: 'https://www.reddit.com' },
    document: { title: 'programming' },
    WC: { detectFromUrl: () => ({ type: 'social' }) },
  });
  const payload = vm.runInContext('(' + payloadSource + ')', context);
  const post = {
    getAttribute: (name) => ({ permalink: '/r/programming/comments/abc/a_post/', 'post-title': 'A useful post' })[name] || null,
    querySelector: (selector) => selector.startsWith('img[') ? null : { textContent: 'Fallback title' },
  };
  const result = payload(post);
  assert.equal(result.url, 'https://www.reddit.com/r/programming/comments/abc/a_post/');
  assert.equal(result.title, 'A useful post');
  assert.equal(result.thumbnail, '');
  post.querySelector = (selector) => selector.startsWith('[slot="post-media-container"]') ?
    { src: 'https://preview.redd.it/photo.jpeg' } : { textContent: 'Fallback title' };
  assert.equal(payload(post).thumbnail, 'https://preview.redd.it/photo.jpeg');
});

test('Reddit adapter inserts after Share in the post action row and watches redraws', () => {
  const spacer = { id: 'spacer' };
  const row = { querySelector: (selector) => selector === '.wc-btn' ? null : spacer };
  const root = { querySelector: () => row };
  const watched = [];
  const post = {
    getAttribute: (name) => name === 'permalink' ? '/r/test/comments/abc/post/' : null,
    shadowRoot: root,
    querySelector: () => null,
  };
  const context = vm.createContext({
    HOST: 'www.reddit.com',
    document: { querySelectorAll: () => [post] },
    redditPayload: () => ({ title: 'A post' }),
    redditRoots: new WeakSet(),
    mo: { observe: (...args) => watched.push(args) },
  });
  const adapter = vm.runInContext('(' + adapterSource + ')', context);
  assert.equal(adapter.match(), true);
  const targets = adapter.scan();
  assert.equal(targets.length, 1);
  assert.equal(targets[0].kind, 'reddit');
  assert.equal(targets[0].parent, row);
  assert.equal(targets[0].before, spacer);
  assert.equal(watched.length, 1);
  adapter.scan();
  assert.equal(watched.length, 1, 'observe each post root once');
  row.querySelector = (selector) => selector === '.wc-btn' ? {} : spacer;
  assert.equal(adapter.scan().length, 0);
});
