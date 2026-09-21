# BOTTOM LINE

Within one roster, a row's authoritative identity is `(user_id, claimed_by)` when `claimed_by` exists; otherwise it is `(user_id, normalized_email)`, and a name is never an identity key. When an owner selects a discoverable member whose confirmed account email matches an existing unclaimed row, the server should claim and reactivate that existing row in place, preserving its `id`, rather than create another row or ask the owner. Enforce both identity axes with database unique indexes across active and archived canonical rows, but preflight and reconcile existing duplicates before creating them because migration 179 can currently produce duplicate `(user_id, claimed_by)` pairs (`supabase/migrations/179_existing_member_collaborator_reconciliation.sql:62-71`). Put the complete block-check, private email resolution, existing-row resolution, claim/reactivation, and insert decision in one service-only transactional `SECURITY DEFINER` RPC; the indexes are the final race arbiter, while a check-then-insert route, advisory lock alone, or ordinary upsert is insufficient. The response must have one projection and one success shape for created, reused, and resurfaced rows—no email, rights identifiers, or `reused` bit—and the route must revalidate bidirectional blocking before the transaction changes anything.

# CORRECTIONS

The statement “there is no unique constraint of any kind on `collaborators`” is too broad: `collaborators.id` is a primary key and therefore unique (`supabase/migrations/018_collaborators_split_sheets.sql:13-27`), and `status` later receives a check constraint (`supabase/migrations/066_split_sheet_identity_foundation.sql:55-66`). The material point is correct: there is no uniqueness rule for either roster identity axis. Migration 026 creates only non-unique indexes on `LOWER(email)` and `claimed_by` (`supabase/migrations/026_collaborator_identity_reconciliation.sql:53-61`), and migration 052 reasserts the latter as non-unique (`supabase/migrations/052_restore_collaborators_claimed_by.sql:10-14`).

The route does normalize the incoming email with trim/lowercase and checks only the caller's active roster (`app/api/collaborators/route.ts:44-59`), fails closed on lookup error (`:61-65`), and skips the check when the sanitized email is not a string (`:47`). However, `.ilike('email', email)` is not equality on `lower(btrim(stored_email))`: it is a pattern comparison, and it does not trim an older stored value. The trigger uses the stronger expression on both sides (`supabase/migrations/179_existing_member_collaborator_reconciliation.sql:23-34`). A database expression index should use that exact normalized equality instead of relying on `ILIKE`.

The reading of migration 179 is correct. It is a `BEFORE INSERT OR UPDATE OF email` trigger, derives the user exclusively from the stored email plus confirmed `auth.users` and `user_profiles`, and forces `status = 'confirmed'` when it links (`supabase/migrations/179_existing_member_collaborator_reconciliation.sql:10-45`, `:51-55`). Its repair update links every matching unclaimed row and has no owner/member uniqueness guard (`:57-71`). It therefore links identity but does not deduplicate it.

The RLS and removal reading is also correct. A claimed person receives row-level `SELECT` through `auth.uid() = claimed_by` (`supabase/migrations/052_restore_collaborators_claimed_by.sql:16-19`), while the owner policy is keyed to `user_id` (`supabase/migrations/018_collaborators_split_sheets.sql:29-32`). The route makes hard deletion conditional on `claimed_by IS NULL`, returns a conflict for a claimed row, and otherwise expects archive (`app/api/collaborators/[id]/route.ts:38-89`).

There is relevant prior repair work that the prompt does not mention. Migration 148 found unclaimed/claimed rows sharing owner plus normalized email, repointed or collapsed conflicting `work_members`, expired pending invites, and archived the duplicate (`supabase/migrations/148_writer_room_existing_collaborator_repair.sql:30-100`, `:125-178`). It did not add an invariant, did not address two already-claimed rows with the same `claimed_by`, and did not cover every newer reference such as Song Passport values or JSON performer references. Migration 179 landed later and can recreate the same class of duplicate.

The scenario's “owner's notes” premise is not represented in the current collaborator schema or editable-field allowlist. The row does have `is_favorite` and `archived_at` (`supabase/migrations/026_collaborator_identity_reconciliation.sql:38-45`; `lib/collaborators/index.ts:6-32`), and it has important downstream references. Split-sheet parties use `ON DELETE SET NULL` (`supabase/migrations/018_collaborators_split_sheets.sql:61-70`), work members use `ON DELETE SET NULL` (`supabase/migrations/136_work_members.sql:82-98`), collaborator invitations use `ON DELETE CASCADE` (`supabase/migrations/018_collaborators_split_sheets.sql:103-125`), and Song Passport values use `ON DELETE SET NULL` with a target-key check bound to the collaborator ID (`supabase/migrations/151_song_passport_foundation.sql:37-53`, `:96-113`). Works also store performer identity in JSONB rather than a foreign key (`supabase/migrations/135_works_core.sql:66-84`). These are reasons to preserve the row ID on the normal Phase 41 path and to treat legacy duplicate consolidation as a dedicated data migration.

