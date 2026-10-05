---
created: 2026-10-05T00:00:00Z
title: Push migration 233 (collaborators.claimed_by write lockdown) and run its owner-run verification
area: database
files:
  - supabase/migrations/233_claimed_by_write_lockdown.sql
  - supabase/migrations/179_existing_member_collaborator_reconciliation.sql
  - supabase/migrations/076_rename_artist_profiles_to_user_profiles.sql
---

## Status (2026-10-05)

Migration 233 is **authored, text-tested, and committed** — never applied. It closes Pass 6
C-1 (`.planning/deliberations/2026-10-05-pass-6-identity-access-review.md`): `collaborators.
claimed_by` — documented as the only verified-identity signal in this codebase, and consumed
by three separate `SECURITY DEFINER` trigger chains (079, 136, 157) to grant real project
visibility, work membership, and invite-acceptance state — was directly writable by any
roster owner through ordinary table-level INSERT/UPDATE plus an RLS policy (018:30-31) that
checks only `auth.uid() = user_id`, on both the UPDATE and INSERT paths. A roster owner who
knew another Funūn member's UUID could set `claimed_by` to that UUID directly via PostgREST
and make the system behave as if that member claimed the roster row themselves.

Migration 233 adds a `BEFORE INSERT OR UPDATE` trigger (`collaborators_guard_claimed_by_write`)
rejecting any such write unless the caller is privileged (`auth.role()` NULL or `service_role`)
or a transaction-local GUC (`funun.collaborators_claimed_by_write = 'verified_claim'`) was set
immediately beforehand by one of the two legitimate writers — `claim_collaborators()` (076) or
`link_existing_member_collaborator()` (179) — each amended by exactly one added line. It issues
**zero GRANT/REVOKE statements against the `collaborators` table itself** — protection is
100% trigger-based, matching migration 231's correction of migration 230's exact silent-no-op
column-REVOKE trap for a different table (`tracks.work_id`).

No database (local or production) was reachable from the planning or execution session that
wrote this migration — no Docker, no local Supabase Postgres, no production credentials
reachable from this sandbox. Everything below is the owner's step.

## Remaining to run (resume here)

1. **Review migration 233 by hand**, then push it:
   ```
   supabase db push
   ```
   (Standard convention for this repo — never run from an agent.)

2. **Run all four BEGIN/SAVEPOINT/ROLLBACK probes** embedded verbatim in migration 233's own
   trailing `OWNER-RUN BEHAVIORAL VERIFICATION` comment block. Requires one real roster owner,
   one real unclaimed collaborator row they own, and one real confirmed Member account (not the
   roster owner) whose email the probe can reference. Each probe ends in `ROLLBACK` and leaves
   production unchanged:

   - **(a) Forged UPDATE** (impersonating the roster owner, naming another real member's id in
     `claimed_by`) — **MUST raise `42501`**.
   - **(b) Forged INSERT** (same impersonation, a brand-new row already carrying another real
     member's id in `claimed_by`) — **MUST raise `42501`**.
   - **(c) Legitimate migration 179 auto-link** (same impersonation, an ordinary INSERT whose
     `email` matches a confirmed Member's account email, `claimed_by` omitted) — **MUST
     succeed**, and the returned `claimed_by` must equal that member's user id, proving the
     GUC-gated bypass did not break the legitimate auto-link.
   - **(d) Legitimate `claim_collaborators()` path** (impersonating `service_role`, calling
     `public.claim_collaborators(...)` against a fresh unclaimed row matching a real test
     user's email) — **MUST succeed**, and the row's `claimed_by` must equal that user's id.

   Note explicitly: this migration issues zero GRANT/REVOKE statements against the
   `collaborators` table itself, so there is no grant-state re-check analogous to migration
   231's — these four behavioral probes are the entire proof. Paste all four results back
   (success/failure + any error code) so this todo can close.

3. **A READ-ONLY production audit query**, to be run once. Any row it returns is a **candidate**,
   not a confirmed forgery — a legitimately claimed row's stored `email` can legitimately drift
   from the claimed account's current email after the claim (the roster owner is allowed to edit
   `email` post-claim; this does not unclaim the row), so a mismatch alone does not prove forgery,
   only that it needs a human look:

   ```sql
   SELECT c.id, c.user_id AS roster_owner, c.name, c.email AS stored_email, c.claimed_by,
          u.email AS claimed_account_email, u.email_confirmed_at
   FROM public.collaborators c
   JOIN auth.users u ON u.id = c.claimed_by
   WHERE c.claimed_by IS NOT NULL
     AND (c.email IS NULL OR btrim(c.email) = '' OR lower(btrim(c.email)) <> lower(btrim(u.email)));
   ```

   **Do NOT clear, repair, or otherwise modify any row this query returns** — that decision
   belongs to the owner. If any rows come back, note also that none of the three consumer
   chains (`project_members`, `work_members`, `collaborator_invites`) will self-correct if
   `claimed_by` is later changed — manual review of those three tables for the same user/
   collaborator pair would be a separate, owner-directed step. No existing trigger reverses any
   of their effects (079's INSERT has no matching DELETE; 136's UPDATE is guarded `user_id IS
   NULL`, fill-only; 157's guard `OLD.claimed_by IS NULL AND NEW.claimed_by IS NOT NULL` is false
   on any later transition).

4. **Three separate findings, surfaced during this investigation, explicitly NOT fixed by this
   migration and NOT blocking it:**

   a. **Every other `collaborators` column remains writable by the roster owner, including on
      an already-claimed row.** `legal_name`, `pro`, `ipi`, `publisher`, `mlc_id`,
      `soundexchange_id`, `mailing_address`, `email`, `phone`, `administrator`, `status` are
      governed by nothing stronger than `auth.uid() = user_id` (`018:30-31`). This is confirmed
      real, confirmed broader than `claimed_by`, and includes the ability for a roster owner
      (not the claimed person) to rewrite that verified person's legal/rights identifiers after
      they claim their row. Not addressed here — this migration is scoped to the identity-forgery
      column named in Pass 6 C-1 only.

   b. **`collaborator_invites` carries the same implicit-FOR-ALL shape** over
      `accepted_user_id`/`accepted_at` (`018:122-123`), on a different table with its own writer
      set (`157:33-38`'s `accept_collaborator_invites_on_claim()` and `214:242-252`'s direct
      UPDATE inside `complete_verified_signup_claim()`). Recommended as its own follow-up quick
      task; not decided or bundled here.

   c. **The reversibility gap in all three consumer chains** (described in step 3 above) means
      that if the production audit finds any already-forged rows, cleanup of all three
      downstream tables — not just `collaborators.claimed_by` — would be needed. This migration
      does not attempt that cleanup; it is the owner's decision.
