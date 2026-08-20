---
title: Codex Security & Architecture Audit — Verified Triage + Remediation Plan
branch: feat/lane1-catalogue-menu-help
verified: 2026-08-18
verifier: Claude (fast pass) + 4 read-only Plan subagents (deep pass)
status: awaiting owner decisions + greenlight — NO CODE CHANGED YET
---

# Verified Triage (all 16 findings)

Every finding was checked against the CURRENT branch/migrations before any change. Verdicts:
CONFIRMED · PARTIALLY-CONFIRMED · ALREADY-FIXED · SAFE-ON-CURRENT · NEEDS-OWNER-DECISION.

| # | Sev | Finding | Verdict | Fix gate |
|---|-----|---------|---------|----------|
| 1 | Crit | Split-sheet approval tokens readable by initiator | **CONFIRMED** | Migration (owner push) + app changes + tests |
| 2 | Crit | Public AI routes → unbounded cost | **CONFIRMED** | Owner decision (product + infra) |
| 3 | Crit | Vulnerable Next.js (15.5.19) | **Version confirmed; advisory UNVERIFIED offline** | Network + redeploy |
| 4 | Crit | Stale branches preserve old vulns | **Current branch SAFE**; stale branches real | Advisory (branch hygiene) |
| 5 | Med | Watermark render unreliable/duplicate/heavy | **CONFIRMED** (reliability, not security) | Code now + migration + infra |
| 6 | Med | Public Selects reactions unbounded | **CONFIRMED** (leaked-token scope) | Code + infra + migration |
| 7 | Med | In-memory rate limiter ineffective | **CONFIRMED** | Owner decision (infra) + code |
| 8 | Med | DocuSeal webhook non-atomic | **CONFIRMED** | Code now (reorder) + migration (robust) |
| 9 | Med | Stripe webhook acks failed persistence | **CONFIRMED** | Code now (no migration) |
| 10 | Med | Vault export exceeds request budget | **PARTIALLY-CONFIRMED** (bytes-in-body already fixed) | Code now + infra |
| 11 | Med | N+1 privileged lookups | **CONFIRMED** (sync-library) / low-sev (Selects) | Code now + optional migration |
| 12 | Med | Capability grant half-applied | **CONFIRMED** (blast radius = artist `roles`) | Code now (no migration) |
| 13 | Low | Lint gate broken | **CONFIRMED** (reproduced: 1 error) | Code now |
| 14 | Low | Join page stale schema key | **CONFIRMED** (`user_id` absent; `id` is PK) | Code now |
| 15 | Low | Planning doc contradicts DB hardening | **ALREADY-FIXED by migration 070** | Doc correction only |
| 16 | Low | No Sentry global-error boundary | **CONFIRMED** (no `app/global-error.tsx`) | Code now |

---

# Per-finding detail (priority order)

## 1. Split-sheet approval tokens readable by initiator — CONFIRMED (Critical)
- **Evidence:** `approval_token TEXT UNIQUE` plaintext (`018:75`); "Initiator sees all parties" is a whole-row SELECT (`018:82`, recreated `064:167`); **zero** column-level REVOKE/GRANT on `split_sheet_parties` in any migration 018→114. `/approve/[token]` treats raw token as sole auth (`route.ts:15,38`); token never rotated/consumed; `update_identity` not gated by the already-used check.
- **Threat:** initiator `GET …/split_sheet_parties?select=approval_token` via PostgREST → reads co-parties' tokens → approve/counter/`update_identity` on their behalf → sheet flips to `approved`, unlocks e-sign. Forged consent on a legal instrument.
- **Fix:** human-gated migration `REVOKE SELECT … FROM authenticated,anon` + `GRANT SELECT (safe columns)` (mirrors migration `040` for `artist_profiles`). MUST ship with app changes: `share`, `send-for-approval`, `mint-envelope` read the token via authenticated client today → switch to service-client reads after the apiClient ownership check. Defense-in-depth: session-bind claimed parties in `/approve`; consume/rotate token; gate `update_identity`.
- **Tests:** direct-PostgREST — initiator `select=approval_token` → 42501/absent (was: token); row visibility intact; app routes still work via service read. Mirror `__tests__/migration-064.test.ts`.
- **Gate:** DB migration + owner `supabase db push`. App companion ships WITH the migration (REVOKE breaks `select('*')` immediately).

