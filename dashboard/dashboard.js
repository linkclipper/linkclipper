// LinkClipper - dashboard logic: boards, filters, masonry grid, editing, sync.
const el = (id) => document.getElementById(id);
const esc = WC.escapeHtml;

const state = {
  items: [],
  boards: [],
  settings: null,
  filters: { board: '', q: '', type: '', tag: '', sort: 'new' },
};

init();

// -------------------------------------------------------------- bootstrap

async function init() {
  await Store.ensureInit();
  await refresh({ keepBoard: false });

  el('search').addEventListener('input', () => {
    state.filters.q = el('search').value.trim().toLowerCase();
    renderContent();
  });
  el('typeFilter').addEventListener('change', () => {
    state.filters.type = el('typeFilter').value;
    renderContent();
  });
  el('tagFilter').addEventListener('change', () => {
    state.filters.tag = el('tagFilter').value;
    renderContent();
  });
  el('sortSelect').addEventListener('change', () => {
    state.filters.sort = el('sortSelect').value;
    renderContent();
  });

  el('search').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.currentTarget.value = ''; state.filters.q = ''; renderContent(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      el('search').focus();
    }
  });

  el('newBoardBtn').addEventListener('click', () => openBoardModal(null));
  el('syncOpenBtn').addEventListener('click', openSyncModal);
  el('exportBtn').addEventListener('click', exportJson);
  el('importBtn').addEventListener('click', () => el('importFile').click());
  el('importFile').addEventListener('change', importJson);

  el('modalBack').addEventListener('click', (e) => {
    if (e.target === el('modalBack')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Deep link from in-page buttons / toast: dashboard.html?item=<id>
  const wantItem = new URLSearchParams(location.search).get('item');
  if (wantItem) {
    setTimeout(() => {
      const item = state.items.find((x) => x.id === wantItem);
      if (item && item.boardId) state.filters.board = item.boardId;
      el('search').value = '';
      state.filters.q = '';
      renderBoards();
      renderContent();
      openItemModal(wantItem);
    }, 250);
  }

  maybeAutoSync();
}

async function refresh(opts) {
  const [items, boards, settings, tags] = await Promise.all([
    Store.listItems(),
    Store.listBoards(),
    Store.getSettings(),
    Store.allTags(),
  ]);
  state.items = items;
  state.boards = boards;
  state.settings = settings;
  state.tags = tags;

  // A board can disappear (deleted elsewhere / sync) - fall back to All.
  if (state.filters.board && !boards.some((b) => b.id === state.filters.board)) {
    state.filters.board = '';
  }

  renderTypeOptions();
  renderTagOptions();
  renderBoards();
  renderContent();
  renderSyncStatusShort();

  if (opts && opts.markClean) await Store.saveSettings({ cleanSyncAt: state.settings.lastSyncAt });
}

// ----------------------------------------------------------------- render

function renderTypeOptions() {
  const sel = el('typeFilter');
  const keep = state.filters.type;
  sel.innerHTML = '<option value="">All types</option>' +
    Object.entries(WC.TYPES)
      .map(([k, v]) => `<option value="${k}">${v.emoji} ${esc(v.label)}</option>`)
      .join('');
  sel.value = keep;
}

function renderTagOptions() {
  const sel = el('tagFilter');
  const keep = state.filters.tag;
  const tags = state.tags || [];
  sel.innerHTML = '<option value="">All tags</option>' +
    tags.map((t) => `<option value="${esc(t.tag)}">${esc(t.tag)} (${t.count})</option>`).join('');
  sel.value = keep;
  if (sel.value !== keep) { state.filters.tag = ''; sel.value = ''; }
}

function boardById(id) {
  return state.boards.find((b) => b.id === id) || null;
}

function renderBoards() {
  const nav = el('boardNav');
  const live = state.boards.filter((b) => !b.deletedAt);
  const counts = {};
  for (const it of state.items.filter((i) => !i.deletedAt)) {
    counts[it.boardId] = (counts[it.boardId] || 0) + 1;
  }
  live.sort((a, b) => (a.id === 'inbox' ? -1 : b.id === 'inbox' ? 1 : a.createdAt < b.createdAt ? -1 : 1));

  const allCount = state.items.filter((i) => !i.deletedAt).length;
  let html = `
    <button class="board-item ${state.filters.board === '' ? 'active' : ''}" data-board="">
      <span class="board-dot" style="background:linear-gradient(135deg,#7b6cff,#b46bff)"></span>
      All items <span class="count">${allCount}</span>
    </button>`;
  html += live.map((b) => `
    <div class="board-item ${state.filters.board === b.id ? 'active' : ''}" data-board="${esc(b.id)}">
      <span class="board-dot" style="background:${esc(b.color)}"></span>
      <span class="board-name" title="${esc(b.description || b.name)}">${esc(b.name)}</span>
      <span class="count">${counts[b.id] || 0}</span>
      <button class="board-del" data-del="${esc(b.id)}" title="Delete board">&#128465;</button>
    </div>`).join('');

  const deleted = state.items.filter((i) => !i.deletedAt && !boardById(i.boardId)).length;
  if (deleted) {
    html += `
    <div class="board-item ${state.filters.board === '__none__' ? 'active' : ''}" data-board="__none__">
      <span class="board-dot" style="background:#9ca3af"></span>
      No board <span class="count">${deleted}</span>
    </div>`;
  }

  nav.innerHTML = html;

  nav.querySelectorAll('.board-item').forEach((n) => {
    n.addEventListener('click', () => {
      const v = n.getAttribute('data-board');
      state.filters.board = v === state.filters.board && v !== '' ? '' : v;
      renderBoards();
      renderContent();
    });

    // drop a card here to move it
    n.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      n.classList.add('drop-hi');
    });
    n.addEventListener('dragleave', () => n.classList.remove('drop-hi'));
    n.addEventListener('drop', async (e) => {
      e.preventDefault();
      n.classList.remove('drop-hi');
      const id = e.dataTransfer.getData('text/plain');
      const target = n.getAttribute('data-board');
      if (!id || target === '' || target === '__none__') return;
      const item = state.items.find((x) => x.id === id);
      if (!item || item.boardId === target) return;
      await Store.saveItem({ id, boardId: target });
      const b = boardById(target);
      toast('Moved to ' + (b ? b.name : '?') + ' âœ“');
      trySyncQuiet();
      refresh();
    });
  });
  nav.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-del');
      const b = boardById(id);
      if (b && b.id === 'inbox') { toast('The Inbox board can be renamed, but not deleted.'); return; }
      if (b && confirm(`Delete board "${b.name}"? Its items move to Inbox.`)) {
        Store.deleteBoard(id).then(() => refresh());
      }
    });
  });
}