# IDENTITY KEY

Identity is scoped to the roster owner. Two different owners may each have a row for Maya; that is expected. Within one owner's roster, use two ordered identity axes:

1. **Claimed identity:** `(user_id, claimed_by)`. `claimed_by` is the canonical account bridge because existing triggers derive it from confirmed account identity, never from a client-selected destination (`supabase/migrations/179_existing_member_collaborator_reconciliation.sql:10-45`). Once populated, it dominates the email stored on the row.
2. **Unclaimed identity:** `(user_id, lower(btrim(email)))` when the trimmed email is nonempty. This is necessarily the fallback because the present signup claim updates all rows matching the account email (`supabase/migrations/026_collaborator_identity_reconciliation.sql:90-94`). Funūn therefore already treats an email as a person-level identity key for this feature. Shared inboxes cannot safely represent two different unclaimed people in the same roster under that doctrine; supporting that later would require separating “invitation address” from person identity rather than weakening uniqueness.

Do not combine the axes into one `COALESCE(claimed_by::text, normalized_email)` key. They are different namespaces and transitions between them are the exact moment that needs reconciliation. Two partial unique indexes express the invariant more clearly and let the database constrain both the pre-claim and post-claim states.

Names, handles, legal names, PROs, and rights identifiers are not dedupe keys. The existing route comment is correct that names are not unique enough (`app/api/collaborators/route.ts:44-46`), and Phase 41 deliberately withholds private rights fields.

For the stated disagreement case—an unclaimed owner row has email A, and the selected member's confirmed account email is A—the two axes agree. Inside the server transaction, set `claimed_by` on that existing row and clear `archived_at`; do not insert. Preserve its `id`, `is_favorite`, existing owner-entered assertions, split-sheet references, and work references. The owner is not being told the member's email: the comparison uses the value the owner already supplied and the account email visible only to trusted server/database code.

If an email-matching row is already claimed by a *different* account, the axes disagree. Do not overwrite `claimed_by`, do not merge, and do not create a second active row as a workaround. Fail closed with a generic response, record a summary-only internal integrity event, and require operator review. A typed email cannot defeat an established verified account bridge.

If a selected member has no claimed row for this owner and no row matching the member's confirmed account email, create one row with `claimed_by` and public recognition fields only. Do not store the account email on that new search-created row. The claimed identity index is sufficient for future reuse.

# CONSTRAINT

Use uniqueness across **canonical rows regardless of archive state**. Archiving is presentation/removal state, not permission to mint another identity. To preserve legacy duplicate tombstones without letting them participate in identity, add a server-owned merge pointer; merged rows must be archived and have their active identity keys cleared.

The following is proposed SQL for a new human-gated migration. It is not applied. Do not assign it number 228 automatically: 228 is already discussed as a deferred storage-attribution migration, and Phase 41's roadmap says to claim a number only during implementation planning after checking the migration ledger (`.planning/ROADMAP.md:2766-2767`).

```sql
-- Proposed NEW migration; number chosen at implementation time.
-- Human-gated. Do not edit applied migration 179 or any prior migration.

ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS merged_into UUID
    REFERENCES public.collaborators(id) ON DELETE RESTRICT;

ALTER TABLE public.collaborators
  ADD CONSTRAINT collaborators_merge_tombstone_chk CHECK (
    merged_into IS NULL
    OR (
      merged_into <> id
      AND archived_at IS NOT NULL
      AND claimed_by IS NULL
      AND email IS NULL
    )
  );

-- STOP rather than letting CREATE UNIQUE INDEX be the first evidence of
-- production duplicates. Error text is summary-only: no emails or row ids.
DO $$
DECLARE
  v_claimed_groups BIGINT;
  v_email_groups   BIGINT;
BEGIN
  SELECT count(*) INTO v_claimed_groups
  FROM (
    SELECT user_id, claimed_by
    FROM public.collaborators
    WHERE merged_into IS NULL AND claimed_by IS NOT NULL
    GROUP BY user_id, claimed_by
    HAVING count(*) > 1
  ) duplicate_claimed;

  SELECT count(*) INTO v_email_groups
  FROM (
    SELECT user_id, pg_catalog.lower(pg_catalog.btrim(email)) AS email_key
    FROM public.collaborators
    WHERE merged_into IS NULL
      AND email IS NOT NULL
      AND pg_catalog.btrim(email) <> ''
    GROUP BY user_id, pg_catalog.lower(pg_catalog.btrim(email))
    HAVING count(*) > 1
  ) duplicate_email;

  IF v_claimed_groups > 0 OR v_email_groups > 0 THEN
    RAISE EXCEPTION
      'collaborator identity preflight failed: % claimed groups, % email groups',
      v_claimed_groups, v_email_groups;
  END IF;
END
$$;

CREATE UNIQUE INDEX collaborators_owner_claimed_identity_uniq
  ON public.collaborators (user_id, claimed_by)
  WHERE merged_into IS NULL AND claimed_by IS NOT NULL;

CREATE UNIQUE INDEX collaborators_owner_email_identity_uniq
  ON public.collaborators (
    user_id,
    pg_catalog.lower(pg_catalog.btrim(email))
  )
  WHERE merged_into IS NULL
    AND email IS NOT NULL
    AND pg_catalog.btrim(email) <> '';
```

