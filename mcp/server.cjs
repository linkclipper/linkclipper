#!/usr/bin/env node
// LinkClipper MCP server.
//
// Two local transports, one tool set:
//   stdio  - default; for Claude Desktop, Cursor and other MCP clients
//   --http - for local LLMs and adapters that call a JSON API
//
// Reads only the snapshot exported by the dashboard. Writes are staged to
// linkclipper-changes.json and applied by the user in the dashboard.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const readline = require('node:readline');

const { createStore } = require('./lib/library.cjs');
const { createTools } = require('./lib/tools.cjs');

const VERSION = '0.1.0';
const PROTOCOLS = ['2024-11-05', '2025-03-26', '2025-06-18'];

function usage() {
  return [
    'LinkClipper MCP ' + VERSION,
    '',
    'Usage:',
    '  node mcp/server.cjs --library <linkclipper-library.json> [options]',
    '',
    'Options:',
    '  --library <path>   Snapshot exported by LinkClipper (or LINKCLIPPER_LIBRARY)',
    '  --changes <path>   Staged change file (default: next to the snapshot)',
    '  --http             Serve the localhost JSON API instead of stdio MCP',
    '  --port <number>    HTTP port (default 47821; 0 picks a free port)',
    '  --token <value>    Bearer token (default: ~/.linkclipper-mcp/token)',
    '  --help             Show this help',
    '',
    'The snapshot never leaves this machine. Writes are staged for review.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = { http: false, port: 47821 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--http') args.http = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--library') args.library = argv[++i];
    else if (arg === '--changes') args.changes = argv[++i];
    else if (arg === '--token') args.token = argv[++i];
    else if (arg === '--port') args.port = Number(argv[++i]);
    else throw new Error('Unknown option: ' + arg);
  }
  return args;
}

function defaultLibrary() {
  const candidates = [
    process.env.LINKCLIPPER_LIBRARY,
    path.join(process.cwd(), 'linkclipper-library.json'),
    path.join(os.homedir(), 'Downloads', 'linkclipper-library.json'),
    path.join(os.homedir(), 'OneDrive', 'Downloads', 'linkclipper-library.json'),
  ].filter(Boolean);
  return candidates.find((file) => fs.existsSync(file)) || candidates[1] || candidates[0];
}

function loadToken(explicit) {
  if (explicit) return { token: explicit, file: null };
  if (process.env.LINKCLIPPER_TOKEN) return { token: process.env.LINKCLIPPER_TOKEN, file: null };
  const file = path.join(os.homedir(), '.linkclipper-mcp', 'token');
  if (fs.existsSync(file)) return { token: fs.readFileSync(file, 'utf8').trim(), file };
  const token = crypto.randomBytes(24).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, token + '\n');
  return { token, file };
}

// ------------------------------------------------------------------ MCP stdio

