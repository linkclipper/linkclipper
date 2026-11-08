const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const memory = {
  wc_items: [
    { id: 'saved', url: 'https://example.com/article?topic=design&utm_source=mail', canonical: 'https://example.com/article?topic=design', boardId: 'ideas', note: 'Keep this', tags: ['design'], deletedAt: null },
    { id: 'deleted', url: 'https://example.com/old', deletedAt: '2026-01-01' },
  ],
};
const context = vm.createContext({
  URL, Date, Promise,
  chrome: { storage: { local: {
    async get(key) { return { [key]: memory[key] }; },
    async set(patch) { Object.assign(memory, patch); },
  } } },
});
for (const file of ['lib/shared.js', 'lib/store.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
}
const Store = vm.runInContext('Store', context);
const WC = vm.runInContext('WC', context);

test('normalization strips tracking but preserves meaningful query boundaries', () => {
  assert.equal(WC.normalizeUrl('https://example.com/article?topic=design&utm_source=mail'),
    'https://example.com/article?topic=design');
  assert.notEqual(WC.normalizeUrl('https://example.com/article?topic=design'),
    WC.normalizeUrl('https://example.com/articletopic=design'));
});

test('finds a saved URL with different tracking params or a matching canonical', async () => {
  assert.equal((await Store.findByUrl('https://example.com/article?topic=design&fbclid=x')).id, 'saved');
  assert.equal((await Store.findByUrl('https://example.com/redirect', 'https://example.com/article?topic=design')).id, 'saved');
  assert.equal((await Store.findByUrl('https://example.com/article?topic=other')), null);
});

test('ignores tombstones and preserves an existing item when updating', async () => {
  assert.equal(await Store.findByUrl('https://example.com/old'), null);
  const updated = await Store.saveItem({ id: 'saved', boardId: 'inbox', tags: ['design', 'read'] });
  assert.equal(updated.note, 'Keep this');
  assert.equal(updated.boardId, 'inbox');
  assert.equal(memory.wc_items.length, 2);
});

test('a second copy requires a new save without the existing id', async () => {
  const first = memory.wc_items.find((i) => i.id === 'saved');
  const copy = await Store.saveItem({
    url: first.url, boardId: 'inbox', title: 'Second copy', tags: [],
  });
  assert.notEqual(copy.id, first.id);
  assert.equal(memory.wc_items.length, 3);
  assert.equal(first.note, 'Keep this');
});
