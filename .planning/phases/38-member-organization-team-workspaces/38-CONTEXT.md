# Phase 38: Member Organization & Team Workspaces - Context

**Gathered:** 2026-09-05
**Status:** Ready for planning
**Decisions:** 55 (D-01..D-55), all owner-approved in session

<domain>
## Phase Boundary

Funūn gains a **shared-workspace layer for Member Accounts**: Artist Teams, Management/Roster
workspaces, and Record Label workspaces. A Member may belong to many workspaces under ONE
identity and switch between them in-session. Workspace membership grants **access only** —
never ownership, credit, royalty entitlement, signature authority, or licensing power.

**This phase does NOT create a new account class.** The three classes in
`docs/architecture/ACCOUNT-TYPES.md` are unchanged: Member, Client Partner, Funūn Team Member.
Workspaces are contexts that **Member Accounts** join, exactly as the doctrine requires.

### In scope

1. A `workspaces` entity with a type and independent capability flags
2. Workspace membership (5 roles), invitations, membership states, offboarding
3. Roster relationships between a workspace and any Member, gated on that Member's acceptance
4. A granular permission model with preset bundles and a two-tier operational/authority split
5. Project attachment — a workspace reaches projects it does not own
6. Active-workspace resolution, URL routing, chrome, and in-session switching
7. Agreement evidence as the basis for authority-tier permissions
8. Workspace-scoped billing entity with beta metering
9. RLS extension, grant subset enforcement, member-side audit trail, abuse controls
10. Documentation updates to ACCOUNT-TYPES.md and The Playbook

### Explicit non-goals

- **No new account class.** Client Partner (`buyer_members`/`buyer_orgs`) and Funūn Team Member
  (`funun_staff`) boundaries are untouched.
- **No reuse of `buyer_orgs`** for creative workspaces (see architecture review, finding 8).
- **No removal of legacy fields** — `member_type`, `industry_roles`, `capability_grants` are
  neither read nor removed here (D-54). That is its own audited cleanup phase.
- **No changes to `project_members` semantics** (D-52). Phase 21 direct collaboration is untouched.
- **No earnings, royalty, or payout feature.** None exists; this phase only sets the boundary
  a future one must respect (D-42).
- **No legal verification of any document.** Funūn records and displays provenance; it never
  parses, interprets, or verifies an agreement (D-36, D-37).
- **No impersonation** in any form — no view-as, no login-as (D-22).
- **No re-litigation of locked custody doctrine.** `sound-vault-master-custody.md` D-01..D-10
  are owner-approved and binding.
- **No column rename.** `user_id` keeps its name; its meaning is documented, not migrated (D-28).

</domain>

<terminology>
## Canonical Terminology

Schema and permission model use **neutral** language. Product surfaces may use warmer names.

| Term | Definition | Notes |
|---|---|---|
| **Workspace** | A shared context Member Accounts join. Never an account class. | `workspaces` table |
| **workspace_type** | `artist_team` \| `management` \| `label` | Drives defaults and UI. **Never authorization.** |
| **Workspace capability** | Independent flags (roster, catalogue) | A company may be both management and label (D-02) |
| **Workspace member** | A Member holding a seat: Owner, Admin, Member, Contractor, Guest | Governs the WORKSPACE, not project access |
| **Roster member** | A Member a workspace represents | Any professional — artist, producer, songwriter, engineer (D-35) |
| **Subject member** | The Member an Artist Team centers on | Neutral term; UI may say "the artist" |
| **Roster relationship** | workspace ↔ Member link, gated on that Member's acceptance | Inert until accepted (D-05) |
| **Attachment** | A link from a workspace to a project it does not hold | Never a copy (D-26) |
| **Record custody** | Who holds and administers a record in Funūn | `user_id`. **NOT rights ownership** (D-28) |
| **Grant** | A set of granular permissions on a relationship or project | (D-19, D-20) |
| **Operational tier** | Permissions the Member may grant alone | (D-21) |
| **Authority tier** | Permissions additionally requiring a document-supported relationship | (D-21, D-16) |
| **Document-supported** | A relationship with an attached agreement and a declared scope | Custody D-02 ladder (D-16) |
| **"Artist Team"** | Product name for `workspace_type = artist_team` | UI only — schema stays neutral (D-34) |

**Forbidden vocabulary:** never label a stored document "verified" or "approved" (D-37). Never
use artist-specific language in schema, permissions, or RLS (D-34).

</terminology>

<decisions>
## Implementation Decisions

### Workspace taxonomy
- **D-01:** ONE `workspaces` entity with `workspace_type` (`artist_team` | `management` | `label`). Type drives defaults and UI, **never authorization**.
- **D-02:** Roster and catalogue capabilities are **independent flags**, not exclusive types. One company can be both management and label without a second workspace.
- **D-03:** A solo Artist Team may be created on demand and expanded later. **NEVER auto-provisioned** — explicitly rejects the `buyer_orgs.is_personal` pattern.