const TOOL_DEFS = [
  {
    name: 'search_items',
    description: 'Search saved links, notes, tags and boards. Use this first for questions like "find my React articles".',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to look for. Every word must match somewhere.' },
        board: { type: 'string', description: 'Board name or id.' },
        tag: { type: 'string', description: 'Exact tag name (case-insensitive).' },
        type: { type: 'string', description: 'article, page, video, shorts, reel or social.' },
        source: { type: 'string', description: 'Domain or source name, e.g. youtube.com.' },
        limit: { type: 'number', description: '1-100, default 20.' },
        offset: { type: 'number', description: 'Skip this many results.' },
      },
    },
  },
  {
    name: 'get_item',
    description: 'Return one saved item with its URL, notes, tags and board.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Item id.' },
        url: { type: 'string', description: 'Original or canonical URL.' },
      },
    },
  },
  {
    name: 'list_boards',
    description: 'List boards with item counts.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_tags',
    description: 'List tags with usage counts.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'library_stats',
    description: 'Counts by type and board, tag count, export time and last save.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'save_item',
    description: 'Stage a new saved link. The user reviews it in the dashboard before it is added.',
    inputSchema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string', description: 'http(s) link to save.' },
        title: { type: 'string' },
        board: { type: 'string', description: 'Board name or id; defaults to Inbox.' },
        tags: { type: 'array', items: { type: 'string' } },
        note: { type: 'string' },
        type: { type: 'string', description: 'article, page, video, reel or social.' },
        thumbnail: { type: 'string' },
        source: { type: 'string' },
      },
    },
  },
  {
    name: 'update_item',
    description: 'Stage changes to a saved item (title, note, tags, board, type, thumbnail).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        url: { type: 'string' },
        title: { type: 'string' },
        note: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        board: { type: 'string' },
        type: { type: 'string' },
        thumbnail: { type: 'string' },
      },
    },
  },
  {
    name: 'move_items',
    description: 'Stage moving one or more items to another board.',
    inputSchema: {
      type: 'object',
      required: ['itemIds', 'board'],
      properties: {
        itemIds: { type: 'array', items: { type: 'string' } },
        board: { type: 'string', description: 'Destination board name or id.' },
      },
    },
  },
  {
    name: 'delete_items',
    description: 'Stage deletion. Requires confirm: true and should only follow an explicit user request.',
    inputSchema: {
      type: 'object',
      required: ['itemIds', 'confirm'],
      properties: {
        itemIds: { type: 'array', items: { type: 'string' } },
        confirm: { type: 'boolean' },
      },
    },
  },
  {
    name: 'pending_changes',
    description: 'Show changes already staged, waiting for the user in the dashboard.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'discard_changes',
    description: 'Discard all staged changes. Requires confirm: true.',
    inputSchema: {
      type: 'object',
      required: ['confirm'],
      properties: { confirm: { type: 'boolean' } },
    },
  },
];

function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }

function startMcp(tools) {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  const send = (message) => {
    if (message) process.stdout.write(JSON.stringify(message) + '\n');
  };

  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch (e) {
      send(rpcError(null, -32700, 'Parse error'));
      return;
    }

    const { id, method, params } = message;
    if (method === 'initialize') {
      const requested = params && params.protocolVersion;
      send(rpcResult(id, {
        protocolVersion: PROTOCOLS.indexOf(requested) === -1 ? PROTOCOLS[0] : requested,
        capabilities: { tools: {} },
        serverInfo: { name: 'linkclipper', version: VERSION },
      }));
      return;
    }
    if (method === 'notifications/initialized' || method === 'notifications/cancelled') return;
    if (method === 'ping') { send(rpcResult(id, {})); return; }
    if (method === 'tools/list') { send(rpcResult(id, { tools: TOOL_DEFS })); return; }
    if (method === 'tools/call') {
      const name = params && params.name;
      const fn = tools[name];
      if (!fn) { send(rpcError(id, -32602, 'Unknown tool: ' + name)); return; }
      try {
        const result = await fn((params && params.arguments) || {});
        send(rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        }));
      } catch (e) {
        send(rpcResult(id, {
          content: [{ type: 'text', text: e.message || String(e) }],
          isError: true,
        }));
      }
      return;
    }
    if (id !== undefined) send(rpcError(id, -32601, 'Method not found: ' + method));
  });
}

// ----------------------------------------------------------------- HTTP API

function sendJson(res, status, body) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error('Request body is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) { resolve({}); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('Request body is not valid JSON')); }
    });
    req.on('error', reject);
  });
}