function visibleItems() {
  const f = state.filters;
  let out = state.items.filter((i) => !i.deletedAt);

  if (f.board === '__none__') {
    out = out.filter((i) => !boardById(i.boardId) || boardById(i.boardId).deletedAt);
  } else if (f.board) {
    out = out.filter((i) => i.boardId === f.board);
  }
  if (f.type) out = out.filter((i) => i.type === f.type);
  if (f.tag) out = out.filter((i) => (i.tags || []).includes(f.tag));
  if (f.q) {
    const words = f.q.split(/\s+/);
    out = out.filter((i) => {
      const hay = [i.title, i.description, i.note, i.url, i.source, (i.tags || []).join(' ')]
        .join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }
  out.sort((a, b) => {
    if (f.sort === 'old') return a.updatedAt < b.updatedAt ? -1 : 1;
    if (f.sort === 'title') return String(a.title).localeCompare(String(b.title));
    return a.updatedAt > b.updatedAt ? -1 : 1;
  });
  return out;
}

// Broken thumbnail -> replace with the type-colored placeholder.
WC.fallbackThumb = function (img) {
  const wrap = img.parentElement;
  if (!wrap) return;
  const div = document.createElement('div');
  div.className = 'ph';
  div.style.cssText =
    'height:110px;background:linear-gradient(135deg,' + (img.dataset.color || '#64748B') + 'cc,' +
    (img.dataset.color || '#64748B') + '77)';
  div.textContent = img.dataset.emoji || 'âš™';
  wrap.innerHTML = '';
  wrap.appendChild(div);
};

function thumbHtml(item) {
  const tm = WC.TYPES[item.type] || WC.TYPES.page;
  if (item.thumbnail) {
    return `<img loading="lazy" src="${esc(item.thumbnail)}" alt=""
              data-color="${esc(tm.color)}" data-emoji="${tm.emoji}"
              onerror="WC.fallbackThumb(this)">`;
  }
  return `<div class="ph" style="height:${item.type === 'article' ? 72 : 110}px;background:linear-gradient(135deg,${esc(tm.color)}cc,${esc(tm.color)}77)">${tm.emoji}</div>`;
}

function cardHtml(i) {
  const tm = WC.TYPES[i.type] || WC.TYPES.page;
  const board = boardById(i.boardId);
  const date = WC.fmtDate(i.updatedAt);
  const emb = embedInfo(i);
  const tags = (i.tags || []).map((t) => `<span class="tag" data-tag="${esc(t)}">${esc(t)}</span>`).join('');
  return `
    <div class="card" data-id="${esc(i.id)}">
      <a class="thumb" href="${esc(i.url)}" target="_blank" rel="noreferrer">
        ${thumbHtml(i)}
        <span class="type-badge" style="background:${esc(tm.color)}">${tm.emoji} ${esc(tm.label)}</span>
      </a>
      <div class="card-body">
        <div class="card-title">${esc(i.title)}</div>
        <div class="card-meta">${esc(i.source)} Â· ${esc(date)}</div>
        ${i.note ? `<div class="note-snippet">&#128221; ${esc(i.note)}</div>` : ''}
        ${(i.tags || []).length ? `<div class="card-tags">${tags}</div>` : ''}
        <div class="board-line">
          <span class="board-dot" style="background:${esc(board ? board.color : '#9ca3af')}"></span>
          ${esc(board ? board.name : 'No board')}
        </div>
        <div class="card-acts">
          ${emb ? `<button class="cact pv" data-prev="${esc(i.id)}" title="Watch / read here">&#9654;</button>` : ''}
          <a class="cact op" href="${esc(i.url)}" target="_blank" rel="noreferrer" title="Open original">&#8599;</a>
          <button class="cact mv" data-act="move" title="Move to another board">&#8620;</button>
          <button class="cact del" data-act="del" title="Delete">&#128465;</button>
        </div>
      </div>
    </div>`;
}

function renderContent() {
  const items = visibleItems();
  const f = state.filters;

  const chips = [];
  if (f.board) {
    const b = boardById(f.board);
    chips.push(`<span class="active-chip" data-clear="board">${esc(b ? b.name : '?')} âœ•</span>`);
  }
  if (f.type) chips.push(`<span class="active-chip" data-clear="type">${esc(WC.TYPES[f.type].label)} âœ•</span>`);
  if (f.tag) chips.push(`<span class="active-chip" data-clear="tag">#${esc(f.tag)} âœ•</span>`);
  if (f.q) chips.push(`<span class="active-chip" data-clear="q">"${esc(f.q)}" âœ•</span>`);

  const chipRow = chips.length
    ? `<div class="count-line" id="chipRow">${chips.join('')}<span class="spacer" style="flex:1"></span></div>`
    : '';

  el('content').innerHTML =
    chipRow +
    `<div class="count-line"><span>${items.length} item${items.length === 1 ? '' : 's'}</span></div>` +
    (items.length
      ? `<div class="grid">${items.map(cardHtml).join('')}</div>`
      : emptyHtml());

  bindContent();
}

function emptyHtml() {
  const f = state.filters;
  const anyFilter = f.q || f.type || f.tag || f.board;
  if (anyFilter) {
    return `<div class="empty"><div class="big">&#128269;</div><h2>Nothing matches</h2>
      <p>Try clearing filters or a different search.</p></div>`;
  }
  return `<div class="empty"><div class="big">&#128218;</div><h2>Your collection is empty</h2>
    <p>Browse the web and click the <b>LinkClipper</b> icon to save anything worth revisiting.</p></div>`;
}

// click handlers for cards (modal + tag filter + filter chips)
function bindContent() {
  el('content').querySelectorAll('[data-clear]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.getAttribute('data-clear');
      state.filters[key] = '';
      if (key === 'q') el('search').value = '';
      else if (key === 'type') el('typeFilter').value = '';
      else if (key === 'tag') el('tagFilter').value = '';
      renderBoards();
      renderContent();
    });
  });

  el('content').querySelectorAll('.tag').forEach((tag) => {
    tag.addEventListener('click', (e) => {
      e.stopPropagation();
      state.filters.tag = tag.getAttribute('data-tag');
      el('tagFilter').value = state.filters.tag;
      renderContent();
    });
  });

  el('content').querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.thumb') || e.target.closest('.cact')) return;
      openItemModal(card.getAttribute('data-id'));
    });
  });

  // preview button on the card footer
  el('content').querySelectorAll('[data-prev]').forEach((pb) => {
    pb.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = pb.getAttribute('data-prev');
      const it = state.items.find((x) => x.id === id);
      const emb = it && embedInfo(it);
      if (emb && emb.popupOnly) openPopupPlayer(emb); // one click for YouTube
      else openItemModal(id, { preview: true });
    });
  });

  // hover action row: move / delete
  el('content').querySelectorAll('[data-act]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = b.closest('.card').getAttribute('data-id');
      if (b.getAttribute('data-act') === 'del') {
        if (confirm('Delete this item?')) {
          Store.deleteItem(id).then(() => { toast('Deleted'); trySyncQuiet(); refresh(); });
        }
      } else {
        openMoveMenu(id, b);
      }
    });
  });

  // ------------------------------------------------------------ drag & drop
  el('content').querySelectorAll('.card').forEach((card) => {
    card.draggable = true;
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.getAttribute('data-id'));
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
}