## 2. Public AI routes → unbounded API-cost exhaustion — CONFIRMED (Critical)
- **Evidence:** `brief-draft/route.ts` + `brief-rerank/route.ts` have no auth, no limiter, no Turnstile; call Sonnet (`lib/buyer/brief-ai.ts:94,178`). Middleware excludes `/api`. Every OTHER AI route gates on `auth.getUser()`. Routes' own comments say "add rate-limiting before this is live."
- **Threat:** anonymous loop → drains Anthropic budget/quota, kills AI platform-wide.
- **Fix:** DEPENDS on owner decisions — (a) is unauthenticated drafting a hard product requirement? If not → gate to authenticated buyers (cheapest). If yes → Turnstile (`lib/security/turnstile.ts` exists; waitlist is the reference) + durable per-IP + global daily budget circuit-breaker.
- **Gate:** **NEEDS-OWNER-DECISION** (product: public vs auth) + infra (durable limiter — see #7).

## 3. Vulnerable Next.js — version confirmed; advisory UNVERIFIED offline
- **Evidence:** lockfile resolves `next@15.5.19`; `package.json` `^15.0.0`. The "July 2026 GHSA ≥15.5.21" claim is past my knowledge cutoff and npm timed out for Codex — I could not independently confirm the advisory.
- **Fix:** confirm latest patched 15.x via `npm view next versions`, bump to the patched release, regenerate lockfile, run full tsc/lint/build/tests, redeploy.
- **Gate:** network (npm) + redeploy coordination. Low-risk hygiene IF advisory real; needs confirmation first.

## 4. Stale branches preserve old vulns — current branch SAFE
- **Evidence:** current `curator-reach/route.ts:17` fails closed (`!process.env.CRON_SECRET || …`). The `Bearer undefined` bypass + old DM code + unescaped pitch HTML exist only on the named STALE branches, not here.
- **Fix (advisory, per your rule #9):** archive/protect obsolete branches; DO NOT deploy/merge them; backport fixes into any that must stay active; make CI reject refs missing authorization tests. No current-branch code change.
- **Gate:** owner branch-hygiene decision (list below).

## 5. Watermark render unreliable/duplicate/heavy — CONFIRMED (reliability)
- **Evidence:** `void renderPreviewIfAbsent(...)` unawaited (`signed-url.ts:40`, `download/route.ts:132`); no `after()`/`waitUntil` anywhere; status derived only from bucket-file existence (no job table); duplicate renders on concurrent views; 2× whole-file buffering. Security path is solid + unit-tested.
- **Fix:** code-now — wrap in Next 15 `after()` + atomic per-track claim. Migration — small `selects_preview_renders` state table (pending/processing/ready/failed). Infra — durable background-job worker (real fix).
- **Gate:** code portion now; state table = migration; worker = infra decision. Founder-scale severity: low-med now.

## 6. Public Selects reactions unbounded — CONFIRMED (leaked-token scope)
- **Evidence:** `viewerKey` client-supplied, length-check only (`react/route.ts:26`); written via `createServiceClient()` (bypasses RLS); uniqueness per-viewerKey (`111_selects.sql:133`) → fresh key each request = new row, no cap/retention.
- **Fix:** signed HttpOnly server cookie for viewer identity (code); durable per-token/per-IP limit (infra, same as #7); per-token retention cap (migration — DB trigger/constraint, app-count is racy); optional Turnstile.
- **Gate:** code (cookie) now; limit = infra; cap = migration.

## 7. In-memory rate limiter ineffective — CONFIRMED
- **Evidence:** `lib/security/rate-limit.ts:27` process-local Map; no global TTL sweep (unbounded growth); per-instance + cold-start reset; `getClientIp` trusts leftmost `x-forwarded-for` (spoofable). Used in waitlist/signup/invite/register. Self-documented "beta accepted risk."
- **Fix:** durable atomic limiter — owner chooses store (Postgres SECURITY DEFINER RPC per `upsert_*` convention vs Redis/Upstash/Vercel KV). Code sub-fixes: bound Map growth; prefer Vercel `x-real-ip` (needs deploy-topology confirm).
- **Gate:** **NEEDS-OWNER-DECISION** (store) + NEEDS-OWNER-INFO (trusted header). This unblocks #2 and #6.

## 8. DocuSeal webhook non-atomic — CONFIRMED
- **Evidence:** check-then-act (`route.ts:415`), unconditional terminal flip after expensive work (`:509`), ignored write results (`:546,:553,:581,:612`), no event-id dedup, fan-out rows no dedup key. Concurrent delivery → duplicate locker rows + notifications; partial-failure-after-flip → permanent inconsistency, still returns 200.
- **Fix:** code-now — reorder signer/sheet/fan-out BEFORE the completed flip + check every result + 5xx on failure (matches route's own doctrine at `:45`). Robust — `complete_split_sheet_envelope` SECURITY DEFINER RPC (atomic claim via `xmax=0` idiom from migration 101) + partial unique index on `vault_documents` + notification outbox.
- **Tests:** extend `__tests__/docuseal-webhook.test.ts` — concurrent delivery, failure-after-first-mutation (assert 5xx + not flipped), replay consistency.
- **Gate:** reorder+checks now (no migration); robust = migration.

## 9. Stripe webhook acks failed persistence — CONFIRMED
- **Evidence:** select error unchecked (`route.ts:56`), both update results discarded (`:65,:79`), returns 200 unconditionally (`:92`). Transient DB error → paid deal stuck unpaid / stale Connect state, no retry.
- **Fix (no migration):** check `{error}` on select + both updates; return retryable 5xx when a required write errors; 200 only once persistence confirmed. Idempotency already value-safe (checkout guarded by `payment_status!=='paid'`). Optional: `stripe_webhook_events` dedup table.
- **Tests:** new `__tests__/stripe-webhook.test.ts` — transient select failure → 5xx; update failures → 5xx; already-paid replay → 200 no-op.
- **Gate:** code now. Clean.

## 10. Vault export exceeds request budget — PARTIALLY-CONFIRMED
- **Evidence:** "returns bytes in body" is a strawman — it streams to Storage + returns a signed URL (already good). REAL: runs inline under `maxDuration=10`; buffers all files in memory before finalize (`:152-163`); size gate sums DB metadata not storage, and **stems/instrumental sizes are client-provided/uncapped** (the real undercount); object sizes not resolved up front.
- **Fix:** code-now — resolve real object sizes via Storage `list()` before accepting the job (reject over threshold); count share MP3 from `tracks.audio_file_size`; lower `MAX_PACK_BYTES`. Infra — move assembly to background worker (converges with #5).
- **Gate:** code now; worker = infra decision.

## 11. N+1 privileged lookups — CONFIRMED (sync-library) / low-sev (Selects)
- **Evidence:** `sync-library/page.tsx` two unbounded `getUserById` `Promise.all` loops (`:161`, `:191`, pool up to 300), duplicate lookups, no cache/batch, `force-dynamic` (re-runs every load). Selects page adder loop is deduped/bounded (low-sev). Pattern recurs at ~20 call sites.
- **Fix:** code-now — request-scoped identity cache + concurrency cap + `auth.admin.listUsers` batch for sync-library. Durable — denormalize `email` onto `user_profiles` (migration + backfill + sync path) for all ~20 sites.
- **Gate:** code now; read-model = migration + infra.

## 12. Capability grant half-applied — CONFIRMED
- **Evidence:** `grant.ts:32` inserts approved grant first; `:60` profile update result ignored, non-transactional; unique index `capability_grants_active_uniq` (`042:38`) → retry 23505 trap. Live blast radius = artist `roles` badge (industry approve route `approve/[grantId]/route.ts:72` already orders correctly — the reference to copy).
- **Fix (no migration):** reorder `grantCapability` to profile-update-first (checked, throw on error) then grant insert, mirroring the approve route. Robust — `grant_capability_atomic` RPC.
- **Tests:** prime `user_profiles.update` → `{error}` → assert throws + no approved grant row persists; retry then succeeds (no 23505 trap). Cover artist + industry.
- **Gate:** code now.

## 13. Lint gate broken — CONFIRMED
- **Evidence:** `npm run lint` → 1 error: `@typescript-eslint/no-var-requires` rule not found at `__tests__/playbook-digest.test.ts:72` (disable directive references a rule this ESLint config doesn't load).
- **Fix:** remove the obsolete `// eslint-disable-next-line` directive (the rule isn't active, so `require()` isn't flagged). Re-run lint → clean.
- **Gate:** code now — **do FIRST** so lint is a green gate for every subsequent fix.

## 14. Join page stale schema key — CONFIRMED
- **Evidence:** `join/[inviteToken]/page.tsx:74` `.eq('user_id', …)` on `user_profiles` — PK is `id` (`053`); no `user_id` column; 0/112 other queries use `user_id`; error swallowed → inviter identity silently blank.
- **Fix:** `.eq('id', invite.inviting_user_id)` + handle error. **Tests:** integration — valid invite renders inviter identity.
- **Gate:** code now.

## 15. Planning doc contradicts DB hardening — ALREADY-FIXED
- **Evidence:** migration `070_readiness_definer_privilege_sweep.sql:59-63` already made `calculate_vault_readiness()` SECURITY DEFINER + `search_path=''` + restricted EXECUTE. The pending todo I filed earlier today (based on the pre-070 debug note) is the stale artifact.
- **Fix:** delete `.planning/todos/pending/2026-08-18-vault-readiness-security-invoker-latent-rls-risk.md`; note 070 in the archived debug session. Verify 070 applied (070 < 114 applied → almost certainly live; confirm via `supabase migration list`).
- **Gate:** doc correction only.

## 16. No Sentry global-error boundary — CONFIRMED
- **Evidence:** no `app/global-error.tsx`; build warns.
- **Fix:** add `app/global-error.tsx` with root html/body + `Sentry.captureException` + `NextError`. **Tests:** controlled error → captured.
- **Gate:** code now.

---

# Decisions needed from owner (these block the top-priority items)

1. **#2 — Public AI routes:** Is unauthenticated brief-draft/rerank a hard product requirement? (Gate to authenticated buyers = cheapest durable fix. If must stay public → Turnstile + budget breaker.)
2. **#2/#6/#7 — Durable rate-limiter store:** Postgres atomic-counter RPC (no new infra, fits `upsert_*` convention) **vs.** Redis/Upstash/Vercel KV (new dependency)?
3. **#5/#10 — Background-job infra:** approve a durable worker (Supabase queue / Vercel Cron worker / QStash)? Both converge on this one decision.
4. **#3 — Next.js bump:** OK to confirm the patched 15.x via npm and bump + redeploy?
5. **#4 — Stale branches:** which of the listed branches are dead (archive/protect) vs. must stay active (backport)?
6. **Migration pushes:** #1 (and the robust forms of #8/#5/#6/#11) need owner-run `supabase db push` — same human-gated flow as your other migrations.

# Proposed execution order (code-only first, no decisions needed)

Each = its own atomic commit + tests + tsc/lint/build, per your rules.

- **A. #13 lint** (green the gate first)
- **B. #9 Stripe result-checks + 5xx** (data-integrity, pure code)
- **C. #12 grant reorder** (mirror the correct approve route)
- **D. #8 DocuSeal reorder + result-checks** (ship-now portion; robust RPC deferred to migration batch)
- **E. #14 join key + #16 global-error + #15 todo correction** (small)
- **F. #11 sync-library identity cache + concurrency cap + batch** (cheap win)
- **G. #10 up-front size resolution + share-size count** (cheap win)
- **H. #1 authored** — migration + coordinated app changes + tests, tolerating the pre-push window (top critical; completes on your push)

Decision-gated (after your input): #2, #7 core, #6 core, #5 worker, #10 worker, #11 read-model, #3, #4.
