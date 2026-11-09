# Changelog

## Unreleased

- Reddit feed and post pages now show a labeled LinkClipper save icon in the
  action row beside Share; post titles and permalinks are captured from the post.
- Instagram posts, carousels and reels get a save control after Share, and
  profile-grid tiles get a save badge. Captions and post-scoped images are
  captured per post; profile-scoped links now get the Reel type.
- TikTok video pages get a save control in the action rail, and profile grids
  get the same save badge, via TikTok's stable `data-e2e` hooks.
- Social saves now prefer media belonging to the X post rather than an avatar or
  unrelated image. Text-only and broken-image posts show an offline source mark;
  recognizable source badges also appear on collection cards and save previews.

## 0.4.0 — share links and local-first polish (2026-11-08)

- **LinkClipper identity:** replaced the legacy `W` roundel with a linked-loop
  mark across the toolbar, popup, dashboard, in-page buttons and public site.
  Refreshed store and site screenshots to match.
- **Dashboard polish and local profile:** refined collection hierarchy, navigation
  and card surfaces; optional local display name, note and avatar color. Profile
  data stays on this device and is never included in synced or shared boards.
- **Command palette:** dashboard actions and board navigation in a searchable,
  keyboard-navigable overlay (Ctrl/⌘+Shift+P by default). The palette key is
  configurable locally via presets or a recorded combination. Settings show
  the browser-wide capture key and link to Chrome/Brave's shortcut manager.
- **Faster capture:** Alt+Shift+L opens the existing quick-save popup. The board
  picker takes focus, and Ctrl+Enter (⌘+Enter on Mac) explicitly saves. The
  browser's extension-shortcut settings can reassign a conflicting key; opening
  the popup never saves on its own.
- **Bulk actions** in the dashboard: select cards (or all visible cards), move
  them to a board, add a tag, or delete with a confirmation. Selection stays
  within the current filtered view; each operation writes once to local storage
  and keeps tombstones for sync. Cards are keyboard-selectable in selection mode.
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