// Move via popover menu anchored to a card button.
function openMoveMenu(id, anchor) {
  closeMoveMenu();
  const item = state.items.find((x) => x.id === id);
  if (!item) return;
  const boards = state.boards.filter((b) => !b.deletedAt && b.id !== item.boardId);
  const menu = document.createElement('div');
  menu.className = 'wc-move-menu';
  menu.innerHTML = '<div class="mm-title">Move to board</div>' + (boards.length
    ? boards.map((b) => `<button class="mm-item" data-b="${esc(b.id)}">
        <span class="board-dot" style="background:${esc(b.color)}"></span>${esc(b.name)}</button>`).join('')
    : '<div class="mm-title">No other boards yet</div>');

  const r = anchor.getBoundingClientRect();
  document.body.appendChild(menu);
  menu.style.top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - 40 - menu.offsetHeight)) + 'px';
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 200)) + 'px';

  menu.querySelectorAll('[data-b]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const b = boardById(btn.getAttribute('data-b'));
      await Store.saveItem({ id, boardId: b.id });
      closeMoveMenu();
      toast('Moved to ' + b.name + ' âœ“');
      trySyncQuiet();
      refresh();
    });
  });

  const away = (e) => { if (!menu.contains(e.target)) closeMoveMenu(); };
  setTimeout(() => document.addEventListener('mousedown', away), 0);
  closeMoveMenu._away = away;
  closeMoveMenu._menu = menu;
}