`CREATE UNIQUE INDEX` does not merge existing data. With the preflight above, the migration deliberately stops before either index if production still contains duplicates. That is the safe behavior: migration 179 makes existing duplicates plausible, and blindly choosing a winner could corrupt work access or rights provenance.

Run a privileged, read-only preflight before finalizing the repair and report only counts outside the restricted operator context. For each duplicate group, choose a survivor deterministically: an already-claimed row for the target account wins; otherwise use the oldest row, breaking ties by `id`. Consolidate `is_favorite` with boolean OR and resurface the survivor. Do not choose by non-null rights fields because those fields can conflict and, under the approved rights model, are assertions to preserve for later confirmation rather than identity proof.

Every losing row should become an immutable tombstone: repoint mutable identity references as described below, set `merged_into = survivor.id`, `archived_at = COALESCE(archived_at, now())`, then clear `claimed_by` and `email`. Preserve its remaining fields and historical invite linkage for audit. The check constraint prevents that tombstone from being unarchived through the current PATCH path, and `merged_into` is absent from `COLLABORATOR_EDITABLE_FIELDS`, so a client cannot select or clear the merge target (`lib/collaborators/index.ts:6-32`, `:79-132`).

The final implementation should also normalize stored email on every server-controlled email write or add a `BEFORE` normalization trigger. The expression index enforces normalized equality even without rewriting old casing/whitespace, but canonical storage prevents future routes from repeating today's inconsistent comparison.

# MERGE SEMANTICS

For the ordinary Phase 41 case, **reuse and link in place**. The existing unclaimed row is already the owner's durable roster object. Updating it to `claimed_by = target_user_id`, `status = 'confirmed'`, and `archived_at = NULL` preserves its ID, favourite state, and all existing references. Existing claim-related triggers already use a `claimed_by` transition to accept pending invitations and attach project/work membership (`supabase/migrations/157_first_sign_in_experience.sql:21-50`; `supabase/migrations/079_project_membership_auto.sql:109-122`; `supabase/migrations/136_work_members.sql:300-343`).

Do not create a new row and archive the old one. That is strictly more work and creates a reference-migration problem without adding identity evidence. Do not ask the owner when equality is established by confirmed account email: the owner cannot make the identity comparison more authoritative, and the question itself can reveal that a private server-side match occurred. Ask for human resolution only when the identity axes conflict, and make that an operator integrity workflow rather than a roster-owner choice.

Legacy duplicate cleanup needs table-specific handling:

