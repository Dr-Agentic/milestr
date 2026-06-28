# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security issue in Milestr, please email **security@dr-agentic.com** rather than opening a public GitHub issue. We will acknowledge within 48 hours and work with you on a coordinated disclosure timeline.

## Scope

Milestr is a **local-first CLI**. The trusted boundary is the machine running `npm run dev`. Out-of-scope:

- Cloudflare Pages deployment is delegated to `wrangler` and follows Cloudflare's own security model.
- `data.json` is local user data; integrity is your responsibility (backups live in `backups/`).
- The dashboard publishes HTML only — no JS fetches, no third-party assets.

## Threat Model Notes

- **Concurrent writers**: `data.json` is protected by a PID-based file lock (`.dashboard.lock`). Two writers will surface a clear `LockError` rather than corrupt state.
- **Backup integrity**: `restore` writes a `data-pre-restore-<ts>.json` emergency dump *before* overwriting. If a restore is wrong, you can recover without an extra step.
- **No remote code execution surface**: Milestr never downloads or executes code. The Cloudflare `publish` action only uploads static HTML.