### Workspace creation & verification
- **D-04:** Management/Label workspaces are self-declared, created instantly, and visibly **UNVERIFIED**. Verification is a separate auditable state. Explicitly NOT `buyer_orgs`' born-verified default (migration 080 D-14). Unverified never blocks the workspace working; it limits claims and discovery.
- **D-05:** **Roster claims are inert until the Member affirmatively accepts.** Creating a workspace and naming someone grants no data, visibility, or access. Structural protection, not policy.
- **D-06:** Any Member may create any workspace type. Creation is not the control point — acceptance and verification are.
- **D-07:** An Artist Team centers a named **subject member** who must accept. Anyone may create one (e.g. a manager for their client) but it reaches nothing until acceptance. *(Wording amended by D-34.)*

### Master ownership (bounded by locked custody doctrine)
- **D-08:** A **Document-supported** label master-ownership record automatically unlocks catalogue, metadata, readiness, registrations, and delivery for those recordings. **Clean-master DOWNLOAD remains a separately granted, logged capability** — preserves custody D-01. A merely *Claimed* record grants nothing.
- **D-09:** Separation runs **two independent clocks**: evidenced master ownership persists after a roster relationship ends; workspace-derived access ends. The Member keeps compositions, catalogue, and personal projects.
- **D-10:** A Label workspace may file a master-ownership claim on a version it cannot reach. It lands as custody D-02 *Claimed*, notifies the holder, is visible to both sides, and **grants nothing**.

### Membership & invitations
- **D-11:** Five workspace roles: **Owner, Admin, Member, Contractor, Guest**. They govern the WORKSPACE (invite, configure, roster, remove) — **not** project access, which comes from separate grants. Contractor is time-boxed, so membership requires an `expired` state.
- **D-12:** Invite by email. A **pending seat** exists immediately, grants nothing, and binds on signup + email verification. Reuses `work_members`' `collaborator_id` two-axis pattern and migration 177's **service-only** `find_auth_user_id_by_email`. Never auto-provision an account.
- **D-13:** **Never-zero-owners**, enforced at the DB/service layer, not the UI. Ownership transfer = promote successor, then step down.
- **D-14:** Removal ends future access immediately. Notes, uploads, approvals, diary entries, split-sheet parties, signatures, and audit trail **persist, attributed**. Mirrors `split_sheet_parties`' create-time identity snapshot (018 D-19).

### Roster relationships
- **D-15:** A Member may hold **any number** of roster relationships. Funūn **never enforces exclusivity** — that is a contract term between parties (custody D-02: records, does not adjudicate).
- **D-16:** An agreement document is **optional** to form a relationship (acceptance is real consent) but is a **prerequisite for authority-tier permissions**. Moves the relationship from *accepted* to *document-supported*.
- **D-17:** Effective and optional termination dates are tracked. Reaching termination **auto-ends future workspace-derived access** (per D-09). Nothing is deleted; the record persists as history.
- **D-18:** The Member may **revoke any roster relationship unilaterally and immediately**, with no approval. Access stops; record and history persist. Funūn is never the venue for the contractual argument and must never trap someone in a disputed relationship.

