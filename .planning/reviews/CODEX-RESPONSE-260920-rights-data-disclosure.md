# BOTTOM LINE

The owner's model is sound if “the system knows” means that Funūn keeps a subject-controlled canonical rights identity and releases only the minimum fields needed for a named purpose, not that every project owner may query the underlying profile. The safe source-of-truth rule is: a claimed member owns and confirms their own Interested Party Information (IPI) name number and society affiliation, while the person making a filing remains accountable for selecting the correct party and approving the transaction. Phase 41 should ship option (a)—link the member and withhold rights data—with no rights-field copy, profile join, contract autofill, or membership-based disclosure. It should not add contract autofill yet, because the current split-sheet PDF deliberately excludes IPI/CAE while the current draft editor already discloses a claimed party's live profile IPI to the initiator, so “autofill” presently describes two materially different security decisions (`lib/vault/pdf/split-sheet.test.ts:212-223`; `app/(artist)/split-sheets/[id]/page.tsx:176-248`). A later rights-disclosure phase should implement purpose-bound document/delivery resolution and explicit, revocable grants, while rejecting project membership alone as authority to see another person's identifiers.

# CORRECTIONS

## The profile-table citation is historical, not the current schema story

The statement that the fields “live on `user_profiles` in migration 026” is historically true but incomplete for the schema at migration 227. Migration 026 created a separate `user_profiles` table with `pro`, `ipi`, `publisher`, `phone`, and `mailing_address` (`supabase/migrations/026_collaborator_identity_reconciliation.sql:11-26`). Phase 19 later repointed the claim functions to the then-canonical `artist_profiles`, including the `phone` → `contact_phone` rename (`supabase/migrations/072_repoint_claim_functions.sql:74-104`, `:227-241`), dropped the legacy table, and migration 076 renamed canonical `artist_profiles` to `user_profiles` (`supabase/migrations/076_rename_artist_profiles_to_user_profiles.sql:84-87`). The current canonical contact column is therefore `user_profiles.contact_phone`, not `user_profiles.phone` (`app/api/profile/route.ts:47-64`).

## People Search exclusion is correct, and the database boundary is stronger than that projection

`DISCOVER_PUBLIC_COLUMNS` deliberately omits legal names, contact fields, PRO/CMO affiliation, IPI, publisher, MLC ID, and SoundExchange ID (`lib/green-room/discover.ts:30-42`). That is not the only protection: migration 040 revoked broad profile reads and re-granted only a public-safe column set, leaving the rights columns without `authenticated`/`anon` grants (`supabase/migrations/040_artist_profiles_column_privileges.sql:83-96`, `:121-130`), and migration 076 preserved the same omission on the compatibility view (`supabase/migrations/076_rename_artist_profiles_to_user_profiles.sql:532-552`). The requested design must preserve both layers; no People Search change is recommended.

## The roster-owner status quo is broader than “the owner types an IPI”

The user is correct that `collaborators.ipi` exists and is owner-editable (`lib/collaborators/index.ts:6-20`, `:38-54`). The create and update routes return full rows, the roster GET uses `.select('*')`, and the PATCH route lets an owner update every allowlisted rights field even after `claimed_by` is set (`app/api/collaborators/route.ts:16-24`, `:71-78`; `app/api/collaborators/[id]/route.ts:19-35`). Migration 026 also copied a claimed member's profile value into a blank roster field using `COALESCE`, while deliberately preserving an existing owner-entered value (`supabase/migrations/026_collaborator_identity_reconciliation.sql:96-110`); the current function retains that additive-only behavior (`supabase/migrations/076_rename_artist_profiles_to_user_profiles.sql:351-365`). Thus a claimed row can contain a stale owner assertion beside a different canonical profile value, and the roster owner can still edit the stale copy.

## `claimed_by` does grant the claimed person row-level read, but not ownership of the row

