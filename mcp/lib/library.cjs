// LinkClipper MCP - read side.
// Loads the snapshot exported by the dashboard, keeps a cached copy, and
// provides local search. No network, no accounts, no third-party services.

const fs = require('node:fs');
const path = require('node:path');

const ITEM_FIELDS = [
  'id', 'type', 'title', 'url', 'canonical', 'thumbnail', 'tags', 'note',
  'description', 'selection', 'readerText', 'readerAt', 'boardId', 'source',
  'createdAt', 'updatedAt',
];

function text(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max || 500);
}

function cleanItem(raw) {
  const item = {};
  ITEM_FIELDS.forEach((field) => {
    if (raw[field] === undefined) return;
    if (field === 'tags') {
      item.tags = (Array.isArray(raw.tags) ? raw.tags : [])
        .map((tag) => text(tag, 40)).filter(Boolean).slice(0, 20);
    } else if (field === 'note' || field === 'description' || field === 'selection') {
      item[field] = String(raw[field] || '').slice(0, 20000);
    } else if (field === 'readerText') {
      item[field] = String(raw[field] || '').slice(0, 100000);
    } else {
      item[field] = String(raw[field] == null ? '' : raw[field]).slice(0, 4000);
    }
  });
  item.tags = item.tags || [];
  return item;
}

function tokens(query) {
  return String(query || '').toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter(Boolean)
    .slice(0, 12);
}

function includes(haystack, needle) {
  return String(haystack || '').toLowerCase().indexOf(needle) !== -1;
}

function roundLimit(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max || 100);
}

function readSnapshot(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error('Library snapshot not found at ' + file +
      '. Export it from LinkClipper: Dashboard -> AI -> Export AI snapshot.');
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error('Library snapshot is not valid JSON: ' + file);
  }
  if (!data || data.app !== 'LinkClipper' || !Array.isArray(data.items)) {
    throw new Error('Not a LinkClipper AI library file: ' + file);
  }
  return data;
}

function createStore(file) {
  let cache = null;
  let cachedAt = 0;

  function load(force) {
    let stamp;
    try {
      stamp = fs.statSync(file).mtimeMs;
    } catch (e) {
      throw new Error('Library snapshot not found at ' + file +
        '. Export it from LinkClipper: Dashboard -> AI -> Export AI snapshot.');
    }
    if (force || !cache || stamp !== cachedAt) {
      const data = readSnapshot(file);
      const boards = (data.boards || []).filter((b) => !b.deletedAt).map((b) => ({
        id: String(b.id || ''),
        name: text(b.name, 200),
        color: String(b.color || ''),
        description: String(b.description || ''),
        createdAt: String(b.createdAt || ''),
        updatedAt: String(b.updatedAt || ''),
      }));
      const boardNames = {};
      boards.forEach((b) => { boardNames[b.id] = b.name; });
      const items = (data.items || [])
        .filter((i) => i && !i.deletedAt)
        .map((i) => {
          const item = cleanItem(i);
          item.boardName = boardNames[item.boardId] || '';
          return item;
        });
      cache = { data, boards, items, exportedAt: data.exportedAt || '' };
      cachedAt = stamp;
    }
    return cache;
  }

  function score(item, needles) {
    const title = item.title || '';
    const tags = (item.tags || []).join(' ');
    const note = item.note || '';
    const description = item.description || '';
    const url = item.url || '';
    const source = item.source || '';
    const board = item.boardName || '';
    let total = 0;
    for (const needle of needles) {
      let hit = false;
      if (includes(title, needle)) { total += 6; hit = true; }
      if (includes(tags, needle)) { total += 5; hit = true; }
      if (includes(note, needle)) { total += 3; hit = true; }
      if (includes(description, needle)) { total += 2; hit = true; }
      if (includes(source, needle) || includes(board, needle)) { total += 1; hit = true; }
      if (includes(url, needle)) { total += 1; hit = true; }
      if (!hit) return -1;
    }
    return total;
  }

  function search(args) {
    const options = args || {};
    const data = load(false);
    const needles = tokens(options.query || options.q);
    const board = text(options.board, 200).toLowerCase();
    const tag = text(options.tag, 60).toLowerCase();
    const type = text(options.type, 40).toLowerCase();
    const source = text(options.source, 100).toLowerCase();
    const limit = roundLimit(options.limit, 20, 100);
    const offset = Math.max(0, Number(options.offset) || 0);

    let out = data.items.filter((item) => {
      if (board && item.boardId !== options.board && (item.boardName || '').toLowerCase() !== board) return false;
      if (tag && !(item.tags || []).some((t) => t.toLowerCase() === tag)) return false;
      if (type && String(item.type || '').toLowerCase() !== type) return false;
      if (source && !includes(item.source, source) && !includes(item.url, source)) return false;
      return true;
    });

    if (needles.length) {
      out = out
        .map((item) => ({ item, score: score(item, needles) }))
        .filter((row) => row.score >= 0)
        .sort((a, b) => b.score - a.score || String(b.item.updatedAt || '').localeCompare(String(a.item.updatedAt || '')))
        .map((row) => row.item);
    } else {
      out.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    }

    return {
      total: out.length,
      offset,
      limit,
      items: out.slice(offset, offset + limit),
    };
  }

  function get(idOrUrl) {
    const key = text(idOrUrl, 2000);
    if (!key) return null;
    const data = load(false);
    return data.items.find((item) => item.id === key) ||
      data.items.find((item) => item.url === key || item.canonical === key) ||
      data.items.find((item) => includes(item.url, key)) ||
      null;
  }

  function findByUrl(url) {
    const key = text(url, 4000);
    if (!key) return null;
    const data = load(false);
    return data.items.find((item) => item.url === key || item.canonical === key) || null;
  }

  function tags() {
    const counts = {};
    load(false).items.forEach((item) => {
      (item.tags || []).forEach((tag) => {
        const key = tag.toLowerCase();
        if (!counts[key]) counts[key] = { tag, count: 0 };
        counts[key].count++;
      });
    });
    return Object.values(counts).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  function stats() {
    const data = load(false);
    const byType = {};
    const byBoard = {};
    let lastSaved = '';
    data.items.forEach((item) => {
      const type = item.type || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
      const board = item.boardName || item.boardId || 'Unfiled';
      byBoard[board] = (byBoard[board] || 0) + 1;
      if ((item.updatedAt || '') > lastSaved) lastSaved = item.updatedAt || '';
    });
    return {
      items: data.items.length,
      boards: data.boards.length,
      tags: tags().length,
      exportedAt: data.exportedAt,
      lastSaved,
      byType,
      byBoard,
    };
  }

  return {
    file,
    reload: () => load(true),
    search,
    get,
    findByUrl,
    allItems: () => load(false).items.slice(),
    boards: () => load(false).boards.slice(),
    tags,
    stats,
    has: (id) => !!load(false).items.find((item) => item.id === id),
  };
}

module.exports = { createStore, readSnapshot, tokens };
