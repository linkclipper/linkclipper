# Changelog

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
