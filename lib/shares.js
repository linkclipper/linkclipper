// LinkClipper — board share links (Phase B, v1: self-contained payload).
//
// Design (Knowledgebase design/social-backend.md, "chosen transport"):
//   The board snapshot travels INSIDE the link fragment (#d=...). No server,
//   no keys, works with zero sync configured. The link IS the secret: keep it
//   to who you want to show the board. Snapshots are static — "refresh" by
//   re-sharing. Live update/removal comes with Phase B2 (user's sync project).
//
// Wire format (keep in sync with linkclipper.github.io/b/ decode side):
//   { v: 1,
//     b: { n: board name, c: color, d?: description },
//     i: [ { u: url, t: title, s?: source, w?: thumbnail, g?: [tags],
//            k?: type ('video','reel','article','page'), } ] }
//
// Notes/readerText/selection are deliberately never shared.

const Shares = {
  VERSION: 1,
  MAX_URL: 15000, // conservative; chat clients trim longer links

  buildPayload(board, items) {
    const payload = {
      v: this.VERSION,
      b: { n: String(board.name || 'Untitled board'), c: String(board.color || '#7b6cff'), d: String(board.description || '') },
      i: [],
    };
    for (const it of items) {
      if (it.deletedAt || !it.url) continue;
      const slim = { u: String(it.url), t: String(it.title || '') };
      if (it.source) slim.s = String(it.source);
      if (it.thumbnail && /^https?:\/\//i.test(it.thumbnail)) slim.w = String(it.thumbnail);
      if (Array.isArray(it.tags) && it.tags.length) slim.g = it.tags.slice(0, 8).map(String);
      if (it.type && it.type !== 'page') slim.k = String(it.type);
      payload.i.push(slim);
    }
    return payload;
  },

  // UTF-8-safe base64url.
  encode(payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },

  decode(text) {
    if (typeof text !== 'string' || !text) return null;
    let b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    let bin;
    try { bin = atob(b64); } catch (e) { return null; }
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    let payload;
    try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { return null; }
    if (!payload || payload.v !== this.VERSION || !payload.b || !Array.isArray(payload.i)) return null;
    return payload;
  },

  url(payload) {
    return 'https://linkclipper.github.io/b/#d=' + this.encode(payload);
  },

  fits(payload) {
    return this.url(payload).length <= this.MAX_URL;
  },
};
