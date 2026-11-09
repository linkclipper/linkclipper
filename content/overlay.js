// LinkClipper - in-page saving for social sites.
// Injects LinkClipper link-mark buttons into YouTube (watch bar, Shorts rail, list
// thumbnails), Instagram action stacks, X (Twitter) post rows, Reddit post
// rows and TikTok. Clicking opens an in-page quick-save dialog (board picker,
// tags, note) exactly like the toolbar popup.
//
// DOM selectors on these sites change often; each adapter lists several
// candidates so aging selectors degrade to the floating button instead of
// vanishing.

(() => {
  if (window.__WC_OVERLAY__) return;
  window.__WC_OVERLAY__ = true;

  const HOST = location.hostname.replace(/^www\./, '');
  const REG = []; // registered page buttons: { el, getPayload }

  const O = {
    loaded: false,
    byUrl: new Map(), // normalized url -> saved item
    boardId: 'inbox',
    boardName: 'Inbox',
  };

  // ------------------------------------------------------------ cache

  async function loadAll() {
    try {
      await Store.ensureInit();
      const items = await Store.listItems();
      O.byUrl = new Map();
      for (const it of items) {
        if (!it.deletedAt) O.byUrl.set(WC.normalizeUrl(it.url), it);
      }
      const s = await Store.getSettings();
      const board = await Store.getBoard(s.lastBoardId || 'inbox');
      O.boardId = board ? board.id : 'inbox';
      O.boardName = board ? (board.id === 'inbox' ? 'Inbox' : board.name) : 'Inbox';
      O.loaded = true;
      refreshStates();
    } catch (e) {
      // Extension was reloaded by the user; APIs are stale until page reload.
    }
  }

  chrome.storage.onChanged.addListener(() => { loadAll(); });

  // -------------------------------------------------------- link-mark svg

  let gid = 0;
  function logoSvg(px) {
    const id = 'wcg' + (++gid);
    const s = px || 14;
    return '<svg viewBox="0 0 64 64" width="' + s + '" height="' + s + '" aria-hidden="true">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#7b6cff"/><stop offset="1" stop-color="#b46bff"/>' +
      '</linearGradient></defs>' +
      '<rect width="64" height="64" rx="15" fill="url(#' + id + ')"/>' +
      '<g fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M25 35 C29 39 35 39 39 35 L48 26 C54 20 54 13 48 8 C43 3 36 4 31 9 L26 14"/>' +
      '<path d="M39 29 C35 25 29 25 25 29 L16 38 C10 44 10 51 16 56 C21 61 28 60 33 55 L38 50"/>' +
      '</g></svg>';
  }

  // -------------------------------------------------------- toast

  let toastEl = null;
  let toastTimer = null;
  function toast(msg, actions) {
    try {
      if (toastEl) toastEl.remove();
      toastEl = document.createElement('div');
      toastEl.className = 'wc-toast';
      const m = document.createElement('span');
      m.className = 'wc-msg';
      m.textContent = msg;
      toastEl.appendChild(m);
      (actions || []).forEach((a) => {
        const b = document.createElement('button');
        b.textContent = a.label;
        b.addEventListener('click', () => { a.fn(); hideToast(); });
        toastEl.appendChild(b);
      });
      document.body.appendChild(toastEl);
      clearTimeout(toastTimer);
      toastTimer = setTimeout(hideToast, 4200);
    } catch (e) { /* body may not exist yet */ }
  }
  function hideToast() { if (toastEl) { toastEl.remove(); toastEl = null; } }

  function openEdit(id) {
    try {
      window.open(chrome.runtime.getURL('dashboard/dashboard.html?item=' + encodeURIComponent(id)),
        '_blank');
    } catch (e) {
      toast('LinkClipper was updated - reload this page');
    }
  }

  function pingSync() {
    try {
      const pr = chrome.runtime.sendMessage({ type: 'wc:sync' });
      if (pr && pr.catch) pr.catch(() => {});
    } catch (e) { /* worker asleep or context reloading */ }
  }

  // =========================================================== dialog

  let dlgOpen = null;

  function norm(p) {
    const url = p.url || location.href;
    return {
      url,
      type: p.type || WC.classify(url, {}),
      title: (p.title || '').trim() || 'Untitled',
      thumbnail: p.thumbnail || '',
      description: p.description || '',
    };
  }

  async function openDialog(getPayload) {
    let p;
    try { p = norm(getPayload()); } catch (e) { toast('Could not read this item'); return; }
    if (dlgOpen) { closeDialog(); }

    let boards, tags, settings;
    try {
      [boards, settings] = await Promise.all([Store.liveBoards(), Store.getSettings()]);
      tags = (await Store.allTags()).map((t) => t.tag);
    } catch (e) {
      toast('LinkClipper was updated - reload this page to save here');
      return;
    }

    const key = WC.normalizeUrl(p.url);
    const existing = await Store.findByUrl(p.url);

    const st = {
      payload: p,
      existing,
      forceNew: false,
      key,
      tags: existing ? [...(existing.tags || [])] : [],
      boardId: existing ? existing.boardId : (O.boardId && boards.some((b) => b.id === O.boardId) ? O.boardId : (boards[0] || { id: 'inbox' }).id),
      newBoardColor: WC.BOARD_COLORS[(boards.length + 1) % WC.BOARD_COLORS.length],
      colorChips: [],
    };

    buildDialog(st, boards, tags);
  }

  function buildDialog(st, boards, tags) {
    const back = document.createElement('div');
    back.className = 'wc-back';
    const card = document.createElement('div');
    card.className = 'wc-card';
    back.appendChild(card);

    // Keydown first so page shortcuts (YouTube 'k', 'm' etc) never fire while
    // the dialog is focused; ESC inside closes.
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeDialog(); }
      e.stopPropagation();
    });
    card.addEventListener('keyup', (e) => e.stopPropagation());

    const tm = WC.TYPES[st.payload.type] || WC.TYPES.page;

    card.innerHTML =
      '<header class="wc-head">' +
        '<span class="wc-badge" style="background:' + tm.color + '">' + tm.emoji + ' ' + tm.label + '</span>' +
        '<button type="button" class="wc-x" title="Close">&#215;</button>' +
      '</header>' +
      '<div class="wc-preview"></div>' +
      '<div class="wc-tedit" contenteditable="plaintext-only" spellcheck="false"></div>' +
      '<div class="wc-meta">' + WC.escapeHtml(WC.domain(st.payload.url)) +
        (st.existing ? ' &#183; updating saved item' : '') + '</div>' +
      '<label class="wc-flab">Board</label>' +
      '<div class="wc-boardrow"><select class="wc-inp wc-bselect"></select></div>' +
      '<div class="wc-newrow hidden"><input class="wc-inp wc-newname" placeholder="New board name&hellip;" />' +
        '<div class="wc-dots"></div></div>' +
      '<label class="wc-flab">Tags</label>' +
      '<div class="wc-chips"></div>' +
      '<input class="wc-inp wc-tagin" list="wc-dl" placeholder="Add a tag, hit Enter" />' +
      '<datalist id="wc-dl"></datalist>' +
      '<label class="wc-flab">Note <span class="wc-opt">(optional)</span></label>' +
      '<textarea class="wc-inp wc-note" rows="2" placeholder="Why do you want to come back to this?"></textarea>' +
      '<footer class="wc-foot">' +
        '<button type="button" class="wc-act wc-openDash">Dashboard &#8599;</button>' +
        '<span class="wc-sp"></span>' +
        '<button type="button" class="wc-act wc-cancel">Cancel</button>' +
        (st.existing ? '<button type="button" class="wc-act wc-copy">Save another copy</button>' : '') +
        '<button type="button" class="wc-act wc-savebtn">' + (st.existing ? 'Update' : 'Save') + '</button>' +
      '</footer>';

    // fill dynamic bits
    const title = card.querySelector('.wc-tedit');
    title.textContent = st.existing ? st.existing.title : st.payload.title;
    const preview = card.querySelector('.wc-preview');
    preview.innerHTML = WC.sourceBadge(st.payload.url, 'wc-source-mark');
    if (st.payload.thumbnail) {
      const media = new Image();
      media.alt = '';
      media.onload = () => { preview.prepend(media); };
      media.src = st.payload.thumbnail;
    }

    const sel = card.querySelector('.wc-bselect');
    boards.forEach((b) => {
      const o = document.createElement('option');
      o.value = b.id;
      o.textContent = b.name;
      sel.appendChild(o);
    });
    const newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = '＋ New board…';
    sel.appendChild(newOpt);
    sel.value = st.boardId;

    const dotsRow = card.querySelector('.wc-dots');
    WC.BOARD_COLORS.forEach((c) => {
      const d = document.createElement('span');
      d.className = 'wc-dot' + (c === st.newBoardColor ? ' on' : '');
      d.style.background = c;
      d.addEventListener('click', () => {
        st.newBoardColor = c;
        dotsRow.querySelectorAll('.wc-dot').forEach((x) => x.classList.remove('on'));
        d.classList.add('on');
      });
      dotsRow.appendChild(d);
    });
    st.colorChips = [...dotsRow.children];

    const chipsRow = card.querySelector('.wc-chips');
    function paintTags() {
      chipsRow.innerHTML = '';
      st.tags.forEach((t, i) => {
        const c = document.createElement('span');
        c.className = 'wc-chip-tag';
        c.textContent = t + ' ';
        const x = document.createElement('b');
        x.textContent = '×';
        x.addEventListener('click', () => { st.tags.splice(i, 1); paintTags(); fillDl(); });
        c.appendChild(x);
        chipsRow.appendChild(c);
      });
    }
    function fillDl() {
      card.querySelector('#wc-dl').innerHTML = tags
        .filter((t) => st.tags.indexOf(t) === -1)
        .map((t) => '<option value="' + WC.escapeHtml(t) + '"></option>').join('');
    }
    paintTags(); fillDl();

    const tagIn = card.querySelector('.wc-tagin');
    tagIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const t = tagIn.value.trim().replace(/^#/, '').toLowerCase();
        if (t && st.tags.indexOf(t) === -1) st.tags.push(t);
        tagIn.value = '';
        paintTags(); fillDl();
      }
    });
    tagIn.addEventListener('blur', () => {
      const t = tagIn.value.trim();
      if (t) {
        const n = t.replace(/^#/, '').toLowerCase();
        if (n && st.tags.indexOf(n) === -1) st.tags.push(n);
        tagIn.value = '';
        paintTags(); fillDl();
      }
    });

    const note = card.querySelector('.wc-note');
    note.value = st.existing ? st.existing.note : '';

    sel.addEventListener('change', () => {
      const v = sel.value;
      card.querySelector('.wc-newrow').classList.toggle('hidden', v !== '__new__');
      if (v !== '__new__') st.boardId = v;
    });

    card.querySelector('.wc-x').addEventListener('click', closeDialog);
    card.querySelector('.wc-cancel').addEventListener('click', closeDialog);
    back.addEventListener('click', (e) => { if (e.target === back) closeDialog(); });
    card.querySelector('.wc-openDash').addEventListener('click', () => {
      closeDialog();
      try {
        window.open(st.existing
          ? chrome.runtime.getURL('dashboard/dashboard.html?item=' + encodeURIComponent(st.existing.id))
          : chrome.runtime.getURL('dashboard/dashboard.html'), '_blank');
      } catch (e) { toast('LinkClipper was updated - reload this page'); }
    });
    card.querySelector('.wc-savebtn').addEventListener('click', () => saveDialog(st, card));
    if (st.existing) card.querySelector('.wc-copy').addEventListener('click', () => {
      st.forceNew = true;
      card.querySelector('.wc-copy').remove();
      card.querySelector('.wc-savebtn').textContent = 'Save copy';
      card.querySelector('.wc-meta').textContent = 'Saving another copy of this item';
    });

    document.body.appendChild(back);
    dlgOpen = { back };
    setTimeout(() => title.focus(), 30);
  }

  async function saveDialog(st, card) {
    const saveBtn = card.querySelector('.wc-savebtn');
    saveBtn.disabled = true;
    try {
      if (!st.existing && !st.forceNew) {
        const found = await Store.findByUrl(st.payload.url);
        if (found) {
          closeDialog();
          toast('Already saved — review the existing item');
          await openDialog(() => st.payload);
          return;
        }
      }
      const title = (card.querySelector('.wc-tedit').textContent || '').trim() || 'Untitled';
      const note = card.querySelector('.wc-note').value.trim();
      let boardId = st.boardId;
      if (selIsNew(card)) {
        const name = card.querySelector('.wc-newname').value.trim();
        if (name) {
          const b = await Store.saveBoard({ name, color: st.newBoardColor });
          boardId = b.id;
        }
      }

      let item;
      if (st.existing && !st.forceNew) {
        item = await Store.saveItem({
          id: st.existing.id,
          title,
          boardId,
          tags: st.tags,
          note,
          thumbnail: st.payload.thumbnail || st.existing.thumbnail,
        });
      } else {
        item = await Store.saveItem({
          type: st.payload.type,
          title,
          url: st.payload.url,
          canonical: '',
          thumbnail: st.payload.thumbnail,
          description: st.payload.description,
          source: WC.domain(st.payload.url),
          selection: '',
          note,
          boardId,
          tags: st.tags,
        });
      }

      O.byUrl.set(st.key, item);
      const b = await Store.getBoard(item.boardId);
      O.boardId = item.boardId;
      O.boardName = b ? (b.id === 'inbox' ? 'Inbox' : b.name) : 'Inbox';
      await Store.saveSettings({ lastBoardId: item.boardId });
      pingSync();
      closeDialog();
      refreshStates();
       toast((st.existing && !st.forceNew ? 'Updated in ' : 'Saved to ') + O.boardName + ' \u2713', [{ label: 'Edit', fn: () => openEdit(item.id) }]);
    } catch (e) {
      toast('LinkClipper was updated - reload this page');
      saveBtn.disabled = false;
    }
  }

  function selIsNew(card) {
    return card.querySelector('.wc-bselect').value === '__new__' &&
      card.querySelector('.wc-newname').value.trim() !== '';
  }

  function closeDialog() {
    if (dlgOpen) { try { dlgOpen.back.remove(); } catch (e) { /* page navigated */ } dlgOpen = null; }
  }

  // ------------------------------------------------------ page buttons

  function refreshStates() {
    REG.forEach((r) => {
      try {
        if (!r.el.isConnected) return;
        const p = norm(r.getPayload());
        const saved = O.byUrl.get(WC.normalizeUrl(p.url));
        const was = r.el.classList.contains('saved');
        if (saved && !was) {
          r.el.classList.add('saved');
          r.el.title = 'Saved in LinkClipper - click to edit';
          r.el.setAttribute('aria-label', 'Saved in LinkClipper - click to edit');
          const lb = r.el.querySelector('.wc-label');
          if (lb) lb.textContent = 'Saved';
        } else if (!saved && was) {
          r.el.classList.remove('saved');
          r.el.title = 'Save to LinkClipper';
          r.el.setAttribute('aria-label', 'Save to LinkClipper');
          const lb = r.el.querySelector('.wc-label');
          if (lb) lb.textContent = 'Save';
        }
      } catch (e) { /* stale payload - ignore */ }
    });
    for (let i = REG.length - 1; i >= 0; i--) {
      if (!REG[i].el.isConnected) REG.splice(i, 1);
    }
  }

  function makeButton(kind, getPayload) {
    const btn = document.createElement('button');
    btn.setAttribute('type', 'button');
    btn.className = 'wc-btn wc-' + kind;
    btn.title = 'Save to LinkClipper';
    btn.setAttribute('aria-label', 'Save to LinkClipper');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openDialog(getPayload);
    });
    if (kind === 'chip' || kind === 'rail' || kind === 'reddit') {
      btn.innerHTML = '<span class="wc-logo">' + logoSvg(kind === 'chip' ? 18 : 20) + '</span>' +
        '<span class="wc-label">Save</span>';
    } else if (kind === 'float') {
      btn.innerHTML = '<span class="wc-logo">' + logoSvg(24) + '</span>';
    } else { // row (icon-only) and thumb (badge)
      btn.innerHTML = '<span class="wc-logo">' + logoSvg(kind === 'row' ? 18 : 14) + '</span>';
    }
    return btn;
  }

  function injectTargets(targets) {
    targets.forEach((t) => {
      try {
        if (t.kind === 'float' && document.querySelector('.wc-float')) return;
        if (t.parent && t.parent.querySelector('.wc-btn')) return;
        const btn = makeButton(t.kind, t.payload);
        if (!t.parent) return;
        if (t.kind === 'reddit' && t.root && !t.root.querySelector('style[data-wc-reddit]')) {
          const style = document.createElement('style');
          style.setAttribute('data-wc-reddit', '');
          style.textContent = '.wc-reddit{display:inline-flex;align-items:center;justify-content:center;gap:6px;' +
            'height:32px;padding:0 12px;border:0;border-radius:999px;flex:none;cursor:pointer;' +
            'background:var(--color-neutral-background-weak,#292d30);color:inherit;' +
            'font:600 12px/1 "Segoe UI",system-ui,sans-serif}' +
            '.wc-reddit:hover{background:rgba(124,108,255,.28)}' +
            '.wc-reddit.saved{color:#b3a7ff}' +
            '.wc-reddit .wc-logo{display:inline-flex}.wc-reddit svg{display:block}';
          t.root.appendChild(style);
        }
        if (t.before && t.before.parentElement === t.parent) t.parent.insertBefore(btn, t.before);
        else if (t.after && t.after.parentElement === t.parent) t.parent.insertBefore(btn, t.after.nextSibling);
        else t.parent.appendChild(btn);

        if (t.kind === 'thumb' || t.kind === 'float') {
          const cs = getComputedStyle(t.parent);
          if (cs.position === 'static') t.parent.style.position = 'relative';
        }
        REG.push({ el: btn, getPayload: t.payload });
      } catch (e) { /* selector drift - skip this target */ }
    });
  }

  // ------------------------------------------------------ site adapters

  function ytImg(videoId) {
    return 'https://i.ytimg.com/vi/' + encodeURIComponent(videoId) + '/hqdefault.jpg';
  }

  function ytPayload() {
    const d = WC.detectFromUrl(location.href);
    const t = (document.querySelector('h1.ytd-watch-metadata') || {}).textContent;
    return {
      url: location.href,
      title: (t || document.title || '').replace(/\s*[-|]\s*YouTube\s*$/i, '').trim(),
      thumbnail: d.videoId ? ytImg(d.videoId) : '',
      type: d.type || 'video',
    };
  }

  // Instagram links may be root-scoped (/p/<id>/) or profile-scoped
  // (/nasa/p/<id>/). Comment permalinks (/p/<id>/c/<id>/) are not posts.
  const IG_POST = /^\/(?:[^/]+\/)?(?:p|reel)\/[\w-]+\/?(?:[?#].*)?$/;

  function igClean(text) {
    let s = (text || '').replace(/^(?:Photo|Video|Carousel) by .+? on .+?\.\s*/i, '').trim();
    if (/^May be an image of /i.test(s)) s = s.replace(/^May be an image of /i, '');
    else s = s.replace(/\s*May be an image of .*$/i, '');
    return s.replace(/\s+/g, ' ').trim();
  }

  function igTitle(text) {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    const quoted = t.match(/:\s*"([\s\S]*)"\s*$/);
    if (quoted) return quoted[1].trim().slice(0, 140);
    return t.replace(/\s*[•|]\s*Instagram.*$/i, '').trim().slice(0, 140);
  }

  function igPostUrl(scope) {
    const a = scope && [...scope.querySelectorAll('a[href]')]
      .find((n) => IG_POST.test(n.getAttribute('href') || ''));
    if (a) {
      try { return new URL(a.getAttribute('href'), location.origin).href; } catch (e) { /* keep looking */ }
    }
    const canonical = document.querySelector('link[rel="canonical"]');
    const href = canonical && canonical.getAttribute('href');
    if (href) {
      try {
        const u = new URL(href, location.origin);
        if (IG_POST.test(u.pathname)) return u.href;
      } catch (e) { /* keep location */ }
    }
    return location.href;
  }

  // The largest post image, never the author avatar in the post header.
  function igImage(scope) {
    if (!scope) return null;
    const area = (img) => {
      const r = img.getBoundingClientRect ? img.getBoundingClientRect() : {};
      return (r.width || 0) * (r.height || 0) || (img.naturalWidth || 0) * (img.naturalHeight || 0);
    };
    const imgs = [...scope.querySelectorAll('img')].filter((img) => {
      const src = img.currentSrc || img.src || '';
      if (!/cdninstagram\.com|fbcdn\.net/.test(src)) return false;
      if (/profile picture/i.test(img.getAttribute('alt') || '')) return false;
      const r = img.getBoundingClientRect ? img.getBoundingClientRect() : {};
      return (r.width || 0) >= 80 || (img.naturalWidth || 0) >= 200;
    });
    imgs.sort((a, b) => area(b) - area(a));
    return imgs[0] || null;
  }

  function igPayload(scope) {
    const url = igPostUrl(scope);
    let samePage = false;
    try {
      const canonical = document.querySelector('link[rel="canonical"]');
      const c = canonical && new URL(canonical.getAttribute('href'), location.origin);
      samePage = !!c && c.pathname.replace(/\/$/, '') === new URL(url).pathname.replace(/\/$/, '');
    } catch (e) { /* not the same page */ }
    const meta = (name) => (document.querySelector('meta[property="' + name + '"], meta[name="' + name + '"]') || {}).content || '';
    const img = igImage(scope);
    let title = samePage ? igTitle(meta('og:title')) : '';
    let thumbnail = samePage ? meta('og:image') : '';
    if (!thumbnail && img) thumbnail = img.currentSrc || img.src || '';
    if (!thumbnail && scope) thumbnail = (scope.querySelector('video[poster]') || {}).poster || '';
    if (!title) title = igClean(img && img.getAttribute('alt')) || igTitle(meta('og:title')) || document.title;
    return {
      url,
      title: title.replace(/\s*[•|]\s*Instagram.*$/i, '').trim().slice(0, 140),
      thumbnail,
      type: WC.detectFromUrl(url).type || 'social',
    };
  }

  function igGridPayload(a, img) {
    let url = location.href;
    try { url = new URL(a.getAttribute('href'), location.origin).href; } catch (e) { /* keep location */ }
    return {
      url,
      title: igClean(img && img.getAttribute('alt')) || 'Instagram post',
      thumbnail: (img && (img.currentSrc || img.src)) || '',
      type: WC.detectFromUrl(url).type || 'social',
    };
  }

  function tiktokPayload(scope) {
    const meta = (name) => (document.querySelector('meta[property="' + name + '"]') || {}).content || '';
    const desc = document.querySelector('[data-e2e="browse-video-desc"], [data-e2e="video-desc"]');
    let url = location.href;
    try {
      const canonical = document.querySelector('link[rel="canonical"]');
      const c = canonical && canonical.getAttribute('href');
      if (c && /\/video\/\d+/.test(c)) url = new URL(c, location.origin).href;
    } catch (e) { /* keep location */ }
    if (!/\/video\/\d+/.test(url) && scope) {
      // Feed items need their own permalink; the page URL is the feed itself.
      const item = (scope.closest && scope.closest('[data-e2e="recommend-list-item-container"],' +
        ' [data-e2e="feed-video"], article, div[class*="DivItemContainer"]')) || document;
      const link = (item.querySelector && item.querySelector('a[href*="/video/"]')) ||
        (scope.closest && scope.closest('a[href*="/video/"]'));
      if (link) {
        try { url = new URL(link.getAttribute('href'), location.origin).href; } catch (e) { /* keep */ }
      }
    }
    const video = (scope && scope.querySelector && scope.querySelector('video')) || document.querySelector('video');
    const cover = document.querySelector('img[data-e2e="video-cover"]');
    return {
      url,
      title: ((desc && desc.textContent) || document.title || '')
        .replace(/\s*\|\s*TikTok$/i, '').replace(/\s+/g, ' ').trim().slice(0, 140),
      thumbnail: meta('og:image') || (video && video.poster) ||
        (cover && (cover.currentSrc || cover.src)) || '',
      type: WC.detectFromUrl(url).type || 'reel',
    };
  }

  function tiktokGridPayload(a, img) {
    let url = location.href;
    try { url = new URL(a.getAttribute('href'), location.origin).href; } catch (e) { /* keep */ }
    const handle = (url.match(/@([^/]+)/) || [])[1] || 'TikTok';
    return {
      url,
      title: ((img && img.getAttribute('alt')) || 'Video by @' + handle).trim().slice(0, 140),
      thumbnail: (img && (img.currentSrc || img.src)) || '',
      type: 'reel',
    };
  }

  function xPayload(article) {
    const link = article.querySelector('a[href*="/status/"]');
    let url = location.href;
    try {
      if (link) url = new URL(link.getAttribute('href'), location.origin).href;
    } catch (e) { /* keep location */ }
    const body = article.querySelector('[data-testid="tweetText"]');
    const img = [...article.querySelectorAll('img')].find((node) => {
      try { const u = new URL(node.currentSrc || node.src); return u.hostname === 'pbs.twimg.com' && u.pathname.startsWith('/media/'); }
      catch (e) { return false; }
    });
    return {
      url,
      title: ((body && body.textContent) || document.title || '').trim().slice(0, 140),
      thumbnail: img ? (img.currentSrc || img.src) : (article.querySelector('video[poster]') || {}).poster || '',
      type: WC.detectFromUrl(url).type || 'social',
    };
  }

  function redditPayload(post) {
    const permalink = post.getAttribute('permalink') || '';
    let url = location.href;
    try {
      if (permalink) url = new URL(permalink, location.origin).href;
    } catch (e) { /* fallback to location */ }
    const t = post.querySelector('[slot="title"], h1, h2, h3');
    const img = post.querySelector('[slot="post-media-container"] img, [slot="page-1"] img');
    return {
      url,
      title: (post.getAttribute('post-title') || post.getAttribute('title') || (t && t.textContent) || document.title).trim().slice(0, 140),
      thumbnail: img ? (img.src || '') : '',
      type: WC.detectFromUrl(url).type || 'social',
    };
  }

  const ADAPTERS = [
    {
      name: 'youtube',
      match: () => /(^|\.)youtube\.com$/.test(HOST),
      scan() {
        const out = [];
        const path = location.pathname;

        // 1) watch page: chip in the like/share action bar
        if (path === '/watch') {
          const bar = document.querySelector('ytd-watch-metadata #top-level-buttons-computed,' +
            ' #actions ytd-menu-renderer #top-level-buttons-computed');
          if (bar && !bar.querySelector('.wc-btn')) {
            const share = [...bar.querySelectorAll('ytd-button-renderer, ytd-toggle-button-renderer, button')]
              .find((b) => ((b.getAttribute('aria-label') || b.getAttribute('title') || '') + '').toLowerCase().indexOf('share') !== -1);
            out.push({ kind: 'chip', parent: bar, before: share || null, payload: ytPayload });
          }
        }

        // 2) shorts rail (like / dislike / share column)
        if (/^\/shorts\//.test(path)) {
          const rail = document.querySelector('ytd-shorts #actions');
          if (rail && !rail.querySelector('.wc-btn')) {
            out.push({ kind: 'rail', parent: rail, payload: ytPayload });
          }
        }

        // 3) list thumbnails (home, search, sidebar)
        document.querySelectorAll('a#thumbnail[href*="watch?v="]').forEach((a) => {
          const parent = a.parentElement;
          if (!parent || parent.querySelector(':scope > .wc-btn')) return;
          let id = '';
          try { id = new URL(a.href, location.origin).searchParams.get('v') || ''; } catch (e) { return; }
          if (!id) return;
          out.push({
            kind: 'thumb',
            parent,
            payload: () => {
              const root = a.closest('ytd-rich-item-renderer, ytd-compact-video-renderer, ' +
                'ytd-grid-video-renderer, ytd-video-renderer');
              const tt = root && root.querySelector('#video-title');
              return {
                url: 'https://www.youtube.com/watch?v=' + id,
                title: ((tt && tt.textContent) || document.title).trim(),
                thumbnail: ytImg(id),
                type: 'video',
              };
            },
          });
        });
        return out;
      },
    },
    {
      name: 'instagram',
      match: () => /(^|\.)instagram\.com$/.test(HOST),
      scan() {
        const out = [];
        const rows = new Set();
        // Feed posts, carousels and reels each expose Share in their action row.
        // Inserting after it keeps Save next to the native actions.
        document.querySelectorAll('svg[aria-label="Share"]').forEach((svg) => {
          const wrap = svg.closest('div[role="button"], button');
          const holder = wrap && wrap.parentElement;
          if (!holder || rows.has(holder)) return;
          rows.add(holder);
          if (holder.querySelector(':scope > .wc-btn')) return;
          out.push({
            kind: 'row',
            parent: holder,
            after: wrap,
            payload: () => igPayload(svg.closest('article')),
          });
        });
        // Profile and explore grids: a save badge on each post tile.
        document.querySelectorAll('a[href]').forEach((a) => {
          if (!IG_POST.test(a.getAttribute('href') || '')) return;
          const img = a.querySelector('img');
          if (!img || a.querySelector('.wc-btn')) return;
          out.push({ kind: 'thumb', parent: a, payload: () => igGridPayload(a, img) });
        });
        if (!rows.size && /\/(reel|reels)\//.test(location.pathname)) {
          out.push({ kind: 'float', parent: document.body, payload: () => igPayload(null) });
        }
        return out;
      },
    },
    {
      name: 'x',
      match: () => /(^|\.)(x|twitter)\.com$/.test(HOST),
      scan() {
        const out = [];
        document.querySelectorAll('article').forEach((ar) => {
          const group = ar.querySelector('div[role="group"]');
          if (!group || group.querySelector('.wc-btn')) return;
          out.push({ kind: 'row', parent: group, payload: () => xPayload(ar) });
        });
        return out;
      },
    },
    {
      name: 'reddit',
      match: () => /(^|\.)reddit\.com$/.test(HOST),
      scan() {
        const out = [];
        document.querySelectorAll('shreddit-post').forEach((post) => {
          if (!post.getAttribute('permalink')) return;
          const root = post.shadowRoot;
          if (root && !redditRoots.has(root)) {
            mo.observe(root, { childList: true, subtree: true });
            redditRoots.add(root);
          }
          // The modern action bar lives in the post's open shadow root.
          // Insert after Share, before Reddit's trailing spacer/actions.
          const row = (root && root.querySelector('rpl-action-bar [data-testid="action-row"]')) ||
            post.querySelector('[slot="interactal-actions"], [slot="interactive-actions"]');
          if (!row || row.querySelector('.wc-btn')) return;
          const before = row.querySelector('div.ms-auto, slot[name="action-row-whitespace"]');
          out.push({ kind: 'reddit', parent: row, before, root, payload: () => redditPayload(post) });
        });
        return out;
      },
    },
    {
      name: 'tiktok',
      match: () => /(^|\.)tiktok\.com$/.test(HOST),
      scan() {
        const out = [];
        const rows = new Set();
        // TikTok keeps these data-e2e hooks across redesigns; the share control
        // sits in the vertical action rail beside Like / Comment / Favorite.
        const SHARE = '[data-e2e="share-button"], [data-e2e="share-icon"],' +
          ' [data-e2e="browse-share-icon"], button[data-e2e*="share"]';
        document.querySelectorAll(SHARE).forEach((anchor) => {
          const wrap = anchor.closest('button, [role="button"]') || anchor;
          const holder = wrap.parentElement;
          if (!holder || rows.has(holder)) return;
          if (!holder.querySelector('[data-e2e*="comment"], [data-e2e*="like"], [data-e2e*="favorite"]')) return;
          rows.add(holder);
          if (holder.querySelector(':scope > .wc-btn')) return;
          out.push({ kind: 'rail', parent: holder, after: wrap, payload: () => tiktokPayload(wrap) });
        });
        // Profile grids: a save badge on each video tile.
        document.querySelectorAll('a[href*="/video/"]').forEach((a) => {
          if (!/^\/@[^/]+\/video\/\d+/.test(a.getAttribute('href') || '')) return;
          const img = a.querySelector('img');
          if (!img || a.querySelector('.wc-btn')) return;
          out.push({ kind: 'thumb', parent: a, payload: () => tiktokGridPayload(a, img) });
        });
        if (!rows.size && /\/video\//.test(location.pathname)) {
          out.push({ kind: 'float', parent: document.body, payload: () => tiktokPayload(null) });
        }
        return out;
      },
    },
  ];

  // -------------------------------------------------------- run loop

  function run() {
    if (!O.loaded || !document.body) return;
    let targets = [];
    ADAPTERS.forEach((a) => {
      if (a.match()) {
        try { targets = targets.concat(a.scan() || []); } catch (e) { /* site DOM changed */ }
      }
    });
    injectTargets(targets);
    refreshStates();
  }

  let scheduled = null;
  function schedule() {
    if (scheduled) return;
    scheduled = setTimeout(() => { scheduled = null; run(); }, 250);
  }

  const mo = new MutationObserver(schedule);
  const redditRoots = new WeakSet();
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      schedule();
    }
  }, 700);

  function start() {
    loadAll().then(run);
    mo.observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
