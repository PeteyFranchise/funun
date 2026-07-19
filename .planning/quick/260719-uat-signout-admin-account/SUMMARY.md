---
status: complete
quick_id: 260719-uat-signout-admin-account
date: 2026-07-19
---

# Summary: Phase 12 UAT blockers fixed — sign-out path + admin provisioning

## What changed

1. **Sign-out path (blocker 1):** `components/auth/SignOutButton.tsx` already existed but was imported NOWHERE — an orphaned component. Mounted it in:
   - `components/nav/ArtistNav.tsx` — sidebar footer beneath the user/profile block, collapse-aware.
   - `app/(admin)/layout.tsx` — pinned at the bottom of the admin nav (`mt-auto`, hairline top border).
   Sign-out → `/signin` gives the switch-account path Codex's UAT needed. No new component written.

2. **Admin test account (blocker 2):** `scripts/provision-test-admin.mjs` — zero-dep Node script against the Supabase GoTrue admin API. Creates-or-promotes a user by email with `app_metadata.is_admin: true` (the exact flag lib/admin/gate.ts checks), `email_confirm: true`, generated-or-supplied password (printed once on create only), idempotent, `--demote` to undo. Secrets come from env (`set -a; source .env.local; set +a`), never hardcoded.

## Verification

- `node --check` on the script; `npx tsc --noEmit` clean; `npm run lint` clean; full `npx jest` 455/455 green.
- Visual check of both mounts is auth-gated (artist nav requires a session; admin nav requires is_admin) — deliberately left to the human UAT re-run this task exists to unblock.

## To finish the UAT unblock (human)

```bash
set -a; source .env.local; set +a
node scripts/provision-test-admin.mjs --email uat-admin@yourtestdomain.test
```
Then sign in as that user → run 12-BROWSER-UAT-CHECKLIST.md Test 2. Use the new Sign out control to switch between viewer/admin identities for Test 1's blocked-pair checks.
