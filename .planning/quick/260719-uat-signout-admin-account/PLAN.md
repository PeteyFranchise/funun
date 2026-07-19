---
quick_id: 260719-uat-signout-admin-account
date: 2026-07-19
source: Codex Phase 12 UAT execution notes (12-BROWSER-UAT-CHECKLIST.md, 2026-07-19)
---

# Quick Task: Fix Phase 12 UAT blockers — sign-out path + admin test account

Codex's UAT pass found two blockers: (1) the app has no sign-out/switch-account
path — `components/auth/SignOutButton.tsx` exists but is imported NOWHERE
(orphaned since some earlier wave); (2) no admin test account exists, and admin
is gated on `app_metadata.is_admin === true` (lib/admin/gate.ts), which no UI
can set — only the service role can.

## Tasks

1. Mount `SignOutButton` in the artist sidebar footer (`components/nav/ArtistNav.tsx`,
   under the user footer, collapse-aware) and in the admin sidebar
   (`app/(admin)/layout.tsx`, bottom of nav). No new component — wire the orphan.
2. Add `scripts/provision-test-admin.mjs` — zero-dep Node script (repo spike
   conventions): reads `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
   from env, takes `--email` (+ optional `--password`, else generates one and
   prints it), creates-or-updates the user via the Supabase Admin REST API with
   `email_confirm: true` and `app_metadata.is_admin: true`. Idempotent —
   re-running promotes an existing user. Secrets never hardcoded/committed.
3. Verify: tsc, lint, full jest; mount check via grep.

## Out of scope

Running the provisioning script against any live database (human runs it with
their env), in-place account *switching* UI (sign-out → sign-in covers UAT).