function closeMoveMenu() {
  if (closeMoveMenu._menu) {
    const { _menu, _away } = closeMoveMenu;
    try { document.removeEventListener('mousedown', _away); } catch (e2) { /* noop */ }
    _menu.remove();
    closeMoveMenu._menu = null;
    closeMoveMenu._away = null;
  }
}

// --------------------------------------------------------- embed preview

// Some sites offer official embeddable players; iframing them keeps you in
// the collection without leaving the page. Unknown sites fall back to a
// "blocks embedding" note.
//
// One hard platform fact (confirmed twice in testing + vendor docs): YouTube's
// /embed endpoint refuses to run when the referrer is missing or not a normal
// web origin - extension pages and popup windows both fail with the player's
// "Error 153". YouTube's own watch pages do NOT have that check, so YouTube
// items use youtube.com/watch_popup?v=ID - a player-only page designed for
// floating windows. It plays reliably. Instagram/TikTok embeds play in-page.
function embedInfo(i) {
  try {
    const u = i.url || '';
    const d = WC.detectFromUrl(u);

    if ((i.type === 'video' || i.type === 'shorts') && d.videoId) {
      return {
        popupOnly: true,
        popup: 'https://www.youtube.com/watch_popup?v=' + d.videoId,
        short: i.type === 'shorts',
        tall: false,
      };
    }
    // Vimeo has no referrer identity check - embeds play right in the page.
    const vm = (i.type === 'video' || i.type === 'shorts') && u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vm) {
      return { srcs: ['https://player.vimeo.com/video/' + vm[1]], tall: false };
    }
    if (i.type === 'reel') {
      const m = u.match(/instagram\.com\/(reel|reels|p)\/([\w-]+)/);
      if (m) return { srcs: ['https://www.instagram.com/' + (m[1] === 'reels' ? 'reel' : m[1]) + '/' + m[2] + '/embed'], tall: true };
      const tk = u.match(/tiktok\.com\/.*\/video\/(\d+)/);
      if (tk) return { srcs: ['https://www.tiktok.com/embed/v2/' + tk[1]], tall: true };
    }
  } catch (e) { /* fallthrough */ }
  return null;
}

