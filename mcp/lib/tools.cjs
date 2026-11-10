// LinkClipper MCP - tool implementations shared by the stdio MCP server and
// the localhost HTTP API.

const changes = require('./changes.cjs');

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function findBoard(boards, raw) {
  if (raw) {
    const key = String(raw).trim();
    const lower = key.toLowerCase();
    return boards.find((b) => b.id === key) ||
      boards.find((b) => b.name.toLowerCase() === lower) ||
      boards.find((b) => slug(b.name) === slug(key)) ||
      null;
  }
  return boards.find((b) => b.id === 'inbox') ||
    boards.find((b) => b.name.toLowerCase() === 'inbox') ||
    boards[0] || null;
}

function requireItem(store, value, label) {
  const item = store.get(value);
  if (!item) throw new Error('No saved item matches ' + (label || 'that id or URL') + ': ' + value);
  return item;
}

function boardCounts(board, items) {
  return Object.assign({}, board, {
    items: items.filter((item) => item.boardId === board.id).length,
  });
}

function createTools(store, changesPath) {
  function saveItem(args) {
    const create = changes.normalizeCreate(args, store.boards(), findBoard);
    const existing = store.findByUrl(create.item.url) ||
      (create.item.canonical ? store.findByUrl(create.item.canonical) : null);
    if (existing) {
      throw new Error('Already saved as "' + existing.title + '" (' + existing.id + '). Use update_item to change it.');
    }
    return { staged: changes.appendChange(changesPath, create), changeFile: changesPath };
  }

  function updateItem(args) {
    if (!args || (!args.id && !args.url)) throw new Error('update_item needs id or url');
    const item = requireItem(store, args.id || args.url, 'item');
    if (args.boardId || args.board) {
      const board = findBoard(store.boards(), args.boardId || args.board);
      if (!board) throw new Error('Unknown board: ' + (args.boardId || args.board));
      args = Object.assign({}, args, { boardId: board.id });
    }
    const change = changes.normalizeUpdate(args, item);
    return { staged: changes.appendChange(changesPath, change), changeFile: changesPath };
  }

  function moveItems(args) {
    const ids = Array.isArray(args && (args.itemIds || args.ids)) ? (args.itemIds || args.ids) : [];
    if (!ids.length) throw new Error('move_items needs itemIds');
    const board = findBoard(store.boards(), args.boardId || args.board);
    if (!board) throw new Error('Unknown board: ' + (args.boardId || args.board));
    const items = ids.map((id) => requireItem(store, id, 'item'));
    const change = { op: 'move', itemIds: items.map((item) => item.id), boardId: board.id };
    return { staged: changes.appendChange(changesPath, change), changeFile: changesPath };
  }

  function deleteItems(args) {
    const ids = Array.isArray(args && (args.itemIds || args.ids)) ? (args.itemIds || args.ids) : [];
    if (!ids.length) throw new Error('delete_items needs itemIds');
    if (!args.confirm) throw new Error('delete_items requires confirm: true after asking the user');
    const items = ids.map((id) => requireItem(store, id, 'item'));
    const change = {
      op: 'delete',
      itemIds: items.map((item) => item.id),
      baseUpdatedAt: items.reduce((acc, item) => {
        acc[item.id] = item.updatedAt || '';
        return acc;
      }, {}),
    };
    return { staged: changes.appendChange(changesPath, change), changeFile: changesPath };
  }

  function discardChanges(args) {
    if (!args || !args.confirm) throw new Error('discard_changes requires confirm: true');
    changes.discardChanges(changesPath);
    return { discarded: true, changeFile: changesPath };
  }

  return {
    search_items(args) {
      return store.search(args || {});
    },
    get_item(args) {
      if (!args || (!args.id && !args.url)) throw new Error('get_item needs id or url');
      const item = store.get(args.id || args.url);
      if (!item) throw new Error('No saved item matches: ' + (args.id || args.url));
      return item;
    },
    list_boards() {
      const items = store.allItems();
      return { boards: store.boards().map((board) => boardCounts(board, items)) };
    },
    list_tags() {
      return { tags: store.tags() };
    },
    library_stats() {
      return store.stats();
    },
    save_item: saveItem,
    update_item: updateItem,
    move_items: moveItems,
    delete_items: deleteItems,
    pending_changes() {
      return changes.readChanges(changesPath);
    },
    discard_changes: discardChanges,
  };
}

module.exports = { createTools, findBoard };
