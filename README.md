# LinkClipper

> A collection center for the web you browse â€” YouTube Shorts, Instagram reels,
> videos, articles and pages â€” organized into boards, tagged, searchable,
> and synced across devices.

Think Pinterest, but for everything you want to revisit.

## Features

- **Save from inside the page** â€” YouTube (watch action bar, Shorts rail, and a small
  W badge on every video thumbnail in lists), Instagram reels/posts, X (Twitter)
  posts, Reddit posts and TikTok get an in-page LinkClipper button. Clicking it
  opens a quick-save dialog on the page itself (board picker with inline "new
  board", tags with autocomplete, note) just like the toolbar popup. Already-saved
  items show a green checkmark and open in edit mode.
- **Preview without leaving** â€” YouTube, Instagram and TikTok items play inside
  the dashboard via official embeds: hover a card and click â–¶, or "Load preview"
  in the edit modal. If YouTube shows its "Error 153" player refusal, hit
  **â†» Alternate player**; sites that block embedding fall back to an
  open-original link.
- **Organize fast** â€” hover a card for action buttons (open â†—, move â‡„, delete ðŸ—‘),
  use the move popover, or simply **drag a card onto a board in the sidebar**.
- **One-click save** â€” click the toolbar icon on any page. LinkClipper extracts
  the title, thumbnail and description automatically and classifies the artifact:
  - âš¡ **YouTube Short** Â· â–¶ **Video** (YouTube/TikTok) Â· ðŸŸª **Reel** (Instagram/TikTok)
  - âœ‰ **Article** (detected from page structure) Â· âš™ **Page** (fallback)
- **Boards** â€” organize items into boards (default `Inbox`, plus unlimited custom
  boards with colors).
- **Tags & notes** â€” add tags while saving (autocomplete from tags you already
  use) and a "why save this" note.
- **Pinterest-style dashboard** â€” masonry grid at `chrome-extension://<id>/dashboard/dashboard.html`
  with search (`/` to focus), type filter, tag filter, board sidebar, sort, and an
  edit modal per item.
- **Duplicate awareness** â€” saving the same page again updates the existing item
  instead of creating copies (tracking params like `utm_*`/`si` are stripped for matching).
- **Local-first, optional cloud sync** â€” everything lives in `chrome.storage.local`.
  Optionally connect a free **Supabase** project to sync boards + items across
  devices (last-write-wins merge, deletes propagate via tombstones).
- **Export / Import JSON** â€” full backup, no lock-in.

## Install (Load unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. **Load unpacked** â†’ select this folder
4. Pin the **W** icon; browse around and click it to save

## Use the dashboard

Click **Open collection â†—** in the popup, or open the extension's
`dashboard/dashboard.html` directly.

- Left sidebar: **All items** + your boards (click to filter; ðŸ—‘ to delete a board â€” items move to Inbox)
- Top bar: search, type filter, tag filter, sort order
- Click a card â†’ edit title / board / tags / note, or delete
- Click a **tag chip** on a card to filter by that tag
- â˜ Sync / â†“ Export / â†‘ Import live in the sidebar footer

## Cloud sync setup (Supabase, ~3 minutes)

1. Create a free project: https://supabase.com â†’ **New project**
2. Open **SQL Editor â†’ New query**, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql), press **Run**
3. In the extension dashboard, click **â˜ Sync** and paste:
   - **Project URL** â€” `https://xxxx.supabase.co` (Project Settings â†’ API)
   - **Anon public key** (Project Settings â†’ API â†’ `anon` key)
4. **Test connection** â†’ then **Sync now**

Sync behavior:

- Fully local until you configure it; after every popup save the extension
  quietly syncs in the background (when configured).
- Merge strategy: newest `updatedAt` wins per record. Deleting an item or board
  tombstones it first, so the deletion reaches your other devices.
- Repeat steps 2â€“4 on another computer's copy of the extension to share the collection.

> âš ï¸ With the anon key + open RLS policy used here, anyone holding your project's
> anon key could read/write your tables. That's fine for a private personal
> project (keys live in one browser). If you later want real accounts, add
> Supabase Auth and user-scoped RLS policies.

## Project layout

```
manifest.json          MV3 manifest (permissions: activeTab, storage, scripting)
background.js          service worker: badge count, install seeding, bg sync
lib/shared.js          type detection, classification, helpers (WC.*)
lib/store.js           chrome.storage.local CRUD, boards, tags, tombstones
lib/supabase.js        REST sync (push/pull/LWW merge, no SDK)
popup/                 save popup (extraction, board picker, tags, note)
dashboard/             full-page masonry collection manager
icons/                 generated PNGs
tools/make-icons.ps1   regenerates the icons
supabase/schema.sql    tables + RLS for the sync backend
```

## Notes & limits

- Thumbnails for YouTube are derived from the video ID (`i.ytimg.com`), other
  thumbnails come from the page's `og:image`. Some sites (e.g. Instagram) may
  return no image unless you're logged in â€” the card falls back to a colored
  placeholder.
- Chrome-internal pages (`chrome://`, Web Store, PDFs) can't be saved â€” the
  popup tells you instead of failing silently.
- Import/export are full JSON snapshots; importing merges by record and keeps
  the newer version of each.

## Roadmap ideas

- Context-menu save (links, images, selected text) and `Alt+Shift+S` shortcut
- Board cover collage images, drag & drop between boards
- Read-later queue, "resurface on a rainy day" shuffle
- Real Supabase Auth + multi-device profiles
- Markdown / PDF export of collections
