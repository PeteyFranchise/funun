# Phase 41 Context Review

## BOTTOM LINE

Phase 41 is **not yet plannable as written**: most product intent is clear, but three load-bearing rules need correction or explicit scoping before plans are generated. D-01 and D-19 are reconcilable—D-01 may distinguish “existing member” from “signup invite,” while D-19 hides whether the member path inserted, reused, or resurfaced a roster row—but the context must say that boundary explicitly (`.planning/phases/41-collaborator-discovery-mobile-contact-matching/41-CONTEXT.md:36-40`, `:120-125`). D-01 still directly contradicts the roadmap, which says a hidden identity must not be exposed by reverse lookup and that email invitation must resist enumeration (`.planning/ROADMAP.md:2700-2704`, `:2722-2726`). D-16 also depends on unique indexes that D-17 cannot safely create until a legacy consolidation migration that D-17 simultaneously excludes from Phase 41 (`41-CONTEXT.md:106-116`, `.planning/ROADMAP.md:2742-2746`). Resolve those two contradictions, make the rights containment the first owned plan and release gate, correct the surface inventory, and split the work into an identity-safety foundation followed by the UI rollout.

## CONTRADICTIONS

### 1. D-01 and D-19 do not inherently conflict, but their scopes are unstated

D-01 discloses one fact: whether the submitted address resolved to a Funūn member or received a signup invitation (`41-CONTEXT.md:36-40`). D-19 conceals a different fact: within the existing-member branch, whether the roster operation created a row, reused one, or resurfaced an archived one (`41-CONTEXT.md:120-125`). An implementation can therefore return:

- one uniform, privacy-safe “member added” result for inserted, reused, already-linked, and resurfaced member rows; and
- a distinct “signup invite sent” result for a non-member.

That is the only reconciliation consistent with both decisions. The context should state it because D-19 currently says “same status, keys, copy and notification behaviour” without naming the endpoint or branch, while D-01 expressly demands different copy. A planner could reasonably read D-19 as applying to the entire shared email flow and erase D-01, or read D-01 as permission to restore `reused`/`alreadyMember`; both readings would be wrong. D-19 should say: **uniform across roster-resolution outcomes after a server-verified member match; D-01 alone governs member-match versus signup-invite feedback.**

### 2. D-01 conflicts with the canonical roadmap, not with D-19

The roadmap says that an email match may link an eligible member but that “a hidden or blocked identity must not be exposed through a reverse-lookup result” (`.planning/ROADMAP.md:2700-2704`). It separately says the path must resist email enumeration and, after no discoverable match, must not claim that the person is not a member (`.planning/ROADMAP.md:2722-2726`). D-01 deliberately does the opposite for hidden, unblocked members: it turns the invite box into a registration oracle and says so (`41-CONTEXT.md:36-40`; the owner selected that tradeoff in `41-DISCUSSION-LOG.md:14-24`).

These cannot both be implemented. Rate limiting and a victim notification do not make the two output rules compatible; they only bound and surface use of the oracle. Before planning, choose the canonical rule in writing:

- If D-01 stands, amend the roadmap to say hidden-but-unblocked membership is intentionally disclosed to an inviter, while blocked identities remain opaque.
- If the roadmap stands, narrow D-01 to members discoverable to that inviter and use neutral output for hidden members.

This review does not substitute a preferred privacy tradeoff for the owner’s explicit choice. It flags that the approved choice and the authoritative roadmap presently command opposite observable responses.

### 3. D-16 cannot be delivered while D-17 excludes its mandatory prerequisite

D-16 makes two partial unique indexes the final race arbiter (`41-CONTEXT.md:106-109`). D-17 correctly says production may contain duplicates that would make those indexes fail, then declares legacy consolidation “not Phase 41 work” (`41-CONTEXT.md:110-113`). The roadmap nevertheless makes preflight reconciliation mandatory before the indexes (`.planning/ROADMAP.md:2742-2746`), and migration 148 proves this is not a theoretical class: it previously found matching claimed/unclaimed rows, repointed work membership, expired invitations, and archived duplicates (`supabase/migrations/148_writer_room_existing_collaborator_repair.sql:30-100`, `:125-178`). Migration 179 can create later collisions because it updates every matching unclaimed row to the same account without a uniqueness invariant (`supabase/migrations/179_existing_member_collaborator_reconciliation.sql:57-71`).

