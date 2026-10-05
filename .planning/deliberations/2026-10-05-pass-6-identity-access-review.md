# Pass 6 — identity and access review (2026-10-05)

**The most severe pass. Four criticals, all live.** Read-only; nothing changed.

**Verdict: Phase 50 is not safe to implement** until the identity trigger is rebased on migration
214 and several existing database write surfaces are hardened.

> **Completed 2026-10-05** — the truncated remainder was re-requested and is recorded below.

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


---

# Pass 6, continued — the truncated remainder

## H-2 complete — four service-read clusters with no structural boundary

`createServiceClient()` bypasses RLS. `requireStaff()` establishes a staff *role* but enforces no
client-book, room, object or self scope. **Every narrower-than-role service read falls into one of
four clusters, and each is safe only because its predicate is currently correct.**

**A — AE/client-book scope.** `admin/selects/page.tsx:60-70`.

**B — Object-by-URL, then a manual relationship check.** `lib/selects/persistence.ts:47-79`,
`admin/client-partners/[orgId]/page.tsx:55-75`, `admin/clients/[personId]/page.tsx:56-97`. **The
row is read through the service client *before* the relationship check runs.** Dropping or
mistyping the check exposes another Client Partner's organisation record, contact identities,
relationship notes and game plans, briefs and budgets, Selects contents and commercial status,
and licence-request activity. `notFound()` prevents an existence leak — but that is entirely
application-enforced, with no RLS backstop underneath.

**C — Playbook room scope.** Eight pages load all rooms and grants, compute accessible rooms in
TypeScript, then constrain with `.in('room_id', …)`. A dropped predicate exposes incidents,
exception requests and rationales, doctrine drafts and revisions, review threads, learning paths
and completion state, workflow runs, reader feedback, and other departments' operating
procedures. The later `roomById` mapping sometimes prevents an unauthorised row from *rendering* —
**but it was already fetched**, and a refactor, count, export, AI prompt or log statement would
expose it.

**D — Self scope.** Profile, preferences, workflow runs, learning completions, inbox items,
room-lead resolution — all guarded by a single `.eq('user_id', …)` or equivalent. A dropped
predicate exposes other staff members' names, titles, phone numbers, preferences, training state
and assigned operational work.

**The defect is architectural, not a list of bugs.** service_role removes the database boundary,
so one omitted `.eq()` turns a local query error into a cross-client or cross-department
disclosure. The recommended direction: scope into narrow SQL functions or repositories, return
only the columns a surface needs, make unscoped service reads unavailable to general page code,
and behaviourally test the negative cases — unrelated AE, unrelated room member, non-owner staff,
guessed object id.

## H-3 — Multi-role staff see weaker controls than the APIs authorise. **CORRECTS PASS 4.**

API gates pass when **any** value in `staff_roles` is allowed. The page reduces the array to **one
priority-sorted primary role** (`staff-role.ts:65-78`).

- `['bd','anr']` → primary `bd` → **the page redirects**, while the admit/reject and quality APIs
  authorise the secondary `anr`.
- `['ae','anr']` → primary `ae` → the page renders but `canAdmit` and `canReviewQuality` are
  **false**, while both APIs authorise `anr`.

**Pass 4 reported this matrix as clean. It is clean only for single-role staff.** The page
comments claiming the flags mirror the route allowlists are false for anyone holding two roles.

## M — Selects pages admit roles the mutation APIs refuse

The pages admit every operational role except IT and render create/builder controls; the create,
update, send and track APIs allow only leadership, AE and BD. Usually masked by an empty
organisation list — but a non-AE assigned as `ae_user_id` sees actions the server rejects.

## M — Client Partner routing conflates relationship with identity

`postSignInPath()` and the root page send a user to The Crate only when
`app_metadata.role === 'buyer'`. **An existing Member added to `buyer_members` lands in `/vault`
instead of the Client Partner workspace** — the relationship is valid, but login routing behaves
as though it does not exist. Direct `/sync` access works, because that layout correctly queries
`buyer_members`. Not an authorisation bypass; identity-model conflation in navigation.