The user's RLS reading is correct. Migration 052 reasserts the policy as `auth.uid() = claimed_by` for `SELECT` (`supabase/migrations/052_restore_collaborators_claimed_by.sql:10-19`), alongside the roster owner's manage policy keyed to `user_id` (`supabase/migrations/018_collaborators_split_sheets.sql:29-32`). Claimed rows cannot be hard-deleted by the owner, but the owner may archive or edit them (`app/api/collaborators/[id]/route.ts:38-89`; `lib/collaborators/index.ts:113-138`). The policy lets the subject inspect the row; it does not make the row the subject's canonical rights record or prevent the owner from changing it.

## The song-passport provenance claim is correct but does not establish authority

The legacy adapter labels the owner's IPI fact as sourced from `profile` and a member roster fact as sourced from `collaborator` (`lib/song-passport/legacy.ts:85-115`). That provenance says which row supplied the value; it does not say that the value was confirmed, registry-validated, current, or authoritative. In particular, the collaborator branch does not switch to the claimed member's profile merely because `claimed_by` exists (`lib/song-passport/legacy.ts:106-115`). Any future resolver must keep “source row,” “asserted by,” “confirmed by the identified person,” and “validated against an external registry” as separate states.

## The split-sheet PDF does not currently disclose IPI—but the initiator UI does

The current executed split-sheet template has five approved columns: legal name, split, PRO/society, publishing designee, and administrator (`lib/vault/pdf/split-sheet.tsx:352-364`, `:368-393`). Its test explicitly requires that neither IPI value render because IPI is retained for CWR/PRO registration rather than the agreement (`lib/vault/pdf/split-sheet.test.ts:212-223`). The mint route nevertheless selects and passes `ipi` into the renderer's party object (`app/api/split-sheets/[id]/mint-envelope/route.ts:121-130`, `:247-282`), where it is currently unused.

The larger correction is that the draft editor already performs the disclosure under debate. For an initiator, the server follows `split_sheet_parties.collaborator_id → collaborators.claimed_by → user_profiles`, selects the other members' `pro`, `ipi`, publisher, administrator, and legal-name fields with the service role, and supplies the resolved values to the builder (`app/(artist)/split-sheets/[id]/page.tsx:176-248`). The builder visibly labels and displays “IPI # (live from Settings)” (`components/split-sheets/SplitSheetBuilder.tsx:667-687`). A non-initiator account party sees only names and percentages on the authenticated summary (`app/(artist)/split-sheets/[id]/page.tsx:305-349`), and a public approval-token holder receives only their own identity fields while sibling parties are fetched as name/role/split only (`app/approve/[token]/page.tsx:109-165`). Therefore the owner's proposed principle is not the current end-to-end behavior even though People Search and the PDF itself are private.

## Membership tables exist, but they do not encode rights-disclosure consent

`project_members` has owner/co-owner/editor/viewer roles (`supabase/migrations/078_project_members.sql:64-77`) and `work_members` has contribute/administer tiers (`supabase/migrations/136_work_members.sql:82-90`). The latter migration states the governing distinction directly: membership is access, not composition ownership or a split declaration (`supabase/migrations/136_work_members.sql:77-81`). Project membership currently widens reads of `vault_documents` to any project member (`supabase/migrations/193_workspace_column_allowlist_rpcs.sql:202-214`), which is another reason not to put a newly identifier-bearing PDF into the generic project-document path without reviewing artifact-level access.

## An explicit workspace grant vocabulary already exists, but it is not an IPI-sharing implementation

The permission catalogue already contains bundle-excluded `view_private_rights_identifiers`, labels it as individually granted, and says every use is logged (`lib/workspaces/permissions.ts:20-41`, `:99-111`; `lib/workspaces/permission-copy.ts:49-75`). Grants carry relationship/project scope and `revoked_at`/`revoked_by` history (`supabase/migrations/184_workspace_permissions_grants.sql:67-95`), and the live resolver excludes revoked grants on the next read (`supabase/migrations/192_workspace_project_permission_v2.sql:234-271`). However, the shipped catalogue surface exposes only project UPC under that permission (`supabase/migrations/194_workspace_catalogue_rpc.sql:189-242`; `lib/workspaces/catalogue.ts:200-224`), while the track reader conditionally exposes ISRC (`supabase/migrations/193_workspace_column_allowlist_rpcs.sql:323-380`). It does not expose another member's IPI, PRO/CMO affiliation, publisher IPI, SoundExchange ID, or mailing address, and the repository contains a `mustLogUse()` declaration but no production call site for this permission (`lib/workspaces/grant-service.ts:278-293`). The existing machinery is a useful consent and revocation pattern, not evidence that the requested collaborator-rights grant already works.