“Preflight” cannot make unsafe data disappear. If it finds duplicates, the indexes cannot land until survivor selection, reference repair, and loser treatment are executed. Either the first Phase 41 foundation plan owns a human-reviewed repair migration before the constraint migration, or a separately numbered prerequisite phase owns and completes it. Keeping consolidation deferred while promising the indexes makes the phase conditionally unimplementable.

### 4. D-05 calls blocking “total,” but current blocking does not revoke an existing roster relationship

D-05 rejects a separate removal mechanism because “the block remedy already exists” and is “total” (`41-CONTEXT.md:53-54`; selected rationale at `41-DISCUSSION-LOG.md:48-56`). Current blocks are directional records with policies only for a blocker’s own blocklist (`supabase/migrations/035_connections_blocks.sql:79-110`). The collaborator owner retains their independent owner policy (`supabase/migrations/018_collaborators_split_sheets.sql:29-32`), while the claimed member merely gains another SELECT policy (`supabase/migrations/052_restore_collaborators_claimed_by.sql:16-19`). Creating a block does not archive the collaborator row, revoke its owner’s visibility, clear `claimed_by`, or remove existing references.

D-03 can make blocking total **for future add attempts**. It does not make the notification’s block link a removal remedy for the row just created. The context must choose whether a later block (a) prevents only future discovery, additions, and notifications while the existing private roster row remains, or (b) also hides/archives/severs the claimed roster relationship. That is a product and privacy decision, not an implementation detail.

## GAPS

### Real decisions required before planning

1. **Canonical hidden-member response.** Resolve D-01 against the roadmap as described above. The exact response is externally observable and changes the privacy boundary; a planner must not invent it (`41-CONTEXT.md:36-40`; `.planning/ROADMAP.md:2700-2704`).

2. **Block-after-add semantics.** Decide what happens to an already-linked row when either party later blocks the other. “No separate removal” is implementable only if the owner accepts that blocking does not revoke the existing private roster record; the current database does not supply that effect (`41-CONTEXT.md:45-54`; `supabase/migrations/035_connections_blocks.sql:79-110`).

3. **Who owns legacy reconciliation.** D-17 needs an owner and a release slot. The repair policy must decide survivor selection and how to preserve/collapse references before the indexes can be proposed. `work_members` has independent unique identities by user and collaborator, so a blanket foreign-key rewrite can itself collide (`supabase/migrations/136_work_members.sql:82-98`). Song Passport contributor values bind `target_key` to either a subject user or collaborator ID (`supabase/migrations/151_song_passport_foundation.sql:37-53`, `:95-113`), while `works.primary_performer` stores identity in JSONB without an FK (`supabase/migrations/135_works_core.sql:66-84`). Those are data-governance choices, not mechanical index setup.

4. **Manual identities without email.** D-13 defines unclaimed identity by normalized email (`41-CONTEXT.md:93-96`), but the API currently requires only `name` and accepts a row with no email (`app/api/collaborators/route.ts:38-47`, `:71-78`). The split-sheet `PartyPicker` deliberately supports phone-only fast-add and synthesizes `name` from phone (`components/split-sheets/PartyPicker.tsx:205-221`, `:262-289`). Decide whether Phase 41 preserves email-less/phone-only manual rows as intentionally non-deduplicable records, requires email on every new roster identity, or introduces another server-owned identity mechanism. A name must not become the fallback key.

5. **Visibility of legacy owner-entered fields after linking.** D-14 preserves an existing row in place (`41-CONTEXT.md:97-105`), so that row may already contain owner-entered email, phone, legal name, IPI, PRO, publisher, administrator, MLC/SoundExchange ID, and address—the editable model explicitly includes those fields (`lib/collaborators/index.ts:6-32`, `:38-65`). D-09 then lets the claimed member SELECT that whole database row through RLS (`41-CONTEXT.md:75-77`; `supabase/migrations/052_restore_collaborators_claimed_by.sql:16-19`). D-22 protects four outbound surfaces but never decides whether the newly linked person should see all assertions the owner previously stored about them, or which fields remain visible to the owner after the row becomes claimed. This requires a field-level product rule and probably distinct owner/subject DTOs; RLS alone is row-level, not column-level.

