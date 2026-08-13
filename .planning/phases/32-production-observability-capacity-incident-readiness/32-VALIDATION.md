---
phase: 32
slug: production-observability-capacity-incident-readiness
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-13
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest (see jest.config.js) |
| **Config file** | jest.config.js |
| **Quick run command** | `npm test -- <path>` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~{N} seconds (fill during Wave 0) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- <changed test path>`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** {N} seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 1 | R-{XX} | T-32-01 / — | {expected secure behavior or "N/A"} | unit | `{command}` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Seed from RESEARCH.md `## Validation Architecture` — R4 health (healthy/degraded/timeout/secret-redaction), R5 Sentry PII scrubbing, R6 correlation-ID uniqueness + same-id on log line and Sentry event, R7 k6 mid-ramp stop-condition abort (backstop).*

---

## Wave 0 Requirements

- [ ] Health-route test file — stubs for R4 (healthy/degraded/timeout/secret-redaction)
- [ ] Sentry `beforeSend` scrubbing test — stubs for R5
- [ ] Correlation-ID test — stubs for R6 (uniqueness + same-id propagation)
- [ ] Existing Jest infrastructure covers the above (no new framework install needed)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Vercel usage/spend + FUNCTION_THROTTLED alert delivery | R1 | Vendor-dashboard config; test-notification delivery | Force a test notification; confirm receipt on chosen channel |
| Supabase review checklist accuracy | R2 | Documentation over vendor dashboards | Walk each metric to its read-location |
| Better Stack alert on Nth consecutive failure | R3 | External provider runs the checks | Trigger a deliberately failing check; confirm alert after N (not N−1) |
| Sentry server + browser exception with release/source-map | R5 | Requires live Sentry project + real deploy | Throw a controlled exception each side; confirm resolution in monitor |
| k6 capacity report across 25→500 | R7 | Requires non-prod staging target | Run harness against staging; verify report table + stop-condition abort |
| Incident runbook tabletop | R9 | Human-executed exercise | Walk a simulated incident end-to-end |
| Weekly/monthly operating checklists name an owner | R10 | Documentation deliverable | Confirm owner named; produce one monthly report |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