function startHttp(tools, options) {
  const auth = options.auth;
  const tokenFile = options.tokenFile;

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/health') {
        sendJson(res, 200, { ok: true, name: 'linkclipper-mcp', version: VERSION });
        return;
      }
      if (!auth || req.headers.authorization !== 'Bearer ' + auth) {
        sendJson(res, 401, { error: 'Missing or invalid bearer token' });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/') {
        sendJson(res, 200, {
          name: 'linkclipper-mcp',
          version: VERSION,
          endpoints: [
            'GET /items?query=&board=&tag=&type=&source=&limit=&offset=',
            'GET /items/:id', 'GET /boards', 'GET /tags', 'GET /stats',
            'GET /changes', 'POST /changes', 'DELETE /changes?confirm=true',
          ],
          changeFile: options.changesPath,
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/items') {
        sendJson(res, 200, await tools.search_items({
          query: url.searchParams.get('query') || url.searchParams.get('q'),
          board: url.searchParams.get('board'),
          tag: url.searchParams.get('tag'),
          type: url.searchParams.get('type'),
          source: url.searchParams.get('source'),
          limit: url.searchParams.get('limit'),
          offset: url.searchParams.get('offset'),
        }));
        return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/items/')) {
        const id = decodeURIComponent(url.pathname.slice('/items/'.length));
        sendJson(res, 200, await tools.get_item({ id }));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/boards') {
        sendJson(res, 200, await tools.list_boards());
        return;
      }
      if (req.method === 'GET' && url.pathname === '/tags') {
        sendJson(res, 200, await tools.list_tags());
        return;
      }
      if (req.method === 'GET' && url.pathname === '/stats') {
        sendJson(res, 200, await tools.library_stats());
        return;
      }
      if (req.method === 'GET' && url.pathname === '/changes') {
        sendJson(res, 200, await tools.pending_changes());
        return;
      }
      if (req.method === 'POST' && url.pathname === '/changes') {
        const body = await readBody(req);
        const op = String(body.op || '').toLowerCase();
        let result;
        if (op === 'create' || op === 'save') result = await tools.save_item(body);
        else if (op === 'update') result = await tools.update_item(body);
        else if (op === 'move') result = await tools.move_items(body);
        else if (op === 'delete') result = await tools.delete_items(body);
        else throw new Error('Unknown op: ' + (body.op || '(missing)') + ' (use create, update, move or delete)');
        sendJson(res, 200, result);
        return;
      }
      if (req.method === 'DELETE' && url.pathname === '/changes') {
        sendJson(res, 200, await tools.discard_changes({
          confirm: url.searchParams.get('confirm') === 'true',
        }));
        return;
      }
      sendJson(res, 404, { error: 'Not found' });
    } catch (e) {
      sendJson(res, 400, { error: e.message || String(e) });
    }
  });

  server.listen(options.port, '127.0.0.1', () => {
    const port = server.address().port;
    process.stderr.write('LinkClipper MCP HTTP listening on http://127.0.0.1:' + port + '\n');
    if (tokenFile) process.stderr.write('Bearer token file: ' + tokenFile + '\n');
    process.stderr.write('Change file: ' + options.changesPath + '\n');
  });
  return server;
}

// --------------------------------------------------------------------- main

function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); }
  catch (e) { process.stderr.write(e.message + '\n\n' + usage() + '\n'); process.exit(1); }
  if (args.help) { process.stdout.write(usage() + '\n'); return; }

  const libraryPath = path.resolve(args.library || defaultLibrary());
  const changesPath = path.resolve(args.changes || path.join(path.dirname(libraryPath), 'linkclipper-changes.json'));
  if (!fs.existsSync(libraryPath)) {
    process.stderr.write('Warning: library snapshot not found: ' + libraryPath + '\n');
    process.stderr.write('Export it from LinkClipper: Dashboard -> AI -> Export AI snapshot.\n');
  }

  const store = createStore(libraryPath);
  const tools = createTools(store, changesPath);

  if (args.http) {
    const pair = loadToken(args.token);
    startHttp(tools, {
      port: Number.isFinite(args.port) ? args.port : 47821,
      auth: pair.token,
      tokenFile: pair.file,
      changesPath,
    });
    return;
  }

  // stdio is reserved for JSON-RPC; diagnostics go to stderr only.
  process.stderr.write('LinkClipper MCP ' + VERSION + ' ready\n');
  process.stderr.write('Library: ' + libraryPath + '\n');
  process.stderr.write('Changes: ' + changesPath + '\n');
  startMcp(tools);
}

if (require.main === module) {
  try { main(); }
  catch (e) {
    process.stderr.write('LinkClipper MCP failed: ' + (e.message || e) + '\n');
    process.exit(1);
  }
}

module.exports = { TOOL_DEFS, createTools, createStore, parseArgs };
