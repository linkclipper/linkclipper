// Tests for the dashboard-side AI snapshot builder and change validator.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadAi() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'ai-export.js'), 'utf8');
  const context = { URL };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.AI;
}

const AI = loadAi();

const items = [
  {
    id: 'a1', type: 'article', title: 'Local-first React', url: 'https://example.com/react',
    canonical: 'https://example.com/react', thumbnail: 'https://example.com/t.png',
    tags: ['react', 'local'], note: 'Use offline cache', description: 'A post', selection: 'quote',
    boardId: 'inbox', source: 'example.com', createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z', secret: 'do not export',
  },
  { id: 'a2', type: 'video', title: 'Deleted item', url: 'https://example.com/gone', boardId: 'inbox', deletedAt: '2026-02-01T00:00:00.000Z' },
];

const boards = [
  { id: 'inbox', name: 'Inbox', color: '#fff', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'gone', name: 'Gone', deletedAt: '2026-02-01T00:00:00.000Z' },
];

test('exportPayload keeps live items and notes but drops tombstones and unknown fields', () => {
  const data = AI.exportPayload(items, boards, '0.4.0');
  assert.equal(data.kind, 'ai-library');
  assert.equal(data.appVersion, '0.4.0');
  assert.equal(data.items.length, 1);
  assert.equal(data.boards.length, 1);
  assert.equal(data.items[0].note, 'Use offline cache');
  assert.equal(data.items[0].secret, undefined);
  assert.equal(data.items[0].deletedAt, undefined);
  assert.equal(data.boards[0].deletedAt, undefined);
});

test('normalizeChanges accepts create, update, move and delete', () => {
  const changes = AI.normalizeChanges({
    app: 'LinkClipper',
    kind: 'ai-changes',
    version: 1,
    changes: [
      { op: 'create', item: { url: 'https://example.com/new', title: 'New', board: 'Reading', tags: ['AI', 'ai', ' local '] } },
      { op: 'update', itemId: 'a1', baseUpdatedAt: '2026-01-02T00:00:00.000Z', patch: { note: 'Updated note', tags: ['one'] } },
      { op: 'move', itemIds: ['a1', 'a2'], board: 'Archive' },
      { op: 'delete', itemIds: ['a1'], baseUpdatedAt: { a1: '2026-01-02T00:00:00.000Z' } },
    ],
  });
  assert.equal(changes.length, 4);
  assert.equal(changes[0].item.url, 'https://example.com/new');
  assert.equal(changes[0].item.tags.join(','), 'AI,local');
  assert.equal(changes[0].item.boardId, 'Reading');
  assert.equal(changes[1].baseUpdatedAt, '2026-01-02T00:00:00.000Z');
  assert.equal(changes[1].patch.note, 'Updated note');
  assert.equal(changes[2].boardId, 'Archive');
  assert.equal(changes[3].baseUpdatedAt.a1, '2026-01-02T00:00:00.000Z');
});

test('normalizeChanges rejects malformed files and unsafe links', () => {
  assert.throws(() => AI.normalizeChanges({ app: 'Other', kind: 'ai-changes', changes: [] }), /Not a LinkClipper/);
  assert.throws(() => AI.normalizeChanges({ app: 'LinkClipper', kind: 'ai-changes', changes: [] }), /empty/);
  assert.throws(() => AI.normalizeChanges({
    app: 'LinkClipper', kind: 'ai-changes',
    changes: [{ op: 'create', item: { url: 'javascript:alert(1)' } }],
  }), /Only http and https/);
  assert.throws(() => AI.normalizeChanges({
    app: 'LinkClipper', kind: 'ai-changes',
    changes: [{ op: 'delete', itemIds: [] }],
  }), /itemIds/);
  assert.throws(() => AI.normalizeChanges({
    app: 'LinkClipper', kind: 'ai-changes',
    changes: [{ op: 'update', itemId: 'a1', patch: {} }],
  }), /patch is empty/);
  assert.throws(() => AI.normalizeChanges({
    app: 'LinkClipper', kind: 'ai-changes',
    changes: [{ op: 'update', itemId: 'a1', patch: { type: 'script' } }],
  }), /Unknown type/);
});
