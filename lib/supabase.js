// LinkClipper - optional Supabase cloud sync.
//
// Local-first design:
//   1. Push every local record whose updatedAt > lastSyncAt (upsert).
//   2. Pull every remote record whose updated_at > lastSyncAt.
//   3. Merge into local storage: newest updatedAt wins per record (LWW).
//   4. Persist lastSyncAt.
//
// Works straight from the dashboard page - Supabase's REST endpoint sends
// CORS headers that allow browser use, so no extra host permissions needed.

const Sync = {
  normalizeUrl(raw) {
    return String(raw || '').trim().replace(/\/+$/, '');
  },

  configured(settings) {
    return Boolean(settings && settings.supabaseUrl && settings.supabaseKey);
  },

  base(settings) {
    return this.normalizeUrl(settings.supabaseUrl) + '/rest/v1';
  },

  headers(settings, extra) {
    return Object.assign({
      apikey: settings.supabaseKey,
      Authorization: 'Bearer ' + settings.supabaseKey,
      'Content-Type': 'application/json',
    }, extra || {});
  },

  // ------------------------------------------------------ item field maps

  itemToLocal(r) {
    return {
      id: r.id,
      type: r.type || 'page',
      title: r.title || '',
      url: r.url || '',
      canonical: r.canonical || '',
      thumbnail: r.thumbnail || '',
      description: r.description || '',
      source: r.source || '',
      selection: r.selection || '',
      note: r.note || '',
      boardId: r.board_id || 'inbox',
      tags: Array.isArray(r.tags) ? r.tags : [],
      createdAt: r.created_at || WC.nowISO(),
      updatedAt: r.updated_at || r.created_at || WC.nowISO(),
      deletedAt: r.deleted_at || null,
    };
  },

  itemToRemote(i) {
    return {
      id: i.id,
      type: i.type,
      title: i.title,
      url: i.url,
      canonical: i.canonical || null,
      thumbnail: i.thumbnail || null,
      description: i.description || null,
      source: i.source || null,
      selection: i.selection || null,
      note: i.note || null,
      board_id: i.boardId || 'inbox',
      tags: i.tags || [],
      created_at: i.createdAt,
      updated_at: i.updatedAt,
      deleted_at: i.deletedAt || null,
    };
  },

  boardToLocal(r) {
    return {
      id: r.id,
      name: r.name || 'Untitled board',
      color: r.color || '#5C54EE',
      description: r.description || '',
      createdAt: r.created_at || WC.nowISO(),
      updatedAt: r.updated_at || r.created_at || WC.nowISO(),
      deletedAt: r.deleted_at || null,
    };
  },

  boardToRemote(b) {
    return {
      id: b.id,
      name: b.name,
      color: b.color,
      description: b.description || null,
      created_at: b.createdAt,
      updated_at: b.updatedAt,
      deleted_at: b.deletedAt || null,
    };
  },

  // ----------------------------------------------------------- transport

  async api(settings, path, opts) {
    const res = await fetch(this.base(settings) + path, {
      method: (opts && opts.method) || 'GET',
      headers: this.headers(settings, opts && opts.headers),
      body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 300); } catch (e) { /* noop */ }
      throw new Error('Supabase ' + res.status + ': ' + detail);
    }
    if ((opts && opts.expect === 'none')) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  },

  async test(settings) {
    await this.api(settings, '/wc_boards?select=id&limit=1');
    return true;
  },

  async pull(settings, table, since) {
    const path = '/' + table + '?select=*&(updated_at=gt.' + encodeURIComponent(since) + ')';
    return this.api(settings, path);
  },

  async push(settings, table, rows) {
    if (!rows.length) return;
    await this.api(settings, '/' + table + '?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: rows,
      expect: 'none',
    });
  },

  // ------------------------------------------------------------ strategy

  // Merge two records: the one with the newer updatedAt/updated_at wins.
  async mergeAll(settings) {
    const since = settings.lastSyncAt || '1970-01-01T00:00:00.000Z';

    const [remoteItems, remoteBoards, localItems, localBoards] = await Promise.all([
      this.pull(settings, 'wc_items', since),
      this.pull(settings, 'wc_boards', since),
      Store.listItems(),
      Store.listBoards(),
    ]);

    // Local records that changed since the last successful full sync (or that
    // have never been seen by the server) get pushed.
    const localDirtyItems = localItems
      .filter((i) => i.updatedAt > since)
      .map((i) => this.itemToRemote(i));
    const localDirtyBoards = localBoards
      .filter((b) => b.updatedAt > since)
      .map((b) => this.boardToRemote(b));

    await this.push(settings, 'wc_boards', localDirtyBoards);
    await this.push(settings, 'wc_items', localDirtyItems);

    // LWW merge for everything the server returned.
    const itemsById = new Map(localItems.map((i) => [i.id, i]));
    for (const r of remoteItems) {
      const local = this.itemToLocal(r);
      const existing = itemsById.get(local.id);
      if (!existing || existing.updatedAt <= local.updatedAt) itemsById.set(local.id, local);
    }

    const boardsById = new Map(localBoards.map((b) => [b.id, b]));
    for (const r of remoteBoards) {
      const local = this.boardToLocal(r);
      const existing = boardsById.get(local.id);
      if (!existing || existing.updatedAt <= local.updatedAt) boardsById.set(local.id, local);
    }

    await Promise.all([
      Store.setRaw(KEYS.items, [...itemsById.values()]),
      Store.setRaw(KEYS.boards, [...boardsById.values()]),
    ]);

    const now = WC.nowISO();
    await Store.saveSettings({ lastSyncAt: now });
    return {
      pushed: localDirtyItems.length + localDirtyBoards.length,
      pulled: remoteItems.length + remoteBoards.length,
      items: itemsById.size,
      boards: boardsById.size,
      at: now,
    };
  },

  async sync(settings) {
    const result = await this.mergeAll(settings);
    return result;
  },
};
