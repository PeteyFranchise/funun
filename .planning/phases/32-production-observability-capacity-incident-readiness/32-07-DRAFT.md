# Phase 32 Plan 07: Uptime Monitoring — DRAFT-FIRST STATUS

This plan was executed in **draft-first mode**: the automatable documentation deliverable was
authored and committed, but the owner checkpoint (external Better Stack account setup) was
deliberately skipped. This is not a completed plan — do not treat it as such. No
`32-07-SUMMARY.md` was written; no STATE.md / ROADMAP.md updates were made.

## Drafted

- `docs/observability/UPTIME-MONITORING.md` — fully authored from the plan spec:
  - The 4 monitored routes (`/`, `/signin`, `/sync/catalog`, `/api/health`)
  - The free 3-min check interval (D-05) and the pre-launch 1-min (~$25/mo) upgrade trigger
  - The 2-3 consecutive-failure alert rule, including the Nth-vs-(N-1)th and
    failure→success-doesn't-alert edge cases, and the unreachable-target-always-counts-as-failure
    edge case
  - The `/api/health` 503-degraded-as-down status-code check decision (cross-referencing the
    Plan 03 contract in `app/api/health/route.ts`)
  - The "why external, not Vercel-internal" rationale (a Vercel-hosted checker cannot report a
    Vercel-wide outage)
  - A placeholder for the public status-page URL, to be filled in once the owner enables it
  - A pointer to `lib/observability/config.ts` (Plan 01) and
    `docs/observability/THRESHOLDS-AND-SEVERITY.md` (Plan 08) for alert routing/SEV, rather than
    restating a destination address

Committed as `docs(32-07): draft uptime monitoring documentation (Better Stack, R3)`.

## Deferred — needs owner

Task 1 (`checkpoint:human-verify`, gate=blocking) was **skipped**, not resolved. The owner still
needs to, outside of this repo, entirely in Better Stack's dashboard:

1. Create a Better Stack account and monitors for the 4 routes — `https://www.funun.studio/`,
   `/signin`, `/sync/catalog`, `/api/health` — at the free 3-minute interval (D-05).
2. Set alerting to require 2-3 consecutive failures, with destination = pete@funun.studio (per
   the recipient config in Plan 01).
3. Configure the `/api/health` monitor as a status-code check treating `200` as up and `503`
   (degraded) as down — matching the Plan 03 contract already documented in
   `docs/observability/UPTIME-MONITORING.md`.
4. Enable the public status page (e.g. `status.funun.studio`) and record its URL back into
   `docs/observability/UPTIME-MONITORING.md` (currently a placeholder).
5. Run a deliberately failing check (e.g. point a scratch monitor at a guaranteed-404 path) and
   confirm an alert is delivered only after the Nth consecutive failure (not the N-1th), and that
   a lone failure→recovery does not alert.

Once the owner completes the above and confirms via the plan's resume-signal ("monitors live on
4 routes; forced-failure alert fired on the Nth failure; status page URL = ___"), a follow-up
pass should: record the status-page URL in the doc, write `32-07-SUMMARY.md`, and update
STATE.md / ROADMAP.md to mark the plan complete.
