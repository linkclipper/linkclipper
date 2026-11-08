# Roadmap

LinkClipper is being built deliberately: each phase ships standalone value and leaves the data model compatible with the next.

## Phase A — Solid foundation (now, v0.3.x)

- ✅ Local-first storage + optional user-owned Supabase sync
- ✅ In-page save buttons (6 social sites), popup, dashboard
- ✅ In-place reading (per-site permission), floating YouTube player, inline Vimeo/IG/TikTok
- ✅ Schema versioning + migration ladder
- ✅ CI (validate + store-zip on every push), tagged releases
- ⬜ Store listing live (CWS)
- ⬜ E2E spot-checks in CI (dev-harness screenshot states)

## Phase B — Sharing (v0.4)

- ⬜ `visibility: 'link'` boards with share slug (`board.shareId`)
- ⬜ Read-only public board page served from the user's own Supabase project
- ⬜ Share button → `linkclipper.github.io/b/<slug>`
- ⬜ Item sanitization on share: strip `readerText` cache unless author opts in
- **Decision needed:** Supabase RLS policies for anon-read of shared boards (drafted in `supabase/schema.sql` follow-up)

## Phase C — Discovery foundation (v0.5)

- ⬜ Hosted auth (our Supabase project, anon visitors stay local-only)
- ⬜ Public profiles + public-boards index
- ⬜ Remix: "save to my board" copies any public item locally (attribution preserved)
- ⬜ Follows + basic feed (chronological first, curation later)
- **Decision needed:** moderation model (report queue vs curated allow-list first)
- **Engineering note:** transition sync from mirror → transport; server LWW arbiter, same record format

## Phase D — The Pinterest moment (v1.0+)

- ⬜ Curated discovery page / search across public boards
- ⬜ Board invites & collabs
- ⬜ Notifications, activity
- ⬜ Monetization (Pro features only; never selling data)
- ⬜ Maybe: public web app (non-extension) reading the same backend

## Non-goals

- Ads, data selling, tracking pixels
- Making the extension require an account
- Seeding any fake content — discovery grows from real boards