- **Split-sheet parties:** repoint `split_sheet_parties.collaborator_id` to the survivor but do not change the party's frozen `name`, `email`, PRO/IPI fields, percentages, approvals, or executed PDF. The schema intentionally snapshots those legal facts (`supabase/migrations/018_collaborators_split_sheets.sql:57-78`). Repointing the internal roster bridge does not rewrite the agreement.
- **Work members:** if only the losing row is present on a work, repoint it and fill `user_id` from the survivor's `claimed_by`. If survivor and loser both appear on the same work, collapse to one membership before updating because the table has separate unique indexes for work/user and work/collaborator (`supabase/migrations/136_work_members.sql:71-98`). Preserve the stronger tier (`administer` over `contribute`) and the earliest membership ID when possible. This requires a purpose-built repair transaction, not a blanket `UPDATE`.
- **Song Passport values:** update both `collaborator_id` and `target_key = 'collaborator:' || survivor_id` in the same statement, because the database check requires them to agree (`supabase/migrations/151_song_passport_foundation.sql:96-113`). Do not discard value history or pretend conflicting assertions are the same fact.
- **Collaborator invitations:** retain historical invitations on the tombstone and expire any still pending, matching migration 148's precedent (`supabase/migrations/148_writer_room_existing_collaborator_repair.sql:125-151`). Do not cascade-delete the losing row; that would delete invitation history (`supabase/migrations/018_collaborators_split_sheets.sql:107-125`).
- **JSON identity snapshots:** inspect and deliberately handle `works.primary_performer`, version/block performer arrays, and diary payloads. `works.primary_performer` is JSONB rather than a foreign key (`supabase/migrations/135_works_core.sql:66-84`), and diary events embed `collaboratorId` in append-only payloads (`supabase/migrations/138_work_diary_events.sql:291-319`, `:417-429`). Current mutable performer references should move to the survivor. Historical diary payloads should remain unchanged and resolvable through the tombstone/`merged_into` relationship rather than being silently rewritten.

The split sheets and works that already reference the matched older row therefore continue working without any change in the common link-in-place path. Reference rewrites are only necessary for pre-existing duplicate rows that must be consolidated before the uniqueness indexes can land.

# RACE

The current route has the classic A/B interleaving: request A checks and sees no row; request B checks and sees no row; A inserts; B inserts (`app/api/collaborators/route.ts:47-75`). Quick invite repeats the same shape (`app/api/collaborators/quick-invite/route.ts:47-93`). Both current tests prove sequential reuse behavior, not concurrent exclusion (`app/api/collaborators/route.test.ts:55-87`, `:114-148`; `app/api/collaborators/quick-invite/route.test.ts:168-221`).

Use **both** database uniqueness and one service-only transactional RPC:

- The unique indexes are the authoritative invariant. They cover every writer, including future routes and migration 179's trigger.
- The RPC supplies the required semantics: revalidate block/discoverability, read the target's confirmed email privately, prefer existing claimed identity, link an email-matching unclaimed row, resurface archived rows, and create only if neither exists.
- A plain upsert is not enough because there are two conflict axes and an email-matching unclaimed row must transition to claimed identity rather than merely update the claimed index target.
- An advisory lock alone is not enough because every writer would have to remember to take it. A transaction-scoped advisory lock inside the RPC is useful to avoid noisy unique violations, but the indexes remain the backstop.
- An application transaction is not available across independent PostgREST calls; the decision must live inside PostgreSQL.

The RPC should be `SECURITY DEFINER SET search_path = ''`, fully qualify every relation, revoke execution from `PUBLIC`, `anon`, and `authenticated`, and grant only `service_role`. The authenticated route proves the owner, revalidates that the selected public profile is eligible, and calls the RPC; the client never writes `claimed_by` or calls the RPC directly. The function should take the server-verified owner and target IDs, acquire `pg_advisory_xact_lock` on a stable hash of that pair, query confirmed `auth.users.email` internally, check `public.blocks` in both directions, and then resolve/update/insert. A unique violation should be caught by reselecting the canonical row inside the same function, never translated into a second insert.

The route should not rely on the current `link_existing_member_collaborator` trigger to make the selection. That trigger remains valuable for manual/email paths, but the discovery RPC already knows the selected member identity and must atomically reconcile it. The trigger then sees an explicitly server-owned `claimed_by` value and leaves it alone because its body only resolves when `NEW.claimed_by IS NULL` (`supabase/migrations/179_existing_member_collaborator_reconciliation.sql:23-42`).

Required concurrency tests should launch two real database transactions for the same owner/target and prove: one canonical row ID is returned twice; exactly one canonical row exists; an archived match is resurfaced; an unclaimed email match keeps its ID; a block committed before resolution creates nothing; and a conflicting claimed/email identity fails closed. Mocked route tests alone cannot prove the index or transaction behavior.

# ARCHIVED ROWS

Resurface the archived row. Archive currently hides a row from GET and pickers (`app/api/collaborators/route.ts:16-24`; `components/collaborators/CollaboratorPicker.tsx:64-77`); it does not erase its identity, split sheets, work memberships, or audit history. Creating a second row because the first is hidden reproduces the exact identity fragmentation Phase 41 is meant to prevent.

This means both unique indexes include archived canonical rows, and the RPC clears `archived_at` when it resolves one. The owner gets Maya back in the active roster with the same ID and references. If the owner intentionally wants the person hidden again, they may archive the canonical row after the add; they still may not create a second identity.

