# AGENTS.md

Guidance for coding agents and contributors working in this repository.
Goal: one clean, reviewable PR per change, no cross-platform surprises,
and no ambiguity about which checkout you are building.

## Repository topology (fork workflow)

- **Upstream** `kvv256512-ux/turbo-ai` — the source of truth. All PRs target it.
- **origin** — your fork (e.g. `mpetruc/turbo-ai`). Feature/fix branches live here.
- `main` mirrors `upstream/main`. **Never commit to `main` directly.**

```bash
git remote add upstream https://github.com/kvv256512-ux/turbo-ai.git
git fetch upstream --prune
```

## Branch discipline

- **One change per branch, one branch per PR.** Never mix unrelated changes
  (e.g. a crash fix + a feature) on one branch — each PR must be reviewable
  and revertable on its own. Keep the touched file sets disjoint where possible.
- Branch names: `fix/<topic>`, `feat/<topic>`, `chore/<topic>`, `docs/<topic>`.
- Branch from up-to-date `upstream/main`. **Rebase onto main; never merge main
  into a feature branch** (merge commits entangle histories and defeat clean PRs).
- Commit messages: conventional style — `feat:` / `fix:` / `chore:` / `docs:` /
  `test:` — imperative mood, with the *why* in the body.

## PR workflow

```bash
git fetch upstream --prune
git checkout -b fix/my-fix upstream/main
# ... work, commit ...
npm run check                 # must pass before every push
git push -u origin fix/my-fix
gh pr create --repo kvv256512-ux/turbo-ai --base main \
  --head <your-fork>:fix/my-fix
```

- A PR tracks its branch **live**: pushing updates the PR automatically.
  History rewrites require `git push --force-with-lease` (never plain `--force`).
- CI on fork PRs may sit in "Awaiting approval" — a maintainer must approve
  the first workflow run; that is GitHub policy, not a broken check.

## After a PR merges

```bash
git fetch upstream --prune
git checkout main && git merge --ff-only upstream/main
git branch -d fix/my-fix
git push origin --delete fix/my-fix
# rebase still-open branches onto the new main; push with --force-with-lease
```

## Local integration testing (running several open changes together)

To *run* changes that are still in review, use a local-only integration branch.
**Never push it.**

```bash
git checkout -b run main          # once
git merge fix/a feat/b            # merge everything you want to test together
npm run build
```

Refresh after fetching: `git reset --hard main`, then re-merge whatever is
still open. Delete the branch once main contains everything.

## Cross-platform rules (this repo is built from Linux *and* Windows)

- `node_modules` is **platform-specific**. After any OS switch on a checkout,
  run `npm ci` before building or testing. Never commit `node_modules`.
- Prefer `npm install` for day-to-day work (near no-op when the tree is in
  sync, and it reconciles `package-lock.json` if the two drift apart). Use
  `npm ci` when switching operating systems, after pulling changes that
  touched the lockfile, or whenever `node_modules` looks suspect — it wipes
  the tree and reinstalls exactly what the lockfile pins.
- Prefer **one native checkout per OS** over sharing a single working tree
  across WSL/Windows boundaries.
- Line endings are pinned by `.gitattributes` (LF everywhere). If `git status`
  shows the whole tree modified, **do not commit** — check `core.autocrlf`
  and run `git add --renormalize .` instead.
- `dist/` is build output; never commit it.

## Verification gate

```bash
npm run check    # tsc build + full node:test suite
```

Must pass before every push and PR. If tests fail with an esbuild
"installed for another platform" error, that is the `node_modules` rule
above — `npm ci`, not a code problem.

## When something looks wrong, suspect the environment first

| Symptom | Likely cause | Fix |
|---|---|---|
| Whole tree "modified" in git status | EOL conversion | `.gitattributes` + `git add --renormalize .` |
| esbuild platform error on build/test | `node_modules` from another OS | `npm ci` |
| Branch "diverged" from origin | stale refs after remote rewrite | `git fetch --prune`, then compare SHAs — don't guess |
| PR shows old commits | you're reading a stale local ref | check the PR on GitHub; it tracks the branch live |