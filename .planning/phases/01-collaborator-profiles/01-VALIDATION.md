---
phase: 1
slug: collaborator-profiles
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-26
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Next.js build + TypeScript compiler |
| **Config file** | tsconfig.json |
| **Quick run command** | `npm run build 2>&1 | tail -20` |
| **Full suite command** | `npm run build && npm run lint` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build 2>&1 | tail -20`
- **After every plan wave:** Run `npm run build && npm run lint`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | COLLAB-01 | — | Migration runs clean, no data loss | build | `supabase db push --dry-run` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | COLLAB-01 | — | API rejects unauthenticated requests | build | `npm run build 2>&1 \| tail -5` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 2 | COLLAB-02 | — | UI renders without type errors | build | `npm run build 2>&1 \| tail -5` | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 3 | COLLAB-03 | — | Auto-fill populates all fields | manual | N/A — see manual verifications | — | ⬜ pending |
| 1-04-01 | 04 | 3 | COLLAB-04 | — | Invite email dispatched, token resolves | manual | N/A — see manual verifications | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] TypeScript strict compilation passes for all new files
- [ ] Supabase migration file valid SQL syntax
- [ ] Zod schemas compile with no type errors

*Existing infrastructure (TypeScript, Next.js build) covers base verification.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Auto-fill populates split sheet/contract fields from roster | COLLAB-03 | Requires real DB + full UI interaction | Open split sheet modal, pick collaborator, verify all fields populated |
| Invite email received and approval link works | COLLAB-04 | Requires live email delivery | Invite a collaborator, check inbox, click approval link, verify status updates |
| Unauthenticated approval page accessible | COLLAB-04 | Requires middleware verification | Open `/approve/[token]` in incognito, verify page loads without redirect |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
