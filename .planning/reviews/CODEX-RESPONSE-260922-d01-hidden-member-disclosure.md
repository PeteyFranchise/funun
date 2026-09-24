# D-01 Hidden-Member Disclosure Decision Support

## SUMMARY

The owner is choosing whether an exact email should confirm account membership beyond the audience that the member made discoverable, not whether Funūn may expose the member’s profile or rights data. Branch (a) confirms membership for every unblocked confirmed member and makes invite-by-email an explicit exception to the Green Room visibility rule; branch (b) confirms only what the inviter could already learn through People Search; branch (c) confirms only inside an accepted connection. The baseline is important: the current quick-invite path already exposes `alreadyMember` after migration 179 links a matching account without checking `is_public`, `profile_visibility`, or blocks, so this is partly a decision about retaining versus closing an existing oracle, not creating one from zero (`app/api/collaborators/quick-invite/route.ts:69-107`; `supabase/migrations/179_existing_member_collaborator_reconciliation.sql:23-42`). A neutral response is meaningful only if invite links, roster payloads, `claimed_by`, member badges, notifications visible to the inviter, and later reads do not reveal the branch by another route. Separately, D-05 asks whether a social block only stops future interaction or also suppresses an existing roster relationship; hard severance is not a copy change and can detach or invalidate rights/work references.

## BRANCH (a) KEEP D-01

### Who learns what

For an exact submitted email that belongs to a confirmed account with a `user_profiles` row, the inviter learns: **“this email belongs to a Funūn member.”** Under D-01 that remains true even when `is_public = false`, or when `is_public = true` and `profile_visibility = 'connections_only'` but the inviter is not an accepted connection (`.planning/phases/41-collaborator-discovery-mobile-contact-matching/41-CONTEXT.md:37-46`). D-03 is the exception: if either direction of `no_block` fails, the action returns the same generic non-disclosing failure, creates no roster entry, and sends nothing (`41-CONTEXT.md:69-77`).

The inviter need not receive the member’s handle, display name, profile, legal name, email echoed from canonical account data, or rights identifiers. The fact disclosed is the association between the **email the inviter already supplied** and Funūn membership. The target learns that the identified inviter added them, after the membership fact has already been disclosed; D-02’s notice cannot undo that first disclosure (`41-CONTEXT.md:62-68`).

### What becomes possible

A motivated member with a list of known or guessed addresses can test which addresses have Funūn accounts, including members who deliberately chose connections-only visibility and never accepted the tester. One correct address is enough to confirm one deliberately hidden target. With a future cap of `R` syntactically valid attempts per inviter per day, one account can test at most `R` candidates per day if every attempt—success, miss, blocked, and error—consumes quota; `A` usable accounts can test up to `A × R` candidates per day unless account creation and correlated-abuse controls provide another bound.

That capability substantially exists **today**. Quick Invite inserts the supplied email, migration 179’s `BEFORE INSERT OR UPDATE OF email` trigger resolves any confirmed matching account without visibility or block predicates, and the route returns `alreadyMember: true`; the modal renders “is already a Funūn member” and withholds the signup link (`supabase/migrations/179_existing_member_collaborator_reconciliation.sql:23-55`; `app/api/collaborators/quick-invite/route.ts:74-107`; `components/collaborators/QuickInviteModal.tsx:144-163`). Current tests deliberately pin that response (`app/api/collaborators/quick-invite/route.test.ts:224-256`). Phase 41 branch (a) would make the behavior the declared product contract, spread it into the shared flow, add a rate limit and target notification, and—through D-03—close the current blocked-member bypass.

### Product value and cost

The owner keeps definitive feedback: no wondering whether an invitation was sent to an existing member, no inappropriate signup link, immediate identity linkage, and a clear explanation of why the collaborator is already roster-ready. The target gets notice and can block future interaction. The product cost is that “connections-only” no longer means identity indistinguishable from nonexistent to a non-connection on this path; it means “profile hidden, membership confirmable if someone knows the exact email.” That is narrower than exposing the full profile, but it is a real exception to the current privacy doctrine and must be described that way rather than as reuse of People Search (`app/u/[handle]/page.tsx:253-267`; `.planning/phases/13-network-trust-safety/13-VERIFICATION.md:43-49`).

