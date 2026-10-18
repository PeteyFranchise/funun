---
phase: quick-261017-u5c
plan: 01
status: complete-pending-owner-migration
requirements: [GH-190]
commits:
  - 1d336580 feat(email): add email_suppressions table for hard-bounced addresses
  - 3d19b6b6 fix(webhooks): record Resend hard bounces in email_suppressions
  - 751b1750 fix(email): skip hard-bounced recipients in sendEmail
  - f2544fc3 fix(webhooks): act on Resend's documented bounce shape and suppress complaints
  - 8391e20a fix(email): stop re-minting invites for suppressed waitlisters and add an un-suppress route
---

# Quick 261017-u5c: Suppress hard-bounced addresses (GH #190)

migration 246 is authored and committed but **NOT applied**. Nothing was pushed.

## What changed

- `supabase/migrations/246_email_suppressions.sql`: service-role-only `public.email_suppressions` (email PK with normalized CHECK, reason, source_event_id, created_at; RLS on, zero policies, REVOKE ALL).
- `app/api/webhooks/resend/route.ts`: a verified permanent bounce (Resend `bounce.type` "Permanent"; the original draft looked for "HardBounce", see "Review fixes") for any address upserts the normalized recipient into `email_suppressions` (`onConflict: 'email', ignoreDuplicates: true`, `source_event_id` = svix-id). 500 on failure so Resend retries.
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

## Review fixes (adversarial review follow-up)

Commits: f2544fc3 (webhook, sendEmail, shared normalizer), 8391e20a (broadcast, un-suppress route). Migration 246 stays unapplied; only its comments changed.

1. **Blocker, wrong bounce type.** Resend's documented `email.bounced` payload (https://resend.com/docs/webhooks/emails/bounced) puts the class in `data.bounce.type` ("Permanent", with `subType` such as "Suppressed"), not "HardBounce". The route now treats "Permanent" (case-insensitive) and the legacy "HardBounce" as hard bounces and ignores everything else. This also repairs the pre-existing `curators.email_valid` write, which had never fired against real traffic. The invented flat `data.bounce_type` / `data.email` fields are gone from `ResendWebhookEvent`, and the webhook tests now use payloads copied from Resend's documented examples. Signature verification is untouched. Every "HardBounce" comment (route, `resend-verify.ts`, migration 246 comments, this summary) was updated to match.
2. **Broadcast re-minting.** No existing `artist_waitlist` column fits honestly (`notified_reopen_at` means delivered, `unsubscribed_at` means opted out), so the suppression list is the terminal state. The route pre-filters suppressed addresses (normalized, chunks of 100, fail-open) before any claim or mint, and a late `Recipient suppressed` result releases the claim and counts as `skipped`. Response and audit entry now carry `skipped`.
3. **Un-suppress.** `DELETE /api/admin/email-suppressions` with JSON body `{ "email": "..." }`: `requireStaff(['leadership'])`, `checkRateLimit` fail-closed (20/min per staff user), normalized delete, 404 if not suppressed, audit entry `email_suppression.remove` without the address. Equivalent SQL for the owner:

   ```sql
   delete from public.email_suppressions where email = lower(btrim('someone@example.com'));
   ```
4. **One normalizer.** `normalizeEmailAddress` lives in `lib/email/suppression.ts` (re-exported from `lib/email`) and is used by `sendEmail`, the webhook, the broadcast pre-filter and the un-suppress route. The webhook test covers a display-name `to`.
5. **Multi-recipient events.** An event whose `to` has anything other than exactly one entry suppresses nothing and reports to Sentry with tags only (`ambiguous-recipients`, event type, recipient count). Comment explains why guessing would suppress the wrong address.
6. **Idempotency key caveat** documented on `sendEmail`'s `idempotencyKey` doc. No caller passes an array with a key today.
7. **`email.complained`** suppresses the address with reason `complaint` through the same write path (500 plus Sentry on failure). It does not touch `curators.email_valid`. Table CHECK only requires a non-empty reason, so no migration change was needed.
8. **Sentry hygiene.** `sendEmail` reports a suppression-lookup failure at most once a minute per instance (`resetSuppressionLookupReportThrottleForTests` exported). Webhook 500s (curator or suppression write) report via `captureMessage` with tags only (`resend-webhook`, operation, event type, pg code).

Review-fix verification: `npm run security:migrations:verify` PASS; `npm test` 674 suites, 8590 tests, 0 failed; `npm run lint` clean (max-warnings=0); `npm run typecheck:strict` clean.

## Known stubs

None.

## Self-Check: PASSED

All three commits exist on the worktree branch; migration, webhook and email files present.
> Renumbered to 246 on 2026-10-18 because 245 (private documents bucket) is applied first.
