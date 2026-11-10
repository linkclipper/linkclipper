// Tests for the LinkClipper MCP library, staged changes, stdio protocol and HTTP API.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');

const { createStore } = require('../mcp/lib/library.cjs');
const { createTools } = require('../mcp/lib/tools.cjs');

const SERVER = path.join(__dirname, '..', 'mcp', 'server.cjs');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-mcp-'));
  const library = path.join(dir, 'linkclipper-library.json');
  const changes = path.join(dir, 'linkclipper-changes.json');
  fs.writeFileSync(library, JSON.stringify({
    app: 'LinkClipper',
    kind: 'ai-library',
    version: 1,
    exportedAt: '2026-11-11T10:00:00.000Z',
    boards: [
      { id: 'inbox', name: 'Inbox' },
      { id: 'reading', name: 'Reading' },
    ],
    items: [
      {
        id: 'i1', type: 'article', title: 'Local-first React apps', url: 'https://example.com/react',
        canonical: 'https://example.com/react', tags: ['react', 'local'], note: 'Offline cache ideas',
        boardId: 'reading', source: 'example.com', updatedAt: '2026-11-10T09:00:00.000Z',
        createdAt: '2026-11-09T09:00:00.000Z',
      },
      {
        id: 'i2', type: 'video', title: 'Design tokens talk', url: 'https://youtube.com/watch?v=1',
        tags: ['design'], note: 'Good colour system', boardId: 'inbox', source: 'youtube.com',
        updatedAt: '2026-11-11T08:00:00.000Z', createdAt: '2026-11-08T09:00:00.000Z',
      },
    ],
  }, null, 2));
  return { dir, library, changes };
}

test('library search filters by text, tag, board and type', () => {
  const f = fixture();
  const store = createStore(f.library);

  assert.equal(store.search({ query: 'react' }).items.length, 1);
  assert.equal(store.search({ query: 'offline cache' }).items[0].id, 'i1');
  assert.equal(store.search({ tag: 'design' }).items[0].id, 'i2');
  assert.equal(store.search({ board: 'Reading' }).items[0].id, 'i1');
  assert.equal(store.search({ type: 'video' }).items[0].id, 'i2');
  assert.equal(store.search({ source: 'youtube' }).items[0].id, 'i2');
  assert.equal(store.search({ query: 'nothing-matches-this' }).total, 0);
  assert.equal(store.stats().items, 2);
  assert.equal(store.findByUrl('https://example.com/react').id, 'i1');
});

test('staged writes validate, stage and discard without touching the snapshot', () => {
  const f = fixture();
  const before = fs.readFileSync(f.library, 'utf8');
  const store = createStore(f.library);
  const tools = createTools(store, f.changes);

  const created = tools.save_item({
    url: 'https://example.com/new', title: 'New thing', board: 'Reading', tags: ['ai'],
  });
  assert.ok(created.staged.id.startsWith('chg_'));
  assert.equal(created.staged.op, 'create');

  assert.throws(() => tools.save_item({ url: 'https://example.com/react' }), /Already saved/);
  assert.throws(() => tools.save_item({ url: 'not-a-url' }), /Invalid link/);

  const updated = tools.update_item({ id: 'i1', note: 'Changed note', board: 'Reading' });
  assert.equal(updated.staged.op, 'update');
  assert.equal(updated.staged.itemId, 'i1');

  const moved = tools.move_items({ itemIds: ['i1', 'i2'], board: 'inbox' });
  assert.deepEqual(moved.staged.itemIds, ['i1', 'i2']);

  assert.throws(() => tools.delete_items({ itemIds: ['i1'] }), /confirm/);
  const deleted = tools.delete_items({ itemIds: ['i1'], confirm: true });
  assert.equal(deleted.staged.op, 'delete');

  assert.equal(tools.pending_changes().changes.length, 4);
  assert.equal(fs.readFileSync(f.library, 'utf8'), before);

  tools.discard_changes({ confirm: true });
  assert.equal(fs.existsSync(f.changes), false);
});

test('MCP stdio answers initialize, tools/list and tools/call', async () => {
  const f = fixture();
  const child = spawn(process.execPath, [SERVER, '--library', f.library, '--changes', f.changes], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines = readline.createInterface({ input: child.stdout });
  const queue = [];
  const waiters = [];
  lines.on('line', (line) => {
    const message = JSON.parse(line);
    const waiter = waiters.shift();
    if (waiter) waiter(message);
    else queue.push(message);
  });
  const next = () => queue.length ? Promise.resolve(queue.shift()) : new Promise((resolve) => waiters.push(resolve));
  const send = (message) => child.stdin.write(JSON.stringify(message) + '\n');

  try {
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } });
    const init = await next();
    assert.equal(init.result.protocolVersion, '2025-06-18');
    assert.equal(init.result.serverInfo.name, 'linkclipper');

    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const list = await next();
    assert.ok(list.result.tools.some((tool) => tool.name === 'search_items'));
    assert.ok(list.result.tools.some((tool) => tool.name === 'delete_items'));

    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_items', arguments: { query: 'react' } } });
    const call = await next();
    const payload = JSON.parse(call.result.content[0].text);
    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0].id, 'i1');

    send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'delete_items', arguments: { itemIds: ['i1'] } } });
    const refused = await next();
    assert.equal(refused.result.isError, true);
    assert.match(refused.result.content[0].text, /confirm/);
  } finally {
    child.kill();
  }
});

test('HTTP API requires the token, searches and stages changes', async () => {
  const f = fixture();
  const child = spawn(process.execPath, [
    SERVER, '--http', '--port', '0', '--token', 'test-token',
    '--library', f.library, '--changes', f.changes,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const port = await new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error('HTTP server did not start: ' + text)), 8000);
    child.stderr.on('data', (chunk) => {
      text += chunk.toString();
      const match = text.match(/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error('HTTP server exited ' + code + ': ' + text)); });
  });

  const base = 'http://127.0.0.1:' + port;
  const auth = { Authorization: 'Bearer test-token' };
  try {
    const health = await fetch(base + '/health').then((r) => r.json());
    assert.equal(health.ok, true);

    const denied = await fetch(base + '/items');
    assert.equal(denied.status, 401);

    const found = await fetch(base + '/items?query=design', { headers: auth }).then((r) => r.json());
    assert.equal(found.items.length, 1);
    assert.equal(found.items[0].id, 'i2');

    const staged = await fetch(base + '/changes', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
      body: JSON.stringify({ op: 'create', url: 'https://example.com/api', title: 'From API', board: 'Inbox' }),
    }).then((r) => r.json());
    assert.equal(staged.staged.op, 'create');

    const pending = await fetch(base + '/changes', { headers: auth }).then((r) => r.json());
    assert.equal(pending.changes.length, 1);

    const cleared = await fetch(base + '/changes?confirm=true', { method: 'DELETE', headers: auth }).then((r) => r.json());
    assert.equal(cleared.discarded, true);
  } finally {
    child.kill();
  }
});
