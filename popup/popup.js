// LinkClipper - popup logic.
// Flow: query active tab -> inject metadata extractor -> classify type ->
// user picks board/tags/note -> save to local store (-> optional cloud sync).

const el = (id) => document.getElementById(id);

const state = {
  tab: null,
  meta: null,      // {title, description, image, canonical, selection, paragraphCount, ogType, ogImage}
  item: null,      // draft item
  existing: null,  // previously saved item for the same URL, if any
  boards: [],
  tags: [],
  newBoardColor: WC.BOARD_COLORS[0],
};

init();

// -------------------------------------------------------------- bootstrap

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.tab = tab;

  const backpage = isRestricted(tab && tab.url);
  if (backpage) {
    show('blockedView');
    return;
  }

  await Store.ensureInit();
  state.meta = await extractMeta(tab);
  buildDraft();

  state.boards = await Store.liveBoards();
  state.tags = (await Store.allTags()).map((t) => t.tag);
  renderBoards();
  renderTags();
  renderKnownTags();
  renderPreview();
  renderDuplicateState();

  show('saveView');
  el('tagInput').focus({ preventScroll: true });
}

function isRestricted(url) {
  return !url || /^(chrome|edge|about|extension|view-source|devtools|chrome\-extension):/i.test(url);
}

function show(id) {
  ['saveView', 'doneView', 'blockedView'].forEach((v) => el(v).classList.toggle('hidden', v !== id));
}

// -------------------------------------------------- content extraction

// Runs inside the page. Keep it fully self-contained - no closures.
function pageExtractor() {
  const meta = (n) => {
    const el = document.querySelector(`meta[property="${n}"], meta[name="${n}"]`);
    return el ? el.getAttribute('content') || '' : '';
  };
  let canonical = '';
  const link = document.querySelector('link[rel="canonical"]');
  if (link && link.href && link.href.indexOf('http') === 0) canonical = link.href;

  let image = meta('og:image') || meta('twitter:image') || meta('twitter:image:src');
  if (!image) {
    const img = document.querySelector('article img, main img, img[class*="thumb" i], img[class*="hero" i]');
    if (img && (img.currentSrc || img.src) && (img.currentSrc || img.src).indexOf('http') === 0) {
      image = img.currentSrc || img.src;
    }
  }

  return {
    title: meta('og:title') || meta('twitter:title') || document.title || '',
    description: meta('og:description') || meta('description') || meta('twitter:description') || '',
    image,
    canonical,
    selection: (window.getSelection() ? String(window.getSelection()) : '').trim(),
    paragraphCount: document.querySelectorAll('article p, main p, p').length,
    ogType: (meta('og:type') || '').toLowerCase(),
    isArticleTag: !!document.querySelector('article, [itemprop="articleBody"]'),
  };
}

async function extractMeta(tab) {
  try {
    const frames = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pageExtractor,
    });
    if (frames && frames.length && frames[0].result) return frames[0].result;
  } catch (e) {
    // Restricted frames, PDF viewer, discarding tabs, etc.
  }
  return {
    title: tab.title || '',
    description: '',
    image: '',
    canonical: '',
    selection: '',
    paragraphCount: 0,
    ogType: '',
    isArticleTag: false,
  };
}

// ------------------------------------------------------------- draft item

function buildDraft() {
  let url = state.tab.url;
  let title = state.meta.title || state.tab.title || 'Untitled';
  try { new URL(url); } catch (e) { url = ''; }

  const type = WC.classify(url, state.meta);
  const thumbnail = state.meta.image || WC.guessThumbnail(url) || '';

  // "Reel" detection (instagram/tiktok) upgrades generic "video".
  state.item = {
    type,
    title,
    url,
    canonical: state.meta.canonical || '',
    thumbnail,
    description: state.meta.description || '',
    source: WC.domain(url),
    selection: state.meta.selection || '',
    note: '',
    boardId: null, // resolved after boards load
    tags: [],
  };
}

// ----------------------------------------------------------------- render

function renderPreview() {
  const link = el('thumbLink');
  link.href = state.item.url || '#';
  if (state.item.thumbnail) {
    const img = document.createElement('img');
    img.src = state.item.thumbnail;
    img.onload = () => {}; // <img> just paints; on error we fall back to gradient
    img.onerror = () => { link.innerHTML = ''; };
    link.appendChild(img);
  }
  const tm = WC.TYPES[state.item.type];
  const badge = el('badgeType');
  badge.textContent = tm.emoji + ' ' + tm.label;
  badge.style.background = tm.color;

  el('titleInput').textContent = state.item.title;
  el('metaLine').textContent = [state.item.source, state.item.selection ? '"…' + state.item.selection.slice(0, 80) + '…"' : '']
    .filter(Boolean)
    .join(' · ');
  el('titleInput').addEventListener('input', () => { state.item.title = el('titleInput').textContent.trim() || 'Untitled'; });
}

function renderBoards() {
  const sel = el('boardSelect');
  sel.innerHTML = '';
  state.boards.forEach((b) => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.name;
    sel.appendChild(opt);
  });
  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = '＋ New board…';
  sel.appendChild(newOpt);

  const settings = Store.getSettings().then((s) => {
    const last = state.boards.find((b) => b.id === s.lastBoardId);
    state.item.boardId = last ? last.id : (state.boards[0] && state.boards[0].id) || 'inbox';
    sel.value = state.item.boardId;
  });
}

