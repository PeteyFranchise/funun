---
type: quick
slug: quick-invite-block-bypass
created: 2026-09-22
branch: fix-quick-invite-block-bypass
migration: none expected — verify
source: .planning/reviews/CODEX-RESPONSE-260922-d01-hidden-member-disclosure.md
---

# A blocked member's account is confirmed to the person they blocked

## The defect

Migration 179's trigger sets `claimed_by` by matching a collaborator row's email against
confirmed `auth.users`, with **no `is_public`, `profile_visibility`, connection or block
predicate** (`supabase/migrations/179_existing_member_collaborator_reconciliation.sql:23-42`).

Two routes then disclose the result to the roster owner:

1. **`app/api/collaborators/quick-invite/route.ts:98-108`** — returns `alreadyMember: true`
   explicitly when `collaborator.claimed_by` is set.
2. **`app/api/collaborators/route.ts:71-78`** — inserts with `.select()` and returns the full
   row, so a non-null `claimed_by` discloses the same fact implicitly. **This one is easy to miss
   precisely because it carries no flag.**

So someone who has blocked you can have their Funūn membership confirmed to you, by you typing
their email. `ROADMAP.md:2700-2704` forbids exactly this: *"a hidden or blocked identity must not
be exposed through a reverse-lookup result."*

## Scope — the blocked case ONLY

**Do not touch the hidden-member case.** Whether a hidden-but-unblocked member's membership may
be confirmed is an open owner decision (D-01a in
`.planning/phases/41-collaborator-discovery-mobile-contact-matching/41-CONTEXT.md:42-61`) and is
explicitly not being settled here. This task closes the **blocked** half, which the owner already
decided (D-03) and the roadmap already forbids.

## The fix

**A block in either direction ends the action.** Chosen by the owner 2026-09-22, matching D-03
for the new Phase 41 path, so there is one rule rather than two.

Before inserting or reusing a collaborator row whose email is supplied:

1. Resolve the email to an account id **server-side with the service client**. The email must
   never be echoed and the account id must never reach the response.
2. Call `isBlockedRelativeTo(service, callerId, accountId)` from
   `lib/trust-safety/block-check.ts`. It is bidirectional, uses the service client so it can see
   blocks placed *against* the caller, and never exposes direction.
3. If blocked: return `BLOCKED_ACTION_ERROR` with `BLOCKED_ACTION_STATUS` from that same module
   and **create nothing**. Checking before the insert means the trigger never fires, so no row,
   no `claimed_by`, no disclosure.

Use the existing helper and its existing generic error. Plan 13-03's rule is **no distinguishable
"you are blocked" state anywhere** — the failure must look identical to any other generic failure
for the same action. Five routes already follow this pattern (`app/api/wall/route.ts`,
`connections`, `endorsements`, `follows`, `release-comments`); match them.

## Audit, do not assume

`grep` shows several other routes inserting near collaborator reads. **Determine which actually
insert into `collaborators` with a caller-supplied email**, and report each one as either fixed,
not-applicable-with-reason, or needing follow-up. Candidates to check at minimum:
`app/api/launchpad/[projectId]/campaigns/route.ts`,
`app/api/works/[workId]/passport/route.ts`, `app/api/works/[workId]/members/route.ts`,
`app/api/split-sheets/[id]/correction-flag/route.ts`, and whatever
`components/split-sheets/PartyPicker.tsx` posts to.

## Probably no migration — confirm rather than assume

Checking before the insert should make a trigger change unnecessary, because the trigger cannot
fire on a row that is never inserted. **Verify that reasoning holds** for every path found in the
audit. If some path inserts without passing through a guarded route, say so plainly and propose
the trigger hardening as a follow-up **without writing the migration** — migrations are
human-gated and this task is not authorised to add one.

## Tests

- A blocked target (block in **each** direction, tested separately) produces
  `BLOCKED_ACTION_ERROR` / `BLOCKED_ACTION_STATUS` and **no row is created**. Assert the insert
  never happens, not merely that the response is an error.
- The response for a blocked target is **byte-identical** to the generic failure shape used
  elsewhere — no `alreadyMember`, no `claimed_by`, no row, nothing naming a block.
- An unblocked existing member still links and still returns `alreadyMember` on quick-invite.
  **This must not change** — it is the D-01a decision and is not ours to make.
- An unblocked non-member still receives an invite as today.
- Self-invite is unaffected (`isBlockedRelativeTo` returns false for `viewerId === otherId`).

**Prove the tests bite:** remove the guard from one route, confirm the suite fails, restore it,
and report the actual failure output.

## Verification gate

Every step CI `validate` runs, per `.claude/CLAUDE.md`, including `lint --max-warnings=0`.
