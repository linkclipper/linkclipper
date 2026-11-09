// LinkClipper - popup logic.
// Flow: query active tab -> inject metadata extractor -> classify type ->
// user picks board/tags/note -> save to local store (-> optional cloud sync).

const el = (id) => document.getElementById(id);

const state = {
  tab: null,
  meta: null,      // {title, description, image, canonical, selection, paragraphCount, ogType, ogImage}
  item: null,      // draft item
  existing: null,  // previously saved item for the same URL, if any
  forceNew: false, // user explicitly chose another copy
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
  await renderDuplicateState();
  await renderBoards();
  renderTags();
  renderKnownTags();
  renderPreview();

  show('saveView');
  el('saveBtn').disabled = false;
  el('boardSelect').focus({ preventScroll: true });
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

  const isXPost = /^(?:www\.)?(?:x|twitter)\.com$/i.test(location.hostname) && /\/status\/\d+/.test(location.pathname);
  let image = '';
  if (isXPost) {
    const id = location.pathname.match(/\/status\/(\d+)/)[1];
    const articles = [...document.querySelectorAll('article')];
    const post = articles.find((a) => [...a.querySelectorAll('a[href*="/status/"]')]
      .some((link) => link.getAttribute('href').includes('/status/' + id))) ||
      (articles.length === 1 ? articles[0] : null);
    const media = post && [...post.querySelectorAll('img')]
      .find((img) => /\/media\//.test(img.currentSrc || img.src || '') &&
        /(^|\.)pbs\.twimg\.com$/i.test((() => { try { return new URL(img.currentSrc || img.src).hostname; } catch (e) { return ''; } })()));
    image = (media && (media.currentSrc || media.src)) ||
      (post && post.querySelector('video[poster]') || {}).poster || '';
    if (!image) {
      const og = meta('og:image') || meta('twitter:image') || meta('twitter:image:src');
      if (/^https:\/\/pbs\.twimg\.com\/media\//i.test(og)) image = og;
    }
  } else {
    image = meta('og:image') || meta('twitter:image') || meta('twitter:image:src');
  }
  if (!image && !isXPost) {
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
  const source = WC.sourceIdentity(state.item.url);
  const fallback = () => {
    link.innerHTML = '';
    if (source) link.innerHTML = WC.sourceBadge(state.item.url, 'source-preview-mark');
  };
  fallback();
  if (state.item.thumbnail) {
    const img = document.createElement('img');
    img.onerror = fallback;
    link.prepend(img);
    img.src = state.item.thumbnail;
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

async function renderBoards() {
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

  const settings = await Store.getSettings();
  const last = state.boards.find((b) => b.id === settings.lastBoardId);
  const savedBoard = state.existing && state.boards.find((b) => b.id === state.existing.boardId);
  state.item.boardId = savedBoard ? savedBoard.id : (last ? last.id : (state.boards[0] && state.boards[0].id) || 'inbox');
  sel.value = state.item.boardId;
  el('newBoardRow').classList.add('hidden');
  el('newBoardName').setCustomValidity('');
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
el('newBoardName').addEventListener('input', () => el('newBoardName').setCustomValidity(''));

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

async function renderDuplicateState() {
  const found = await Store.findByUrl(state.item.url, state.item.canonical);
  state.existing = found;
  const notice = el('duplicateNotice');
  notice.classList.toggle('hidden', !found);
  el('duplicateNewBtn').classList.toggle('hidden', !found);
  if (!found) return;

  const board = state.boards.find((b) => b.id === found.boardId);
  notice.textContent = 'Already saved in ' + (board ? board.name : 'a board') + '. Update it or save another copy.';
  state.item.title = found.title || state.item.title;
  state.item.note = found.note || '';
  state.item.tags = [...(found.tags || [])];
  state.item.thumbnail = found.thumbnail || state.item.thumbnail;
  el('noteInput').value = state.item.note;
  el('saveBtn').textContent = 'Update saved item';
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

  // Another surface may have saved this page since the popup opened.
  if (!state.existing && !state.forceNew) {
    const found = await Store.findByUrl(state.item.url, state.item.canonical);
    if (found) {
      await renderDuplicateState();
      await renderBoards();
      renderTags();
      renderPreview();
      btn.disabled = false;
      btn.style.filter = '';
      return;
    }
  }

  // A "new board" may have been typed without pressing anywhere else.
  if (el('boardSelect').value === '__new__' || el('newBoardRow').classList.contains('hidden') === false) {
    const name = el('newBoardName').value.trim();
    if (!name) {
      const input = el('newBoardName');
      input.setCustomValidity('Give your new board a name');
      input.reportValidity();
      input.focus();
      btn.disabled = false;
      btn.style.filter = '';
      return;
    }
    const b = await createNewBoard(name);
    state.item.boardId = b.id;
  }

  const patch = Object.assign({}, state.item, { title: state.item.title });
  let saved;
  if (state.existing && !state.forceNew) {
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
  el('doneText').textContent = (state.existing && !state.forceNew ? 'Updated ✓ ' : 'Saved ✓ ') + (board ? board.name : '');
  state.existing = saved;
  state.forceNew = false;
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
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
  if (!state.item || el('saveView').classList.contains('hidden') || el('saveBtn').disabled) return;
  e.preventDefault();
  save(); // Same explicit save path as clicking the button; never saves on popup open.
});
el('duplicateNewBtn').addEventListener('click', () => {
  state.forceNew = true;
  el('saveBtn').textContent = 'Save another copy';
  el('duplicateNewBtn').classList.add('hidden');
  el('duplicateNotice').textContent = 'This will create a separate card for the same page.';
});
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
  state.forceNew = true;
  el('duplicateNotice').classList.remove('hidden');
  el('duplicateNotice').textContent = 'This will create a separate card for the same page.';
  el('duplicateNewBtn').classList.add('hidden');
  el('saveBtn').textContent = 'Save another copy';
  show('saveView');
  el('saveBtn').disabled = false;
  el('saveBtn').style.filter = '';
});

function openDashboard() {
  chrome.tabs.create({ url: 'dashboard/dashboard.html' });
  window.close();
}