Amending only the Phase 41 roadmap is coherent if the exception is explicitly limited to authenticated, rate-limited, unblocked collaborator invitation by exact email. Generalizing it into “hidden identity may be confirmed anywhere” would collide with substantially more Phase 13 behavior discussed under BLAST RADIUS OF AMENDING.

## BRANCH (b) NARROW D-01

### Who learns what

The inviter receives “already a member” only when the target is already discoverable **to that inviter** under the live rule:

- `is_public = true`;
- `profile_visibility = 'public'`, **or** `profile_visibility = 'connections_only'` with an accepted `connections` row between the two users;
- no block in either direction;
- not self.

Those are the predicates in the current exact-email discovery function (`supabase/migrations/210_no_block_relocation.sql:364-396`). People Search then applies the same public-safe projection and visibility check before returning the result (`lib/green-room/discover.ts:480-511`, `:526-544`). For `is_public = false`, or a connections-only target without an accepted connection, the inviter receives a neutral result indistinguishable from a non-member; blocked pairs take D-03’s generic no-action path.

### What becomes possible

For public profiles and accepted connections, no new membership fact becomes learnable: People Search already accepts an exact email, resolves it through the visibility-gated RPC, and returns the visible profile card (`components/green-room/PeopleSearch.tsx:152-160`; `lib/green-room/discover.ts:437-460`). For a hidden non-connection, the email-invite response no longer supplies confirmation once the current Quick Invite and migration-179 bypass are closed. A tester can still submit guesses, but the output does not distinguish a hidden member from an unregistered address.

The word “neutral” creates a real implementation obligation. If the server immediately links a hidden account, today the roster owner can receive the full row—including `claimed_by`—because the GET route uses `select('*')`, and current UI types and badges treat `claimed_by` as the member signal (`app/api/collaborators/route.ts:6-24`; `lib/collaborators/index.ts:38-65`, `:135-139`; `components/collaborators/CollaboratorCard.tsx:255-264`). Current owner RLS is also row-wide, keyed only to `user_id` (`supabase/migrations/018_collaborators_split_sheets.sql:29-32`). Therefore branch (b) cannot be delivered by changing success copy while still writing a plainly owner-readable claimed row. It needs either a pending/consent state that does not link the hidden account yet, or a redesigned server-only identity bridge plus grants/RLS/projections that prevent the owner from recovering the hidden branch through direct reads.

### Product value and cost

The privacy setting keeps its current operational meaning: a non-connection cannot use search or invitation feedback to distinguish the member from a nonexistent/private identity. The owner still receives exact feedback wherever search could already provide it. What the owner loses is definitive resolution for hidden non-connections: Funūn must say only that the request was handled, cannot expose a member badge or branch-specific invite link, and may have to wait for the target to consent before creating the canonical link. That ambiguity is the product cost of preserving the existing visibility boundary.

The current migration-179 trigger is incompatible with this branch because it links by confirmed email alone (`supabase/migrations/179_existing_member_collaborator_reconciliation.sql:23-42`). Since migration 179 is applied history, implementing branch (b) requires a new human-reviewed migration or a new server-owned state/path that prevents the old trigger from deciding the hidden case; editing 179 in place would not repair production.

## BRANCH (c) CONNECTIONS ONLY

### Who learns what

On the strict reading, the inviter receives membership confirmation only when all of the following are true: the account is confirmed and has a member profile, `is_public = true`, an accepted connection exists between inviter and target, and neither party has blocked the other. A merely public profile is not enough. `profile_visibility = 'connections_only'` and `profile_visibility = 'public'` are treated alike once the accepted-connection requirement is imposed; `is_public = false` remains outside the disclosed set.

An accepted connection is mutual state recorded with `status = 'accepted'`; the current visibility helper already treats that state as sufficient for a connections-only profile (`lib/trust-safety/contracts.ts:140-154`; `lib/green-room/discover.ts:401-416`). The target and inviter therefore already know each other as Funūn members. The invite response restates an existing fact rather than creating a new membership disclosure.

