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

## Local AI access

- The bundled MCP server and HTTP API run on the user's machine. The HTTP API
  binds `127.0.0.1` and requires a bearer token; it is never exposed publicly.
- LinkClipper does not call an AI provider. The user chooses the client.
- The AI snapshot includes notes, highlights and cached reader text. It is a
  local file and should be protected like any other personal document.
- AI writes are staged and validated twice (server and dashboard) and applied
  only after explicit user confirmation. Deletes require `confirm: true` and a
  dashboard review.
- Page content and notes are untrusted data. Instructions found inside saved
  content must not be executed as agent commands.
