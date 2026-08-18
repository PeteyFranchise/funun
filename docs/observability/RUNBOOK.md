# Incident Response Runbook

**Owner:** Pete (pete@funun.studio) — D-13, founder-led, no dedicated backup yet.
**Scope:** How to triage a production incident, correlate a user report to its cause, roll back safely, communicate degraded service, and run a post-incident review. This doc contains **no destructive-recovery, DB-reset, or migration-repair instructions** — those live behind `docs/BREAK-GLASS.md` only, and this doc references (never duplicates) that procedure.

> **Tabletop-validated 2026-08-18** (32-10 Task 3). Walked end-to-end against a simulated `/sync/catalog` 5xx after a deploy that also shipped a DB migration; the schema-ahead §3a caveat correctly steered the decision to a forward fix over a rollback. **Note:** the Sentry-based steps in §1/§2 become fully usable once 32-06's Sentry setup is live (deferred); until then, use the time-window/route fallback in §2.

---

## 1. Where an incident originates — origin triage

Work top-down. Each row is "check here first" for that origin.

| Suspected origin | Check first | Signal |
|---|---|---|
| **Vercel** (hosting/functions/edge) | Vercel dashboard → Observability → Errors / Functions / Latency | 5xx spike, `FUNCTION_THROTTLED` events, elevated p95, a failed/rolled deployment banner |
| **Supabase** (DB/Auth/Storage/API) | Supabase dashboard → Project → Database → Reports; Auth logs; API logs | CPU/connections/disk spikes, Auth failure spike, PostgREST 5xx, slow-query outliers |
| **Application code** | Sentry (server + browser), release timeline | A new error signature appearing right after a deploy, correlated with a specific release/commit |
| **DNS** | `dig www.funun.studio` / `dig funun.studio`, registrar + Vercel domain config | Resolution failure, unexpected A/CNAME record, apex→www redirect broken |
| **Auth** (Supabase Auth) | Supabase Auth logs, `middleware.ts` behavior on protected routes | Elevated `401`/`403`, signup/signin failures, `handle_new_user()` trigger errors |
| **Storage** (Supabase Storage buckets) | Supabase dashboard → Storage; upload/signed-URL error rate | Upload failures, expired/broken signed URLs, bucket quota errors |
| **External provider** (Anthropic, Stripe, Resend, Better Stack, Sentry itself) | The provider's own status page; Funūn logs for the specific integration call | Provider status page shows an incident; Funūn-side errors are all scoped to one integration (e.g. only `lib/email` calls fail) |

**Start with the external uptime monitor first** (Better Stack, R3 — see `docs/observability/UPTIME-MONITORING.md` once Plan 07's checkpoint is complete): if it fired, that already tells you whether the *whole* site is down (points to Vercel/DNS) or a specific route is failing (narrows the search). A monitor hosted on Vercel cannot report a Vercel-wide outage, which is exactly why an external check is the first read, not Vercel's own dashboards.

---

## 2. Correlating a user report → correlation ID → deployment

1. **Get the correlation ID from the user report.** Every request carries (or is assigned) a value under the `x-correlation-id` header (`lib/logging/correlation.ts`, `getOrCreateCorrelationId()`). If the user can share it (e.g. from a support widget, a bug-report screenshot showing response headers, or an error page that displays it), that's the fastest path. If not, narrow by timestamp + route + user-described symptom instead.
2. **Find the log line.** Search Vercel logs (or the structured-logging sink, once wired) for that correlation ID. The log line records operation/route/status/duration/safe identifiers for that request.
3. **Find the matching Sentry event.** The same correlation ID appears on the request's Sentry event (server or browser) — R6's guarantee is that the log line and the error-monitor event share **one value**, so searching Sentry by that ID surfaces the exact exception, stack trace, and release tag for the failing request.
4. **Read the release/deployment off the Sentry event** (or off the Vercel deployment list by timestamp if Sentry release tagging isn't available for this error). That tells you which deployment introduced the behavior — the input to the rollback decision in Section 3.

If a user can't supply a correlation ID, treat the exercise as "narrow by time window + route" instead: pull the deployment timeline, find what shipped around when the symptom started, and check Sentry's new-regression alerts for that time window.

---

## 3. Rolling back a Vercel deployment safely

**When it's safe to roll back:** the previous deployment is a strict subset of the current one — no new DB migration was applied between the previous deploy and now. Rolling back the app in Vercel (promoting the previous deployment, or `vercel rollback`) restores the prior application code while leaving the database untouched. This is safe and, per the R9 idempotency guarantee below, safe to repeat.

**Steps:**
1. Confirm no DB migration shipped between the last-known-good deployment and the current one (check `supabase/migrations/` commit history against the deployment timeline).
2. In the Vercel dashboard, select the last-known-good deployment and promote it to production (or run the Vercel CLI rollback command against that deployment).
3. Re-check the external uptime monitor and `/api/health` to confirm the symptom clears.
4. Record the rollback in the incident timeline (Section 5).

### 3a. When NOT to roll back — the schema-ahead caveat

**Do NOT roll back the application below a deployment that shipped a live database migration**, if the migration is not backward-compatible with the older app code. Funūn's Supabase schema is the source of truth and migrations are additive/forward-only in normal operation (see `docs/BREAK-GLASS.md`'s framing of schema pushes as human-run, never scripted). If the deployed DB schema is **ahead of** the app code you'd be rolling back to — e.g. a migration renamed/dropped a column, changed a trigger the older code doesn't expect, or added a `NOT NULL` constraint the older code doesn't populate — rolling the app back can break it against the *current* schema, potentially turning a partial incident into a full outage.

**Before rolling back, always ask: "did a migration ship between the target deployment and now?"** If yes:
- Prefer a **forward fix** (ship a new deployment that corrects the bug) over a backward rollback.
- If a rollback is still necessary, first confirm the target (older) app code is compatible with the *current* live schema — read the migration(s) in question and check whether the older code path touches the changed columns/triggers.
- If compatibility can't be confirmed quickly, do not guess — treat this as a SEV-1/SEV-2 judgment call and favor the forward fix or an application-level flag/toggle over an unsafe rollback.

This caveat exists specifically because Funūn's schema evolves independently of a rollback's app-code snapshot — a rollback is not automatically safe just because it fixed the last incident.

### Idempotency — rollback and post-incident steps are safe to repeat

Both the rollback procedure above and the post-incident review template (Section 6) are safe to run more than once. Promoting the same "last-known-good" deployment a second time is a no-op beyond re-confirming the state; re-filling or amending a post-incident review doesn't corrupt prior data. This is a deliberate property (R9's idempotency edge) — if you're unsure whether a rollback already happened, it is always safe to re-run the promotion step rather than guess.

