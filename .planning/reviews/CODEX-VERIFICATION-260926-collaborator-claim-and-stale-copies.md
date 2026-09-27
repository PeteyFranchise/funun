---
type: review-verification
created: 2026-09-26
verifier: claude
subject: Codex doctrine on rights identity, collaborator claims and split-sheet snapshots
response: .planning/reviews/CODEX-RESPONSE-260926-collaborator-claim-and-stale-copies.md
verdict: >
  Every factual claim checked (9) was accurate, including three that corrected the
  prompt's own premises. Two live defects in shipped code confirmed from source.
  The doctrine's prescriptive content is NOT verified — only its claims about the code.
---

# Verification — Codex, rights identity and split-sheet snapshots

Method: each falsifiable claim about this codebase read at the cited location. Prescriptive
doctrine (the authority model, retention state machine, five-phase plan, §12 test list) is
**not** verified here — it is judgement, not fact, and is recorded as such.

Unlike the 2026-09-26 marketing-editor review — whose facts had all come from our own prompt,
making a clean verification weak evidence — **most claims below were new information Codex found
itself.** Three of them contradicted the prompt. All three were right.

## Claims that corrected us — all upheld

| # | Claim | Verified at | Result |
|---|---|---|---|
| 1 | A claimed person **can** read the inviter's row | `026_collaborator_identity_reconciliation.sql:63-69` | **UPHELD.** `CREATE POLICY "Claimed users see own credits" ON collaborators FOR SELECT USING (auth.uid() = claimed_by)`. Additive to the owner-only policy. Read-only, post-linkage. Our prompt said they could not read it at all. |
| 2 | Identity does **not** freeze at draft creation; it freezes at mint | `lib/split-sheets/live-identity.ts:74-92`, `lifecycle.ts:121` | **UPHELD.** `resolvePartyIdentity()` gives the claimed profile overwrite semantics across `draft`/`pending_approval`/`approved`/`countered`; only `esign_pending`/`executed` return the snapshot unchanged. `SYNC_FROZEN_STATUSES = ['esign_pending','executed']`. Our prompt's central premise was wrong. |
| 3 | A correction path that overwrites the inviter's row **already exists** | `app/api/approve/[token]/route.ts:104-106` | **UPHELD.** We proposed "never silently overwrite" as a new rule; the opposite is already shipped. |

## Defect claims — both confirmed

### D1 — Three surfaces resolve party identity differently

`resolvePartyIdentity` has exactly **one** production caller (`grep` across the repo, excluding
worktrees and tests): `app/(artist)/split-sheets/[id]/page.tsx:236`.

| Surface | Source | Value shown |
|---|---|---|
| Owner's sheet page | `resolvePartyIdentity(frozen, claimedProfile, status)` | live claimed profile |
| Approver's page | `split_sheet_parties.*` read directly (`app/approve/[token]/page.tsx:24-27`) | stored snapshot |
| Minted PDF | `pro: p.pro, ipi: p.ipi` (`mint-envelope/route.ts:255-256`) | stored snapshot |

And `partiesActuallyChanged()` states in its own contract that *"identity fields are never part of
this comparison"* (`lib/split-sheets/lifecycle.ts:57-73`), so a builder save does not persist the
identity refresh the owner is looking at.

**Net effect:** the initiator sees a corrected identifier, the co-writer approves a different one,
and the document that goes out for signature carries the stored one. No surface shows a
discrepancy. This is the load-bearing defect Codex named, and it is real.

### D2 — The guest identity write-back silently fails

`app/api/approve/[token]/route.ts:104-106`:
```ts
if (party.collaborator_id) {
  await service.from('collaborators').update(update).eq('id', party.collaborator_id)
}
```
Three problems, all confirmed:

1. **Service client, unauthenticated caller.** The route is public — the 256-bit approval token is
   the only authorization — and this write bypasses RLS to mutate a different Member's row.
2. **Error discarded.** Bare `await`, no `error` destructuring, no check.
3. **A column that does not exist.** `IDENTITY_FIELDS = ['legal_name','pro','ipi','publishing_designee','administrator']`
   (`:11`). Checked every `ALTER TABLE collaborators` in `supabase/migrations/`:
   `legal_name` added by `066:55-56`, `administrator` by `063:86-87`, **`publishing_designee` is
   never added to `collaborators`** — it exists only on `split_sheet_parties` (`063:37-40`).

Because it is one `UPDATE`, a payload containing `publishing_designee` raises `42703
undefined_column` and the **entire statement fails** — so `legal_name`, `pro`, `ipi` and
`administrator` are not written either. The error is then thrown away. The "reuse on future
sheets" behaviour documented in the comment above it silently does nothing, and nobody is told.

## Other claims checked

| Claim | Verified at | Result |
|---|---|---|
| Migration 179 auto-links an existing Member when another Member later adds their email | `179_...:10-20` — `link_existing_member_collaborator()`, `SECURITY DEFINER` | UPHELD |
| Quick Invite returns `alreadyMember: true` and sends no signup link for a claimed row | `quick-invite/route.ts:118-127` — also `emailSent: false, skipped: true` | UPHELD |
| `claim_collaborators()` links **every** unclaimed row with that email, not just the token's | `076_...:345-349` — `WHERE LOWER(email) = LOWER(p_email) AND claimed_by IS NULL` | UPHELD |
| The public invite resolver returns the full invited email pre-verification | `app/api/signup/invite/[token]/route.ts:94` — `email: row.email` | UPHELD |

## Not verified

Everything prescriptive: the field-class authority table, the eight source states, the retention
state machine, the five-phase ordering, the §12 test list, and every item in §13. These are design
positions. They may be right; they are not facts about this repository and must not be cited as if
they were.

Two prescriptive points we specifically flag as **owner decisions, not settled by this document**:

- **Codex rejects our Decision 1.** We chose to show name, email and PRO pre-authentication, and to
  disclose that IPI/MLC/address exist without their values. Codex wants a masked email, no PRO, and
  no field-presence disclosure until email control is proven. Its reasoning — a forwarded link is
  held by someone who never controlled the inbox — is sound. Owner has not ruled.
- **§9 retention.** Codex is right that we have no end-of-life policy for a record describing a
  person who never joins. It is also right that the repository does not establish defensible
  periods. That needs counsel, not a phase plan.

## One correction to Codex

Not a factual error, but worth recording: §2's last item tells us not to claim a wrong IPI sends
royalties "to nobody". That is a fair correction of our prompt's rhetoric, and we accept it. The
harm is mismatch, delay, dispute or misattribution — serious, but not deterministic.
