const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let writes = 0;
const memory = { wc_items: [
  { id: 'a', boardId: 'inbox', title: 'A', note: 'Keep', tags: ['old'], deletedAt: null, updatedAt: '2026-01-01' },
  { id: 'b', boardId: 'inbox', title: 'B', tags: [], deletedAt: null, updatedAt: '2026-01-01' },
  { id: 'gone', boardId: 'inbox', tags: [], deletedAt: '2026-02-01', updatedAt: '2026-02-01' },
] };
const context = vm.createContext({
  URL, Date, Promise, Set,
  chrome: { storage: { local: {
    async get(key) { return { [key]: memory[key] }; },
    async set(patch) { Object.assign(memory, patch); writes++; },
  } } },
});
for (const file of ['lib/shared.js', 'lib/store.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
}
const Store = vm.runInContext('Store', context);

test('bulk move writes once and ignores unknown/deleted/duplicate ids', async () => {
  const changed = await Store.bulkUpdateItems(['a', 'a', 'b', 'gone', 'missing'],
    (item) => item.boardId === 'ideas' ? null : { boardId: 'ideas' });
  assert.equal(changed, 2);
  assert.equal(writes, 1);
  assert.equal(memory.wc_items[0].note, 'Keep');
  assert.equal(memory.wc_items[0].boardId, 'ideas');
  assert.equal(memory.wc_items[1].boardId, 'ideas');
  assert.equal(memory.wc_items[2].boardId, 'inbox');
  assert.equal(memory.wc_items[0].updatedAt, memory.wc_items[1].updatedAt);
});

test('tagging skips items that already have the tag without another write', async () => {
  const changed = await Store.bulkUpdateItems(['a', 'b'],
    (item) => (item.tags || []).includes('read') ? null : { tags: [...(item.tags || []), 'read'] });
  assert.equal(changed, 2);
  assert.deepEqual(Array.from(memory.wc_items[0].tags), ['old', 'read']);
  const before = writes;
  assert.equal(await Store.bulkUpdateItems(['a', 'b'],
    (item) => item.tags.includes('read') ? null : { tags: [...item.tags, 'read'] }), 0);
  assert.equal(writes, before);
});

test('bulk delete tombstones only live selected items', async () => {
  assert.equal(await Store.bulkUpdateItems(['a', 'gone'], (_item, now) => ({ deletedAt: now })), 1);
  assert.equal(memory.wc_items[0].deletedAt, memory.wc_items[0].updatedAt);
  assert.equal(memory.wc_items[1].deletedAt, null);
  assert.equal(memory.wc_items[2].deletedAt, '2026-02-01');
});