### Permission model
- **D-19:** Permissions are **granular in the database** — the only shape that expresses ~18 capabilities and survives RLS. The UI offers **editable preset bundles**. Nothing is hardcoded to a role name.
- **D-20:** A grant attaches to the **member↔workspace relationship** by default and may be narrowed or widened **per project**.
- **D-21:** **TWO tiers.** *Operational* (view summaries, metadata, Writer's Room, upload audio, invite collaborators, view split sheets, registrations) — the Member grants alone. *Authority* (request signatures, approve releases, deliver assets, manage payouts, edit rights, act on behalf) — additionally requires a document-supported relationship per D-16.
- **D-22:** Acting on behalf is **always attributed** — e.g. "Alex (Rise Management, on behalf of Jordan)". **No view-as, no login-as, no impersonation of any kind.**

### Project & catalogue attachment
- **D-23:** The **Member holds the project record**; a workspace reaches it through an attachment. **No `owner_workspace_id` column.** `vault_projects.user_id` keeps its current meaning, so personal URLs/workflows are untouched and D-09 is structural.
- **D-24:** A workspace with the right grant MAY create a project for a Member. It is **born held by that Member**, with the diary recording who created it. Requires an already-accepted relationship. No transfer step, no orphan state.
- **D-25:** Detachment **severs the link only**. Nothing moves, copies, or is deleted. The workspace stops seeing the project EXCEPT recordings it owns of record (D-09).
- **D-26:** **One canonical project, many views.** A workspace catalogue is a **query over attachments, never a copy**. Same rows for holder and workspace, differing only by which fields the grant exposes. Nothing is imported, forked, or synced.
- **D-27:** A record a Member performs on but does not hold appears on a separate **read-only "Appears on" shelf** — extending Phase 21's *Shared with me* lane, which already excludes shared projects from personal dashboard math.
- **D-28:** **CANONICAL RULE:** `vault_projects.user_id` / `works.user_id` mean **record custody** — who holds and administers the record in Funūn — **never rights ownership**. Rights always live on separate evidenced records (split sheets = composition; version ownership status = master, custody D-02). Stated explicitly in ACCOUNT-TYPES.md and The Playbook. **No column rename.**
- **D-29:** Record custody MAY transfer, but only as a **two-sided act**: current holder offers, recipient accepts, diary records permanently. Never unilateral.

### Terminology
- **D-34:** Schema and permission model use **neutral** language (`member`, `roster member`, `subject member`). No artist-specific language in any structure. "Artist Team" survives as a UI/product name only. Roster cards label people by actual professional role.
- **D-35:** A roster may hold **any Member** — artists, producers, songwriters, engineers — with **no schema fork**. One roster table; the **card is role-aware**. D-27's "Appears on" shelf is more central for producers/engineers than for artists.

### Navigation & UX
- **D-30:** Active workspace is carried in the **URL path** (`/w/[workspaceId]/...`) and **resolved server-side on every request** from URL + authenticated user, never from client state. Tabs are naturally independent; personal routes keep existing URLs.
- **D-31:** Wrong-context protection is **BOTH**: persistent visual workspace identity in the chrome AND a **server-side re-check of acting context on every write**. Upholds "navigation visibility is not authorization."
- **D-32:** Management/Label landing = **Roster and Activity as sibling tabs, roster default**. Roster = state (readiness, missing info, outstanding approvals); Activity = events. The two must never contradict.
- **D-33:** Switching is **instant and in-session** for Members — one identity, one session, no re-auth. **Funūn Team Member accounts keep their existing hard sign-out/sign-in boundary unchanged**, because staff is a separate identity, not a workspace.

### Contracts & authority
- **D-36:** The **rights holder declares the scope** of authority they are granting and attaches the agreement as **supporting evidence**. The grant is their explicit act; the document is proof of why. **Funūn never parses or interprets the file.**
- **D-37:** **Never the word "verified"** for anything Funūn merely stored. State it by showing **provenance**: who uploaded, when, what it was declared to support, and whether Funūn witnessed the signature (DocuSeal-executed is the one observed case). **Counsel reviews final labels**, matching how custody D-02 flagged its own state labels.
- **D-38:** Documents about one Member live once in **their** Contract Locker (D-26 one-canonical-record rule); the workspace views what its grant permits. Genuinely workspace-level papers (incorporation, team agreements, roster-wide deals) get a **workspace shelf**.
- **D-39:** On document expiry, **authority-tier permissions lapse automatically**; **operational access persists** until the relationship itself ends per D-17. Consequential powers fail closed; day-to-day help doesn't break over a late renewal.

### Rights, credits, earnings boundaries
- **D-40:** High-sensitivity permissions — **clean-master download, private rights identifiers, earnings visibility** — stay in the operational tier but are **excluded from every preset bundle**, must be ticked individually, and every use is logged.
- **D-41:** Rights-information edits (PRO, IPI, publisher, SoundExchange ID) are **propose-only; the Member confirms**. Reuses Phase 19's shipped confirmable pre-fill / per-field confirm pattern. Identifiers that route royalties never change without the person they identify agreeing.
- **D-42:** Payout and tax information is **structurally excluded** — no permission, bundle, or tier can expose it to a workspace. Not a permission defaulting to false: an exclusion no future feature can accidentally grant.
- **D-43:** Workspace membership **never** touches split sheets — no party, no credit, no royalty entitlement, ever. `work_members` already states this verbatim. **This phase adds NO new path into a split sheet**; it only restates the rule in ACCOUNT-TYPES.md and The Playbook.

### Billing & plan ownership
- **D-44:** A **workspace is its own billable entity** with its own plan, separate from every member's personal plan. New org-billing model — `subscriptions` today is strictly per-user (`user_id ... UNIQUE NOT NULL`).
- **D-45:** The **workspace plan covers work done through the workspace**; a Member's personal plan governs their solo work. A workspace never silently consumes a Member's personal credits, and a Member is never paywalled out of their own catalogue.
- **D-46:** On lapse the workspace goes **read-only**. Roster relationships, attachments, grants, evidence, and audit trail persist untouched; Members' own catalogues are entirely unaffected. Reactivation restores access with nothing lost. **A billing event must never destroy rights evidence.**
- **D-47:** **Free during beta**, with seat / roster / storage / AI / e-sign counters **tracked but not enforced**, so post-beta pricing is decided on real evidence.

### Security & auditability
- **D-48:** Workspace-derived access reaches RLS by **extending the existing SECURITY DEFINER helpers with a workspace branch**. `project_member_role()` and siblings gain the branch, so every policy on `vault_projects`, `tracks`, `vault_assets`, `vault_documents`, `tool_outputs` picks it up **with no policy rewrite**. Follows the proven 064/078/136 pattern. **Watch per-row query performance.**
- **D-49:** **Server-side subset check on every grant** — a grant must be a subset of what the granter holds, refused otherwise (not hidden in UI) — **and re-checked on use**, so a grant cannot outlive the granter's own access or relationship.
- **D-50:** **Every workspace-context action** records actor, workspace, subject member, permission relied on, and timestamp. **Append-only, and visible to BOTH the workspace and the affected Member.** Extends the staff `logStaffAction` pattern to the member side. Transparency is what makes delegated access trustworthy.
- **D-51:** Invitations and roster claims are **rate-limited per workspace, expire if unaccepted**, and a Member may **block** a workspace from claiming them again after refusing once.
- **D-56 (added 2026-09-05, at planning):** **A working platform-wide disable control ships with this phase**, not just the seam. `workspace_access_enabled()` in migration 186 is the single function every workspace RLS branch consults; an owner-operable server-side control flips it to disable ALL workspace-derived access instantly, with no deploy, leaving personal Member access fully intact. Supersedes the "seam only" reading of D-55 — cohort scoping remains the containment for *who* can use the feature; this is the containment for *the feature itself* while the new RLS path is unproven. Adds requirement **WS-31**.

### Migration & backward compatibility
- **D-52:** `project_members` is **untouched** — it keeps meaning artist-to-artist direct collaboration. Workspace access is a **separate, additional path** resolved by the same helpers (D-48). Phase 21 sharing keeps working unchanged.
- **D-53:** **Nothing automatic** for existing manager/A&R members. No workspace is provisioned for anyone; they create one when they want it (D-03, D-06). Current access and profiles entirely unaffected. Zero migration risk.
- **D-54:** This phase **neither reads nor writes nor removes** `member_type`, `industry_roles`, or `capability_grants`. ACCOUNT-TYPES already says they are transitional and removable only after every dependent route is migrated and audited — its own cleanup phase.
- **D-55:** The whole layer sits behind a **server-side flag scoped to named beta accounts**, following the Song Passport pilot pattern (global/pilot/emergency controls, migrations 150–156). Personal Member workflows and URLs are entirely unchanged for anyone outside the cohort.

### Claude's Discretion
- Preset bundle contents and names (D-19) — must be editable and never hardcoded to role names.
- Roster card layout and which signals lead per professional role (D-35).
- How Roster and Activity tabs share data without contradicting each other (D-32).
- Membership state-machine mechanics, given the required states (pending, active, suspended, removed, expired).

</decisions>

<permission_matrix>
## Permission Matrix

Granular permissions in the DB (D-19); bundles are UI sugar. **Tier** per D-21. **Bundle-excluded**
permissions must be granted individually with each use logged (D-40).

| Permission | Tier | In bundles? | Notes |
|---|---|---|---|
| View roster / project summaries | Operational | Yes | Baseline read |
| View metadata | Operational | Yes | |
| Edit metadata | Operational | Yes | |
| Access Writer's Room | Operational | Yes | Custody D-01: entry ≠ clean-master rights |
| Upload audio | Operational | Yes | |
| Download protected/preview audio | Operational | Yes | Never the clean master |
| **Access clean masters** | Operational | **NO** | D-08, D-40. Individually granted, every use logged |
| Invite collaborators | Operational | Yes | Subject to D-49 subset check |
| View split sheets | Operational | Yes | Read only — D-43 forbids any new write path |
| View contracts | Operational | Yes | Scoped by D-38 |
| Upload / generate contracts | Operational | Yes | |
| **Request signatures** | **Authority** | Yes (authority bundles) | Requires document-supported (D-16) |
| **View private rights identifiers** | Operational | **NO** | IPI, SoundExchange ID, address. D-40 |
| **Edit rights information** | **Authority** | Yes (authority bundles) | **Propose-only; Member confirms** (D-41) |
| Manage registrations | Operational | Yes | |
| **Approve releases** | **Authority** | Yes (authority bundles) | |
| **Deliver assets** | **Authority** | Yes (authority bundles) | Also gated by custody D-08..D-10 |
| **View earnings** | Operational | **NO** | D-40. No earnings feature exists yet |
| **Manage payouts** | — | **NEVER** | **Structurally excluded** (D-42). No grant can expose it |
| **Act on behalf of a Member** | **Authority** | Yes (authority bundles) | Always attributed; never impersonation (D-22) |

**Invariants that no permission can override:**
1. Membership never creates a split-sheet party, credit, or royalty entitlement (D-43).
2. Payout and tax data is unreachable from any workspace context (D-42).
3. Clean-master download is never bundled and never implied by any other permission (D-08, D-40, custody D-01).
4. No grant may exceed what the granter holds, at grant time or at use time (D-49).
5. Authority-tier permissions require a document-supported relationship and lapse when it expires (D-16, D-39).

</permission_matrix>

<flows>
## Invitation, Approval & Offboarding Flows

### Workspace seat invitation (D-12)
1. Workspace Owner/Admin invites by email.
2. A **pending seat** is created. It grants nothing.
3. If the email matches an existing Member, service-only `find_auth_user_id_by_email` (migration 177) resolves it. Never client-side.
4. Recipient accepts → seat becomes `active`. Unaccepted seats **expire** (D-51).
5. Never auto-provision an account (collides with Phase 27 invite-only gate and `handle_new_user`).

### Roster relationship (D-05, D-15, D-16, D-17)
1. Workspace proposes a relationship with a Member. **Inert — grants nothing, exposes nothing.**
2. Member is notified; may accept, refuse, or refuse-and-block (D-51).
3. On acceptance: relationship becomes `accepted`, effective date set, operational grants may be issued.
4. Attaching an agreement + declared scope (D-36) promotes it to `document-supported`, unlocking authority-tier grants.
5. Termination date (if set) auto-ends future workspace-derived access (D-17).

### Master-ownership claim (D-10)
1. Label files a claim on a version it cannot reach.
2. Lands as custody D-02 `Claimed`; holder notified; visible to both sides; **grants nothing**.
3. Resolution: holder confirms (→ `contributor-confirmed`), evidence attached (→ `document-supported`, unlocking D-08 access), or conflict recorded (→ `Disputed`).

### Offboarding (D-14, D-18, D-25, D-09)
1. Removal or unilateral revocation ends future access **immediately**.
2. Attachments sever; **nothing moves, copies, or is deleted** (D-25).
3. Contributions, approvals, signatures, diary entries and audit trail **persist, attributed** (D-14).
4. Evidenced master ownership **survives independently** of the relationship (D-09).
5. Never-zero-owners blocks removing the last Owner (D-13).

</flows>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Binding doctrine — do NOT re-litigate
- `docs/architecture/ACCOUNT-TYPES.md` — One Identity, Many Roles. Three account classes; roles vs relationships vs authority. Owner-approved 2026-09-04.
- `.planning/deliberations/sound-vault-master-custody.md` — **D-01..D-10 LOCKED 2026-09-01.** D-01 private master storage + preview/clean-master separation; D-02 version & ownership records, the six ownership states, composition-vs-master separation. Binding on D-08, D-10, D-40.

### Prior-phase decisions this phase builds on
- `.planning/phases/21-cross-account-collaboration-sheet-sync/21-SPEC.md` — `project_members`, Shared-with-me lane, dashboard math exclusions. D-27, D-52.
- `.planning/phases/28-industry-accounts-green-room-access/28-CONTEXT.md` §Deferred Ideas — the manager/A&R roster vision this phase **supersedes and absorbs**.
- `.planning/ROADMAP.md` around line 1109 — the same owner vision in roadmap form.
- `.planning/deliberations/team-member-rbac-access-model.md` — staff role×room RBAC. Precedent only; staff stays separate (D-33).

### Schema evidence
- `supabase/migrations/078_project_members.sql` — guest-list write lockdown, SECURITY DEFINER helper pair, per-operation policy split. **The pattern D-48 extends.**
- `supabase/migrations/136_work_members.sql` — "MEMBERSHIP IS NOT SPLITS" doctrine verbatim; two-axis `user_id`/`collaborator_id` identity. Basis for D-12, D-43.
- `supabase/migrations/080_buyer_orgs_members.sql` — Client Partner org model. **Reviewed and rejected** for creative workspaces (born-verified, one-org-per-user, purchase-shaped roles).
- `supabase/migrations/177_member_client_partner_coexistence.sql` — service-only `find_auth_user_id_by_email`. D-12.
- `supabase/migrations/018_collaborators_split_sheets.sql` — per-user private collaborators; `split_sheet_parties` create-time snapshot. D-14, D-43.
- `supabase/migrations/001_initial_schema.sql` — `vault_projects.user_id`, `subscriptions.user_id UNIQUE`. D-28, D-44.

### Code seams
- `lib/accounts/account-context.ts` — `resolveAccountContext`. **No workspace dimension today.** Must gain one.
- `lib/accounts/member-api-gate.ts` — `requireMemberApiAccount` is identity-scoped only. Must become workspace-aware.
- `lib/auth/session-identity.ts` + `components/auth/AccountContextSwitch.tsx` — today's "switch" is sign-out + re-login. **Cannot be the basis for D-30/D-33.**

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **SECURITY DEFINER helper pattern** (064 → 078 → 136): parameterised uid, `SET search_path = ''`, `STABLE`, wrapped as `(SELECT ...)` in policies. D-48 extends this directly.
- **Guest-list write lockdown**: `REVOKE INSERT, UPDATE, DELETE ... FROM authenticated, anon` + service-role routes. Apply to every new workspace table.
- **Phase 19 confirmable pre-fill / per-field confirm** — reuse for D-41 propose-then-confirm.
- **Phase 19 correction-flag** (migration 074, dual notification) — reuse shape for D-10 claims and disputes.
- **`logStaffAction`** — the audit pattern D-50 extends to the member side.
- **Song Passport pilot controls** (migrations 150–156, global/pilot/emergency) — the D-55 flag pattern.
- **AE Client Partners room** — proven shape for D-32's roster surface (tabs, insight columns, health-style signals).

### Established Patterns (constraints)
- Membership tables are never client-writable. Every write is a service-role route that has already proved authority.
- RLS recursion is a known failure class (018 → 064 → 078). Any self-referential workspace-membership policy needs a SECURITY DEFINER helper from day one.
- Server Components must never pass function props to Client Components — a production-only 500. (`ClientPartnersRoom` carries this warning; the workspace room will hit it too.)
- Column-level `REVOKE`/`GRANT` alongside row-level RLS is the house pattern for sensitive columns — relevant to D-40 and D-42.

### Integration Points
- `resolveAccountContext` — add workspace resolution without disturbing the staff-exclusive fail-closed branch.
- `requireMemberApiAccount` — must gain an acting-workspace parameter (D-31).
- `vault_projects` + child-table policies — inherit the D-48 workspace branch via helpers, no rewrite.
- Contract Locker — gains the D-38 workspace shelf.
- `handle_new_user()` — **must not be perturbed** (buyer early-return, Phase 27 invite gate).

</code_context>

<requirements>
## Requirement IDs (for GSD planning)

| ID | Requirement | Decisions |
|---|---|---|
| WS-01 | `workspaces` entity: type + independent capability flags | D-01, D-02 |
| WS-02 | Workspace creation, unverified state, verification as separate auditable state | D-03, D-04, D-06 |
| WS-03 | Workspace membership: 5 roles, states incl. expired, never-zero-owners | D-11, D-13 |
| WS-04 | Invitations: pending seat, email binding, service-only reconciliation, expiry | D-12, D-51 |
| WS-05 | Roster relationships: inert claim, acceptance, multiplicity, dates, unilateral revocation | D-05, D-07, D-15, D-17, D-18 |
| WS-06 | Agreement evidence ladder + rights-holder-declared scope | D-16, D-36 |
| WS-07 | Granular permission model with editable preset bundles | D-19, D-20 |
| WS-08 | Two-tier operational/authority separation, incl. bundle-excluded sensitive permissions | D-21, D-40 |
| WS-09 | Project attachment; workspace catalogue as a query, never a copy | D-23, D-25, D-26 |
| WS-10 | Workspace-created projects born held by the subject Member | D-24 |
| WS-11 | Read-only "Appears on" shelf for contributed records | D-27, D-35 |
| WS-12 | Two-sided, logged record-custody transfer | D-29 |
| WS-13 | URL-carried active workspace, server-resolved every request | D-30 |
| WS-14 | Persistent workspace chrome + server-side acting-context re-check on writes | D-31 |
| WS-15 | Roster + Activity tabs; role-aware roster cards | D-32, D-35 |
| WS-16 | Instant in-session switching; staff boundary unchanged | D-33 |
| WS-17 | Contract Locker workspace shelf + provenance vocabulary (never "verified") | D-37, D-38 |
| WS-18 | Authority lapses on document expiry; operational persists | D-39 |
| WS-19 | Rights-information propose-then-confirm | D-41 |
| WS-20 | Structural exclusion of payout/tax data | D-42 |
| WS-21 | Workspace billing entity; lapse → read-only, nothing destroyed | D-44, D-45, D-46 |
| WS-22 | Usage metering tracked, not enforced, during beta | D-47 |
| WS-23 | RLS workspace branch in SECURITY DEFINER helpers | D-48 |
| WS-24 | Grant subset check at grant time and at use time | D-49 |
| WS-25 | Member-side immutable audit trail, visible to both sides | D-50 |
| WS-26 | Abuse controls: rate limits, expiry, member-side block | D-51 |
| WS-27 | Cohort-scoped server-side beta flag; personal paths untouched | D-53, D-55 |
| WS-28 | Documentation updates: ACCOUNT-TYPES.md + The Playbook | D-28, D-34, D-43 |
| WS-29 | Master-ownership claims + D-08 evidence-derived label access | D-08, D-09, D-10 |
| WS-30 | Attributed acting-on-behalf; no impersonation anywhere | D-22 |
| WS-31 | Platform-wide workspace-access disable control (owner-operable, no deploy) | D-56 |

**Explicitly NOT requirements:** legacy field removal (D-54), `project_members` migration (D-52),
any earnings feature (D-42), any document verification (D-36/D-37).

</requirements>

<slices>
## Recommended Implementation Slices & Dependency Order

Sized against this repo's history (Phase 31 needed a split at ~19 plans). **This phase is large
enough that it will almost certainly split — likely 38 / 38.1 / 38.2 along the A–C / D–F / G–I
boundaries.** Recommend the planner assess this explicitly.

**Slice A — Foundation** *(no dependencies)*
`workspaces`, workspace membership + roles + states, never-zero-owners, invitations with pending
seats, write lockdown, SECURITY DEFINER helper pair. Human-gated migration push.
→ WS-01, WS-02, WS-03, WS-04

**Slice B — Roster relationships** *(after A)*
Inert claims, acceptance/refusal/block, multiplicity, effective+termination dates, revocation,
abuse controls, agreement evidence ladder with declared scope.
→ WS-05, WS-06, WS-26

**Slice C — Permission model** *(after B)*
Granular permission catalogue, preset bundles, two-tier split, bundle-excluded sensitive
permissions, subset checks at grant and use. **Pure-logic core first, unit-tested in isolation**
(the house pattern — `columns.ts`, `health.ts`, `ranking.ts`).
→ WS-07, WS-08, WS-24, WS-30

**Slice D — RLS + attachment** *(after C — the security-critical slice; let it soak)*
Workspace branch in the helpers, project attachment records, workspace catalogue as query,
workspace-created projects, "Appears on" shelf, custody transfer.
→ WS-09, WS-10, WS-11, WS-12, WS-23

**Slice E — Active-workspace UX** *(after D)*
URL routing, server-side resolution, workspace chrome, acting-context write re-check, in-session
switcher, Roster + Activity tabs, role-aware cards.
→ WS-13, WS-14, WS-15, WS-16

**Slice F — Contracts, authority & rights boundaries** *(after C; parallel with E)*
Locker workspace shelf, provenance vocabulary, expiry lapse, rights propose-confirm, payout
structural exclusion, master-ownership claims + D-08 access.
→ WS-17, WS-18, WS-19, WS-20, WS-29

**Slice G — Audit** *(after E and F)*
Member-side immutable audit trail, both-sides visibility.
→ WS-25

**Slice H — Billing & metering** *(after A; independent of D–G)*
Workspace billing entity, plan resolution, lapse read-only, beta counters.
→ WS-21, WS-22

**Slice I — Rollout & docs** *(last)*
Cohort flag, ACCOUNT-TYPES.md + Playbook updates.
→ WS-27, WS-28

</slices>

<risks>
## Risks Requiring Security or Legal Review

### Security review required
1. **The RLS third path (D-48) is the highest-risk change in the phase.** A bug in the workspace branch of `project_member_role()` grants third parties access to artists' catalogues across the whole platform. Requires: dedicated adversarial tests, a horizontal-escalation test suite, and explicit recursion checks (the 018→064→078 failure class).
2. **Per-row helper performance** — the workspace branch runs inside policies on every row of `vault_projects` and four child tables. Needs measurement before rollout.
3. **Payout structural exclusion (D-42) must be verified as genuinely structural**, not a permission defaulting to false. Should be untestable-by-construction, not merely untested.
4. **Clean-master separation (D-08/D-40) must not regress custody D-01.** Needs a test proving no workspace grant path reaches a clean-master URL.
5. **RESOLVED at planning (2026-09-05) — see D-56.** The owner approved building a working platform-wide disable control, not merely the `workspace_access_enabled()` seam. The risk stands only until WS-31 ships: until then, cohort scoping is the sole containment for a new RLS path that grants third parties access to artists' catalogues.
6. **Grant re-check on use (D-49)** must be genuinely enforced server-side on every access path, not only at the API boundary.

### Legal / counsel review required
1. **Document-state vocabulary (D-37)** — counsel must approve the labels before implementation, matching how custody D-02 flagged its own state labels for review.
2. **Rights-holder-declared scope (D-36)** — whether a Funūn-recorded declaration of authority creates any representation or liability, and how it must be worded.
3. **Authority-tier permissions backed by unverified documents** — the gap between "a document was attached" and "this authority legally exists."
4. **Unilateral revocation (D-18)** vs. a label's or manager's contractual position — confirm Funūn's posture as venue-neutral is defensible.
5. **Record-custody transfer (D-29)** — what a transfer does and does not represent legally.
6. **Master-ownership claims (D-10)** — whether surfacing an unverified claim to the holder creates exposure.

</risks>

<dependencies>
## Open External / Legal / Business Dependencies

- **Counsel review** of D-36, D-37 vocabulary and the authority model. Blocks Slice F user-facing copy, not the schema.
- **Workspace pricing** — Phase 24 self-serve is on hold pending the business-model discussion. D-47 defers this by metering without enforcing, so it does **not** block the phase.
- **Stripe organization billing** — `subscriptions` is per-user with a unique constraint. Org billing is a new Stripe integration shape; needs its own research.
- **Verification process for Management/Label workspaces (D-04)** — who performs it, what evidence is required, which team owns the queue. Undefined. Unverified workspaces work fully, so this does not block the phase.
- **Beta cohort definition (D-55)** — which accounts, chosen by whom.

</dependencies>

<acceptance>
## Beta Rollout & Acceptance Criteria

**Rollout:** cohort-scoped server-side flag (D-55). Personal Member workflows and URLs unchanged
for everyone outside the cohort. Migrations human-gated per repo convention.

**Acceptance criteria — the phase is done when:**
1. A Member creates a Management workspace, invites a colleague by email, and that colleague accepts and works in it — under one login, with no duplicate account and no sign-out to switch (D-12, D-33).
2. A workspace names a Member on its roster; that Member sees the claim and **the workspace can see nothing** until acceptance (D-05).
3. After acceptance, a manager with an operational grant edits metadata on an attached project, and the action is attributed to them **on behalf of** the Member, visible to both parties (D-22, D-50).
4. The same manager **cannot** request a signature until an agreement with a declared scope is attached, and **loses** that ability automatically when it expires — while operational access continues (D-16, D-39).
5. Clean-master download is **not present** in any preset bundle and requires an individual grant; each use is logged (D-40).
6. Payout and tax data is **unreachable** from every workspace surface and every API path (D-42).
7. The Member revokes the relationship unilaterally; workspace access stops immediately, every contribution and audit entry persists attributed, and no project moves or is copied (D-18, D-14, D-25).
8. A label with a **document-supported** master-ownership record retains access to those recordings after the roster relationship ends, and **only** those (D-08, D-09).
9. A grant cannot be issued exceeding the granter's own access, and stops working when the granter's access is reduced (D-49).
10. A cohort member and a non-cohort member both use personal Vault, Writer's Room, Contract Locker and split sheets with **no behavioral difference** (D-52, D-53, D-54, D-55).
11. Full Jest suite, strict `tsc`, ESLint, and a production Next build all pass. RLS adversarial tests for horizontal escalation pass.

</acceptance>

<documentation>
## Required Documentation Updates

### `docs/architecture/ACCOUNT-TYPES.md`
1. New section: **workspaces are contexts, not a fourth account class** — Member/Client Partner/Funūn Team unchanged.
2. Record the **D-28 custody rule** explicitly: `user_id` = record custody, never rights ownership; rights live on split sheets and version ownership records.
3. Extend "Roles, relationships, and rights are separate" with the **workspace relationship** layer and the D-21 two-tier authority split.
4. State the **D-43 invariant**: workspace membership never creates a split-sheet party, credit, or royalty entitlement.
5. State the **D-42 exclusion**: payout and tax data unreachable from any workspace context.
6. Note the **D-33 staff boundary**: Funūn Team Members switch by signing out; workspaces never apply to staff identities.
7. Update the multi-organization paragraph — Member-side multi-workspace now exists with an explicit selector; Client Partner multi-org remains deferred.

### The Playbook
- **Company-wide** — a doctrine entry mirroring the ACCOUNT-TYPES changes, matching how migrations 141/150/178 published prior doctrine.
- **Sales / A&R rooms** — how a workspace relationship differs from a Client Partner relationship, so staff never conflate them.
- **IT room** — the D-55 flag and the (recommended) disable control.
- Publication is a human-gated migration per repo convention.

</documentation>

<deferred>
## Deferred Ideas

- ~~Kill switch / platform-wide disable control~~ — **no longer deferred.** Owner approved at planning 2026-09-05; now D-56 / WS-31, in scope for Phase 38.
- **Client Partner multi-organization membership** — still deferred per ACCOUNT-TYPES; unaffected by this phase.
- **Corporate-to-personal verified credential linking** — a separate authentication build; ACCOUNT-TYPES already defers it.
- **Legacy field removal** (`member_type`, `industry_roles`, `capability_grants`) — its own audited cleanup phase (D-54).
- **Workspace verification operations** — process, evidence, and queue ownership undefined (D-04).
- **Workspace-local annotations** (private pipeline notes on a shared project) — considered at D-26, rejected to avoid a second data surface. Revisit if beta demands it.
- **Read-only "view as member" mode** — rejected at D-22 as impersonation-shaped.
- **Third "sensitive" permission tier** — declined twice (D-21, D-40) in favour of bundle exclusion.
- **A&R-facing member CRM** (assigned book, supply-side health, onboarding funnel) — the separate discussion that surfaced this phase. Still unplanned.

</deferred>

---

*Phase: 38-member-organization-team-workspaces*
*Context gathered: 2026-09-05*
