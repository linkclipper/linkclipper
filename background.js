// LinkClipper - lightweight service worker.
// Jobs: seed default boards on install, keep the toolbar badge count fresh.

importScripts('lib/shared.js', 'lib/store.js', 'lib/supabase.js');

const BADGE_COLOR = '#5C54EE';

async function updateBadge() {
  try {
    const items = (await Store.getRaw(KEYS.items)) || [];
    const n = items.filter((i) => !i.deletedAt).length;
    await chrome.action.setBadgeText({ text: n > 0 ? (n > 999 ? '999+' : String(n)) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  } catch (e) {
    // Swallow - badge updates are non critical.
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await Store.ensureInit();
  updateBadge();
});

chrome.runtime.onStartup.addListener(updateBadge);

// Popup fires a fire-and-forget sync after each save (if sync is configured).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'wc:sync') return undefined;
  Store.getSettings()
    .then((s) => {
      if (!Sync.configured(s)) return { ok: false, error: 'not configured' };
      return Sync.sync(s).then((res) => ({ ok: true, result: res }));
    })
    .then((r) => sendResponse(r))
    .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
  return true; // keep the message channel open for the async reply
});

// ------------------------------------------------------------ article reader
// The service worker can fetch cross-origin (host_permissions), so the
// dashboard reads article text in place instead of sending the user away.

function extractReadable(html) {
  let s = String(html || '');
  s = s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(nav|footer|aside|form)[\s\S]*?<\/\1\s*>/gi, ' ');
  const art = s.match(/<article[\s\S]*?<\/article\s*>/i);
  const main = s.match(/<main[\s\S]*?<\/main\s*>/i);
  if (art) s = art[0];
  else if (main) s = main[0];
  s = s
    .replace(/<li[^>]*>/gi, '&bull; ')
    .replace(/<(br)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre|table|ul|ol|caption|figcaption)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  s = s
    .replace(/&nbsp;|\u00a0/gi, ' ')
    .replace(/&bull;|&#8226;|&#x2022;/gi, '\u2022 ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&#8211;/gi, '\u2013')
    .replace(/&#8212;/gi, '\u2014')
    .replace(/&#(\d+);/g, ' ');
  s = s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (s.length > 14000) s = s.slice(0, 14000) + '\n\nâ€¦';
  return s;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'wc:read') return undefined;
  (async () => {
    try {
      const url = String(msg.url || '');
      if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) pages can be read');
      const r = await fetch(url, { redirect: 'follow', credentials: 'omit' });
      const ct = (r.headers.get('content-type') || '');
      let text = '';
      if (ct.includes('json')) {
        try { text = JSON.stringify(JSON.parse(await r.text()), null, 2); } catch (e) { /* plain fallback */ }
      }
      if (!text) text = extractReadable(await r.text());
      sendResponse({ ok: r.ok && !!text, status: r.status, finalUrl: r.url || url, text });
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true; // async reply
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[KEYS.items]) updateBadge();
});

updateBadge();