el('boardSelect').addEventListener('change', () => {
  const v = el('boardSelect').value;
  if (v === '__new__') {
    el('newBoardRow').classList.remove('hidden');
    el('newBoardName').focus();
    el('newBoardName').value = '';
    // keep the select on a real board visually until they type a name
  } else {
    el('newBoardRow').classList.add('hidden');
    state.item.boardId = v;
  }
});

// color dots for a new board
(function () {
  const row = el('newBoardColors');
  WC.BOARD_COLORS.forEach((c, i) => {
    const dot = document.createElement('span');
    dot.className = 'color-dot' + (i === 0 ? ' selected' : '');
    dot.style.background = c;
    dot.title = c;
    dot.addEventListener('click', () => {
      state.newBoardColor = c;
      row.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('selected'));
      dot.classList.add('selected');
    });
    row.appendChild(dot);
  });
})();

el('newBoardName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.preventDefault();
});

// ------------------------------------------------------------------- tags

function renderTags() {
  const wrap = el('tagChips');
  wrap.innerHTML = '';
  state.item.tags.forEach((t, i) => {
    const c = document.createElement('span');
    c.className = 'chip';
    c.textContent = t + ' ';
    const x = document.createElement('b');
    x.textContent = '×';
    x.title = 'Remove tag';
    x.addEventListener('click', () => {
      state.item.tags.splice(i, 1);
      renderTags();
    });
    c.appendChild(x);
    wrap.appendChild(c);
  });
}

function renderKnownTags() {
  const dl = el('knownTags');
  dl.innerHTML = '';
  state.tags.filter((t) => !state.item.tags.includes(t)).forEach((t) => {
    const o = document.createElement('option');
    o.value = t;
    dl.appendChild(o);
  });
}

function addTag(raw) {
  const t = String(raw || '').trim().replace(/^#/, '').toLowerCase();
  if (!t || state.item.tags.includes(t)) return;
  state.item.tags.push(t);
  renderTags();
  renderKnownTags();
}

el('tagInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addTag(el('tagInput').value);
    el('tagInput').value = '';
  }
});
el('tagInput').addEventListener('blur', () => {
  if (el('tagInput').value.trim()) {
    addTag(el('tagInput').value);
    el('tagInput').value = '';
  }
});

// -------------------------------------------------------------- duplicate

function renderDuplicateState() {
  Store.findByUrl(state.item.url).then((found) => {
    state.existing = found;
    if (found) {
      const notice = el('duplicateNotice');
      notice.classList.remove('hidden');
      const board = state.boards.find((b) => b.id === found.boardId);
      notice.innerHTML = '';
      notice.append('Already saved in ' + (board ? board.name : '?') + ' · updating it instead.');
      el('saveBtn').textContent = 'Update saved item';
    }
  });
}

// -------------------------------------------------------------- save flow

async function createNewBoard(name) {
  const b = await Store.saveBoard({ name: name.trim() || 'Untitled board', color: state.newBoardColor });
  state.boards = await Store.liveBoards();
  return b;
}

async function save() {
  const btn = el('saveBtn');
  btn.disabled = true;
  btn.style.filter = 'grayscale(0.4)';

  // A "new board" may have been typed without pressing anywhere else.
  if (el('boardSelect').value === '__new__' || el('newBoardRow').classList.contains('hidden') === false) {
    const name = el('newBoardName').value.trim();
    if (name) {
      const b = await createNewBoard(name);
      state.item.boardId = b.id;
    }
  }

  const patch = Object.assign({}, state.item, { title: state.item.title });
  let saved;
  if (state.existing) {
    // Re-saving an existing URL updates it in place (keeps createdAt).
    saved = await Store.saveItem(Object.assign({}, state.existing, {
      title: patch.title,
      note: patch.note,
      tags: patch.tags,
      boardId: patch.boardId,
      thumbnail: patch.thumbnail || state.existing.thumbnail,
      type: patch.type,
    }));
  } else {
    saved = await Store.saveItem(patch);
  }
  await Store.saveSettings({ lastBoardId: saved.boardId });
  trySyncQuietly();

  const board = state.boards.find((b) => b.id === saved.boardId);
  el('doneText').textContent = 'Saved ✓ ' + (board ? board.name : '');
  show('doneView');
}

// Fire-and-forget sync so the popup stays instant.
function trySyncQuietly() {
  Store.getSettings().then(async (s) => {
    if (!Sync.configured(s)) return;
    try {
      await chrome.runtime.sendMessage({ type: 'wc:sync' });
    } catch (e) { /* worker may be asleep; dashboard syncs too */ }
  });
}

el('noteInput').addEventListener('input', () => { state.item.note = el('noteInput').value; });
el('saveBtn').addEventListener('click', save);
el('viewBtn').addEventListener('click', openDashboard);
el('openDashboard').addEventListener('click', (e) => { e.preventDefault(); openDashboard(); });

el('editBtn').addEventListener('click', () => {
  show('saveView');
  el('saveBtn').disabled = false;
  el('saveBtn').style.filter = '';
  el('saveBtn').textContent = state.existing ? 'Update saved item' : 'Save to collection';
});

el('anotherBtn').addEventListener('click', async () => {
  // Duplicate explicitly: keep copy, save as a fresh item.
  state.existing = null;
  el('duplicateNotice').classList.add('hidden');
  el('saveBtn').textContent = 'Save to collection';
  show('saveView');
  el('saveBtn').disabled = false;
  el('saveBtn').style.filter = '';
});

function openDashboard() {
  chrome.tabs.create({ url: 'dashboard/dashboard.html' });
  window.close();
}
