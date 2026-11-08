# Architecture

LinkClipper is a Manifest V3 Chrome/Brave extension: **local-first**, privacy-preserving, with an optional user-owned cloud sync. This document explains the current slice and how it grows toward shared/discovered collections without raking the floor.

## Components

```
manifest.json           MV3 config: action popup, dashboard, content scripts (social sites)
background.js           service worker — badge, sync trigger, in-place article fetcher+extractor
lib/shared.js           pure helpers: URL/video detection, type taxonomy, formatting
lib/store.js            storage layer — chrome.storage.local CRUD, schema migrations, tombstones
lib/supabase.js         optional REST sync (push/pull, last-write-wins)
popup/                  quick-save surface (board picker, tags, note)
dashboard/              full app — masonry grid, boards, search, filters, editing, reader, previews
content/                in-page save buttons + quick-save dialog on supported sites
tools/                  packaging (pack.ps1 → store zip), icon generation
dashboard/dev.html      offline dev harness: stubs chrome.* so the app runs via file:// for testing
```

## Data model (v1)

Everything lives in `chrome.storage.local` under versioned keys (`wc_items`, `wc_boards`, `wc_settings`, `wc_meta`).

- **Item** — `{ id, boardId, type, url, title, source, thumbnail, tags[], note, selection, description, canonical, readerAt?, readerText?, createdAt, updatedAt, deletedAt }`
- **Board** — `{ id, name, color, description, visibility ('private' | undefined), createdAt, updatedAt, deletedAt }`
- **Tombstones** — deletion sets `deletedAt` and `updatedAt` so deletions sync instead of resurrecting.
- **Sync** — last-write-wins per record by `updatedAt`. No server truth existed before v1; the server is a mirror.
- **Migrations** — `Store.MIGRATIONS` ladder keyed "to-version"; `wc_meta.schemaVersion` tracks progress. Any future data-model change adds a step here; existing installs upgrade in place.

## Playback strategy (why previews look the way they do)

| Source | In-dashboard behavior | Why |
|---|---|---|
| Instagram / TikTok / Vimeo | inline `<iframe>` embed | These platforms emit no referrer-identity check / frame block |
| YouTube | `watch_popup` in a floating window (docked right; portrait for Shorts) | YouTube rejects embeds without a web referrer (`Error 153`, `embedder.identity.missing.referrer`) — verified across origin/widget_referrer/nocookie/no-referrer variants |
| Articles / generic pages | in-place **Reader**: service worker fetches (host permission granted once per site on request), extracts readable text, caches it on the item | Single-purpose grant avoids install-time `<all_urls>` |

## The social direction (v2+)

Discovery ("Pinterest-like") changes the trust model from *mirror of local state* to *server-hosted content with owners*. The design constraint we're protecting: **a user must be able to opt out and still keep everything locally.**

Planned progression (see `docs/ROADMAP.md` for sequencing):

1. **Share links (private→link)** — boards gain a share slug; public read-only pages render a board from the user's own sync project. Extension data model already reserves `visibility`.
2. **Accounts** — hosted identity (Supabase auth managed by us) and public profiles; each item keeps local-first storage as source of truth while the server indexes public boards.
3. **Discovery graph** — follow/remix ("save to my board"), feed ranking, moderation queue. Sync transitions from mirror → transport of record-level changes (same LWW merge, server arbiter).

Every phase keeps the extension functional offline with zero network.

## Testing without a store build

`dashboard/dev.html` stubs `chrome.storage` / `chrome.runtime` and seeds data so the dashboard runs from `file://`. Screenshot states: `dev.html?state=item|reader|vitem|board|sync|empty|toast`.
