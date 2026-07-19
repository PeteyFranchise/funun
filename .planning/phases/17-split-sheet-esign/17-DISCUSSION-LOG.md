# Phase 17: Split-Sheet E-Sign - Discussion Log

> **Audit trail only.** Decisions live in 17-CONTEXT.md.

**Date:** 2026-07-19
**Areas discussed:** Signing lifecycle, Readiness stage mapping, Standalone sheets, Splits reconciliation

## Signing lifecycle

| Question | Options | Selected |
|---|---|---|
| Approval vs signature relation | Two-step (recommended) / collapse (sign-is-approval) / initiator chooses per sheet | **Initiator chooses per sheet** — two-step default + fast-lane skip for studio-handshake pre-agreement |
| Post-mint changes | Any-party void→restart (recommended) / initiator-only void / immutable | **Any-party void → restart approval** |

## Readiness stage mapping

| Question | Selected |
|---|---|
| Tier values | **5 / 10 / 15 as proposed** (over 0/10/15 strict, binary status-quo) |
| Notification events (multi) | **All four**: party approved/signed, counter, fully executed, AND viewed-no-action nudges |

## Standalone sheets

| Question | Selected |
|---|---|
| No-project story | **Full e-sign + personal locker, attachable later** (over no-attachment, require-project) |
| Cap + access | **Initiator's cap; all parties get the executed PDF** (in-locker for account holders) |

## Splits reconciliation

| Question | Selected |
|---|---|
| Post-execution authority | **Executed sheet is truth; write-back OFFERED with diff confirmation** (over silent auto write-back, keep-separate-warn) |

Pattern consistent with prior sessions: maximum flexibility on artist-facing surfaces (per-sheet fast lane, any-party void, cross-party document access) while keeping data-mutation conservative (no silent write-back into registration-feeding composers[]).