# THE MODEL

## The model is sound when knowledge, authority, and disclosure are separate

“Funūn knows it” should mean all of the following:

1. Funūn has a canonical value associated with the person it identifies.
2. Funūn knows who asserted it and whether the identified person confirmed it.
3. Funūn can use it for an enumerated purpose without returning the raw profile row to the requesting member.
4. Funūn records the value/version used at the moment a filing, delivery, or immutable document is created.

It must not mean “the value can be joined into any owner-facing form because both users are associated with the same song.” The existing live resolver explicitly treats a claimed profile value as stronger and overwrites the frozen value pre-mint (`lib/split-sheets/live-identity.ts:55-92`), but “current profile value” is not the same as “externally verified identifier.” Funūn's IPI utility performs a 9–11 digit shape check and expressly does not validate the check digit (`lib/metadata/identifiers.ts:110-130`). The accurate product label is **Interested Party Information (IPI) name number (legacy CAE number)**; “IPI account” or “verified IPI” would overstate what the code knows.

## Withholding is safer for confidentiality, not automatically safer for royalty routing

Withholding reduces the number of durable copies, prevents casual lookup, and lets a correction propagate before the next authorized use. It does not make a wrong number correct. The wrong-IPI risk is addressed by provenance, confirmation, validation, and transaction review—not by showing the number to more people.

Recommended accountability split:

| Decision | Accountable party | Why |
| --- | --- | --- |
| “This IPI name number identifies me” | The identified member | It is their professional rights identity; a roster owner should not be able to overrule it after claim. |
| “This member is the writer/party meant for this work” | The project/document initiator | The subject cannot know which John Smith the initiator intended to credit. |
| “These fields are required for this destination and have the correct shape/designation” | Funūn | This is a product/schema/template responsibility; current validation is shape-only (`lib/metadata/identifiers.ts:110-130`). |
| “Send this snapshot to this PRO/CMO, distributor, administrator, or counterparty now” | The authorized submitter, with subject consent where required | A delivery is a consequential act distinct from storing the value. |
| “The registry agrees this identifier belongs to this person” | No one unless an authoritative verification integration says so | A profile entry or AI check cannot support this claim today. |

For an unclaimed/off-platform collaborator, owner-entered data remains necessary. It should be labeled **entered by roster owner; unconfirmed by the identified person**, and consequential delivery should require an explicit initiator attestation or recipient confirmation. For a claimed member, their subject-confirmed profile becomes canonical; owner-entered values become proposals/evidence, never an override. This moves primary identifier accountability to the person identified without absolving the filer of responsibility for selecting the right person and approving the correct delivery.

## The minimum future resolver

The application should eventually have one server-only rights-identity resolver with inputs equivalent to:

```text
subject identity + actor identity + purpose + project/work/document + requested fields
```

Its output should be a purpose-specific payload, not a `user_profiles` row. For a claimed subject it should use only subject-confirmed canonical fields; for an unclaimed subject it may use explicitly marked owner assertions; and for an executed document or completed delivery it should write an immutable snapshot with source and confirmation state. It should return completeness or mismatch status to ordinary UIs (“IPI on file,” “confirmation needed”) without returning the number. This is an inferred architecture recommendation, not functionality present in the repository.

# DOCUMENT DISCLOSURE

## Split sheets

Do not add IPI to the current split-sheet PDF merely because the database carries it. The approved renderer deliberately omits it (`lib/vault/pdf/split-sheet.test.ts:212-223`), while the PDF does include PRO/society, publishing designee, and administrator (`lib/vault/pdf/split-sheet.tsx:352-393`). If counsel, a collecting society, or a specific delivery specification later establishes that an IPI name number is required on a particular instrument, then inclusion in that instrument is acceptable just-in-time disclosure to the instrument's actual parties and necessary filer.