Blocking is different from archiving. The locked Phase 41 decision says a block in either direction ends the action. The RPC must check blocks again at write time, before resurfacing or inserting, because a block can be created after the search result was rendered. It returns the same generic failure for blocked, newly hidden, stale, or ineligible targets; no row, email, notification, or membership side effect occurs.

# LEAKAGE CHECK

Yes, the match can be performed without disclosing the email. The trusted route/RPC can read the selected member's confirmed `auth.users.email`, compare it to `lower(btrim(collaborators.email))`, and discard it inside the transaction. A newly search-created row stores no email; a reused row retains only the email the owner had already entered. Search itself continues returning a profile ID and public-safe projection, never an email, consistent with the existing exact-email discovery function's stated boundary (`supabase/migrations/149_green_room_people_search.sql:22-71`).

The Phase 41 add response should be an explicit safe projection such as:

```json
{
  "data": {
    "id": "roster-row-id",
    "name": "Maya Reyes",
    "memberProfileId": "public-profile-id",
    "status": "confirmed",
    "archived": false
  }
}
```

Return the same HTTP status, keys, user-facing copy, and notification behavior whether the row was inserted, linked, already linked, or resurfaced. Do not return `email`, `claimed_by`, IPI/PRO/publisher fields, `merged_into`, or `reused`. The existing general create route exposes `reused: true|false` (`app/api/collaborators/route.ts:66-78`), and quick invite exposes `reused` plus `alreadyMember` (`app/api/collaborators/quick-invite/route.ts:95-107`, `:125-132`). Those shapes belong to existing email-entry behavior and must not be copied into the found-member endpoint.

The database operation cannot honestly be claimed cryptographically constant-time: an insert, update, and no-op can have different execution costs. The defensible control is to use one RPC path, bounded indexed lookups, no branch-specific external calls before commit, a uniform response, and no raw database error text. Because the target member is already visible through People Search, the protected fact here is whether a private email-authored roster row matched—not whether the selected target has a Funūn account. Do not add artificial sleeps; rate limiting, block revalidation, uniform output, and removal of the `reused` oracle address the practical leak without creating an availability problem.

The route must also use an explicit response projection rather than `.select('*')`. The current roster endpoints return full collaborator rows (`app/api/collaborators/route.ts:16-24`, `:71-78`; `app/api/collaborators/quick-invite/route.ts:50-58`, `:74-84`). That is incompatible with a guarantee that the found-member path returns no private email or rights identifiers, even if today's new search-created row happens to leave those fields null.

# CONFIDENCE

## Verified by reading the current repository

- Reviewed branch `phase-41-discuss` at commit `a2d10314f9836b1f7b84e126affa620df5de9bc7`. The only pre-existing untracked file at review start was `.planning/reviews/CODEX-PROMPT-260921-roster-identity-dedupe.md`; it was preserved.
- Verified collaborator schema evolution, current create/update/delete routes, editable-field boundary, claim and existing-member triggers, RLS, archive UI behavior, migration 148's prior repair, work-member uniqueness and claim bridge, split-sheet references, invitation lifecycle, Song Passport target constraint, works JSON performer storage, and diary JSON snapshots at the cited lines.
- Verified there is no owner-notes field on the current collaborator row, while `is_favorite` and downstream references do exist.
- Ran `npx jest --runInBand app/api/collaborators/route.test.ts app/api/collaborators/quick-invite/route.test.ts __tests__/migration-148.test.ts __tests__/migration-179.test.ts __tests__/claim-collaborators-rpc.test.ts`: 5 suites passed, 30 tests passed.
- Did not query production, create or apply a migration, change application code, switch branches, commit, push, or deploy. Production-at-227 is accepted from the request and the project state, not independently checked against the live database.

## Inferred or recommended

- The ordered two-axis identity model, resurfacing rule, `merged_into` tombstone, unique indexes, service-only resolver RPC, uniform response, and reference-repair order are design recommendations; they do not exist in the repository today.
- Existing production duplicate counts and field conflicts are unknown. The proposed preflight intentionally fails until a human-reviewed repair handles them.
- The exact set of mutable JSON fields containing collaborator IDs must be re-inventoried at implementation time; the cited work performer and diary payloads prove that foreign-key discovery alone is insufficient.
- Preserving the stronger work tier and leaving historical diary payloads unchanged are recommended audit semantics, not a currently documented owner decision.
- PostgreSQL operations are not constant-time. The leakage conclusion is that the design removes explicit response/error oracles and keeps the private comparison server-side, not that timing differences are mathematically impossible.