function previewButtonHtml(emb, i) {
  const reader = i && (i.type === 'article' || i.type === 'page');
  if (!emb && !reader) return '';
  let html = '';
  if (emb) {
    html += '<button id="mPrev" class="prev-btn" title="' +
      (emb.popupOnly
        ? 'YouTube blocks players inside extension pages (Error 153) - opens the video in a small floating window instead'
        : 'Watch / read right here') +
      '">&#9654;&nbsp; ' + (emb.popupOnly ? 'Play in floating window' : 'Load preview') + '</button>';
  }
  if (reader) {
    html += '<button id="mRead" class="prev-btn read" title="Fetch the article text and read it right here">' +
      '&#128214;&nbsp; Read here</button>';
  }
  return html;
}

function openPopupPlayer(emb) {
  const isShort = !!(emb && emb.short);
  const w = isShort ? Math.min(460, Math.floor(screen.width * 0.34)) : Math.min(800, Math.floor(screen.width * 0.4));
  const h = isShort ? Math.min(830, Math.floor(screen.height * 0.82)) : Math.min(560, Math.floor(screen.height * 0.6));
  // Park shorts/videos at the right edge so the dashboard stays visible.
  const left = Math.max(0, Math.floor(screen.width - w - 28));
  const top = Math.max(0, Math.floor((screen.height - h) / 2));
  window.open(emb.popup, 'wc_mini_player', 'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top + ',popup=yes');
}

// In-place article reading: text extracted by the service worker is shown
// over the modal hero; result is cached on the item for instant reopen.
async function openReaderInline(i, heroDefault) {
  const hero = el('mHero');
  hero.classList.add('tall');
  const bindBack = () => {
    const restored = hero.querySelector('#mPrev');
    if (restored) restored.addEventListener('click', () => {
      const emb = embedInfo(i);
      if (emb && emb.popupOnly) openPopupPlayer(emb);
      else if (emb) loadPreviewInto(hero, emb, i.url, 0);
    });
    const r = hero.querySelector('#mRead');
    if (r) r.addEventListener('click', () => openReaderInline(i, heroDefault));
  };
  const paint = (text, warn) => {
    hero.innerHTML =
      '<div class="reader"><div class="reader-head"><span class="reader-cap">' +
      (warn ? 'Reader' : 'Reader Â· readable text') +
      '</span><div class="reader-acts">' +
      '<button id="rBack" class="prev-btn" title="Back to edit fields">&#8592; Edit</button>' +
      '<a class="prev-btn" href="' + esc(i.url) + '" target="_blank" rel="noreferrer">Open original &#8599;</a>' +
      '</div></div><div class="reader-scroll"><div class="reader-text' + (warn ? ' warn' : '') + '">' +
      esc(text) + '</div></div></div>';
    hero.querySelector('#rBack').addEventListener('click', () => {
      hero.classList.remove('tall');
      hero.innerHTML = heroDefault;
      bindBack();
    });
  };
  // In-place reading needs host access for this one site - ask once per
  // site from the user's click gesture (no install-time <all_urls>).
  try {
    const op = chrome.permissions;
    if (op) {
      let origin = null;
      try { origin = new URL(i.url).origin + '/*'; } catch (e) {}
      if (origin && (await op.contains({ origins: [origin] })) === false) {
        const ok = await op.request({ origins: [origin] });
        if (!ok) {
          paint('To read pages here, allow access to this one site (asked once per site).', true);
          return;
        }
      }
    }
  } catch (e) { /* no permissions API in dev harness - continue */ }
  try {
    const cached = (i.readerText || '').trim();
    if (cached) { paint(cached, false); return; }
    paint('Fetching article textâ€¦', false);
    const res = await chrome.runtime.sendMessage({ type: 'wc:read', url: i.url });
    if (res && res.ok && res.text && res.text.trim().length > 160) {
      await Store.saveItem({ id: i.id, readerText: res.text.trim(), readerAt: WC.nowISO() });
      i.readerText = res.text.trim();
      paint(i.readerText, false);
    } else {
      paint(
        'Could not extract readable text from this page (' +
        esc(String((res && res.status) || '')) +
        '). Many sites block bots - use "Open original" instead.',
        true
      );
    }
  } catch (err) {
    paint('Reader failed: ' + String((err && err.message) || err) + ' - use "Open original" instead.', true);
  }
}

function loadPreviewInto(hero, emb, itemUrl, idx) {
  const i = Number(idx) || 0;
  const src = emb.srcs[Math.min(i, emb.srcs.length - 1)];
  const retry = i + 1 < emb.srcs.length;
  hero.innerHTML = '<iframe class="m-embed' + (emb.tall ? ' tall' : '') + '" src="' + esc(src) + '" ' +
    'allow="autoplay; encrypted-media; picture-in-picture; clipboard-write; web-share; accelerometer" ' +
    'allowfullscreen frameborder="0" referrerpolicy="strict-origin-when-cross-origin"></iframe>' +
    '<div class="prev-note">' +
      (retry ? '<button id="pRetry" title="Player refused? Try YouTube\'s other embed endpoint">&#8635; Alternate player</button>' : '') +
      (emb.popup ? '<button id="pPop" title="YouTube rejects embeds from chrome-extension pages (Error 153) - this opens YouTube\'s own player in a small floating window">&#9654; Popup player</button>' : '') +
      '<a href="' + esc(itemUrl) + '" target="_blank" rel="noreferrer">Open original &#8599;</a>' +
    '</div>';
  const r = hero.querySelector('#pRetry');
  if (r) r.addEventListener('click', () => loadPreviewInto(hero, emb, itemUrl, i + 1));
  const pp = hero.querySelector('#pPop');
  if (pp) pp.addEventListener('click', () => openPopupPlayer(emb));
}

// -------------------------------------------------------------- item modal

function openItemModal(id, opts) {
  opts = opts || {};
  const i = state.items.find((x) => x.id === id);
  if (!i) return;
  try {
    renderItemModal(i, opts);
  } catch (err) {
    // Never leave an empty glass sheet covering the page.
    console.error('LinkClipper: item modal failed', err);
    closeModal();
    toast('Could not open this item: ' + (err && err.message ? err.message : err));
  }
}

function renderItemModal(i, opts) {
  const tm = WC.TYPES[i.type] || WC.TYPES.page;
  const emb = embedInfo(i);

  const boardsHtml = state.boards.filter((b) => !b.deletedAt)
    .map((b) => `<option value="${esc(b.id)}" ${b.id === i.boardId ? 'selected' : ''}>${esc(b.name)}</option>`)
    .join('');

  el('modal').innerHTML = `
    <h2>Edit item</h2>
    <div class="hero ${emb && emb.tall ? 'tall' : ''}" id="mHero" style="background-image:url('${esc(i.thumbnail || '')}')">
      <span class="type-badge" style="background:${esc(tm.color)}">${tm.emoji} ${esc(tm.label)}</span>
      ${previewButtonHtml(emb, i)}
    </div>
    <div class="meta-line">${esc(i.source)} Â· saved ${esc(WC.fmtDate(i.createdAt))}<br>
      <a href="${esc(i.url)}" target="_blank" rel="noreferrer">${esc(i.url.length > 90 ? i.url.slice(0, 90) + 'â€¦' : i.url)}</a></div>

    <label class="field-label">Title</label>
    <input id="mTitle" class="input" value="${esc(i.title)}" />

    <label class="field-label">Board</label>
    <select id="mBoard" class="input">${boardsHtml}</select>

    <label class="field-label">Tags</label>
    <div class="chips" id="mTags"></div>
    <input id="mTagInput" class="input" list="modalTags" placeholder="Add tag + Enter" />
    <datalist id="modalTags"></datalist>

    <label class="field-label">Note</label>
    <textarea id="mNote" class="input" placeholder="Why save this?">${esc(i.note)}</textarea>

    <div class="row">
      <button id="mDelete" class="btn danger">Delete</button>
      <span class="spacer"></span>
      <button id="mCancel" class="btn">Close</button>
      <button id="mSave" class="btn primary">Save</button>
    </div>`;

  el('modalBack').classList.remove('hidden');

  const heroEl = el('mHero');
  const heroDefault = heroEl.innerHTML;
  if (emb) {
    heroEl.querySelector('#mPrev').addEventListener('click', () => {
      if (emb.popupOnly) openPopupPlayer(emb);
      else loadPreviewInto(heroEl, emb, i.url, 0);
    });
    if (opts.preview && !emb.popupOnly) loadPreviewInto(heroEl, emb, i.url, 0);
  }
  const mRead = heroEl.querySelector('#mRead');
  if (mRead) {
    mRead.addEventListener('click', () => openReaderInline(i, heroDefault));
    if (opts.preview) openReaderInline(i, heroDefault);
  }

  const local = { tags: [...(i.tags || [])] };

  const paintTags = () => {
    el('mTags').innerHTML = local.tags.map((t) => `<span class="chip">${esc(t)} <b data-t="${esc(t)}">Ã—</b></span>`).join('');
    el('mTags').querySelectorAll('[data-t]').forEach((b) => {
      b.addEventListener('click', () => {
        local.tags = local.tags.filter((x) => x !== b.getAttribute('data-t'));
        paintTags();
      });
    });
    el('modalTags').innerHTML = (state.tags || [])
      .filter((t) => !local.tags.includes(t.tag))
      .map((t) => `<option value="${esc(t.tag)}"></option>`).join('');
  };
  paintTags();

  el('mTagInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const t = el('mTagInput').value.trim().replace(/^#/, '').toLowerCase();
      if (t && !local.tags.includes(t)) local.tags.push(t);
      el('mTagInput').value = '';
      paintTags();
    }
  });

  el('mCancel').addEventListener('click', closeModal);
  el('mSave').addEventListener('click', async () => {
    await Store.saveItem({
      id: i.id,
      title: el('mTitle').value.trim() || i.title || 'Untitled',
      boardId: el('mBoard').value,
      note: el('mNote').value,
      tags: local.tags,
    });
    closeModal();
    toast('Saved âœ“');
    trySyncQuiet();
    refresh({ markClean: false });
  });

  el('mDelete').addEventListener('click', async () => {
    if (!confirm('Delete this item?')) return;
    await Store.deleteItem(i.id);
    closeModal();
    toast('Deleted');
    trySyncQuiet();
    refresh({ markClean: false });
  });
}