“Just in time” must be defined as **the identifier enters a named artifact or delivery at the authorized transaction boundary**. It must not mean that opening a draft editor reveals another member's profile fields, which is what the current service-client resolution does (`app/(artist)/split-sheets/[id]/page.tsx:176-248`). Before Funūn claims the owner's principle is implemented, that initiator-facing live IPI display should be removed or replaced with masked readiness such as “IPI supplied by collaborator” / “confirmation needed.”

## One canonical instrument, not per-party executed variants

Per-party redacted **previews** are reasonable; per-party versions of the executed agreement are a trap. Different rendered contracts create ambiguity about what each party approved, complicate provider template/signature-field binding, produce different document hashes, and make corrections, certificate evidence, and disputes harder. The current renderer creates one buffer and one provider request (`app/api/split-sheets/[id]/mint-envelope/route.ts:247-337`), and completion fans out database rows that all point to the same executed storage object (`lib/split-sheets/distribution.ts:57-88`). That is the right evidentiary shape.

Use these rules instead:

- If a field is part of the operative agreement, every signer receives the same canonical agreement and can see it.
- If a field is needed only for registration or distributor ingestion, omit it from the agreement and send it in a separate, purpose-bound filing payload.
- Before submission, the human UI may mask the value and show source/confirmation state; the server can populate the delivery without exposing the raw canonical profile value to the project owner.
- A filer who is legally or operationally required to inspect the value must receive a separate explicit grant, not gain access merely by opening the project.
- A sensitive artifact must be readable only by its signatories and specifically authorized filers. The generic `vault_documents` project-member policy currently admits every project member (`supabase/migrations/193_workspace_column_allowlist_rpcs.sql:208-214`), so that path is not sufficient for a newly IPI-bearing artifact without an artifact-level authorization change.

## What happens after disclosure

No revocation mechanism can make a recipient forget a number, erase a screenshot, recall an email attachment, or invalidate a legitimately retained executed agreement. Funūn can stop future API reads, stop issuing new signed URLs, prevent new renders/deliveries, and record when access ended. Executed documents and completed-delivery snapshots should remain immutable and access-controlled for evidence; corrections create a superseding version or amendment rather than silently rewriting history. This is a product/legal design inference, not a behavior fully implemented by the current code.

## OWNER-APPROVED RIGHTS RECORDKEEPING DIRECTION

The owner approved the following product direction on 2026-09-20. Funūn should become the system in which contributor, PRO/CMO, publisher, administrator, and registration information is complete and ready at publication time, but the executed split-sheet PDF should not become the mutable database for that information. The governing principle is: **sign the rights; maintain the identifiers; export the information appropriate to the job.** This is a locked product decision for subsequent planning, subject to counsel approving the agreement and incorporation language.

Use three linked records:

1. **Executed split sheet — immutable legal record.** It carries the contributors' legal/credited identities, roles, ownership percentages, work identity, representations, approvals, signatures, dates, and a stable Funūn agreement/work ID. PRO affiliation may remain if counsel wants it. IPI name numbers are not required in this core instrument by default.
2. **Versioned Rights Schedule — maintained operational record.** It carries writer and publisher IPI name numbers, PRO/CMO affiliations, publisher and administrator relationships, ISWC, copyright-registration numbers, ISRCs, source, confirmation state, verification state, effective dates, and append-only change history. The schedule has a stable ID and numbered versions and is linked to, but not silently merged into, the executed agreement.
3. **Purpose-specific rights packet — controlled transaction output.** Funūn generates only the fields required for a named PRO/CMO registration, publisher, manager, label administrator, distributor, or other authorized destination. Every packet records the actor, purpose, recipient/destination, source/version, and time of generation or submission. Formats may include a dated PDF, CSV, CWR-compatible payload, or direct server-to-server delivery.

The agreement should use counsel-approved language substantially equivalent to: “Rights-administration identifiers associated with this agreement are maintained in Funūn Rights Record [record ID]. Administrative identifiers do not modify the ownership percentages stated in this agreement.” Counsel must decide whether the schedule is referenced only or formally incorporated; the product must not imply incorporation without that decision.