---

## 4. How break-glass applies here

`docs/BREAK-GLASS.md` is the **only** place with destructive/DB-level recovery steps (granting an artist invite, creating an ungated staff account, or reverting the invite gate trigger). This runbook does not duplicate any of that. If an incident traces back to the invite-gate trigger, a locked-out owner account, or anything else `docs/BREAK-GLASS.md` covers, **stop here and go there** — follow its three layers (lightest-touch to most drastic) directly. Nothing in this runbook substitutes for it, and nothing in this runbook should ever grow a parallel "layer 4."

---

## 5. Communicating degraded service

1. Check the public status page (Better Stack, R3 — configured in Plan 07) for the affected route(s); it should already reflect the down/degraded state once the monitor's consecutive-failure threshold trips.
2. If the status page hasn't caught up yet (e.g. within the free-tier 3-minute check interval), manually note the incident on the status page if the provider supports a manual incident post.
3. For a SEV-1/SEV-2 incident with visible buyer/artist impact, prepare a short, plain-language note (what's affected, what's not, ETA if known) — no internal error detail, no stack traces, no schema/infra specifics (same secret-redaction bar as `/api/health`'s response body).
4. Update the note when the incident resolves.

---

## 6. Recording an incident timeline

For every SEV-1/SEV-2 incident (and SEV-3 at the owner's discretion), keep a running timeline as it unfolds:

- **Detected at** — timestamp, and how (uptime alert / Sentry alert / daily digest / user report).
- **Origin identified at** — timestamp, which Section-1 category, how it was confirmed.
- **Mitigation action(s) taken** — timestamp + action (e.g. "rolled back to deployment X at 14:32").
- **Resolved at** — timestamp, confirmation method (monitor back to green, `/api/health` healthy, user confirmation).

This timeline feeds directly into the post-incident review below.

---

## 7. Post-incident review template

Complete this for every SEV-1/SEV-2 incident (SEV-3 at discretion; see `docs/observability/THRESHOLDS-AND-SEVERITY.md` for the SEV model this runbook routes on). All eight fields are required:

1. **Root cause** — what actually broke, in one or two sentences.
2. **User impact** — who was affected, how (error rate/duration/feature unavailable), and for how long.
3. **Detection method** — how the incident was first noticed (uptime monitor / Sentry / daily digest / manual report).
4. **Detection gap** — how long between the incident starting and it being detected, and whether an earlier signal existed that wasn't alerted on.
5. **Resolution** — what fixed it (rollback / forward fix / config change / external provider recovery).
6. **Preventive action** — what changes (code, threshold, process) reduce the chance of recurrence.
7. **Owner** — who owns the preventive action.
8. **Due date** — when the preventive action is expected to land.

Per the operating rhythm (`docs/observability/OPERATING-RHYTHM.md`), the review is completed after **every** incident, and any detection gap identified in field 4 is either closed immediately (a new alert/threshold) or explicitly tracked as a follow-up.

---

*Phase: 32-production-observability-capacity-incident-readiness*
*Plan: 32-10*
*Status: VALIDATED — tabletop exercise (Task 3) passed 2026-08-18*