6. **Notification transition semantics.** D-02 requires notification when someone is added (`41-CONTEXT.md:41-44`), while D-19 demands the same notification behavior for created, reused, and resurfaced outcomes (`41-CONTEXT.md:120-125`). Decide which state transitions constitute a new “added” event. An idempotent retry or repeated click on an already-linked row should not repeatedly notify the target; resurfacing an archived relationship may or may not warrant a new notification. The existing notification helper can coalesce identical content for sixty seconds, but that is not durable event idempotency (`lib/notifications/index.ts:28-48`).

7. **Client-selected search target contract.** The context says the client may never “choose” `claimed_by` (`41-CONTEXT.md:220-224`), which is correct, but the roadmap additionally says it may never choose the destination account ID (`.planning/ROADMAP.md:2719-2720`). A user clicking a People Search result necessarily sends some target reference; the public result already contains the profile `id` (`lib/green-room/discover.ts:80-95`). Decide whether the request carries that discoverable ID or a server-minted opaque selection token. In either case, the server must re-resolve visibility/block eligibility and derive `claimed_by`; the client must never write it directly. The literal “may never choose the destination account ID” wording is not implementable for an explicit picker.

### Planner-owned details, once the decisions above are fixed

- The exact per-member daily lookup cap, already delegated by D-02 (`41-CONTEXT.md:41-44`), plus whether malformed, blocked, and failed lookups consume quota. Security planning should count every syntactically valid attempt before revealing a branch.
- Generic copy for a profile that becomes hidden, blocked, deleted, or ineligible between result display and submit. D-04 already decides the behavior—revalidate in the transaction and return one generic failure—so copy and status code are planner details (`41-CONTEXT.md:50-52`).
- Notification channel and safe payload copy. The repository supports an in-app record and an optional email copy (`lib/notifications/index.ts:5-26`, `:50-86`); product can defer the channel choice to planning if the invariant remains “target is informed” and D-22’s prohibited fields never enter title, body, link, data, or actor snapshots.
- The exact safe roster/add DTO and provenance-badge wording. D-20 already requires an allowlist projection (`41-CONTEXT.md:126-128`). The DTO must be shared by the API and the server-rendered Collaborators page, because both currently use `select('*')` (`app/api/collaborators/route.ts:16-24`; `app/(artist)/collaborators/page.tsx:21-29`).
- Migration numbers, RPC/function names, SQLSTATE-to-HTTP mapping, rollout flags, and surface migration order. Migrations remain human-gated and no SQL in this review is applied or claimed to be applied.
- The surface map itself can be produced by planning, but the context’s current list cannot be treated as authoritative. `CollaboratorPicker` really does create via an inline `CollaboratorForm` (`components/collaborators/CollaboratorPicker.tsx:94-97`, `:124-140`), and `WorkRoster` creates a collaborator when no existing row is selected (`components/catalogue/WorkRoster.tsx:227-249`, `:590-663`; `app/api/works/[workId]/members/route.ts:89-146`). Conversely, `CollaboratorInvitePrompt` only delegates an invite for an already-created row (`components/collaborators/CollaboratorInvitePrompt.tsx:5-18`, `:32-45`), and `PermissionsTab` manages workspace-consent rows, not collaborator creation (`components/settings/PermissionsTab.tsx:323-359`, `:374-458`). Most importantly, `PartyPicker` is omitted even though it directly posts new email- or phone-only collaborator rows (`components/split-sheets/PartyPicker.tsx:24-30`, `:262-303`). The planner should replace the “six surfaces” claim with a verified CREATE / INVITE / SELECT matrix.

## PREREQUISITE

The containment item is correctly a **ship-before-linking prerequisite**, but it should be owned as **Plan 41-01 (or an explicitly completed 41.0 gate)** rather than left in Deferred Ideas. It is implementation work in current application code, it needs regression tests, and Phase 41 is what increases its blast radius. Calling it “not new work” describes why it exists, not who is responsible for completing it (`41-CONTEXT.md:261-266`; `.planning/ROADMAP.md:2735-2740`).

