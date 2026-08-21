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

---

# Owner Decisions (2026-08-20)

| # | Decision | Implication / next build |
|---|----------|--------------------------|
| **#2** public AI | **Require sign-in** on brief-draft/rerank (for now). | Code-only auth gate. Re-deliberate → public+Turnstile+cap if traffic grows (todo `2026-08-20-revisit-public-ai-drafting-access.md`). |
| **#7/#6** limiter store | **Postgres/Supabase** — counter table + atomic SECURITY DEFINER RPC. | Migration + rewrite `lib/security/rate-limit.ts` (durable, bounded, trusted-IP). Then #6 rides it. No new vendor/cost. |
| **#5/#10** heavy work | **Build the durable worker now.** | Background-job system (proposed: a `jobs` table + a Vercel Cron worker route, reusing existing infra — confirm mechanism at build). Wire watermark render (#5) + export assembly (#10) to it. Migrations. |
| **#3** Next.js | **Bump to patched 15.5.x.** | Verify latest patched version, bump + lockfile, full checks; owner redeploys. Needs registry access. |
| **#4** stale branches | **Archive dead + protect main.** | Claude pre-classifies the ~13 flagged branches; owner confirms kill-list; delete/rename dead ones + enable main branch protection. Owner runs deletions (or Claude against a confirmed list). |
| **#1/#16** deploy verify | **Scripts + checklist.** | `verify-115` adversarial PostgREST script (mirrors verify-064) + post-deploy checklist for #16 / Sentry live-exception / Better Stack `/api/health`. |