IPI is useful registration metadata, but it is not the contractual fact that establishes a split. A contributor may not yet have an IPI, may have a different IPI for a particular name/AKA, or may discover a correction after execution. Requiring IPI before signature would therefore block legitimate agreements, while embedding it permanently would create stale copies. The current PDF's deliberate omission remains the correct default (`lib/vault/pdf/split-sheet.test.ts:212-223`).

### Amendment versus administrative history

Use a new multi-party DocuSeal amendment/addendum when a change affects substantive rights: composition or master percentages; ownership or control; adding or removing a rights holder; assignment or transfer; publishing/administration authority where it changes who may exercise rights; territory or term; licensing authority; or correction of the legal party to the agreement. The addendum must reference the original Funūn agreement ID and immutable file hash. It is a new signed submission and artifact, never a rewrite or replacement masquerading as the originally signed PDF.

Use the append-only Rights Schedule history without a new signature when the underlying bargain has not changed: adding or correcting an IPI, adding an ISWC or copyright-registration number, updating a PRO/CMO affiliation, adding a publisher identifier, correcting a verified alias, or recording registration submission/acceptance. Each event records who changed it, when, the old and new values, the evidence/source, and whether the identified contributor confirmed it. A policy or counsel decision may still require acknowledgment for a particular administrative change, but acknowledgment must not be conflated with a signed rights amendment.

For archival use, Funūn may generate a self-contained **rights record bundle** containing the immutable signed agreement, the current dated/versioned Rights Schedule, all later signed amendments, and a registration/identifier summary. The bundle is a presentation of linked records; generating it must not mutate any constituent artifact or imply that the current schedule existed when the original agreement was signed.

DocuSeal is suitable for the signed-agreement and signed-amendment layers: a multi-party document is created as a submission, completion is accepted only from a verified server-side webhook, and the completed artifact is retrieved and frozen. Browser completion events must not advance Funūn's legal state. Administrative schedule updates remain in Funūn's auditable rights record unless a substantive change triggers a separate DocuSeal amendment.

### Operational access for teams

Being “handy” must mean the correct authorized person can obtain a complete, current packet without re-entering data; it must not mean every shared-team member can browse the underlying profile fields. Apply role, resource, purpose, field, and time scope together:

| Role | Default access posture |
| --- | --- |
| Contributor | Own identifiers, their confirmation/provenance state, and the executed agreement |
| Project owner | Everyone's readiness/missing-data state; raw values only when holding the applicable filing or administration authority |
| Manager/business manager | Persistent or time-limited delegated rights-administration access, scoped to the represented relationship and projects |
| Label administrator | Project/release-scoped access, normally expiring after the applicable delivery/administration period |
| Distributor operator | Export or server-side delivery of only the fields required by the destination |
| A&R | Splits, readiness, and missing-data status by default; raw identifiers only when the assigned job includes registration, clearance, or administration |
| Ordinary team member | No raw rights identifiers by default |

The UI should distinguish at least: “confirmed by contributor,” “verified against authoritative source,” “supplied by project owner—unconfirmed,” “missing,” and “contributor has not authorized disclosure.” “Verified” must not be shown based on shape validation, an AI inference, or a matching duplicate alone. Managers and administrators should be able to see readiness without automatically seeing every value.

The implementation phase for this approved direction should therefore plan the Rights Schedule schema/versioning, subject confirmation, assertion provenance, purpose-bound resolver, explicit grants and expiry, artifact ACLs, access/use audit, transaction snapshots, DocuSeal amendment links, and destination-specific exports together. It should not be folded into Phase 41 discovery, and nothing in this decision applies a migration or authorizes broad profile joins.

# TRIGGERS

## 1. Document or delivery need — yes, but purpose-bound

This should exist. The trigger is not “the user clicked a contract screen”; it is a named template or delivery adapter whose reviewed field map says the identifier is required. The server resolves only those fields, records purpose/destination/subject/source/version, and either places them in one canonical agreement or transmits them directly to the destination.