### What becomes possible

Inside the invite-by-email route, a motivated stranger cannot obtain a new membership confirmation even for a public member; only an already accepted connection receives the affirmative branch. However, this is **not a platform-wide membership-hiding rule while exact-email People Search remains available**. A stranger can currently enter a public member’s exact email in People Search and receive their public profile (`components/green-room/PeopleSearch.tsx:152-160`; `supabase/migrations/210_no_block_relocation.sql:371-396`).

Branch (c) is therefore coherent in either of two explicitly different forms:

1. **Route-specific rule:** the invite response confirms only connections, while People Search may still reveal public members. This limits what the invite workflow says but does not reduce public-member discoverability overall.
2. **Platform-wide exact-email rule:** exact-email confirmation anywhere requires an accepted connection. This additionally requires narrowing or removing the existing exact-email People Search RPC/UI behavior.

Treating branch (c) as platform-wide without changing People Search would only look private; the same query would remain available one screen away.

### Product value and cost

The membership response carries almost no incremental privacy exposure because the accepted connection already proves membership. The owner loses automatic definitive email reconciliation for the primary Phase 41 use case—adding a new collaborator who is not yet connected—even when that person has a public profile. In the route-specific form, search-first UX can recover much of that convenience by finding the public member before email entry, but duplicated entry points and direct API use can still produce apparently inconsistent answers. In the platform-wide form, exact-email discovery for public non-connections is also lost; the owner must find them by name/handle, establish a connection, or use a consent-deferred request.

As with branch (b), immediately writing a visible claimed roster row for a non-connection would defeat the neutral response. The database/storage consequence must match the disclosure rule, not merely the response copy.

## EXPOSURE

### What can and cannot be quantified now

No production counts are present in the repository, and this review did not query production. Migration 149 set `is_public = true` for then-current profiles whose visibility was one of the valid states and changed the default to true (`supabase/migrations/149_green_room_people_search.sql:14-20`). The owner-facing setting changes only `profile_visibility`/`open_to_visibility`, not `is_public` (`app/api/profile/visibility/route.ts:20-30`). Consequently, the likely meaningful hidden population is `profile_visibility = 'connections_only'`; `is_public = false` is a legacy/exception population that still must be counted rather than assumed to be zero.

This summary-only SQL answers the global sizing question without returning emails, names, paths, or raw member rows:

```sql
WITH eligible_members AS (
  SELECT
    profile.id,
    profile.is_public,
    profile.profile_visibility
  FROM public.user_profiles AS profile
  JOIN auth.users AS account ON account.id = profile.id
  WHERE account.deleted_at IS NULL
    AND account.email_confirmed_at IS NOT NULL
)
SELECT
  count(*) AS confirmed_members,
  count(*) FILTER (WHERE is_public IS NOT TRUE) AS legacy_non_public,
  count(*) FILTER (
    WHERE is_public IS TRUE AND profile_visibility = 'public'
  ) AS public_profiles,
  count(*) FILTER (
    WHERE is_public IS TRUE AND profile_visibility = 'connections_only'
  ) AS connections_only_profiles,
  count(*) FILTER (
    WHERE is_public IS NOT TRUE OR profile_visibility = 'connections_only'
  ) AS neutral_for_a_nonconnection_under_branch_b,
  round(
    100.0 * count(*) FILTER (
      WHERE is_public IS NOT TRUE OR profile_visibility = 'connections_only'
    ) / NULLIF(count(*), 0),
    2
  ) AS neutral_percent_for_a_nonconnection
FROM eligible_members;
```

The global number slightly overstates branch (b)’s neutral bucket for any particular inviter because their accepted connections can see connections-only profiles. This pair-specific, still summary-only query gives the actual visibility bucket for one inviter; replace the UUID in a human-reviewed SQL session:

```sql
WITH params AS (
  SELECT '00000000-0000-0000-0000-000000000000'::uuid AS inviter_id
), targets AS (
  SELECT profile.id, profile.is_public, profile.profile_visibility
  FROM public.user_profiles AS profile
  JOIN auth.users AS account ON account.id = profile.id
  CROSS JOIN params
  WHERE profile.id <> params.inviter_id
    AND account.deleted_at IS NULL
    AND account.email_confirmed_at IS NOT NULL
), classified AS (
  SELECT
    target.id,
    EXISTS (
      SELECT 1
      FROM public.connections AS connection
      CROSS JOIN params
      WHERE connection.status = 'accepted'
        AND (
          (connection.requester_id = params.inviter_id AND connection.addressee_id = target.id)
          OR
          (connection.addressee_id = params.inviter_id AND connection.requester_id = target.id)
        )
    ) AS connected,
    EXISTS (
      SELECT 1
      FROM public.blocks AS block_row
      CROSS JOIN params
      WHERE (block_row.blocker_id = params.inviter_id AND block_row.blocked_id = target.id)
         OR (block_row.blocker_id = target.id AND block_row.blocked_id = params.inviter_id)
    ) AS blocked,
    target.is_public,
    target.profile_visibility
  FROM targets AS target
)
SELECT
  count(*) AS candidate_members,
  count(*) FILTER (WHERE blocked) AS blocked_generic_no_action,
  count(*) FILTER (
    WHERE NOT blocked
      AND NOT (
        is_public IS TRUE
        AND (profile_visibility = 'public' OR connected)
      )
  ) AS neutral_by_visibility_under_branch_b,
  count(*) FILTER (
    WHERE NOT blocked AND NOT (is_public IS TRUE AND connected)
  ) AS neutral_under_branch_c
FROM classified;
```

These are human-run diagnostic queries, not proposed migrations, and nothing here is claimed as applied.

### Honest worst cases

- **Branch (a):** For one deliberately hidden member whose email the attacker knows or guesses correctly, the realistic worst case is immediate confirmation on the first attempt, plus creation/linking of a private roster record. The target’s later notification enables a block against that account but cannot retract the learned fact or remove the row under current D-05 semantics. For list enumeration, the bound is the selected cap `R` per account per day only if the limiter fails closed and counts all attempts; the cap is not yet chosen (`41-CONTEXT.md:62-68`). Multiple usable accounts multiply the bound. The current Quick Invite endpoint has neither D-02 control in this route nor D-03 visibility/block logic, so present exposure is not actually bounded by the future Phase 41 cap (`app/api/collaborators/quick-invite/route.ts:31-108`).
- **Branch (b):** The worst intended disclosure is membership that was already visible to that inviter: all public profiles and connections-only profiles for accepted connections. A hidden non-connection remains indistinguishable from a non-member. The practical worst case becomes branch (a) again if any side channel remains—`alreadyMember`, missing/present invite link, `claimed_by`, member badge, different HTTP shape, visible notification status, timing dominated by external email, or direct row access.
- **Branch (c):** In the route-specific form, the invite route newly confirms only an existing mutual connection, so incremental disclosure is effectively zero; public non-connection membership remains learnable through exact-email People Search. In the platform-wide form, even that public exact-email lookup is removed for non-connections, and the remaining confirmation set is the accepted-connection graph. The size is inviter-specific and answered by the second query, not by a single global percentage.

The notification reduces quiet abuse but does not reduce the number of facts disclosed. Its deterrent value depends on whether it identifies the inviter, arrives reliably, and cannot itself be spammed by retries; those details are not yet decided.

## FOURTH OPTIONS

### Coherent options

1. **Consent-deferred confirmation.** Return the same immediate “request sent” response for members and non-members. Existing members receive an in-app request; non-members receive a signup/request path. Do not expose or create an owner-readable claimed link until the target accepts. After acceptance, both an existing member and a newly joined member produce the same “added” state. This is coherent but changes D-09’s immediate-link rule, requires a pending request state with expiry/idempotency, and adds target action and delay.