function closeModal() {
  el('modal').innerHTML = '';
  el('modalBack').classList.add('hidden');
}

// ------------------------------------------------------------- board modal

function openBoardModal(existing) {
  try {
    renderBoardModal(existing);
  } catch (err) {
    console.error('LinkClipper: board modal failed', err);
    closeModal();
    toast('Could not open the board editor');
  }
}

function renderBoardModal(existing) {
  const b = existing || null;
  el('modal').innerHTML = `
    <h2>${b ? 'Rename board' : 'New board'}</h2>
    <label class="field-label">Name</label>
    <input id="mName" class="input" value="${esc(b ? b.name : '')}" placeholder="e.g. Codeweb Â· motivation Â· learn rust" />
    <label class="field-label">Color</label>
    <div id="mColors" class="row" style="margin-top:4px;gap:6px"></div>
    <div class="row">
      <span class="spacer"></span>
      <button id="mCancel" class="btn">Close</button>
      <button id="mBoardSave" class="btn primary">${b ? 'Rename' : 'Create'}</button>
    </div>`;

  el('modalBack').classList.remove('hidden');
  let color = b ? b.color : WC.BOARD_COLORS[(state.boards.length + 1) % WC.BOARD_COLORS.length];

  const colors = WC.BOARD_COLORS;
  const paintColors = () => {
    el('mColors').innerHTML = colors.map((c) =>
      `<span class="board-dot color-dot" data-c="${esc(c)}" style="background:${esc(c)};width:22px;height:22px;border-radius:50%;cursor:pointer;border:${c === color ? '2px solid #fff' : '2px solid transparent'}"></span>`
    ).join('');
    el('mColors').querySelectorAll('[data-c]').forEach((d) => {
      d.addEventListener('click', () => {
        color = d.getAttribute('data-c');
        paintColors();
      });
    });
  };
  paintColors();

  el('mCancel').addEventListener('click', closeModal);
  el('mBoardSave').addEventListener('click', async () => {
    const name = el('mName').value.trim();
    if (!name) { toast('Give the board a name'); return; }
    await Store.saveBoard(b ? { id: b.id, name, color } : { name, color });
    closeModal();
    toast(b ? 'Board renamed âœ“' : 'Board created âœ“');
    trySyncQuiet();
    await refresh();
  });
  el('mName').focus();
}