The current split-sheet page uses a service client to map other parties’ collaborator IDs to `claimed_by`, then reads those users’ PRO, IPI, publisher, administrator, and legal-name fields (`app/(artist)/split-sheets/[id]/page.tsx:176-223`). It passes those live values into the initiator’s editor (`app/(artist)/split-sheets/[id]/page.tsx:226-248`), which renders PRO, IPI, and publishing data as “live from Settings” (`components/split-sheets/SplitSheetBuilder.tsx:667-687`). The executed PDF deliberately excludes IPI (`lib/vault/pdf/split-sheet.test.ts:212-223`).

If containment is skipped, every new Phase 41 identity link enlarges the set of people whose live private rights fields can be read by a roster owner who later includes them on a split sheet. If containment ships after linking, the interim disclosure has already occurred and cannot be undone for anyone who viewed, copied, or captured it. Safe sequence: (1) remove/mask the live service-role projection and prove the editor uses only purpose-authorized/frozen values; (2) deploy and verify that change; (3) land the human-approved data repair and uniqueness/RPC foundation; (4) enable the linking UI. The containment change can be independently reviewed and deployed, but Phase 41 must not be marked releasable until its first gate is complete.

## TESTABILITY

D-22 is testable in this repository, but not with one component test and not by merely asserting that currently-null fixture fields happen to be absent. Jest runs in Node, not jsdom (`jest.config.js:47-50`). Existing component tests therefore use `renderToStaticMarkup`; that can prove structural markup and initial-state copy but cannot exercise `useEffect`, DOM events, focus behavior, network-driven transitions, or keyboard interactions. Stateful add-flow logic should be extracted into pure reducers/helpers and unit-tested directly, while static branches can be rendered server-side. If the plans require real interaction/accessibility tests, they must deliberately add and configure a jsdom-capable test project or use browser verification; the current harness does not provide it.

The tests must be shaped as follows to bite:

1. **Add-route contract tests.** Call the exported route handler with mocked auth/RPC dependencies, make the RPC fixture contain unique sentinel values for every forbidden category, and recursively assert that neither keys nor values appear anywhere in the JSON. Exercise inserted, reused, already-linked, resurfaced, blocked, newly-hidden, stale, conflict, and database-error branches. Assert identical member-success status and key sets across the first four, while separately asserting D-01’s chosen member-versus-invite copy after that conflict is resolved. Existing route tests already call handlers directly, but currently expect the leaking full row and `reused` bit (`app/api/collaborators/route.test.ts:55-87`, `:114-148`; `app/api/collaborators/quick-invite/route.test.ts:168-180`).

2. **Roster-response tests.** Seed a mocked collaborator row with non-null sentinels for email, phone, legal name, IPI, PRO, publisher, administrator, MLC ID, SoundExchange ID, and mailing address; call `GET`; assert the explicit `.select(...)` allowlist and recursively reject forbidden keys/values. This test must cover claimed rows specifically. The present GET selects and returns `*` unchanged (`app/api/collaborators/route.ts:16-24`), and the server page separately selects `*` before serializing props to the client (`app/(artist)/collaborators/page.tsx:21-29`), so a page/query contract test is also necessary.

3. **Notification tests.** Put forbidden sentinels into both the actor and target fixtures, call the pure notification payload builder, and assert title, body, link, `data`, actor name, and any email arguments contain none of them. Route tests should assert notification emission only for the decided state transition and no emission on retries, blocked/stale failures, or an already-linked no-op. Test the durable idempotency key/event identity; the generic helper’s content hash only coalesces for sixty seconds (`lib/notifications/index.ts:28-48`).

4. **People Search tests.** Assert the exact `DISCOVER_PUBLIC_COLUMNS` allowlist and response mapper, not merely the absence of an email in one fixture. The current allowlist explicitly excludes private/legal/rights fields (`lib/green-room/discover.ts:23-42`). Include a source fixture containing forbidden sentinels so the test would fail if a future mapper or projection widens. Add visibility, both block directions, self-exclusion, and connections-only cases around the existing database function, whose current predicate enforces those gates (`supabase/migrations/149_green_room_people_search.sql:22-63`).

5. **Database invariant tests.** Static migration tests can assert `SECURITY DEFINER`, empty `search_path`, fully qualified relations, revokes from `PUBLIC`/`anon`/`authenticated`, service-role-only execution, both partial indexes, and the preflight. They cannot prove transaction isolation or race behavior. The plan needs a Postgres/Supabase integration script or documented two-session verification that concurrently adding the same account yields one canonical row, and a pre-apply query whose non-zero result blocks the human-gated index migration.