2. **Per-member confirmation setting.** Add a setting distinct from profile visibility: for example, “Allow Funūn to tell someone who enters my exact email that I am a member.” The resolver checks that setting plus `no_block`; opted-out targets get the neutral/consent path. This is coherent if the default, existing-member backfill, setting copy, direct-read protection, and behavior when the setting changes are explicitly decided. It is not coherent if the setting is enforced only in UI while migration 179 or direct PostgREST reads still expose `claimed_by`.

3. **Target-approved one-time confirmation.** Notify the target that a named member wants to add them and disclose/link only if they approve that specific inviter. This is a narrower consent-deferred variant and avoids a global discoverability preference. It requires a durable, expiring, single-use request and a neutral result on denial or timeout so denial does not become another membership oracle.

4. **Proof exchanged out of band.** The target supplies the inviter a one-time code or share link from their Funūn account. Possession authorizes that one link without changing global visibility. This is coherent and strong against unsolicited lookup, but it moves coordination outside the frictionless email flow and needs replay/expiry controls.

### Options that only look coherent

1. **“Disclose membership but not the specific identity.”** An exact email is already a specific identifier. Saying “an account exists for that address” confirms the identity association even if no name, handle, or avatar is returned. The only genuinely non-identifying response is a neutral one that does not confirm membership.

2. **Artificial or asymmetric delay with the same eventual two outcomes.** If “member” and “invite” eventually differ, delay changes speed, not knowledge. It may reduce bulk throughput but is weaker and less auditable than the explicit rate cap; D-21 already rejects artificial delay (`41-CONTEXT.md:186-190`). Timing becomes a coherent option only when the target’s consent controls whether confirmation is ever released.

3. **Notify before revealing, but reveal automatically after a timer.** The target still cannot prevent disclosure, so this is branch (a) with advance warning. It may improve notice but does not create consent.

4. **Neutral copy with different artifacts.** Returning “request handled” while giving non-members a copyable signup URL, giving members a badge, writing visible `claimed_by`, or showing different roster state is still an oracle. Current Quick Invite demonstrates this exact multi-signal shape: `alreadyMember` controls both copy and invite-link visibility (`components/collaborators/QuickInviteModal.tsx:144-163`).

## BLAST RADIUS OF AMENDING

### Existing code and tests that encode the hidden-identity rule

1. **Exact-email People Search RPC.** The live definition requires `is_public`, bidirectional `private.no_block`, and either public visibility or an accepted connection (`supabase/migrations/210_no_block_relocation.sql:364-404`). Migration 210 calls it the already-correct model copied from migration 149 (`:350-363`). Branch (a) should not silently widen this RPC unless the owner intends the exception to apply to People Search too; Phase 41 needs a separate service-only resolution path if invite-by-email is the only exception.

2. **People Search application layer.** Exact email is deliberately detected and routed through that RPC; a failed visibility-gated lookup returns no results (`lib/green-room/discover.ts:437-460`). The same module excludes connections-only profiles for non-connections after loading relationships and blocks (`lib/green-room/discover.ts:401-435`, `:526-544`). The UI explicitly advertises “exact email” search (`components/green-room/PeopleSearch.tsx:152-160`).

3. **Public profile route.** A block in either direction and a connections-only non-connection both produce the same `notFound()` as nonexistent/private, before downstream content loads (`app/u/[handle]/page.tsx:201-215`, `:253-267`). A narrowly documented invite exception need not change this route; a generalized amendment would.

4. **Trust/safety contracts and settings.** The only profile states are `public` and `connections_only`; the shared helper returns connections-only visibility only to the owner or accepted connections (`lib/trust-safety/contracts.ts:123-154`). Settings copy promises only accepted connections can view the **full profile**, not that account existence is never confirmable, so branch (a) would not make that sentence literally false—but the exception should be disclosed to avoid a misleading privacy expectation (`components/profile/PrivacySettingsForm.tsx:19-28`).

5. **Phase 13 verification doctrine.** Phase 13 records that connections-only profiles are excluded from search, direct visits resolve like nonexistent/private, block direction is never distinguishable, and block errors are generic (`.planning/phases/13-network-trust-safety/13-VERIFICATION.md:43-49`, `:122-138`). A narrow branch-(a) exception requires an explicit note that collaborator email reconciliation is outside that otherwise-uniform discovery rule. Branches (b) and (c) preserve or strengthen it.

