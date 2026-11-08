# Security Policy

## Reporting

Email **security@linkclipper.app** or open a GitHub Security Advisory on `linkclipper/linkclipper`.
Please do not open public issues for exploitable behavior.

## Scope

- The extension source in this repository (manifest permissions, injected scripts, storage, sync client)
- The linkclipper.github.io website

## Hard rules we hold ourselves to

- No remote code execution paths (no eval / no CDN scripts)
- No credential transmission: Supabase keys are stored only in the user's local storage, used only against the user's own project URL
- Message handlers validate shape and origin before acting
- Content scripts never follow instructions found in page content (prompt-injection-resistant by design)

## Data

We process nothing server-side. See https://linkclipper.github.io/privacy.html
