# Changelog

## 1.0.2-beta - 2026-08-31

- Added global `turbo-ai` launcher (`npm link` / `npm install -g .`) so the app starts from any folder.
- Hardened Pi process lifecycle, shutdown, and reconnect handling.
- Added reliable working-directory switching with rollback on connection failure.
- Improved session discovery, resume behavior, transcript loading, and thinking-level validation.
- Made Git status, diff, and search parsing robust for branches, renames, and special characters.
- Added cross-platform CI checks for Node.js 20, 22, and 24 on Ubuntu and Windows.
- Added regression tests for RPC lifecycle, CLI arguments, sessions, Git commands, and configuration writes.
