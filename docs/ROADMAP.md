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

- ✅ `visibility: 'link'` boards with `shareId` (schema v2 migration)
- ✅ Share links **v1 — self-contained snapshots**: board travels in the URL
  fragment; public read-only viewer at `linkclipper.github.io/b/` (zero infra,
  works without sync; transport decision recorded in `Knowledgebase/design/social-backend.md`)
- ⬜ B2: live boards read from the user's own Supabase (Phase A anon-key write
  risk must be resolved first — see `backend/README.md`)
- ⬜ Item sanitization on share: ✅ done for v1 (notes/readerText excluded by the codec)
- **Decision needed:** Phase B2 transport (anon-key model vs hosted slug lookup)

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
