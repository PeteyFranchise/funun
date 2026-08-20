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