6. **Tests.** `__tests__/profile-privacy-api.test.ts:177-238` pins public-versus-connections-only search behavior. `__tests__/migration-149.test.ts:18-38` pins the SQL visibility predicates, and `__tests__/migration-210-no-block-relocation.test.ts:494-523` pins migration 210’s discover function as migration 149 plus only the helper relocation. None should be weakened merely to implement a route-specific D-01 exception. New Phase 41 tests must instead pin the chosen exception and all neutral-output side channels.

### Existing code that already violates the roadmap rule

1. **Migration 179 trigger.** It resolves confirmed membership by email with no `is_public`, `profile_visibility`, connection, or block predicate (`supabase/migrations/179_existing_member_collaborator_reconciliation.sql:23-42`). Because it is applied history, any correction is a new migration.
2. **Quick Invite route and modal.** The route returns the full collaborator plus `alreadyMember`; the modal prints the membership fact and conditionally removes the signup link (`app/api/collaborators/quick-invite/route.ts:95-132`; `components/collaborators/QuickInviteModal.tsx:144-163`).
3. **Quick Invite tests.** The existing-member case asserts `alreadyMember: true`, no invite, and the claimed row (`app/api/collaborators/quick-invite/route.test.ts:224-256`). The selected branch must replace or retain this expectation deliberately.
4. **General roster read.** It selects and returns `*`, making a neutral response insufficient after immediate linking (`app/api/collaborators/route.ts:16-24`). Phase 41 already recognizes the need for explicit projections, but branch (b)/(c) also needs a database-level answer for direct owner reads, not only route shaping (`41-CONTEXT.md:171-185`).

### Planning documents

- Branch (a) requires amending `.planning/ROADMAP.md:2700-2704` and the anti-enumeration wording at `:2722-2726`, plus resolving D-01a in `41-CONTEXT.md:42-61`. The amendment should say whether it is an invite-only exception.
- Branch (b) resolves D-01a in favor of the existing `discover_profile_id_by_email` predicate and keeps the roadmap’s hidden rule.
- Branch (c) must say whether it governs only invite feedback or all exact-email discovery; otherwise the roadmap and actual People Search capability will describe different boundaries.
- Phase 41.1’s mobile-contact phase independently requires “no-reverse-lookup/no-bulk-enumeration” (`.planning/ROADMAP.md:2790-2791`). A web invite exception does not automatically amend that research-gated mobile rule.

The blast radius is therefore asymmetric. A narrow branch-(a) exception mostly requires documentation plus a deliberately separate resolver and fixes to the current blocked-member bypass. A generalized branch-(a) rule would require revisiting People Search, public-profile indistinguishability, Phase 13 verification claims, and tests. Branches (b)/(c) require more change in the current Quick Invite/reconciliation path because today’s implementation already follows branch (a) without its mitigations.

## D-05 BLOCK SEVERANCE

### Path (a): block future discovery, additions, and notifications; preserve the row

**Behavior.** Once either party blocks the other, all future search results, email reconciliation attempts, add attempts, invitations, and collaborator-added notifications fail generically. The existing collaborator row, `claimed_by`, owner-entered data, and downstream references remain. The owner may continue to possess the information they entered before the block; the target cannot make them unlearn it.

**Build cost.** Phase 41’s transactional resolver must call the relocated bidirectional block rule at write time, and every older entry route—including Quick Invite and manual create—must not route around it. Notification emission must recheck or be transactionally derived from the successful transition. The current block route only inserts/deletes `blocks`; it does not touch collaborator rows (`app/api/network/blocks/route.ts:7-19`, `:39-54`). UI copy must state honestly that blocking stops future Funūn interaction, not that it erases another member’s private business records.