## Migrations this will produce (all owner-gated `supabase db push`)
- `115` split_sheet_parties token privacy — **authored** (`e1545d1`), pending push (atomic with the #1 app deploy).
- rate-limit counter table + RPC (#7).
- Selects-reaction retention cap (#6).
- background `jobs` + render-status tables (#5/#10).
- (robust forms of #8/#12 atomic-claim RPCs — optional hardening, deferred.)

Recommend batching these pushes into one coordinated deploy window.

---

# Remediation Results — code-only batch (2026-08-18)

Each fix = its own atomic commit + regression test + tsc/lint/build. All green.

| # | Commit | Shipped | Tests |
|---|--------|---------|-------|
| 13 | `e95281f` | Drop obsolete no-var-requires disable → lint gate green | lint 0, digest 9/9 |
| 9 | `6183d73` | Stripe webhook returns retryable 503 on failed persistence; legit 200 no-ops preserved | new suite 10/10 |
| 12 | `365d54b` | grantCapability: profile badge first + error-checked, then grant insert (no half-apply / 23505 trap) | 12/12 |
| 8 | `1d89a33` | DocuSeal: persist signers/sheet/fan-out (checked, 5xx) before the completion flip | 21/21 |
| 14 | `2638a7e` | join page queries user_profiles by `id` (not nonexistent `user_id`) + explicit error handling | tsc + build |
| 16 | `f8271c9` | `app/global-error.tsx` Sentry boundary for root render failures | 2/2 |
| 15 | `5e05f3a` | Close stale SECURITY INVOKER todo (070 already fixed); annotate archived debug note | doc |
| 11 | `e875079` | `attachUserEmails` — dedup + concurrency-cap + request-cache; kills sync-library N+1 | 4/4 |
| 10 | `2c8f2c1` | Export size gate resolves REAL Storage bytes (not client-provided metadata) | 3/3 |
| **1** | `e1545d1` | **Migration 115 (column-privilege lockdown) + service-role token reads in 4 files** — approval_token no longer readable by the authenticated client | migration 5/5, 264 split-sheet tests, build |

Two full production builds passed (integrity cluster @ `1d89a33`, small+perf clusters). `.claude/launch.json` never touched.

## #1 (split-sheet token disclosure) — AUTHORED (`e1545d1`), pending atomic push+deploy

Investigation expanded the blast radius beyond the report's 3 routes. The column REVOKE breaks EVERY authenticated `split_sheet_parties(*)` read:

- **Migration:** `REVOKE SELECT ON split_sheet_parties FROM authenticated, anon` + `GRANT SELECT (<19 safe columns>) TO authenticated` — all columns EXCEPT `approval_token` (base 018 + `first_viewed_at` from 062 + `legal_name/publishing_designee/administrator` from 063). Mirrors migration 040. anon gets nothing (/approve uses service role).
- **App companion (must ship WITH the migration):**
  - `share/route.ts:34`, `send-for-approval/route.ts:30`, `mint-envelope/route.ts:124` — these NEED the token → ownership-check via apiClient, then read the token via `createServiceClient()`.
  - `lib/split-sheets/list.ts:83,102` — `split_sheet_parties(*)` ×2 (the dashboard/list read) → narrow to explicit safe columns (no token needed).
  - `[id]/route.ts:122` already selects explicit safe columns → unaffected.
- **Tests:** direct-PostgREST — initiator cannot select `approval_token` (42501/absent) post-migration; row visibility intact; app routes still function via service reads. Mirror `migration-064.test.ts`.
- **Coupling:** migration + app changes must deploy ATOMICALLY (owner `supabase db push` + app deploy together) — either alone 42501s every split-sheet read in prod. Defense-in-depth (session-bind claimed parties, consume/rotate token) is additive follow-up.

---

# Remediation Results — Phase 5+ (post-batch, 2026-08-20)

The decision-gated findings, built after the 6 owner decisions. Each = its own atomic commit + regression tests + tsc/lint; production build green at each cluster. `.claude/launch.json` never touched.

| # | Commit(s) | Shipped | Migration | Tests |
|---|-----------|---------|-----------|-------|
| 2 | `3edb491` | Public AI brief-draft/brief-rerank now require sign-in (closes unbounded Anthropic-cost abuse) | — | auth suite |
| 3 | `308166a` | Next.js `^15.5.23` (patched 15.5 line; 15.5.23 in lockfile) | — | build |
| 4 | `e3a2360` | Stale branches pre-classified (KEEP/DELETE/CONFIRM) in `BRANCH-CLEANUP.md` | — | doc — **awaits owner confirm before deletion** |
| 7 | `27e1316` | Durable Postgres rate limiter (`check_rate_limit` RPC, advisory-locked) replaces per-instance in-memory Map; `getClientIp` hardened against XFF spoofing | **116** | limiter + 6 route suites |
| 6 | `3699544` | Selects reactions rate-limited (per token+ip / per token) + DB per-track cap (trigger) — leaked-link flood bounded | **117** | react-ratelimit + migration 117 |
| 1 | `dec6dc1` | Adversarial verify-115 PostgREST script + `POST-DEPLOY-CHECKLIST.md` | (115) | script |
| **5 / 10** | `e11f786`, `70c77c1`, `55d7a48` | **Durable background-job worker** (see below) | **118** | queue/handlers/run/worker + export route/status + preview-queue |

## #5 / #10 — Durable job worker — BUILT (`e11f786` → `55d7a48`), worker deploy-gated on Vercel Pro

Owner chose **graceful fallback** (features keep working pre-Pro; decouples the #1 deploy from the Pro upgrade) + **Vercel Pro** as the worker mechanism.

- **Foundation (`e11f786`):** migration 118 — `jobs` table + `claim_next_job()` RPC (`FOR UPDATE SKIP LOCKED` so overlapping workers never double-claim; partial unique index on `dedup_key` for idempotent enqueue; service-role only, RLS on + REVOKE ALL). `lib/jobs/queue.ts` (enqueue/claim/complete/fail/getJob), `lib/jobs/handlers.ts` (type→handler registry, dynamic-import deps), `lib/jobs/run.ts` (shared claim→dispatch loop), `app/api/cron/process-jobs` (CRON_SECRET-guarded worker). Ships deploy-safe — nothing enqueues until #5/#10 wire.
- **#5 (`70c77c1`):** watermark preview render moved off the fire-and-forget `void renderPreviewIfAbsent`. `queuePreviewRender` enqueues ONE idempotent per-track job (dedup index = the atomic per-track claim) AND drains it inline via Next `after()` for pre-Pro reliability; the worker is the durable backstop. `after()` + worker share `claim_next_job`'s SKIP LOCKED → renders exactly once.
- **#10 (`55d7a48`):** export assembly extracted to `lib/vault/export-assemble.ts` (`loadExportPlan` + `assembleAndUploadPack`). Route branches: ≤80MB inline (unchanged UX), >80MB enqueues a `vault_export` job + returns `{queued,jobId}`; the client polls the ownership-checked `./export/status`, which mints a FRESH signed URL from the pack path. Handlers dynamic-import archiver/PDF deps so the registry stays light on the hot watermark path.
- **Deploy gate:** migration 118 pushes safely anytime (jobs just queue). The worker needs Vercel Pro + a sub-daily `vercel.json` cron for `/api/cron/process-jobs` (rejected on Hobby) — see `POST-DEPLOY-CHECKLIST.md` item 5. Pre-Pro: previews render (via `after()`), small exports inline; large exports queue but complete only once Pro is live (no regression — they hard-timed-out before).

## Remaining owner actions (not code)

- **#1 + migrations:** atomic `supabase db push` of **115/116/117/118** + deploy this branch together (115's app companion 42501s split-sheet reads if the migration lags). Then run the checklist.
- **Vercel Pro:** upgrade + add the process-jobs cron (checklist item 5) to activate the #5/#10 worker.
- **#4:** ✅ branches cleaned up 2026-08-20 (25 remote + 40 local deleted; domain runbook salvaged; 5 KEEP retained — see `BRANCH-CLEANUP.md`). Remaining: enable `main` branch protection in GitHub Settings (CLI can't).
- **npm audit:** 8 vulns (7 high, 1 critical) surfaced during #3 — decide upgrade/accept out of band.