// -------------------------------------------------------------------- sync

function openSyncModal() {
  try {
    renderSyncModal();
  } catch (err) {
    console.error('LinkClipper: sync modal failed', err);
    closeModal();
    toast('Could not open the sync panel');
  }
}

function renderSyncModal() {
  const s = state.settings;
  el('modal').innerHTML = `
    <h2>â˜ Cloud sync (Supabase)</h2>
    <div class="sync-hint">
      LinkClipper is local-first. Nothing leaves your browser until you connect
      a free <b>Supabase</b> project. Full steps are in the project README.
    </div>
    <label class="field-label">Project URL</label>
    <input id="sUrl" class="input" placeholder="https://xxxx.supabase.co" value="${esc(s.supabaseUrl || '')}" />
    <label class="field-label">Anon key</label>
    <input id="sKey" class="input" type="password" placeholder="eyJhbGciOiâ€¦" value="${esc(s.supabaseKey || '')}" />

    <div class="row">
      <button id="sTest" class="btn">Test connection</button>
      <button id="sSync" class="btn primary">Sync now</button>
      <span class="spacer"></span>
      <button id="sForget" class="btn danger">Forget keys</button>
      <button id="sClose" class="btn">Close</button>
    </div>
    <div id="sLog" class="sync-log">${esc(lastSyncLine())}</div>`;

  el('modalBack').classList.remove('hidden');

  const saveAndLog = async (msg) => {
    state.settings = await Store.saveSettings({
      supabaseUrl: el('sUrl').value.trim(),
      supabaseKey: el('sKey').value.trim(),
    });
    log(msg);
  };

  const log = (m) => { el('sLog').textContent = m; };
  const line = (m) => {
    const l = el('sLog');
    l.textContent = l.textContent + '\n' + m;
  };

  el('sClose').addEventListener('click', closeModal);
  el('sTest').addEventListener('click', async () => {
    try {
      await saveAndLog('Testingâ€¦');
      if (!Sync.configured(state.settings)) throw new Error('URL or key missing');
      await Sync.test(state.settings);
      log('âœ“ Connected. Supabase tables reachable at ' + Sync.normalizeUrl(state.settings.supabaseUrl));
    } catch (e) { log('âœ— ' + e.message); }
  });

  el('sSync').addEventListener('click', async () => {
    try {
      await saveAndLog('Syncingâ€¦');
      if (!Sync.configured(state.settings)) throw new Error('Configure URL + key first');
      const res = await Sync.sync(state.settings);
      log(`âœ“ Synced ${WC.fmtDate(res.at)}\npushed ${res.pushed}, pulled ${res.pulled}\n${res.items} items Â· ${res.boards} boards`);
      await refresh({ markClean: true });
    } catch (e) { log('âœ— ' + e.message); }
  });

  el('sForget').addEventListener('click', async () => {
    el('sUrl').value = '';
    el('sKey').value = '';
    await saveAndLog('Keys cleared. Staying local.');
  });
}

