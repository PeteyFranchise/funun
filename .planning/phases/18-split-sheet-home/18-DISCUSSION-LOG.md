# Phase 18: Split-Sheet Home - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-21
**Phase:** 18-split-sheet-home
**Areas discussed:** Groups scope boundary, SMS scope boundary, Locker status extension

**Context for this session:** this was a reconciliation pass, not a from-scratch discussion. Phase 18 already had a full context and four drafted plans from 2026-07-20. The trigger was `split-sheet-identity-and-collaborator-model.md`, a same-day (2026-07-21) deliberation that redesigns the exact `CollaboratorPicker` surface `18-01-PLAN.md` builds on. Most of that deliberation's decisions (initiator auto-included as party 1, legal-name locking, live-linked identity, fast collaborator-add, pending/confirmed status, recipient-side advanced info) were already fully reasoned through in that document and were carried forward directly rather than re-discussed here — re-litigating them would have violated the "don't re-ask decided questions" rule. Only genuinely new scope-boundary questions were put to Pete.

---

## Groups scope boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Pull Groups into its own phase | Phase 18 stays focused on living-draft/Locker/attachment/readiness plus the identity-locking pieces that directly fix the collaborator-picker bug. Groups becomes its own phase, sequenced after. | ✓ |
| Fold Groups into Phase 18 | Build Groups as part of this same phase, since it touches the same CollaboratorPicker surface. | |

**User's choice:** Pull Groups into its own phase.
**Notes:** Groups (real entities, time-bounded membership, mixed Funūn/non-Funūn roster) was independently assessed during the original deliberation as comparable in size to the original Collaborators feature — folding it into an already-large Phase 18 would make it materially larger for a capability the living-draft/Locker/attachment work doesn't depend on.

---

## SMS scope boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Separate, small addition later | SMS only touches the invite/delivery layer (`lib/split-sheets/esign-invite.ts` from 17-10) — no change to signing experience. Keep it its own small follow-up. | ✓ |
| Fold into Phase 18 | Build it now since the collaborator-add flow (email/phone) is already being touched here. | |

**User's choice:** Separate, small addition later.
**Notes:** SMS delivery doesn't touch the living-draft, Locker, or attachment work Phase 18 is actually about — it's purely a second delivery channel alongside email.

---

## Locker status extension (P18-10)

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, surface it | Show pending/invited vs confirmed status per party in the attention-first landing — a natural extension of the per-party signing progress P18-10 already specifies. | ✓ |
| No, keep it simple for v1 | Show only signed/not-signed per party; pending/confirmed stays a Collaborators-page-only concept. | |

**User's choice:** Yes, surface it.
**Notes:** Preview shown and accepted:
```
⚠ Awaiting signature (2 of 3 signed)
   ✓ You — signed
   ✓ Jamie — signed
   ○ Alex — invited, hasn't opened yet
```

---

## Claude's Discretion

None — all three areas were decided explicitly by the user.

## Carried forward without re-discussion (from split-sheet-identity-and-collaborator-model.md)

- §1 Live-linked identity for Funūn-user parties (overwrite semantics on Settings save, freeze boundary as the natural snapshot point)
- §2 Legal-name locking (one-time self-confirm, no automated PRO verification)
- §4 Fast collaborator-add (email/phone only, advanced info collapsed by default)
- §6 Auto-collaborator creation with pending/confirmed status
- §7 Recipient-side optional advanced-info section on `/approve/[token]`
- §9 Initiator auto-included as party 1

## Deferred Ideas

- **Groups** (deliberation §3) — own future phase.
- **SMS invite delivery** (deliberation §5) — own small future addition to 17-10's territory.
- **PRO/MLC identity cross-referencing API** — already filed separately as a gated future BD idea (`.planning/research/PRO-MLC-identity-verification-api.md`), not re-discussed here.
