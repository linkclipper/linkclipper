const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'content', 'overlay.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function fn(name) {
  const match = source.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}'));
  assert.ok(match, 'missing function ' + name);
  return match[0];
}

const IG_POST = source.match(/const IG_POST = ([^\n]+);/)[1];
const helpers = [
  'igClean', 'igTitle', 'igPostUrl', 'igImage', 'igPayload', 'igGridPayload',
  'tiktokPayload', 'tiktokGridPayload',
].map(fn).join('\n');

function makeContext(overrides) {
  const ctx = vm.createContext(Object.assign({
    URL,
    location: { href: 'https://www.instagram.com/', origin: 'https://www.instagram.com', pathname: '/' },
    document: { title: '', querySelector: () => null, querySelectorAll: () => [] },
    WC: {
      detectFromUrl: (url) => (/\/video\/\d+/.test(url) || /\/p\/[\w-]+/.test(url) || /\/reel\/[\w-]+/.test(url))
        ? { type: 'reel' } : { type: null },
    },
  }, overrides));
  vm.runInContext('const IG_POST = ' + IG_POST + ';\n' + helpers, ctx);
  return ctx;
}

function metaDocument(meta, canonical, extra) {
  return Object.assign({
    title: 'Instagram',
    querySelector(selector) {
      if (selector === 'link[rel="canonical"]') return { getAttribute: () => canonical };
      const m = selector.match(/meta\[property="([^"]+)"\]/);
      if (m) return { content: meta[m[1]] || '' };
      return null;
    },
    querySelectorAll: () => [],
  }, extra);
}

function image(src, alt, width, height) {
  return {
    currentSrc: src,
    src,
    naturalWidth: width,
    naturalHeight: height,
    getAttribute: (name) => (name === 'alt' ? alt : null),
    getBoundingClientRect: () => ({ width, height }),
  };
}

function adapter(name, next) {
  if (!next) {
    const last = source.match(new RegExp('\\{\\n      name: \'' + name + '\',[\\s\\S]*?\\n    \\},\\n  \\];'));
    assert.ok(last, 'missing adapter ' + name);
    return last[0].replace(/,\n  \];$/, '');
  }
  const match = source.match(new RegExp('\\{\\n      name: \'' + name + '\',[\\s\\S]*?\\n    \\},\\n    \\{\\n      name: \'' + next + '\''));
  assert.ok(match, 'missing adapter ' + name);
  return match[0].replace(/,\n    \{\n      name: '[^']+'$/, '');
}

test('Instagram post page saves the canonical URL, caption and post image', () => {
  const canonical = 'https://www.instagram.com/nasa/p/DfahZrMjAqq/';
  const ctx = makeContext({
    location: { href: canonical, origin: 'https://www.instagram.com', pathname: '/nasa/p/DfahZrMjAqq/' },
    document: metaDocument({
      'og:title': 'NASA on Instagram: "Galaxy in bloom\n\nData from Hubble and Chandra."',
      'og:image': 'https://scontent.cdninstagram.com/post.jpg',
    }, canonical),
  });
  const payload = vm.runInContext('igPayload()', ctx);
  assert.equal(payload.url, canonical);
  assert.equal(payload.title, 'Galaxy in bloom Data from Hubble and Chandra.');
  assert.equal(payload.thumbnail, 'https://scontent.cdninstagram.com/post.jpg');
  assert.equal(payload.type, 'reel');
});

test('Instagram feed posts use their own link and largest image, not the avatar', () => {
  const avatar = image('https://scontent.cdninstagram.com/avatar.jpg', 'NASA profile picture', 40, 40);
  const post = image('https://scontent.cdninstagram.com/nebula.jpg',
    'Photo by NASA on November 07, 2026. May be an image of nebula and stars.', 640, 640);
  const link = { getAttribute: () => '/nasa/p/DfahZrMjAqq/' };
  const scope = {
    querySelectorAll: (selector) => (selector === 'a[href]' ? [link] : [avatar, post]),
  };
  const ctx = makeContext({
    location: { href: 'https://www.instagram.com/', origin: 'https://www.instagram.com', pathname: '/' },
    document: metaDocument({ 'og:title': 'NASA on Instagram: "Profile"', 'og:image': 'https://x/avatar.jpg' },
      'https://www.instagram.com/'),
  });
  const payload = vm.runInContext('igPayload(scope)', Object.assign(ctx, { scope }));
  assert.equal(payload.url, 'https://www.instagram.com/nasa/p/DfahZrMjAqq/');
  assert.equal(payload.thumbnail, 'https://scontent.cdninstagram.com/nebula.jpg');
  assert.equal(payload.title, 'nebula and stars.');
});

