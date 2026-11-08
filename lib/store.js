// LinkClipper - local storage layer (chrome.storage.local).
// Local-first: every read/write hits local storage; sync (lib/supabase.js)
// merges on top. Deletes are tombstoned so they propagate to the cloud.

const KEYS = {
  items: 'wc_items',
  boards: 'wc_boards',
  settings: 'wc_settings',
};

const Store = {
  async getRaw(key) {
    const o = await chrome.storage.local.get(key);
    return o[key];
  },
  async setRaw(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },

  async ensureInit() {
    const [items, boards] = await Promise.all([this.getRaw(KEYS.items), this.getRaw(KEYS.boards)]);
    const seed = [];
    if (!boards) {
      seed.push(this.setRaw(KEYS.boards, [{
        id: 'inbox',
        name: 'Inbox',
        color: '#5C54EE',
        description: 'Everything lands here until you sort it.',
        createdAt: WC.nowISO(),
        updatedAt: WC.nowISO(),
        deletedAt: null,
      }]));
    }
    if (!items) seed.push(this.setRaw(KEYS.items, []));
    if (seed.length) await Promise.all(seed);
  },

  // ---------------------------------------------------------------- items

  async listItems() { return (await this.getRaw(KEYS.items)) || []; },
  async liveItems() { return (await this.listItems()).filter((i) => !i.deletedAt); },

  async getItem(id) { return (await this.listItems()).find((i) => i.id === id) || null; },

  // Create or update an item. Returns the saved item.
  async saveItem(patch) {
    const items = await this.listItems();
    const now = WC.nowISO();
    let saved = null;
    const idx = items.findIndex((i) => i.id === patch.id);
    if (idx >= 0) {
      saved = Object.assign({}, items[idx], patch, { updatedAt: now });
      items[idx] = saved;
    } else {
      saved = Object.assign({
        id: WC.uid(),
        createdAt: now,
        deletedAt: null,
        tags: [],
        note: '',
        selection: '',
        description: '',
        canonical: '',
      }, patch, { updatedAt: now });
      items.push(saved);
    }
    await this.setRaw(KEYS.items, items);
    return saved;
  },

  // Tombstone so the deletion syncs instead of silently resurrecting.
  async deleteItem(id) {
    const items = await this.listItems();
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return;
    items[idx] = Object.assign({}, items[idx], { deletedAt: WC.nowISO(), updatedAt: WC.nowISO() });
    await this.setRaw(KEYS.items, items);
  },

  async findByUrl(url) {
    const norm = WC.normalizeUrl(url);
    return (await this.listItems()).find(
      (i) => !i.deletedAt && (WC.normalizeUrl(i.url) === norm)
    ) || null;
  },

  // --------------------------------------------------------------- boards

  async listBoards() { return (await this.getRaw(KEYS.boards)) || []; },
  async liveBoards() { return (await this.listBoards()).filter((b) => !b.deletedAt); },

  async getBoard(id) { return (await this.listBoards()).find((b) => b.id === id) || null; },

  async saveBoard(patch) {
    const boards = await this.listBoards();
    const now = WC.nowISO();
    let saved = null;
    const idx = boards.findIndex((b) => b.id === patch.id);
    if (idx >= 0) {
      saved = Object.assign({}, boards[idx], patch, { updatedAt: now });
      boards[idx] = saved;
    } else {
      saved = Object.assign({
        id: WC.uid(),
        description: '',
        createdAt: now,
        deletedAt: null,
        color: WC.BOARD_COLORS[boards.length % WC.BOARD_COLORS.length],
      }, patch, { updatedAt: now });
      boards.push(saved);
    }
    await this.setRaw(KEYS.boards, boards);
    return saved;
  },

  async deleteBoard(id) {
    // Move surviving items to Inbox rather than orphaning them.
    const [items, boards] = await Promise.all([this.listItems(), this.listBoards()]);
    const now = WC.nowISO();
    const inbox = boards.find((b) => b.id === 'inbox' && !b.deletedAt && b.id !== id);
    const out = boards.map((b) => (
      b.id === id ? Object.assign({}, b, { deletedAt: now, updatedAt: now }) : b
    ));
    const moved = items.map((i) => (
      !i.deletedAt && i.boardId === id && inbox
        ? Object.assign({}, i, { boardId: inbox.id, updatedAt: now })
        : i
    ));
    await Promise.all([
      this.setRaw(KEYS.boards, out),
      this.setRaw(KEYS.items, moved),
    ]);
  },

  // ------------------------------------------------------------- settings

  defaultSettings() {
    return {
      supabaseUrl: '',
      supabaseKey: '',
      lastBoardId: 'inbox',
      lastSyncAt: null,
    };
  },

  async getSettings() {
    return Object.assign(this.defaultSettings(), (await this.getRaw(KEYS.settings)) || {});
  },
  async saveSettings(patch) {
    const cur = await this.getSettings();
    const next = Object.assign(cur, patch);
    await this.setRaw(KEYS.settings, next);
    return next;
  },

  // ---------------------------------------------------------------- tags

  async allTags() {
    const counts = {};
    for (const it of await this.liveItems()) {
      for (const t of it.tags || []) counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag, count]) => ({ tag, count }));
  },
};