function lastSyncLine() {
  const s = state.settings;
  if (!Sync.configured(s)) return 'Not configured - running local-only.';
  return 'Last sync: ' + (s.lastSyncAt ? WC.fmtDate(s.lastSyncAt) : 'never');
}

function renderSyncStatusShort() {
  const s = state.settings;
  el('syncStatusShort').textContent = Sync.configured(s)
    ? 'â˜ ' + (s.lastSyncAt ? WC.fmtDate(s.lastSyncAt) : 'not synced yet')
    : 'local-only';
}

function trySyncQuiet() {
  Store.getSettings().then(async (s) => {
    if (!Sync.configured(s)) return;
    try {
      await Sync.sync(s);
      renderSyncStatusShort();
    } catch (e) { /* silent */ }
  });
}

async function maybeAutoSync() {
  const s = state.settings;
  if (!Sync.configured(s)) return;
  const last = s.lastSyncAt ? Date.parse(s.lastSyncAt) : 0;
  if (Date.now() - last > 10 * 60 * 1000) trySyncQuiet();
}

// ------------------------------------------------------------ import/export

async function exportJson() {
  const [items, boards] = [await Store.listItems(), await Store.listBoards()];
  const data = {
    app: 'LinkClipper',
    version: 1,
    exportedAt: WC.nowISO(),
    boards,
    items,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'LinkClipper-export-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Exported JSON âœ“');
}

async function importJson(e) {
  const file = e.currentTarget.files && e.currentTarget.files[0];
  e.currentTarget.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (data.app !== 'LinkClipper' && data.app !== 'WebCollector') {
      throw new Error('Not a LinkClipper export');
    }
    let iCount = 0;
    for (const b of data.boards || []) {
      const mine = (await Store.listBoards()).find((x) => x.id === b.id);
      if (!mine || (mine.updatedAt || '') < (b.updatedAt || '')) {
        await Store.saveBoard(b);
        iCount++;
      }
    }
    for (const it of data.items || []) {
      const mine = (await Store.listItems()).find((x) => x.id === it.id);
      if (!mine || (mine.updatedAt || '') < (it.updatedAt || '')) {
        await Store.saveItem(it);
        iCount++;
      }
    }
    toast('Imported ' + iCount + ' records âœ“');
    await refresh();
  } catch (err) {
    toast('Import failed: ' + err.message);
  }
}

// ------------------------------------------------------------------ toast

let toastTimer = null;
function toast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}
