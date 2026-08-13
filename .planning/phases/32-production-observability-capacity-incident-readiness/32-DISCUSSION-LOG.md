# Phase 32: Production Observability, Capacity & Incident Readiness - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-13
**Phase:** 32-production-observability-capacity-incident-readiness
**Areas discussed:** Error monitoring, External uptime, Vercel alerts & spend, Load-test environment, Incident ownership, Capacity budget (one-by-one, --text mode)

---

## Error monitoring (R5)

| Option | Description | Selected |
|--------|-------------|----------|
| Sentry | Best Next.js+Vercel integration; server+browser SDK, source maps, release/regression, affected-user counts; free tier | ✓ |
| Bugsnag / Highlight.io / other | Comparable, less turnkey with Vercel | |
| Vercel-native only | Cheapest; loses aggregation/regression/affected-user (weakens R5) | |

**User's choice:** 1 (Sentry), accepted defaults.
**Notes:** Locked defaults — 100% errors / ~15% prod traces (100% preview), replay OFF, 30-day retention, founder-only access.

---

## External uptime (R3)

| Option | Description | Selected |
|--------|-------------|----------|
| Better Stack | Best free tier, on-call/escalation, public status page; free 3-min (30s paid) | ✓ |
| UptimeRobot | Simplest; free 5-min (1-min paid) | |
| Checkly | Most powerful (Playwright browser checks), paid-leaning | |

**User's choice:** 1 (Better Stack). Interval sub-choice not specified → defaulted to (a) free 3-min tier.
**Notes:** Documented relaxation of spec's 1–2 min → 3 min on free; upgrade to 1-min paid before a major launch. 2–3 consecutive-failure alerts; enable public status page.

---

## Vercel alerts & spend (R1)

| Option | Description | Selected |
|--------|-------------|----------|
| Observability Plus | Anomaly detection add-on | skipped |
| Auto-pause on spend | Automatic production pause | never (locked) |
| Alert destination | Email now / Slack later / extensible | ✓ email→pete@funun.studio |
| Spend threshold | Dollar figure | ✓ $100/mo |

**User's choice:** email pete@funun.studio now → Slack later; $100 threshold; "need a place to adjust this as we grow"; "build a place to add people in the company who get these alerts as we grow."
**Notes:** Drove the cross-cutting D-10 central config decision — thresholds + a growable recipient list in one owner-editable place.

---

## Load-test environment (R7)

| Option | Description | Selected |
|--------|-------------|----------|
| Vercel Preview + separate staging Supabase | Prod-like, isolated from live data; second Supabase (free) + seed | ✓ |
| Supabase branch + preview deploy | Lighter; requires Supabase Pro + GitHub integration | |
| Local | Cheapest; least prod-like (won't surface cloud limits) | |

**User's choice:** 1 (re-asked after an Area-3-vs-Area-4 mix-up). Tool default k6 accepted.
**Notes:** Never prod Supabase; no prod load test without separate written sign-off.

---

## Incident ownership (R8/R9)

| Option | Description | Selected |
|--------|-------------|----------|
| Primary owner | Pete (founder-led) vs someone else | ✓ Pete |
| Backup: none yet | Single-owner, risk noted | ✓ (via dashboard-later) |
| Backup: name now / escalation pool | | |

**User's choice:** 1 (Pete primary) + "build a place in the dashboard area to add owners as the team grows."
**Notes:** Crystallized the observability admin dashboard idea → later split OUT to a fast-follow phase (see below). Phase 32 keeps a config-level owner list.

---

## Capacity budget (R2/R8/R10)

| Option | Description | Selected |
|--------|-------------|----------|
| Compute auto-upgrade ceiling | Dollar ceiling before approval needed | ✓ default (~$50/mo) |
| Infra-review trigger | Monthly total that flags a capacity review | ✓ $100/mo (same as heads-up) |

**User's choice:** "default and same as $100".
**Notes:** ~$50/mo compute auto-upgrade ceiling (tunable); $100/mo infra-review trigger = the spend heads-up value.

---

## Scope decision (post-areas)

Offered: write CONTEXT now with the dashboard in-scope / split the dashboard to a fast-follow phase / adjust.
**User's choice:** 2 — split the observability admin dashboard into a fast-follow phase; keep Phase 32 to monitoring + config layer + runbooks.

## Claude's Discretion

- Exact Sentry trace-sample % within the 15% prod band; shape of the D-10 config module/table; Better Stack paid-tier upgrade timing; k6 script structure.

## Deferred Ideas

- **Observability Admin Dashboard** (in-app management UI for recipients/owners/thresholds in the Team Member console) → its own fast-follow phase; Phase 32 builds the config layer forward-compatible for it.
- Vercel Observability Plus purchase; Better Stack 1-min paid tier; a named backup incident owner; connection-pooling work (only if direct-Postgres traffic is later confirmed).