Revocation story:

- Before generation/submission: revocation prevents resolution and the transaction stops or requests renewed consent.
- After a draft artifact is generated but before execution: invalidate access and regenerate from current authority; do not keep circulating the stale draft.
- After execution or completed delivery: preserve the snapshot and audit record; revocation affects future uses, not the historical transaction.
- If the collaborator is removed from the project: remove future workflow authority immediately, but do not rewrite already executed documents or submitted registrations.

## 2. Explicit grant — yes, for raw human visibility and delegated filing

This should exist for cases such as a manager, administrator, lawyer, or music supervisor who genuinely must inspect or submit the identifier. Reuse the workspace model's good properties: named relationship, project or relationship scope, individual grant rather than a bundle, expiry, soft revocation, live re-evaluation, and append-only audit (`supabase/migrations/184_workspace_permissions_grants.sql:67-121`; `supabase/migrations/192_workspace_project_permission_v2.sql:243-271`). Do not reuse its current broad copy as proof of implementation: the UI says “like your IPI or SoundExchange ID,” but the shipped data path exposes UPC/ISRC only (`lib/workspaces/permission-copy.ts:49-57`; `lib/workspaces/catalogue.ts:222-224`; `supabase/migrations/193_workspace_column_allowlist_rpcs.sql:367-380`).

A future grant should identify:

- grantor/subject;
- grantee;
- exact field classes (for example IPI name number, PRO/CMO affiliation, publisher/administrator identity, SoundExchange account identifier, contact address);
- purpose (view, prepare document, submit registration, distributor delivery);
- project/work or relationship scope;
- effective time and expiry;
- whether raw display is allowed or only server-side use;
- every use, not merely grant issuance/revocation.

Revocation story: mark the grant revoked, make the next read fail, expire outstanding short-lived links/tokens where technically possible, and log the event. The existing route's soft-revoke approach preserves history (`app/api/workspaces/[workspaceId]/grants/route.ts:323-354`). Revocation cannot retract information already seen or alter an executed document; the consent UI must say that before the grant is accepted.

## 3. Project or work membership — no blanket disclosure

Membership is too coarse. A viewer, editor, producer, session musician, or lyric contributor may need access to the work without needing the writer's IPI, address, or SoundExchange identifier. The schema already treats membership as access rather than splits/ownership (`supabase/migrations/136_work_members.sql:77-81`), and auto-membership can arise merely because a claimed collaborator appears on a non-draft linked split sheet (`supabase/migrations/079_project_membership_auto.sql:84-121`). Turning that automatically derived membership into identifier visibility would convert a workflow convenience into silent consent.

Membership may be a prerequisite—“the actor is involved with this work”—but never the complete disclosure decision. A member who initiates an authorized document may cause the server to use an identifier without receiving the raw value; a member who needs to inspect it must also hold the purpose-specific grant.

Revocation story: removing project/work membership stops future project-scoped resolution and access on the next authorization check. Any separate rights grant scoped to that project should terminate at the same time or become ineffective because its project relationship no longer resolves. Already viewed values and completed artifacts follow the irreversible/history rules above. The repository does not currently implement this complete coupling, so this is a recommended invariant rather than a verified behavior.

# collaborators.ipi

## Recommendation

Keep the column for **unclaimed** collaborators because Funūn must support off-platform people and because the manual roster path explicitly exists for information the owner already possesses (`.planning/ROADMAP.md:2706-2708`). Once a row is claimed, `collaborators.ipi` must cease to be an active source and the owner must no longer edit or receive the claimed person's canonical IPI through that row. The resolver should use:

```text
unclaimed collaborator -> collaborators.ipi, provenance = roster_owner_asserted / unconfirmed
claimed collaborator   -> user_profiles.ipi, but only when subject-confirmed and purpose-authorized
executed artifact       -> immutable transaction snapshot, never a live profile join
```

That rule should extend to the parallel personal rights fields (`pro`, publisher/publishing designee, administrator, MLC/SoundExchange identifiers, phone/address), with field-specific disclosure—not a single “all profile data” switch.