**Reference cost.** None of the named references breaks. Split-sheet parties retain `collaborator_id` and frozen legal snapshots, work memberships retain collaborator/user identity and access, and Song Passport values retain their contributor target. This matches Phase 13’s existing model: later blocks do not delete accepted connections/follows; read/write surfaces enforce `no_block` while stale relationship records remain as data hygiene (`.planning/phases/13-network-trust-safety/13-VERIFICATION.md:133-140`).

**Product cost.** The notified target’s block does not remove the roster card or the claimed relationship. If they understand the block link as “remove me from this person’s roster,” the product has overpromised. The owner preserves audit, work, and rights continuity.

### Path (b1): suppress/archive the active roster relationship but preserve its identity

**Behavior.** A later block makes the row inactive in ordinary roster/picker responses and prevents use for new work, while preserving the row and historical references. This is reversible only if the owner explicitly decides what unblock should do; silently restoring a target-suppressed relationship would be a separate privacy decision.

**Build cost.** Reusing `archived_at` alone is not enough. Current archive is owner-controlled, and the sanitizer lets the owner clear it; owner RLS still permits reading the full archived row, while claimed-member RLS also ignores archive state (`lib/collaborators/index.ts:113-123`; `supabase/migrations/018_collaborators_split_sheets.sql:29-32`; `supabase/migrations/052_restore_collaborators_claimed_by.sql:16-19`). A meaningful target-initiated suppression needs server-owned state such as `blocked_at`/`suppressed_at`, block-aware GET/picker/update rules, a prohibition on owner reactivation while the block exists, and a transaction or SECURITY DEFINER operation because the blocker may not own the collaborator row. If “hide” means the owner cannot read the row even through direct PostgREST, RLS/grants must change; UI filtering is not sufficient.

**Reference cost.** Archival/suppression can preserve every ID, so split-sheet parties, work members, and Song Passport values need not break. The planner must decide whether historical works may still display the collaborator and whether future use is forbidden. The social block should not silently rewrite executed agreements or rights evidence.

**Product cost.** The row disappears from active workflows, which gives the target a stronger remedy, but owners may lose convenient access to legitimate historical business records. Support and audit views need a controlled way to explain suppression without revealing who blocked whom to the wrong party.

### Path (b2): clear `claimed_by` but retain the owner’s row

**Behavior.** The verified account bridge is severed, but the owner-authored roster record and its `id` remain. The target loses the claimed-user SELECT path and member provenance; the owner retains the record.

**Build and reference cost.** This does not automatically revoke downstream access. `sync_work_membership_on_claim` only fills `work_members.user_id` when `claimed_by` changes and never clears it, so existing work access remains (`supabase/migrations/136_work_members.sql:285-343`). Split-sheet parties still point to the collaborator row but lose live identity resolution; legal snapshots remain. Collaborator-targeted Song Passport values remain tied to that row rather than the canonical user. Migration 179 would also relink the account on a later email update unless a new suppression invariant prevents it (`supabase/migrations/179_existing_member_collaborator_reconciliation.sql:23-42`). This path is therefore implementable only with explicit downstream and re-link rules; clearing one column is not severance of the whole relationship.

### Path (b3): hard-delete or replace the row

**Behavior.** The roster identity itself is removed or replaced by a tombstone. This is the strongest erasure-like behavior and the most disruptive.

**Split-sheet parties.** Their FK is `ON DELETE SET NULL`, so the legal snapshot fields survive but lose the roster link (`supabase/migrations/018_collaborators_split_sheets.sql:57-78`). Because `split_sheet_parties.user_id` is not reliably populated by the current claim lifecycle, deletion can leave a named legal party with no canonical account bridge; migration 136 explicitly documents that column as a dead signal in current flows (`supabase/migrations/136_work_members.sql:285-296`). Executed/frozen document evidence should not be rewritten merely because a social block occurred.

**Work members.** `collaborator_id` becomes null, but `user_id` remains and can continue granting work access (`supabase/migrations/136_work_members.sql:82-98`). If block is intended to revoke work access too, those memberships need separate, authorized removal semantics; automatically ejecting someone from an active work is materially broader than blocking social/contact surfaces. If rows are repointed instead, the two unique work-member indexes can collide and require per-work reconciliation.

