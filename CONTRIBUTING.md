# Contributing

Thanks for helping grow LinkClipper. Keep these rules in mind:

1. **Local-first is the law.** Every feature must work with zero network and zero account. Anything that needs a server is opt-in and explicitly reverses.
2. **No remote code.** MV3 + CWS forbid it; no eval, no remote `<script>`, no CDNs in extension pages.
3. **Permissions are sacred.** Never widen install-time host permissions. Site-scoped access must come from user gestures.
4. **Schema changes go through migrations.** Bump `wc_meta.schemaVersion` laddering in `lib/store.js` — never mutate stored shapes in place without one.
5. **Test via the harness.** `dashboard/dev.html` runs the real app offline; screenshot states cover grid/editor/reader/board/sync.
6. Style: 2-space JS, `node --check` every touched file, plain ES2020 worker-safe syntax (no top-level await outside async fns).

## Dev loop

```
Load unpacked from the repo root (chrome://extensions → Developer mode)
Open dashboard/dashboard.html (or dev.html for chrome-free testing)
tools/pack.ps1 → store zip in the project root
```

## PR checklist

- [ ] Works offline / graceful when offline
- [ ] No new permissions
- [ ] Sync merge still last-write-wins safe
- [ ] README/docs updated if behavior or data model changed