## Existing rows

Do not silently pick whichever copy is non-null, most recent, or happens to be in `user_profiles`. The current claim function can reverse-prefill a blank canonical profile from the most recently updated claimed roster row and marks the provenance as `confirmed: false` (`supabase/migrations/076_rename_artist_profiles_to_user_profiles.sql:368-420`). That is useful recovery data, but it is not subject confirmation.

Use a human-gated migration after the current 227 ceiling—228 only if that number is still free when implementation begins—with this rollout:

1. Add a server-owned assertion/proposal history table that records the claimed subject, roster row, asserting owner, exact field designation, value (or encrypted value/reference under the selected data posture), source, recorded time, and resolution state.
2. Copy each nonblank claimed-row IPI into that history as `roster_owner_asserted/unconfirmed`; never label a value verified merely because it matches the profile.
3. If canonical `user_profiles.ipi` came from an unconfirmed `claim_prefill` entry, keep it unusable for consequential delivery until the member confirms or replaces it.
4. Deploy code that never reads claimed-row IPI as authoritative and never permits the roster owner to edit it.
5. Only then null `collaborators.ipi` on claimed rows and add a database invariant preventing a claimed row from acquiring a new active IPI copy; update the claim/link triggers in the same rollout so claiming a populated legacy row records a proposal rather than violating that invariant.
6. Leave unclaimed rows unchanged and leave every frozen/executed document snapshot unchanged.

The migration must be proposed and reviewed as a new file; nothing in this report is applied. A bare `UPDATE collaborators SET ipi = NULL WHERE claimed_by IS NOT NULL` is not acceptable because it destroys the only surviving assertion in some rows and makes conflicts unauditable. Conversely, retaining the value indefinitely as an active fallback preserves the two-sources-of-truth defect.

## Read and write behavior during transition

Until the migration lands, API/UI code should treat a claimed row's rights fields as unavailable to the owner even if old data remains physically present. The current `.select('*')` roster response and unrestricted claimed-row PATCH are incompatible with that rule (`app/api/collaborators/route.ts:16-24`; `app/api/collaborators/[id]/route.ts:19-35`). The claimed member may see owner assertions in a private “confirm/correct” workflow; that does not give the roster owner access to the member's replacement value. Completeness badges should say “managed by collaborator,” “confirmation needed,” or “not supplied,” never reveal the number and never claim registry verification.

# PHASE 41 SCOPE

## Choose option (a): link, withhold, and define the seam

Phase 41's roadmap already says that adding someone to My Roster does not grant project access, assign a credit/split, or declare rights/authority, and that clients may not supply `claimed_by` (`.planning/ROADMAP.md:2710-2723`). Keep that boundary. The phase should build only:

- privacy-safe member discovery using the existing public projection;
- a server-derived link to the selected member;
- a private roster row containing the minimum recognition fields needed by the owner, with claimed rights/contact fields absent;
- an explicit provenance badge such as “Funūn member · rights details managed by them”;
- duplicate/race/block handling already required by the phase;
- tests that the add response, roster response for a newly linked member, notifications, and People Search contain no IPI, PRO/CMO affiliation, publisher/administrator identifier, MLC/SoundExchange ID, phone, mailing address, or legal name.

For a member selected through People Search, the route should not copy their profile rights fields into `collaborators`, should not return those fields, and should not call the current split-sheet live-identity resolver. Linking establishes identity only. The existing email trigger already demonstrates the correct server-derived identity boundary—`claimed_by` is resolved from a confirmed account rather than supplied by the client (`supabase/migrations/179_existing_member_collaborator_reconciliation.sql:10-55`)—although Phase 41 still needs its own block/discoverability rules for the direct discovery action.

## Necessary containment before or with Phase 41

Phase 41 will create more claimed links, so it should not expand the population exposed by the existing draft-editor join. Before releasing the new linking path, remove the initiator-facing service-role projection of other parties' live `user_profiles` rights fields or replace it with masked completeness/provenance state (`app/(artist)/split-sheets/[id]/page.tsx:176-248`; `components/split-sheets/SplitSheetBuilder.tsx:667-687`). This is containment of an existing disclosure path, not option (b): it does not autofill a contract or design a new grant model.