**Song Passport values.** The FK says `ON DELETE SET NULL`, but contributor values also have a check requiring exactly a valid user target or collaborator target with a matching `target_key` (`supabase/migrations/151_song_passport_foundation.sql:37-53`, `:84-113`). A collaborator-targeted value with `subject_user_id IS NULL` cannot simply have `collaborator_id` set to null; the resulting row violates the check. In practice, deletion may fail unless the same controlled transaction first converts appropriate values to `subject_user_id` plus `target_key = 'user:' || id`, archives them, or otherwise resolves provenance. This makes naive hard deletion unsafe and, for affected rows, likely unexecutable.

**Unconstrained JSON.** `works.primary_performer` can carry `collaborator_id` inside JSONB with no FK, so deletion produces a stale identifier that the database cannot repair automatically (`supabase/migrations/135_works_core.sql:66-84`).

**Build cost.** A safe version needs a human-gated schema/data design, transactionally ordered reference repair, immutable audit/tombstone behavior, rules for executed documents and active work access, idempotency, and unblock semantics. The current DELETE route expressly refuses claimed rows to preserve credit records (`app/api/collaborators/[id]/route.ts:38-89`). Hard deletion is not unimplementable in principle, but a direct `DELETE` without prior conversion is unsafe and can fail on Song Passport constraints.

### The exact D-05 choice

The owner is not choosing merely between “keep” and “remove.” The actual choices are:

- future-only block with records and work/rights relationships intact;
- suppress the relationship from new roster use while preserving historical identity;
- sever only the verified account bridge while leaving business records and some access intact; or
- perform a rights-aware destructive conversion/deletion across every reference.

Each makes a different promise. D-05 must name which promise the block link gives; otherwise UI copy, RLS, work access, legal records, and user expectations will disagree.

## CONFIDENCE

### Verified by reading code and current planning artifacts

- The current exact-email People Search predicate uses `is_public`, public-or-accepted-connection visibility, self exclusion, and bidirectional `no_block` (`supabase/migrations/210_no_block_relocation.sql:364-396`).
- The owner can select only `public` or `connections_only`, and the public-profile/search helpers enforce accepted-connection visibility (`lib/trust-safety/contracts.ts:123-154`; `app/api/profile/visibility/route.ts:20-30`).
- Current Quick Invite plus migration 179 already exposes confirmed membership without visibility/block checks, and its UI/tests intentionally distinguish the branch (`app/api/collaborators/quick-invite/route.ts:69-107`; `components/collaborators/QuickInviteModal.tsx:144-163`; `app/api/collaborators/quick-invite/route.test.ts:224-256`).
- Current block creation does not alter collaborator rows, connections, or downstream references (`app/api/network/blocks/route.ts:39-54`; `.planning/phases/13-network-trust-safety/13-VERIFICATION.md:133-140`).
- The split-sheet, work-member, Song Passport, and JSON reference behavior described in D-05 follows the cited schema definitions.
- Targeted verification passed on 2026-09-22: 3 suites, 33 tests—`__tests__/profile-privacy-api.test.ts`, `__tests__/migration-149.test.ts`, and `app/api/collaborators/quick-invite/route.test.ts`—using Jest `--runTestsByPath`.

### Inferred or not verified against production

- Production is at migration 227 as supplied by the requester; no production database or member data was queried.
- The number and percentage of connections-only or legacy `is_public = false` profiles are unknown until the summary queries above are run.
- Abuse volume depends on the still-undecided cap, whether every attempt consumes quota, account-acquisition friction, and cross-account abuse controls. The `R` and `A × R` bounds are formulas, not observed traffic estimates.
- The likelihood that members interpret “connections-only” as hiding membership itself is a product/user-expectation inference; the current settings copy literally promises only that accepted connections can view the **full profile** (`components/profile/PrivacySettingsForm.tsx:20-28`).
- The effect of notifications on attacker deterrence is inferred; delivery reliability, copy, inviter identification, and durable idempotency are not yet specified.
- No branch is recommended here. No migration was created or applied, and no production state was changed.
