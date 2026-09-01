# Changelog

## Unreleased

- Fixed session persistence: Pi is launched without `--no-session`, so conversations are saved to `~/.pi/agent/sessions/` and `/save`, `/open`, `/resume`, and recent session history work as documented.

## 1.0.2-beta - 2026-08-31

- Hardened Pi process lifecycle, shutdown, and reconnect handling.
- Added reliable working-directory switching with rollback on connection failure.
- Improved session discovery, resume behavior, transcript loading, and thinking-level validation.
- Made Git status, diff, and search parsing robust for branches, renames, and special characters.
- Added cross-platform CI checks for Node.js 20, 22, and 24 on Ubuntu and Windows.
- Added regression tests for RPC lifecycle, CLI arguments, sessions, Git commands, and configuration writes.
