# Branch cleanup — pre-classification for owner confirmation (audit #4)

Codex flagged ~13 stale branches carrying already-fixed vulnerabilities (old DM
flow, cron `Bearer undefined`, unescaped pitch HTML). The real exposure: Vercel
preview-deploys every *pushed* branch, and any of these could be merged by
mistake. **The current branch (`feat/lane1-catalogue-menu-help`) is clean.**

Classification is by "commits not in `origin/main`":
- **0 unique** = fully merged → the work is in main, safe to delete.
- **>0 unique** = commits not literally in main — almost always because the PR was
  **squash-merged** (work IS in main under new hashes) or the branch is a
  superseded phase/experiment. Confirm you have nothing on these you still want.

**Nothing is deleted until you confirm this list.**

---

## KEEP
- `main` (→ enable branch protection: require PR + review before merge)
- `feat/lane1-catalogue-menu-help` (current work)

## DELETE — fully merged into main (safe; work preserved)
- `codex/phase-26-sync-library`
- `codex/phase-23-buyer-onboarding`
- `codex/phase-11-presence-messaging`
- `codex/review-fixes-batch1`
- `codex/review-fixes-batch2`
- `codex/reconcile-main-2026-08-07`
- `phase-8-identity-schema-foundation`

## DELETE — stale PR / phase / experiment (squash-merged or superseded)
Old completed PRs and phase branches — their diffs are in main; the branches are dead history. **`codex/phase-10-connections-notifications` [42] is a Codex-flagged vuln branch** (old DM code) — highest priority to remove.
- `codex/phase-10-connections-notifications` [42]  ← flagged vuln
- `codex/phase09-verification-docs` [1]  ← flagged vuln
- `codex/close-completed-prs` [1]  ← flagged vuln
- `codex/phase12-security-review-fixes` [1]
- `pr/phase-20-profile-rename` [4] · `uat/phase-20-cutover-smoke-test` [1]
- `test/phase-11-messaging-e2e` [4] · `test/phase-14-playback-uat-e2e` [2] · `test/phase-21-rls-smoke` [1]
- `phase-14-playback-room-refinement` [1]  ← flagged vuln
- `feat/split-sheet-delete-draft` · `feat/collaborator-invite-resend` · `feat/collaborator-card-redesign`
- `fix/collaborator-card-size` · `fix/collaborator-card-frame` · `fix/sidebar-nav-order`
- `style/split-sheets-brand-polish`

## CONFIRM before deleting
- `connect-funun-studio-domain` [1] — sounds like production-domain config. Verify it's not a reference you still need before removing.

## LOCAL-ONLY branches (not on origin → no preview exposure; delete for hygiene)
`phase-27-cutover-corrective`, `pr/phase-19-profile-cleanup`, and the `claude/*`
session branches (`hungry-hellman`, `nostalgic-poincare`, `dazzling-swartz`,
`interesting-williamson`, `fervent-driscoll`, `cool-villani`, `elated-kilby`,
`bold-mestorf`, `sleepy-booth`, `adoring-morse`, `compassionate-morse`,
`modest-noyce`, `stoic-torvalds`).

---

## Execution (once you confirm)
Remote delete: `git push origin --delete <branch>` (per branch).
Local delete: `git branch -D <branch>`.
Then: enable **main branch protection** in GitHub (Settings → Branches) — require a
PR + passing checks before merge, so a stale branch can never fast-path to prod.

Recommendation: delete everything above except the two KEEP branches; double-check
only `connect-funun-studio-domain` first.

---

## EXECUTED — 2026-08-20

Re-verified live before deleting (counts = commits not in `origin/main`); owner
confirmed each tier.

- **Deleted 25 remote** branches (all of `origin/*` except `main` +
  `feat/lane1-catalogue-menu-help`) — Tier 1 (7 fully-merged) + Tier 2
  (~16 squash-merged/superseded) + the flagged `codex/phase-10-connections-notifications` [42].
- **Deleted 40 local** branches (all local except the 5 KEEP below).
- **Salvaged** `connect-funun-studio-domain`'s only unique content —
  `docs/DOMAIN-SETUP.md` — via cherry-pick onto `feat/lane1-catalogue-menu-help`
  (`e7470d8`, pushed) before deleting the branch.
- **KEPT (owner choice):** `main`, `feat/lane1-catalogue-menu-help`, and three
  local-only branches held for later review — `backup/local-main-pre-reset-20260713-0739`
  [44], `codex/harden-document-token-workflows` [4], `gsd-reviewfix/10-80913` [48]
  (uncertain merge status around the 2026-07-13 main reset).

Deleted branch SHAs are in the deletion output (git reflog / GitHub) — recoverable
short-term if any is ever needed.

### Still owner-pending
- **Enable `main` branch protection** (GitHub → Settings → Branches): require a PR
  + passing checks before merge, so a stale branch can never fast-path to prod.
  This is the remaining half of audit #4 and can't be done from the CLI here.