6. **Non-vacuous test invocation.** Do not pass a bracketed path as Jest’s positional regex. In this checkout, `npm test -- --runInBand 'app/api/works/[workId]/versions/[versionId]/pins/route.test.ts' --listTests` exited successfully and listed nothing, while `npm test -- --runInBand --runTestsByPath 'app/api/works/[workId]/versions/[versionId]/pins/route.test.ts' --listTests` listed the exact test file. Plans should use `--runTestsByPath` for every bracketed App Router path, then either run the suite normally or assert that `--listTests` output is non-empty. Test counts should be recorded in plan verification so “zero tests, exit 0” cannot be mistaken for coverage.

## PHASE SIZE

This should be **two independently gated implementation slices**, not one undifferentiated phase. Phase 41.1 is already assigned to mobile contact discovery (`.planning/ROADMAP.md:2688-2691`), so call the slices 41A/41B inside Phase 41 or use the next available roadmap number rather than overloading 41.1.

**Slice A — identity and privacy foundation:**

1. Contain the split-sheet live-rights disclosure and deploy/verify it.
2. Run read-only production preflight; if duplicates exist, prepare a separate human-reviewed repair migration.
3. After repair is approved/applied by the human operator, propose the unique indexes and transactional service-only resolver RPC.
4. Add server routes, write-time visibility/block revalidation, safe DTOs for all roster reads, rate limiting, transition-idempotent notifications, and route/SQL/concurrency tests.
5. Keep the new endpoint dark or uncalled until the foundation is complete.

**Slice B — shared discovery experience:**

1. Build the search-first / email-second / manual-last shared flow.
2. Migrate the verified CREATE/INVITE surfaces, leaving selection-only surfaces unchanged.
3. Add loading, empty, blocked/hidden/stale, duplicate, error, keyboard, screen-reader, and responsive behavior.
4. Run static/pure-function tests plus human or browser interaction verification, then enable the UI.

The seam is the server contract: Slice A finishes when a caller can safely request “add this currently discoverable member” or “invite this email” and receive a stable privacy-safe DTO under enforced database invariants; Slice B consumes that contract. Combining them would tie a human-gated data repair and constraint rollout to a broad UI migration across unrelated surfaces, making rollback and verification unnecessarily coupled. Splitting does not reopen the owner’s decision that the finished product must present one shared add flow (`41-DISCUSSION-LOG.md:82-90`).

## WHAT THE DISCUSSION GOT WRONG

### 1. “Rate limit plus notice” does not make the hidden-member oracle privacy-safe

The discussion accurately disclosed the oracle and the owner knowingly accepted it (`41-DISCUSSION-LOG.md:14-35`). What is wrong is the later claim that blocks plus those mitigations make full disclosure “defensible” as though they preserve the existing People Search boundary (`41-DISCUSSION-LOG.md:37-46`; `41-CONTEXT.md:45-49`). A daily cap reduces scale; it does not stop a targeted test. A notice tells the target after the inviter has learned the fact; it does not prevent disclosure. This may remain the owner’s accepted product tradeoff, but the documents must call it a deliberate weakening of the roadmap privacy rule, not reuse of the People Search doctrine.

### 2. “Same notification behaviour” is the wrong mechanism for a uniform response

Uniform response shape is sound because internal reuse/resurface state is private (`41-CONTEXT.md:120-133`). Uniform side effects are not required to achieve that. Notifying on an already-linked idempotent retry permits repeated clicks, client retries, or concurrent requests to generate target-facing noise and potentially harassment; suppressing every repeat is compatible with returning the same response. Ship a notification only for a defined durable transition—normally first link, and resurfacing only if explicitly chosen—and keep that transition bit server-side. The response must not reveal it.

### 3. The discussion treated a block link as a removal remedy when it is not one

The selected option says a block link “reuses the remedy just made total” (`41-DISCUSSION-LOG.md:48-56`). Current block storage has no coupling to collaborator rows (`supabase/migrations/035_connections_blocks.sql:79-110`), and claimed rows cannot be hard-deleted by the owner under the current route’s lifecycle; they are archived instead (`app/api/collaborators/[id]/route.ts:38-89`). Without a new rule and implementation, the notified target can block future contact but cannot remove or hide the existing owner-held record. The decision is incomplete, not merely underdocumented.

