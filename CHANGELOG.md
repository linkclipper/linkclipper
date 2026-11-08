# Changelog

## 0.4.0 — share links (Phase B, v1)

- Duplicate saves now load the saved board, title, tags and note before editing
  in the popup. Updating preserves the original item; **Save another copy**
  is explicit in both the popup and in-page dialog. Tracking parameters and
  canonical URLs are considered when matching; deleted items are ignored.
- Cards now have **Copy original link** beside Open, with a clipboard fallback
  for browsers where the async Clipboard API is unavailable.
- Fixed the Share entry point: selecting any board now shows an explicit
  **Share board** button; each sidebar board also has Share and Edit controls.
  The existing-board editor was previously unreachable from the UI.
- **Board share links**: any board can be shared via a link that carries a
  read-only **snapshot** inside the URL fragment (`linkclipper.github.io/b/#d=…`).
  - No server, no keys, no sync required — works for anyone, recipient needs no
    account or extension (they get a "Get LinkClipper" call to action).
  - Privacy model: titles, links, thumbnails, tags, source + board name/color are
    shared; **notes, reader-text caches and selections are never shared**.
  - Snapshots are static by design — re-share to refresh. (Live, revocable
    boards via the user's own sync project = Phase B2.)
  - The public viewer escapes everything it renders; links are opened with
    `noopener noreferrer`; thumbnails load with `no-referrer` and fall back
    silently when dead.
- Board editor gains "Share this board…"; opening a share preview does not
  mutate the board or sync anything. `visibility`/`shareId` are reserved for
  future live sharing, not set by a static snapshot link.
- Schema: migration ladder stepped to **v2** (existing boards stamped to the
  share shape; idempotent, runs in place).
- Share codec is a standalone lib (`lib/shares.js`), mirrored decode-side on the
  public page; corrupt/truncated/garbage hash text is rejected, never thrown.

## 0.3.0 — the reading view release (2026-11-08)

- Fixed a shipped-since-glassmorphism bug: a missing `.hidden` rule left an empty glass pill and a dark scrim covering the dashboard permanently.
- Diffed empirically in headed headless Chromium; confirmed as the root cause via reproducible screenshots.
- In-place playback architecture:
  - Verified YouTube rejects every embed variant from extension origins (`embedder.identity.missing.referrer`, Error 153). Floating `watch_popup` mini-player docked to the right edge; portrait sizing for Shorts.
  - Vimeo now plays inline (no frame-rejection).
  - New in-place **Reader** for articles/pages: background service worker fetch (per-site permission granted on request, never install-time), readability extraction, cache on item for instant reopen.
- Rebrand to **LinkClipper**.
- Engineering foundations: `wc_meta` schema version + migration ladder, board `visibility` field (future sharing), CI + releases.

## 0.2.0 — boards, sync and in-page saves

- Pinterest-style dashboard, boards, tag search, drag & drop, editing modals.
- In-page save buttons on YouTube, Instagram, X/Twitter, Reddit, TikTok with quick-save dialog.
- Optional Supabase sync (last-write-wins, tombstoned deletes).
- Glassmorphism dark aurora theme (no `backdrop-filter`; Brave GPU-safe).
