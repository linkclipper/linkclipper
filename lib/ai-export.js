// LinkClipper - local AI export helpers.
// Builds the snapshot the bundled MCP server reads, and validates the staged
// change file an AI assistant writes. No network calls live here.

(function (global) {
  const AI = {};

  const ITEM_FIELDS = [
    'id', 'type', 'title', 'url', 'canonical', 'thumbnail', 'tags', 'note',
    'description', 'selection', 'readerText', 'readerAt', 'boardId', 'source',
    'createdAt', 'updatedAt',
  ];
  const PATCH_FIELDS = ['title', 'note', 'tags', 'boardId', 'type', 'thumbnail', 'description', 'canonical'];
  const OPS = ['create', 'update', 'move', 'delete'];
  const TYPES = ['shorts', 'video', 'reel', 'social', 'article', 'page'];
  const MAX_CHANGES = 500;

  function cleanType(value, fallback) {
    const type = text(value, 40).toLowerCase();
    if (!type) return fallback || 'page';
    if (TYPES.indexOf(type) === -1) throw new Error('Unknown type "' + type + '"');
    return type;
  }

  function text(value, max) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max || 500);
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
    let u;
    try {
      u = new URL(String(url || '').trim());
    } catch (e) {
      throw new Error('Invalid link: ' + (url || 'missing'));
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error('Only http and https links are supported');
    }
    return u.href;
  }

  function cleanItem(raw) {
    const item = {};
    ITEM_FIELDS.forEach((field) => {
      if (raw[field] === undefined) return;
      if (field === 'tags') item.tags = cleanTags(raw.tags);
      else if (field === 'url' || field === 'canonical') item[field] = raw[field] ? String(raw[field]).trim() : '';
      else if (field === 'thumbnail') item.thumbnail = String(raw[field] || '').trim().slice(0, 4000);
      else if (field === 'note' || field === 'description' || field === 'selection') item[field] = String(raw[field] || '').slice(0, 20000);
      else if (field === 'readerText') item[field] = String(raw[field] || '').slice(0, 100000);
      else item[field] = text(raw[field], 500);
    });
    return item;
  }

  // A snapshot for the MCP server: live boards and items only, no settings,
  // no sync keys, no profile. Notes and highlights stay because they are the
  // user's own words and make AI answers useful.
  AI.exportPayload = function (items, boards, appVersion) {
    const liveBoards = (boards || []).filter((b) => !b.deletedAt).map((b) => ({
      id: b.id,
      name: b.name,
      color: b.color || '',
      description: b.description || '',
      createdAt: b.createdAt || '',
      updatedAt: b.updatedAt || '',
    }));
    const liveItems = (items || []).filter((i) => !i.deletedAt).map(cleanItem);
    return {
      app: 'LinkClipper',
      kind: 'ai-library',
      version: 1,
      appVersion: appVersion || '',
      exportedAt: new Date().toISOString(),
      boards: liveBoards,
      items: liveItems,
    };
  };

  function normalizeChange(raw, index) {
    const where = 'Change ' + (index + 1) + ': ';
    if (!raw || typeof raw !== 'object') throw new Error(where + 'not an object');
    const op = String(raw.op || '').toLowerCase();
    if (OPS.indexOf(op) === -1) throw new Error(where + 'unknown operation "' + op + '"');

    if (op === 'create') {
      if (!raw.item || typeof raw.item !== 'object') throw new Error(where + 'missing item');
      const item = cleanItem(raw.item);
      item.url = cleanUrl(item.url);
      item.type = cleanType(item.type, 'page');
      item.boardId = text(raw.item.boardId || raw.item.board, 200);
      if (!item.title) item.title = item.url;
      return { op, item };
    }

    if (op === 'update') {
      const itemId = text(raw.itemId || raw.id, 200);
      if (!itemId) throw new Error(where + 'missing itemId');
      if (!raw.patch || typeof raw.patch !== 'object') throw new Error(where + 'missing patch');
      const patch = {};
      PATCH_FIELDS.forEach((field) => {
        if (raw.patch[field] === undefined) return;
        if (field === 'tags') patch.tags = cleanTags(raw.patch.tags);
        else if (field === 'type') patch.type = cleanType(raw.patch.type, 'page');
        else if (field === 'note' || field === 'description') patch[field] = String(raw.patch[field] || '').slice(0, 20000);
        else if (field === 'canonical') patch[field] = String(raw.patch[field] || '').trim().slice(0, 4000);
        else if (field === 'thumbnail') patch[field] = String(raw.patch[field] || '').trim().slice(0, 4000);
        else patch[field] = text(raw.patch[field], 500);
      });
      if (raw.patch.board !== undefined && patch.boardId === undefined) patch.boardId = text(raw.patch.board, 200);
      if (!Object.keys(patch).length) throw new Error(where + 'patch is empty');
      return { op, itemId, baseUpdatedAt: text(raw.baseUpdatedAt, 60), patch };
    }

    const ids = Array.isArray(raw.itemIds) ? raw.itemIds : (raw.ids || []);
    const itemIds = ids.map((id) => text(id, 200)).filter(Boolean);
    if (!itemIds.length) throw new Error(where + 'missing itemIds');

    if (op === 'move') {
      const boardId = text(raw.boardId || raw.board, 200);
      if (!boardId) throw new Error(where + 'missing board');
      return { op, itemIds, boardId };
    }

    const base = raw.baseUpdatedAt && typeof raw.baseUpdatedAt === 'object' && !Array.isArray(raw.baseUpdatedAt)
      ? raw.baseUpdatedAt : null;
    return Object.assign({ op, itemIds }, base ? { baseUpdatedAt: base } : {});
  }

  // Validates the file an assistant writes. Throws with a readable reason.
  AI.normalizeChanges = function (data) {
    if (!data || typeof data !== 'object') throw new Error('Not a change file');
    if (data.app !== 'LinkClipper' || data.kind !== 'ai-changes') {
      throw new Error('Not a LinkClipper AI change file');
    }
    const list = Array.isArray(data.changes) ? data.changes : [];
    if (!list.length) throw new Error('The change file is empty');
    if (list.length > MAX_CHANGES) throw new Error('Too many changes (max ' + MAX_CHANGES + ')');
    return list.map(normalizeChange);
  };

  AI.summary = function (changes) {
    const counts = { create: 0, update: 0, move: 0, delete: 0 };
    (changes || []).forEach((c) => { if (counts[c.op] !== undefined) counts[c.op]++; });
    return counts;
  };

  global.AI = AI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