## Why not option (b)

“Contract-only autofill” silently decides at least four unresolved questions: which templates require an IPI; whether the initiator may inspect it; who may access the resulting artifact; and what snapshot/consent record supports the use. It is especially unsafe while all project members can read project `vault_documents` rows (`supabase/migrations/193_workspace_column_allowlist_rpcs.sql:208-214`). The current split-sheet PDF's deliberate no-IPI rule means there is no urgent compatibility need to ship this inside discovery (`lib/vault/pdf/split-sheet.test.ts:212-223`).

## Why not option (c)

The full model crosses profile authority, collaborator migration, workspace consent, document templates, distributor/registration adapters, artifact ACLs, audit logging, revocation, immutable snapshots, and user-facing consent copy. Folding that into a discovery phase would make identity linking depend on legal/document decisions unrelated to recognizing a member, and would make Phase 41's privacy review substantially harder. It deserves its own phase with migration and deployment sequencing.

## Cost of deferral

Deferral has a real product cost:

- A newly linked member's rights fields will not auto-populate an owner-facing split-sheet editor.
- Registration/distributor exports cannot yet satisfy “do not make me re-enter things” from the member's canonical profile; they must show “available from collaborator—authorization flow not yet shipped,” request confirmation, or use a clearly labeled owner assertion for an unclaimed person.
- Managers/supervisors retain the existing workspace UPC/ISRC visibility only; the current `view_private_rights_identifiers` grant must not be advertised as collaborator-IPI access.
- Existing claimed-row duplicates remain technical debt until the dedicated migration, though Phase 41 must not create new copies or expose them through its new route.

That cost is preferable to making a hard-to-reverse disclosure rule accidentally. Phase 41 still delivers its core value—correct person linking and no accidental signup invite—while preserving a clean seam for later purpose-bound autofill.

# CONFIDENCE

## Verified by reading the current repository

- Began the review on `main` at commit `2245acf23a6f428b03a6b5950b175710a796f5eb`. During the review the shared worktree moved to `phase-41-discuss` at `afd7f664ab11959c277cefbb04e65572ee9faad2`; the intervening diff contains only the Phase 41 checkpoint and this review's prompt, with no application-code or migration change. Those user-owned planning changes were preserved.
- Verified the profile-table history, current private-column grants, People Search projection, collaborator schema/API, claim/backfill functions, `claimed_by` RLS, song-passport provenance, project/work membership, split-sheet live resolver, initiator and recipient views, PDF renderer, executed-document fan-out, workspace permissions/grants/revocation, and workspace catalogue field exposure at the cited lines.
- Verified that the current split-sheet PDF intentionally excludes IPI and that the initiator-facing draft editor receives a claimed party's live IPI.
- Ran `npx jest --runInBand lib/vault/pdf/split-sheet.test.ts lib/split-sheets/live-identity.test.ts lib/workspaces/catalogue.test.ts __tests__/migration-193.test.ts`: 4 suites passed, 133 tests passed.
- Did not query production, apply a migration, change application code, create a branch, commit, push, or deploy. Production-at-227 is accepted from the request and is consistent with `.planning/STATE.md:7-8`; it was not independently verified against the live database.

## Inferred or recommended

- The accountability allocation, minimum-purpose resolver, artifact-level authorization model, and conclusion that per-party executed documents are an evidentiary trap are design recommendations, not existing code behavior.
- Whether a particular split sheet, distributor, PRO/CMO, collective-management workflow, or jurisdiction legally requires an IPI name number is template/destination-specific and requires counsel or authoritative destination specifications; this report does not infer that requirement from the field merely existing.
- I inferred that a recipient can retain any value already displayed or downloaded; no technical revocation can reliably erase an external copy.
- The proposed assertion-history migration shape and migration order are recommendations only. Live row counts, conflicts between `collaborators.ipi` and `user_profiles.ipi`, and the number of profiles carrying unconfirmed `claim_prefill.ipi` require a human-approved production data audit before SQL is finalized.
