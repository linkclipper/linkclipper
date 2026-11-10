// LinkClipper MCP - staged writes.
// An assistant never edits the library snapshot. It appends validated changes
// to linkclipper-changes.json; the dashboard shows them for review and applies
// them only when the user confirms.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const OPS = ['create', 'update', 'move', 'delete'];
const MAX_CHANGES = 500;
const PATCH_FIELDS = ['title', 'note', 'tags', 'boardId', 'type', 'thumbnail', 'description', 'canonical'];
const TYPES = ['shorts', 'video', 'reel', 'social', 'article', 'page'];

function text(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max || 500);
}

function cleanType(value, fallback) {
  const type = text(value, 40).toLowerCase();
  if (!type) return fallback || 'page';
  if (TYPES.indexOf(type) === -1) throw new Error('Unknown type "' + type + '"');
  return type;
}

function cleanTags(tags) {
  const out = [];
  (Array.isArray(tags) ? tags : []).forEach((tag) => {
    const value = text(tag, 40);
    if (value && !out.some((t) => t.toLowerCase() === value.toLowerCase())) out.push(value);
  });
  return out.slice(0, 20);
}

function cleanUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url || '').trim());
  } catch (e) {
    throw new Error('Invalid link: ' + (url || 'missing'));
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https links are supported');
  }
  return parsed.href;
}

function emptyChanges() {
  return {
    app: 'LinkClipper',
    kind: 'ai-changes',
    version: 1,
    createdAt: new Date().toISOString(),
    changes: [],
  };
}

function readChanges(file) {
  if (!fs.existsSync(file)) return emptyChanges();
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error('Change file is not valid JSON: ' + file);
  }
  if (!data || data.app !== 'LinkClipper' || data.kind !== 'ai-changes' || !Array.isArray(data.changes)) {
    throw new Error('Not a LinkClipper AI change file: ' + file);
  }
  return data;
}

function writeChanges(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
  return data;
}

function appendChange(file, change) {
  const data = readChanges(file);
  if (data.changes.length >= MAX_CHANGES) {
    throw new Error('This change file already has ' + MAX_CHANGES + ' changes. Apply or discard it first.');
  }
  const entry = Object.assign({
    id: 'chg_' + crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }, change);
  data.changes.push(entry);
  writeChanges(file, data);
  return entry;
}

function discardChanges(file) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function normalizeCreate(args, boards, findBoard) {
  const raw = args && args.item ? args.item : args;
  if (!raw || typeof raw !== 'object') throw new Error('save_item needs an item object');
  const board = findBoard(boards, raw.boardId || raw.board);
  if (!board) throw new Error('Unknown board: ' + (raw.boardId || raw.board || '(none)'));
  return {
    op: 'create',
    item: {
      url: cleanUrl(raw.url),
      title: text(raw.title, 500) || cleanUrl(raw.url),
      type: cleanType(raw.type, 'page'),
      boardId: board.id,
      tags: cleanTags(raw.tags),
      note: String(raw.note || '').slice(0, 20000),
      description: String(raw.description || '').slice(0, 20000),
      thumbnail: String(raw.thumbnail || '').trim().slice(0, 4000),
      canonical: String(raw.canonical || '').trim().slice(0, 4000),
      source: text(raw.source, 200),
    },
  };
}

function normalizeUpdate(args, item) {
  const patch = {};
  PATCH_FIELDS.forEach((field) => {
    if (args[field] === undefined) return;
    if (field === 'tags') patch.tags = cleanTags(args.tags);
    else if (field === 'type') patch.type = cleanType(args.type, 'page');
    else if (field === 'note' || field === 'description') patch[field] = String(args[field] || '').slice(0, 20000);
    else if (field === 'canonical' || field === 'thumbnail') patch[field] = String(args[field] || '').trim().slice(0, 4000);
    else patch[field] = text(args[field], 500);
  });
  if (args.board !== undefined && patch.boardId === undefined) patch.boardId = text(args.board, 200);
  if (!Object.keys(patch).length) throw new Error('update_item needs at least one field to change');
  return { op: 'update', itemId: item.id, baseUpdatedAt: item.updatedAt || '', patch };
}

module.exports = {
  OPS,
  MAX_CHANGES,
  readChanges,
  writeChanges,
  appendChange,
  discardChanges,
  emptyChanges,
  normalizeCreate,
  normalizeUpdate,
  cleanUrl,
  cleanTags,
  text,
};
