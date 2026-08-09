---
phase: 27
slug: artist-invite-only-onboarding
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-09
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Detailed validation architecture (SQL↔TS gate twin-parity test, enforcement-point tests)
> lives in `27-RESEARCH.md` → "Validation Architecture". This file is the sampling/coverage contract;
> the per-task map is completed during execution as plan tasks are finalized.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest (see `package.json` `test` script; existing suites e.g. `__tests__/claim-collaborators-rpc.test.ts`, `lib/staff/createStaffAccount.test.ts`) |
| **Config file** | project default (Next.js + ts-jest; no custom config beyond package.json) |
| **Quick run command** | `npm test -- <path>` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30–90 seconds (grows with new suites) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- <touched suite>`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

> Populated during execution once PLAN.md tasks + provisional INVITE-01..12 IDs are finalized.
> Key required checks (from RESEARCH Validation Architecture):

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|--------|
| TBD | TBD | 1 | INVITE-01 (gate) | T-27-01 (uninvited-signup bypass) | Uninvited signup is rejected server-side in `handle_new_user` (RAISE), no `user_profiles` row created | unit/integration | `npm test -- <gate suite>` | ⬜ pending |
| TBD | TBD | 1 | INVITE-02 (allowlist) | — | Collaborator email + Team-Member invite + owner seed all admit; unknown email does not | unit | `npm test -- <allowlist suite>` | ⬜ pending |
| TBD | TBD | 2 | INVITE-05 (deep-link binding) | T-27-02 (forwarded link onboarding stranger) | Token admits only the invited email; admission re-derived by email at signup | unit | `npm test -- <invite-token suite>` | ⬜ pending |
| TBD | TBD | 3 | INVITE-09 (broadcast opt-out) | — | Reopen broadcast excludes opted-out; personal invites still send | unit | `npm test -- <waitlist suite>` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] jest is already present — no framework install needed.
- [ ] Add test stubs for the gate (`handle_new_user` enforcement) and the SQL↔TS allowlist twin-parity check (RESEARCH pitfall: SQL gate and the TS pre-check route drifting apart).
- [ ] Migration application check (new `artist_invites` + `artist_waitlist` apply cleanly after 096).

---

## Manual-Only / checkpoint:human-verify Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cloudflare Turnstile keys provisioned | INVITE-07 (captcha) | Operator task — site/secret keys are env config, not code | Owner provisions keys; set env; confirm widget renders + `siteverify` passes on the waitlist form |
| Owner has a seed artist account before the gate migration ships | INVITE-12 (bootstrap) | Prevents owner self-lockout | Confirm the owner's artist account exists (or seed one `artist_invites` bootstrap row) BEFORE applying the gate migration |
| Transactional-vs-commercial email framing (broadcast honors unsubscribe; personal invites transactional) | INVITE-10 | Legal/BD judgment, not code | BD/counsel review before enabling the reopen broadcast |