## M — Six more cross-subject or system-fact mutations

**`works`** — any work member can rewrite title, primary performer, vocal state and working-version
selection. **`tool_outputs`** — co-owners/editors can rewrite or delete tool inputs, outputs and
provenance. **`collaborator_invites`** — the inviter can falsify the invite lifecycle including
`accepted_user_id` and `accepted_at`. **`pitches`** — the *recipient* can rewrite sender, project
and message. **`opportunity_matches`** — the subject can rewrite system-computed `match_score` and
breakdown. **`notifications`** — whole-row update, so notification provenance is not authoritative.

## M, DORMANT — legacy community tables permit impersonation and anonymous deletion

`community_posts`' insert policy checks subscription but **never that `user_id = auth.uid()`** —
a qualifying user can post as someone else. `community_comments` is an implicit `FOR ALL` with
`USING (true)`, so **UPDATE can take over any comment** by setting `user_id` to self, and
**DELETE is open to any role holding table DELETE — including `anon`.** No consumer exists today;
immediately exploitable if these tables are reused.

## Opening signup — what an attacker could do on day one

Real controls exist: durable IP/email rate limits on invite checks, Turnstile on the waitlist,
server-side upload admission, MIME allowlists with image magic-byte checks, and per-file size
caps.

**Missing:** no rate limit or CAPTCHA around the actual `supabase.auth.signUp` call — Turnstile
protects the waitlist form, not Auth. **Direct authenticated Storage writes bypass upload
admission entirely** (`002:27-50`, `004:41-64`): the policies require only the caller's user id as
the first path segment, not that the nested project or track exists or belongs to them. No
aggregate per-account storage quota. No Member-account suspension workflow — workspace suspension
does not disable the underlying identity. Orphan cleanup is incomplete in three ways. The storage
cron is **detection, not prevention**, and says so.

**Day one:** an unauthenticated caller cannot use the authenticated Storage policies, but can
automate signups. Once disposable accounts exist, they can create unbounded owned rows and upload
unlimited per-object-valid files straight to Storage, bypassing the server's daily limits.

## `app_metadata` — clean

**No public signup path can set `staff_roles`, `staff_role`, `is_admin` or `role`.** Signup data
becomes `user_metadata`; staff authority reads only `app_metadata`, written exclusively through
service-only provisioning. Caveat: staff authorisation trusts the JWT and does not re-confirm a
`funun_staff` row per request, so it is safe only while every `app_metadata` writer stays
service-controlled and role removal reliably revokes sessions.

## The RLS mutation census

The reviewer enumerated **every** table by category. **Cross-subject or shared-record mutation
needing correction:** `collaborators` · `split_sheets` · `collaborator_invites` · `works` ·
`work_versions` · `lyric_blocks` · `ai_entries` · `tracks` · `vault_assets` · `vault_documents` ·
`tool_outputs` · `vault_projects` · `pitches` · `opportunity_matches` · `community_posts` ·
`community_comments` · `notifications`.

**Already hardened and the model to copy:** DMs, `work_diary_events`, `work_members`,
`project_members`, licence/deal join tables, Ideas and Writer's Room evidence, e-sign envelopes,
all Song Passport ledgers, workspace grants and agreements, audit and billing events, and
`sync_listings`.

**Why the hardened ones differ:** they treat the row as **evidence rather than editable content** —
SELECT-only RLS combined with actual privilege revocation, append-only storage, immutability
triggers or narrow RPCs. **The unsafe tables kept generic "member/editor manages row" policies
after identity, authorship, signature, provenance or money-bearing columns were added to them.**

## Live-state limitation

This establishes what the corpus specifies, not that production matches it. Before accepting any
remediation, inspect production `pg_policies`, `role_table_grants`, `column_privileges` and active
triggers — then behaviourally attempt each forbidden write as authenticated, anon and service_role.
**A migration statement's presence is not evidence that the behaviour is blocked.**
