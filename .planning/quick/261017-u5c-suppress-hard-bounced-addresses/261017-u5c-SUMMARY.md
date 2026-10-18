---
phase: quick-261017-u5c
plan: 01
status: complete-pending-owner-migration
requirements: [GH-190]
commits:
  - 1d336580 feat(email): add email_suppressions table for hard-bounced addresses
  - 3d19b6b6 fix(webhooks): record Resend hard bounces in email_suppressions
  - 751b1750 fix(email): skip hard-bounced recipients in sendEmail
---

# Quick 261017-u5c: Suppress hard-bounced addresses (GH #190)

migration 246 is authored and committed but **NOT applied**. Nothing was pushed.

## What changed

- `supabase/migrations/246_email_suppressions.sql`: service-role-only `public.email_suppressions` (email PK with normalized CHECK, reason, source_event_id, created_at; RLS on, zero policies, REVOKE ALL).
- `app/api/webhooks/resend/route.ts`: a verified HardBounce for any address upserts the normalized recipient into `email_suppressions` (`onConflict: 'email', ignoreDuplicates: true`, `source_event_id` = svix-id). 500 on failure so Resend retries.
- `lib/email/index.ts`: `sendEmail` filters suppressed recipients after the config gate. All suppressed returns `{ ok: false, error: 'Recipient suppressed', suppressed }`; mixed lists send to the rest. Lookup fails open with a Sentry report (no address in payload). `to` widened to `string | string[]`.

## Deviation from plan (orchestrator override)

Write order in the webhook is reversed from the plan. The existing `curators.email_valid = false` update (and its 500-on-error) runs FIRST, unchanged. The `email_suppressions` upsert runs SECOND and returns 500 on error. Reason: until the owner applies the migration the suppression write fails, and suppression-first would have broken curator invalidation too (a regression). Both writes are idempotent, so a Resend retry redoes them safely. A test asserts the curator update still happens when the suppression write fails. The not-in-curator-directory case still returns `{ ok: true, ignored: true }`, but only after the suppression write succeeds.

Other deviations: none. Branch is the worktree branch, not `fix/audit-2026-10` as the plan text says.

## Deploy safety before the migration is applied

- Webhook: hard bounces return 500 until the table exists, so Resend keeps retrying and no bounce is lost. Curator invalidation keeps working meanwhile.
- `sendEmail`: lookup fails open (Sentry `feature: email`, `operation: suppression-lookup`), so mail keeps flowing. Expect Sentry noise on every send until the migration is applied.

## Owner step: apply migration 246

Apply `supabase/migrations/246_email_suppressions.sql` via the normal path (`supabase db push` against production, or paste into the Supabase SQL editor), then verify:

```sql
select relrowsecurity from pg_class where oid = 'public.email_suppressions'::regclass;  -- expect true
select count(*) from pg_policies where tablename = 'email_suppressions';                 -- expect 0
```

## Optional: backfill existing curator bounces

Curators already marked `email_valid = false` are not copied into the table (out of scope). If wanted:

```sql
insert into public.email_suppressions (email, reason)
select lower(btrim(email)), 'hard_bounce'
from public.curators
where email_valid = false and email is not null
on conflict do nothing;
```

## Verification

- Target tests: `migration-246-email-suppressions` (7), `rls-helper-callsites` + `beta-security-migration-harness` (51 passed, 0 failed combined with the 243 file), webhook route (10), `lib/email/index` (10). All green.
- RED confirmed before each GREEN (migration test: file missing; webhook: 4 failing; email: 5 failing).
- Full `npm test`: 666 suites passed, 8358 tests passed, 0 failed.
- `npm run lint` (max-warnings=0): exit 0, clean.
- `npm run typecheck:strict`: exit 0, clean.
- Em dash check: 0 in the migration, 0 in added lines of changed files.

## Known stubs

None.

## Self-Check: PASSED

All three commits exist on the worktree branch; migration, webhook and email files present.
> Renumbered to 246 on 2026-10-18 because 245 (private documents bucket) is applied first.