### 4. The “six surfaces” premise is factually wrong

The discussion chose “every creating surface” (`41-DISCUSSION-LOG.md:82-90`), a sound invariant, but the context’s audit list mixes creators, inviters, and unrelated settings UI (`41-CONTEXT.md:67-71`). `PermissionsTab` is a consent-management surface (`components/settings/PermissionsTab.tsx:323-359`); `CollaboratorInvitePrompt` sends an invite after creation (`components/collaborators/CollaboratorInvitePrompt.tsx:5-18`); and the omitted `PartyPicker` creates roster rows, including phone-only rows with rights fields (`components/split-sheets/PartyPicker.tsx:24-30`, `:262-303`). Planning from the named list would leave a duplicate-producing path untouched while spending effort on a non-creator.

### 5. “Client may never choose the destination account ID” is too literal

The security invariant is that the client cannot assign `claimed_by`; the server must derive and revalidate it. The UI must still identify the public search result the user selected, and People Search’s result contract exposes `id` for that purpose (`lib/green-room/discover.ts:80-95`). A profile ID is acceptable as an untrusted request parameter if the transaction rechecks visibility, self, blocks, and eligibility; an opaque server token is another acceptable design. Saying the client cannot choose any destination ID leaves no implementable contract for an explicit Add button (`.planning/ROADMAP.md:2695-2698`, `:2719-2720`).

### 6. “Legacy consolidation is not Phase 41 work” is incompatible with the approved invariant

The referred review correctly surfaced the missing database invariant (`41-DISCUSSION-LOG.md:161-177`, `:188-194`). The context then separated the repair from the phase while requiring indexes that depend on it (`41-CONTEXT.md:106-113`, `:267-268`). That separation is valid only if the repair is a named, owned prerequisite that completes before Slice A’s constraint step. As an unowned deferred idea, it makes the phase’s central concurrency guarantee aspirational.

## CONFIDENCE

**Verified by reading current repository code and planning artifacts:**

- The exact text and relationship of D-01 through D-22, the alternatives selected, and the roadmap contradictions (`41-CONTEXT.md:31-145`; `41-DISCUSSION-LOG.md:12-194`; `.planning/ROADMAP.md:2686-2750`).
- The live split-sheet service-role join and editor rendering of another party’s rights identifiers, plus the PDF’s deliberate IPI omission (`app/(artist)/split-sheets/[id]/page.tsx:176-248`; `components/split-sheets/SplitSheetBuilder.tsx:667-687`; `lib/vault/pdf/split-sheet.test.ts:212-223`).
- Current roster reads return full rows in both the API and server-rendered page (`app/api/collaborators/route.ts:16-24`; `app/(artist)/collaborators/page.tsx:21-29`).
- Claimed-member RLS is row-level SELECT, and current block policies do not alter collaborator rows (`supabase/migrations/052_restore_collaborators_claimed_by.sql:16-19`; `supabase/migrations/035_connections_blocks.sql:79-110`).
- Migration 148 repaired a duplicate class without adding the proposed identity indexes, and migration 179 can assign one account to multiple matching rows (`supabase/migrations/148_writer_room_existing_collaborator_repair.sql:30-178`; `supabase/migrations/179_existing_member_collaborator_reconciliation.sql:57-71`).
- The actual behavior of `CollaboratorPicker`, `WorkRoster`, `CollaboratorInvitePrompt`, `PermissionsTab`, and the omitted `PartyPicker`, cited above.
- Jest uses the Node environment, static React rendering is an established local pattern, and positional bracketed paths can list zero tests while `--runTestsByPath` selects the intended file (`jest.config.js:47-50`; verified locally with the two commands recorded in TESTABILITY).

**Inferred or not live-verified:**

- Production is at migration 227, per the supplied constraint; no production database was queried.
- Whether production currently contains duplicate roster identities is unknown. The migrations establish that it can; the required preflight must determine whether it does.
- The recommendation to split the work is an engineering-risk judgment based on the human-gated data dependency, security boundary, and UI breadth, not a fact encoded in the repository.
- The exact desired block-after-add behavior, notification channel, resurfacing notification rule, and manual no-email identity policy are intentionally identified as unresolved decisions rather than guessed.
- No migration has been created or applied, no production state has been changed, and no claim is made that any proposed SQL is deployed.