test('Instagram grid tiles save their own permalink and image', () => {
  const tile = { getAttribute: () => '/nasa/reel/Dfc1mYxFevS/' };
  const img = image('https://scontent.cdninstagram.com/cover.jpg',
    'Video by NASA on November 07, 2026. May be an image of poster and text.', 310, 414);
  const ctx = makeContext({
    location: { href: 'https://www.instagram.com/nasa/', origin: 'https://www.instagram.com', pathname: '/nasa/' },
  });
  const payload = vm.runInContext('igGridPayload(tile, img)', Object.assign(ctx, { tile, img }));
  assert.equal(payload.url, 'https://www.instagram.com/nasa/reel/Dfc1mYxFevS/');
  assert.equal(payload.title, 'poster and text.');
  assert.equal(payload.thumbnail, 'https://scontent.cdninstagram.com/cover.jpg');
  assert.equal(payload.type, 'reel');
});

test('Instagram adapter inserts after Share and badges grid tiles', () => {
  const holder = { querySelector: () => null };
  const wrap = { parentElement: holder };
  const share = { closest: () => wrap };
  const tileImage = image('https://scontent.cdninstagram.com/tile.jpg', 'A photo', 300, 300);
  const tile = {
    getAttribute: () => '/nasa/p/DfahZrMjAqq/',
    querySelector: (selector) => (selector === 'img' ? tileImage : null),
  };
  const ctx = makeContext({
    document: {
      querySelector: () => null,
      querySelectorAll: (selector) => {
        if (selector === 'svg[aria-label="Share"]') return [share];
        if (selector === 'a[href]') return [tile];
        return [];
      },
    },
  });
  const scan = vm.runInContext('(' + adapter('instagram', 'x') + ').scan', ctx);
  const targets = scan();
  assert.equal(targets.length, 2);
  assert.equal(targets[0].kind, 'row');
  assert.equal(targets[0].parent, holder);
  assert.equal(targets[0].after, wrap);
  assert.equal(targets[1].kind, 'thumb');
  assert.equal(targets[1].parent, tile);
});

test('TikTok video page saves the canonical permalink, description and cover', () => {
  const canonical = 'https://www.tiktok.com/@nasa/video/7420000000000000000';
  const desc = { textContent: 'A tour of the launch pad | TikTok' };
  const ctx = makeContext({
    location: { href: canonical, origin: 'https://www.tiktok.com', pathname: '/@nasa/video/7420000000000000000' },
    document: {
      title: 'TikTok',
      querySelector(selector) {
        if (selector === 'link[rel="canonical"]') return { getAttribute: () => canonical };
        if (selector === '[data-e2e="browse-video-desc"], [data-e2e="video-desc"]') return desc;
        if (selector === 'meta[property="og:image"]') return { content: 'https://p16-sign.tiktokcdn.com/cover.jpg' };
        if (selector === 'video') return { poster: '' };
        return null;
      },
      querySelectorAll: () => [],
    },
  });
  const payload = vm.runInContext('tiktokPayload()', ctx);
  assert.equal(payload.url, canonical);
  assert.equal(payload.title, 'A tour of the launch pad');
  assert.equal(payload.thumbnail, 'https://p16-sign.tiktokcdn.com/cover.jpg');
  assert.equal(payload.type, 'reel');
});

test('TikTok adapter inserts in the action rail and badges video tiles', () => {
  const holder = {
    querySelector: (selector) => (selector.indexOf('comment') !== -1 ? {} : null),
  };
  const wrap = { parentElement: holder };
  const share = { closest: () => wrap };
  const tileImage = image('https://p16-sign.tiktokcdn.com/tile.jpg', 'Launch clip', 300, 400);
  const tile = {
    getAttribute: () => '/@nasa/video/7420000000000000000',
    querySelector: (selector) => (selector === 'img' ? tileImage : null),
  };
  const ctx = makeContext({
    location: { href: 'https://www.tiktok.com/@nasa', origin: 'https://www.tiktok.com', pathname: '/@nasa' },
    document: {
      querySelector: () => null,
      querySelectorAll: (selector) => {
        if (selector.indexOf('share') !== -1) return [share];
        if (selector === 'a[href*="/video/"]') return [tile];
        return [];
      },
    },
  });
  const scan = vm.runInContext('(' + adapter('tiktok') + ').scan', ctx);
  const targets = scan();
  assert.equal(targets.length, 2);
  assert.equal(targets[0].kind, 'rail');
  assert.equal(targets[0].parent, holder);
  assert.equal(targets[0].after, wrap);
  assert.equal(targets[1].kind, 'thumb');
  assert.equal(targets[1].parent, tile);
});

test('Instagram profile-scoped post links are detected as reels', () => {
  const shared = fs.readFileSync(path.join(__dirname, '..', 'lib', 'shared.js'), 'utf8').replace(/\r\n/g, '\n');
  const ctx = vm.createContext({ URL, crypto: undefined, console });
  const WC = vm.runInContext(shared + '\n;WC', ctx);
  assert.equal(WC.detectFromUrl('https://www.instagram.com/nasa/p/DfahZrMjAqq/').type, 'reel');
  assert.equal(WC.detectFromUrl('https://www.instagram.com/instagram/reel/Dfh0K8ypSPK/').type, 'reel');
  assert.equal(WC.detectFromUrl('https://www.instagram.com/p/DfahZrMjAqq/').type, 'reel');
});
