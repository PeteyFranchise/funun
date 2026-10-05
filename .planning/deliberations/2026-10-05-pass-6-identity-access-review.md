# Pass 6 — identity and access review (2026-10-05)

**The most severe pass. Four criticals, all live.** Read-only; nothing changed.

**Verdict: Phase 50 is not safe to implement** until the identity trigger is rebased on migration
214 and several existing database write surfaces are hardened.

> **This record is incomplete.** The reviewer's output was truncated partway through finding H-2
> (service-role staff reads, four query-scope clusters). Sections A–D of that finding and anything
> after it are **not captured here**. Re-run or request the remainder before treating this as a
> complete picture.

---

## C-1 — A roster owner can forge another account's verified identity. **Worst finding of the day.**

`collaborators.claimed_by` is documented as **"the ONLY verified-identity signal,"** set
**"exclusively by `claim_collaborators()`."** That statement is false as a security property.

"Users manage own collaborators" is an implicit `FOR ALL` policy checking only
`auth.uid() = user_id` (`018:13-31`). **It does not protect `claimed_by`**, and `collaborators`
carries ordinary table-level UPDATE — so the roster owner can set that column directly through
PostgREST.

**Two `SECURITY DEFINER` trigger chains trust it:**

- `sync_project_membership_for_sheet()` (`079:74-127`) inserts a `project_members` **viewer** row
  for `NEW.claimed_by` on every linked non-draft split sheet.
- `sync_work_membership_on_claim()` (`136:278-343`) fills unresolved `work_members.user_id` with
  `NEW.claimed_by`.

**So a roster owner who knows another user's UUID can make that account appear to have claimed a
collaborator identity** — granting it visibility into linked projects and member-level access to
works, and falsifying the identity linkage behind credits, rights records and later split logic.

**Fix:** make `claimed_by` client-immutable, writable only through the verified claim function or
a narrowly authorised service operation. Behaviourally test that an authenticated roster owner
gets `42501` attempting to insert, change or clear it.

## C-2 — Project editors can rewrite rights and royalty inputs on `tracks`

The final `tracks` policy (`193:156-177`) is `FOR ALL` for owner, co-owner and **editor** — whole-row
INSERT, UPDATE and DELETE. The row holds **writers, producers, ISRC, lyrics, metadata JSON
including composer and split facts, audio identity, and `user_id`.**

**Migration 231 protects only `work_id`.** Nothing guards the rest. Application allowlists do not
constrain direct PostgREST writes.

An editor can rewrite another person's credited writers, change split-bearing metadata or
identifiers, reassign attribution, or delete the track outright.

## C-3 — Project editors can fabricate signed legal evidence

`vault_documents` is `FOR ALL` for owner, co-owner and editor (`193:202-229`). Those actors can
directly write **`status`, `document_data`, `signed_at`, `file_url`, `signed_by`, verification
fields and `user_id`.**

The status-evidence CHECK (`045:23-41`) only requires appropriately *shaped* evidence — an editor
can supply the file_url, timestamps and verification values themselves. **It establishes neither
authenticity nor immutability.**

An editor can fabricate signed or verified state, replace the referenced document, change the
asserted signer, or delete the evidence — making a release appear contract-ready when it is not.

## C-4 — An initiator can rewrite or delete an **executed** split sheet

"Initiator manages split sheet" is an implicit `FOR ALL` policy (`018:38-53`) that **remained
active after `esign_pending` and `executed` statuses were added.** The initiator can directly
change or delete `status` (including `executed`), `all_approved_at`, `track_id`,
`vault_project_id`, `work_id`, song identity, and the entire parent row — **after other parties
have approved or signed.** Deleting it can cascade to or detach the evidence hanging from it.

---

## H-1 — Building `handle_new_user()` from migration 098 restores a pre-verification identity model

Phase 50's Slice 1 cites 098. **The live definition is 214.** Fourteen behaviours exist in 214 and
not in 098, including: the staff early-return; exact `account_provision_intents` id + email +
expiry consumption; exact 64-character invite token **bound to the submitted email**;
`collaborator_invites` as a signup source; atomic handle insertion with collision fallback;
**no collaborator identity claimed before email verification**; **no invite accepted before email
verification**; `complete_verified_signup_claim()` locking and consuming the exact invite;
accepted invites resumable only by the same `accepted_user_id`; a durable append-only claim ledger
storing a **token hash, not the token**; and removal of the raw bearer token from
`auth.users` metadata.

**098 instead admits anyone whose email appears on any collaborator row**, without possession of
that collaborator's invite token, marks every pending invite for the email accepted, calls
`claim_collaborators()` **during the `auth.users` INSERT — before verification** — and creates the
profile without the requested handle.

**A nuance that makes this worse than a diff suggests:** this deployment applies `app_metadata`
*after* the INSERT, so the trigger's role branches are not the real provisioning authority for
admin-created accounts — the service-only provision intent and helper reconciliation are
load-bearing. Rebasing from 098 would remove those protections even though the old role branches
look correct in isolation.

Account-creation paths confirmed affected: public Member signup, Client-Partner-only accounts,
industry accounts, Funūn Team Member accounts, and curator claim provisioning. Adding an existing
Member to `buyer_members` does not create an account; `generateLink()` does not create users.

## H-2 — Service-role staff reads have no structural tenant boundary *(TRUNCATED)*

`createServiceClient()` bypasses RLS. The reviewer identified **four query-scope clusters** where
authorised staff should see less than the whole table and the boundary exists **only in query
construction** — fail-open on one omitted predicate.

**Only cluster A was captured before the output truncated:** AE / client-book scope,
`app/(admin)/admin/selects/page.tsx:60-70`. **Clusters B, C and D are unknown.** This finding is
incomplete and must be re-requested.

---

## The pattern across Passes 5, 6 and 7

Seven surfaces now share one shape: **`FOR ALL` to a role, on a table holding rights-bearing
facts, with the protection asserted in a comment rather than enforced by the database.**

`ai_entries` · `lyric_blocks` (`author_user_id` — *"the fact that MOVES SPLITS"*) · `work_versions`
· `collaborators.claimed_by` · `tracks` (writers, producers, ISRC, split metadata) ·
`vault_documents` (signed evidence) · `split_sheets` (executed sheets).

**The schema already knows the right posture.** `work_diary_events` revokes client writes;
Passport values are service-written or append-only; master designations and release links reject
UPDATE and DELETE. Three tables was the wrong scope — this is a systemic gap, and the fix is
applying an existing pattern consistently rather than inventing one.
