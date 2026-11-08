# LinkClipper

**Save the web you love. Find it again, in one place.**

LinkClipper is a local-first Chrome/Brave extension (MV3) that clips anything you browse — YouTube Shorts, reels, articles, pages — into boards you can tag, search, and revisit. In-page save buttons live right next to the videos you're watching; articles open as clean readable text *inside* your dashboard.

![badge](https://img.shields.io/badge/manifest-MV3-7b6cff) ![badge](https://img.shields.io/badge/license-MIT-green) ![badge](https://img.shields.io/badge/data-local--first-blueviolet)

<p>
  <a href="https://linkclipper.github.io"><b>Website</b></a> ·
  <a href="https://linkclipper.github.io/privacy.html"><b>Privacy</b></a> ·
  <a href="docs/ROADMAP.md"><b>Roadmap</b></a> ·
  <a href="docs/ARCHITECTURE.md"><b>Architecture</b></a> ·
  <a href="CHANGELOG.md"><b>Changelog</b></a>
</p>

![LinkClipper dashboard](https://linkclipper.github.io/assets/webstore-1-grid.png)

## Install in Chrome or Brave

Until the Chrome Web Store listing is available, download the latest `LinkClipper-*.zip` from [GitHub Releases](https://github.com/linkclipper/linkclipper/releases/latest), extract it to a folder you will keep, open `chrome://extensions` (or `brave://extensions`), enable **Developer mode**, choose **Load unpacked**, and select the extracted folder containing `manifest.json`. Reload the extension there after updating the folder. Local data stays in that browser profile; export a JSON backup before removing the extension.

## Highlights

- **One-click save** — toolbar popup anywhere; in-page buttons on YouTube, Instagram, X/Twitter, Reddit, TikTok.
- **Keyboard-first capture** — press **Alt+Shift+L** to open quick save, choose a board, then **Ctrl+Enter** (⌘+Enter on Mac) to save. No shortcut silently saves. If the browser has already assigned the key, set your own at `chrome://extensions/shortcuts`.
- **Command palette** — use the **Commands** button or **Ctrl/⌘+Shift+P** in the dashboard to search actions and jump between boards. **Keyboard shortcuts** in the palette lets you pick a preset or record a custom palette key; browser-wide capture keys are managed separately by Chrome/Brave.
- **Local profile** — add a display name, short note, and avatar color for your personal dashboard. It stays on this device, requires no account, and is not part of board sync or shared snapshots.
- **Boards & tags** — Pinterest-style masonry, drag & drop, autocomplete, instant full-text search.
- **Play in place** — IG/TikTok/Vimeo embed inline; YouTube opens a docked floating mini-player (vendor limitation, see docs).
- **Read in place** — articles extract to a clean reading pane on first view and stay cached on the item.
- **Local-first** — zero accounts, zero analytics. Optional sync goes only to *your own* Supabase project.
- **Board snapshots** — share a self-contained link to a chosen board. Snapshots do not update or revoke after being copied; share only what you intend to show.

## Where this is heading

LinkClipper is growing toward shared, discoverable collections (Phase C/D of the [roadmap](docs/ROADMAP.md)) while keeping the local-first guarantee: the extension works fully offline, and every server-touching feature is opt-in. Engineering guardrails for that path — schema versioning, migration ladder, and board `visibility` — are already in `lib/store.js`.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). The law of the project: **if it breaks offline, it's a bug; if it requires an account, it's redesign.**

## Repository layout

```
manifest.json    MV3 manifest (action, dashboard, override-less content scripts)
background.js    service worker: badge, sync, article fetch/extract
lib/             shared helpers, storage + migrations, supabase sync client
popup/           quick-save popup
dashboard/       full dashboard app (+ dev.html harness for offline dev)
content/         in-page save overlay for supported sites
tools/           pack.ps1 (store zip), icon generation
docs/            architecture + roadmap
```
