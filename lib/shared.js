// LinkClipper - shared helpers and constants.
// Loaded as a classic script in the popup + dashboard, and importScripts()'d
// in the service worker. Keep everything on one global ("WC") to stay safe.

const WC = {};

// ---------------------------------------------------------------- constants

WC.TYPES = {
  shorts:   { label: 'YouTube Short', emoji: '\u26A1', color: '#F59E0B' },
  video:    { label: 'Video',          emoji: '\u25B6', color: '#EF4444' },
  reel:     { label: 'Reel',           emoji: '\u25A1', color: '#EC4899' },
  social:   { label: 'Post',           emoji: '\u2934', color: '#8B5CF6' },
  article:  { label: 'Article',        emoji: '\u2709', color: '#0EA5E9' },
  page:     { label: 'Page',           emoji: '\u2699', color: '#64748B' },
};

WC.BOARD_COLORS = [
  '#5C54EE', '#F43F5E', '#F59E0B', '#10B981',
  '#0EA5E9', '#8B5CF6', '#EC4899', '#64748B',
];

// ---------------------------------------------------------------- utilities

WC.uid = function () {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'wc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
};

WC.nowISO = function () { return new Date().toISOString(); };

WC.escapeHtml = function (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

WC.fmtDate = function (iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + 'd ago';
  return d.toLocaleDateString();
};

WC.domain = function (url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
};

// Fixed, bundled source marks: never fetch a favicon or send a saved URL elsewhere.
WC.sourceIdentity = function (url) {
  const host = WC.domain(url).toLowerCase();
  if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com'))
    return { name: 'X', mark: '𝕏', color: '#151923' };
  if (host === 'instagram.com' || host.endsWith('.instagram.com'))
    return { name: 'Instagram', mark: '◎', color: '#b93686' };
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com'))
    return { name: 'TikTok', mark: '♪', color: '#171b28' };
  if (host === 'reddit.com' || host.endsWith('.reddit.com'))
    return { name: 'Reddit', mark: 'r', color: '#ff4500' };
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be')
    return { name: 'YouTube', mark: '▶', color: '#e62117' };
  return null;
};

WC.sourceBadge = function (url, className) {
  const source = WC.sourceIdentity(url);
  if (!source) return '';
  const marks = {
    X: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 2h4l14 20h-4zM20 2h2L4 22H2z" fill="currentColor"/></svg>',
    Instagram: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".7" fill="currentColor" stroke="none"/></svg>',
    TikTok: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M14 2h3c.3 2.6 1.8 4.1 4 4.5v3.2a9 9 0 0 1-4-1.3v6.4a6.2 6.2 0 1 1-6.2-6.2v3.3a2.9 2.9 0 1 0 2.9 2.9V2z"/></svg>',
    Reddit: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m13 8 1-4 4 1M5 13a7 7 0 0 1 14 0M5 13a2 2 0 1 0 1 4 7 7 0 0 0 12 0 2 2 0 1 0 1-4"/><circle cx="8.5" cy="13" r=".8" fill="currentColor"/><circle cx="15.5" cy="13" r=".8" fill="currentColor"/><path d="M9 17c2 1.5 4 1.5 6 0"/></svg>',
    YouTube: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M4 5h16a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zm6 3v8l7-4z" fill-rule="evenodd"/></svg>',
  };
  return '<span class="' + (className || 'source-badge') + '" style="background:' + source.color +
    '" title="' + source.name + '" aria-label="' + source.name + '">' + (marks[source.name] || source.mark) + '</span>';
};

WC.normalizeUrl = function (url) {
  try {
    const u = new URL(url);
    // Strip tracking params so "already saved" detection is smarter.
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'si', 'fbclid', 'gclid']
      .forEach((p) => u.searchParams.delete(p));
    const query = u.searchParams.toString();
    return u.origin + u.pathname + (query ? '?' + query : '');
  } catch (e) { return url; }
};

// ------------------------------------------------- artifact type detection

// Returns { type, videoId } based purely on the URL. Anything unknown flows
// through content heuristics (article vs page) in the caller.
WC.detectFromUrl = function (url) {
  let u;
  try { u = new URL(url); } catch (e) { return { type: 'page' }; }
  const host = u.hostname.replace(/^www\./, '');
  const path = u.pathname;

  // YouTube
  if (host === 'youtu.be') return { type: 'video', videoId: path.slice(1).split('/')[0] };
  if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    const m = path.match(/^\/shorts\/([\w-]+)/);
    if (m) return { type: 'shorts', videoId: m[1] };
    if (u.searchParams.get('v')) return { type: 'video', videoId: u.searchParams.get('v') };
  }

  // Instagram (profile-scoped links include the account: /nasa/p/<id>/)
  if (host.endsWith('instagram.com') && /^\/(?:[^/]+\/)?(?:reel|reels|p)\/[\w-]+/.test(path)) {
    return { type: 'reel' };
  }

  // TikTok
  if (host.endsWith('tiktok.com') && /\/video\/(\d+)/.test(path)) return { type: 'reel' };

  // Reddit posts
  if (host.endsWith('reddit.com') && path.indexOf('/comments/') !== -1) return { type: 'social' };

  // Social status posts
  if ((host === 'x.com' || host === 'twitter.com') && /\/status\/\d+/.test(path)) return { type: 'social' };

  return { type: null };
};

// YouTube thumbnails can be derived without scraping anything.
WC.guessThumbnail = function (url) {
  const det = WC.detectFromUrl(url || '');
  if (det.videoId) {
    return 'https://i.ytimg.com/vi/' + encodeURIComponent(det.videoId) + '/hqdefault.jpg';
  }
  return null;
};

// Decide the final artifact type once we know both the URL and page content.
WC.classify = function (url, pageMeta) {
  const det = WC.detectFromUrl(url || '');
  if (det.type) return det.type;
  const paragraphs = (pageMeta && pageMeta.paragraphCount) || 0;
  const ogType = (pageMeta && pageMeta.ogType) || '';
  if (ogType.indexOf('article') !== -1 || paragraphs >= 3) return 'article';
  const isArticleish = pageMeta && (pageMeta.isArticleTag || /news|blog|post|article/i.test(url || ''));
  if (isArticleish) return 'article';
  return 'page';
};
