# Contracts Across Song Passport, Sound Vault, Contract Locker and The Crate

**Status:** Owner-approved product direction; legal language and implementation remain counsel/GSD gated
**Recorded:** 2026-10-04
**Coordination:** Standalone additive record created while Claude was working; intentionally does not edit shared roadmap, phase, TODO, or blueprint files

## Core model

An agreement is not merely a PDF in a file cabinet. It is immutable evidence connected to the exact composition, recording, contributor relationship, release, or licensing transaction that it governs.

```text
Song Passport
  identity, contributors, rights facts and provenance
        |
        | trusted facts + agreement evidence
        v
Sound Vault
  assets, master versions, release readiness and delivery custody
        |
        | admitted song + authorized buyer-safe facts
        v
The Crate
  discovery, licensing request, negotiation and deal
        |
        | deal-specific agreement + execution evidence
        v
Contract Locker
  drafts, reviews, revisions, signatures, executed artifacts and certificates
        |
        +---- links evidence back to the Passport, Vault assets and Crate deal
```

The four systems share references and authoritative facts; they do not copy mutable contract text into one another.

## System responsibilities

### Song Passport — the rights and provenance view of the music

The Passport answers:

- What is the composition?
- Which recording or master version is being discussed?
- Who contributed?
- Which ownership, credit, clearance and authority facts are confirmed, proposed, disputed, outdated or locked?
- Which documents support each fact?

The Passport does not become the executed contract. It displays a **Rights & Agreements** section containing authorized references to Contract Locker records.

### Sound Vault — the working and release-readiness view

Sound Vault answers:

- Which audio, stems, instrumentals, artwork and metadata belong to the work or release?
- Which recording is the designated master?
- Which rights, registrations and agreements are still missing?
- Is the package ready for release, pitching or controlled delivery?

Contracts appear as readiness evidence and actionable gates, not generic attachments.

### Contract Locker — the agreement lifecycle and evidence view

Contract Locker owns:

- Template selection and questionnaires
- Generated drafts and previews
- User and counsel review
- Comments, revision branches and approvals
- E-signature attempts and signer status
- Executed PDFs and completion certificates
- Version, template, disclosure and audit provenance
- Authorized download, archive, amendment and supersession behavior

Executed documents are immutable. A later change creates an amendment, replacement or superseding document; it never overwrites the signed artifact.

### The Crate — the buyer and transaction view

The Crate answers:

- Is the song admitted to the curated catalogue?
- What delivery-safe facts may a buyer see?
- What uses, territories, terms or restrictions are available for discussion?
- What did the buyer request?
- What commercial terms were agreed?
- Which deal-specific license was executed?
- Have contract and payment gates cleared for delivery?

The Crate never treats catalogue admission as licensing authority and never exposes all upstream artist agreements to a buyer.

## How an agreement lives with a song

Add a **Rights & Agreements** section to the Song Passport. Each agreement card should show:

- Agreement type and title
- Parties and their transaction roles
- Draft, in-review, awaiting-signature, executed, expired, terminated, amended or superseded state
- Effective, expiration and termination dates where applicable
- The exact composition, recording version, release or deal covered
- The rights or obligations the agreement addresses
- Template version, origin and review provenance
- Amendment/supersession relationships
- Link to the authorized Contract Locker detail

Do not duplicate the contract file or full legal text into Passport values.

## Agreements for music not already in Funūn

Users may create an agreement for music that has not been uploaded or created anywhere in Funūn. Treat it as an external music reference in Contract Locker, not as a Song Passport, Sound Vault project, Sync Library listing or The Crate asset.

At agreement creation, ask:

> **What music is this agreement for?**

Actions:

- `Choose music already in Funūn`
- `Use music not currently in Funūn`
- `This agreement is not song-specific`

Use this direct status copy for the second path:

> **Not linked to existing Funūn music**
> This agreement is not connected to any song, recording or release already uploaded or created in your Sound Vault or elsewhere in Funūn.

Before creating the external reference, search the user's accessible Funūn works, recordings, tracks and releases for likely title, artist or identifier matches. If candidates exist, show:

> **We found music in Funūn that may match. Link it instead?**

The user may select a match or confirm `Continue without linking`. Similarity alone never merges records or establishes identity.

Until explicitly linked, the agreement:

- Appears in Contract Locker with the `Not linked to existing Funūn music` status.
- Does not appear as evidence on a Song Passport.
- Does not affect Sound Vault readiness.
- Does not create or qualify a Sync Library listing.
- Does not appear in The Crate.
- Does not establish ownership, clearance, representation or delivery authority.

If the music is later added to Funūn, require the user to confirm the exact Work, recording version and release relationship. Add links without changing the agreement's original music-details snapshot or executed artifact.

## Agreement coverage: one song, several songs or a release

The agreement builder must ask:

> **What does this agreement cover?**

Actions:

- `One song`
- `Several selected songs`
- `An entire project or release`
- `This agreement is not song-specific`

For `An entire project or release`, collect the release type (`Single`, `EP`, `LP`, `Album` or `Other`) and then offer:

- `Entire release as currently listed`
- `Select specific tracks`

The first option is a fixed snapshot, not a promise to cover whatever may belong to the project later. Before generation, preview the exact covered items and produce a Schedule A or equivalent exhibit listing each covered composition and recording version. At minimum, each row should contain:

- Track order and title
- Funūn Work/track identifier, or the preserved external reference
- Recording/version or master identifier
- ISRC and ISWC when available
- Coverage: `Composition`, `Master recording` or `Both`
- Rights holder/licensor relevant to that coverage when the template calls for it

Store an explicit scope classification such as `single_work`, `selected_works`, `release_snapshot` or `non_song_specific`. A project-level link alone is insufficient: persist an immutable covered-item row for every exact Work and recording/version included in the generated revision. The agreement may also link to the release for navigation and context.

Adding, removing, reordering or replacing a release track after a draft snapshot exists must trigger a visible scope-difference review. It must never silently change a sent or executed agreement. After execution, a changed song list requires an amendment, replacement or new agreement, according to the governed template and counsel-approved workflow.

Do not offer blanket coverage for an entire catalogue, future releases or works added later by default. A `catalog_scope` or future-works option may exist only in a template whose operative language, disclosure and use case have been specifically approved by counsel.

### Existing and external releases

For an existing Funūn project, let the user select the release and resolve its current track list into the fixed covered-item snapshot.

For music outside Funūn, let the user create one external release reference plus its explicit track list. Show the existing status copy with scope-aware wording:

> **Not linked to existing Funūn music**
> This agreement covers songs or recordings not connected to music already uploaded or created in your Sound Vault or elsewhere in Funūn.

Run the same likely-match check for the release and each track. The user may link confirmed matches individually or continue without linking; a partial match must not collapse the external release into a Funūn release or change the agreement snapshot.

### Cross-system behavior

- **Contract Locker:** owns one agreement instance, its fixed covered-item snapshot, Schedule A, revisions, signatures and amendments.
- **Song Passport:** displays the same authorized agreement reference on every covered song; it does not create duplicate agreement instances or imply that uncovered versions are included.
- **Sound Vault:** evaluates readiness for every covered track and rights dimension. Project-level status must identify incomplete or blocked tracks rather than treating one release link as clearance for all music.
- **The Crate:** ties a request or license to the exact covered compositions and recording versions. It must not infer authority over all tracks merely because an upstream agreement references a project or release.

Some agreements are naturally release-scoped, including distribution, label-services and certain project-wide production arrangements. Other agreements are usually song-specific but may be bundled with an exact schedule, including split confirmations, sync/master-use licenses, sample clearances and featured-artist agreements. Whether bundling is permitted and how it is worded remains a governed-template and counsel decision.

## Contract-to-resource links

Use a normalized many-to-many `contract_resource_links` concept rather than relying on a single `project_id` or `track_id`. One agreement can cover several works or recordings, and one song can have several agreements.

Recommended link targets:

- `work` — underlying composition
- `song_passport` — Passport evidence surface
- `work_version` — demo, mix, instrumental or designated master
- `vault_project` — release/project
- `track` — released or planned track record
- `contributor` or `work_member` — governed relationship
- `sync_listing` — catalogue admission record
- `license_request` — The Crate deal spine
- `buyer_organization` — counterparty context where authorized
- `invoice` or `payment_record` — commercial evidence where appropriate
- `contract_instance` — amendment, option, termination or supersession relationship

Recommended relationship kinds:

- `covers`
- `subject_of`
- `evidence_for`
- `authorizes`
- `restricts`
- `amends`
- `supersedes`
- `terminates`
- `related_to`

A link is provenance and scope. It does not independently prove ownership, clearance, representation or signing authority.

## Contract-derived Passport facts

The current Passport vocabulary already permits `contract` as a source kind across composition, recording-version and release facts. Use that seam carefully.

An executed agreement may propose or support a Passport value and identify its source contract. It must not silently rewrite a confirmed fact or become conclusive merely because a file was linked.

| Agreement | Passport layer | Candidate supported facts |
| --- | --- | --- |
| Split sheet | Composition / contributor | Writers, publishing shares, contributor roles |
| Producer agreement | Recording version / contributor | Producer credit, services, master participation, recording ownership evidence |
| Work-for-hire or contributor agreement | Recording version | Ownership/control of commissioned contribution |
| Featured-artist agreement | Recording version / contributor | Performer identity, credit and use permission |
| Session-musician release | Recording version / contributor | Performance authorization and credit |
| Beat/instrumental license | Composition and/or recording version | Licensed source, restrictions, exclusivity and term evidence |
| Sample clearance | Composition and/or recording version | Sample/interpolation authorization and restrictions |
| Master assignment/license | Recording version | Recording owner/controller and effective scope |
| Publishing/admin agreement | Composition / contributor | Publisher or administrator evidence |
| Distribution agreement | Release | Distributor, term and territories |
| Sync representation agreement | Composition/recording + catalogue | Authority to shop, negotiate or license within the approved model |
| Sync/master-use license | Deal evidence, not ownership | The buyer's permitted use of an exact work and recording |

Recommended fact behavior:

1. Create a proposed/supported value with `source_kind = contract` and `source_record_id` referencing the contract instance.
2. Preserve the agreement's transaction snapshot even if current Passport values later change.
3. Require the appropriate subject/controller confirmation before promotion to confirmed or locked state.
4. If sources conflict, open a Passport issue and mark the affected current value disputed or outdated according to the existing lifecycle.
5. Never alter an executed agreement to match a later Passport correction.

## Composition, recording, release and deal scope must remain distinct

| Scope | Canonical home | Typical agreements |
| --- | --- | --- |
| Composition | Work + Song Passport composition layer | Split sheet, co-writer/collaboration, publishing/admin, composition sample/interpolation clearance |
| Recording/master | Work version + Passport recording-version layer | Producer, work-for-hire, featured artist, session musician, beat/master license, master sample clearance |
| Release | Sound Vault project/track + Passport release layer | Distribution, label services, artwork/photo/likeness release, release-specific consents |
| Catalogue authority | Sync listing + relevant work/master | Sync representation/shopping authorization, Content ID/aggregator authorization where applicable |
| Buyer transaction | The Crate `license_request`/deal | Deal memo, sync license, master-use license, option/addendum, amendment, termination |

The UI must state the scope. “Agreement attached to song” is too vague when composition ownership and master ownership may be controlled by different parties.

## Sound Vault interaction and readiness

Sound Vault should turn agreement requirements into named readiness tasks:

- Split sheet missing or incomplete → composition ownership is not fully documented.
- Producer agreement missing → producer economics, credit or master ownership may be unresolved.
- Work-for-hire/session/featured-artist paperwork missing → recorded-performance permission may be incomplete.
- Sample/interpolation clearance missing → distribution or sync use is restricted.
- Beat-license restrictions unclear → exclusivity, monetization or sync use requires review.
- Master authority unproven → do not represent the recording as fully cleared.
- Sync representation authority missing → Funūn cannot take the actions that the intended operating model requires.

Selecting a task opens the relevant Contract Locker workflow with the work, version, project, track and parties pre-linked.

When a work graduates into a release:

- Preserve the composition and recording agreement links on the Passport.
- Add release links without copying the executed document.
- Snapshot the exact rights and asset state used for release approval.
- Do not assume that a release link expands the scope of any agreement.

## The Crate interaction

### Buyer-visible clearance summary

The Crate may show authorized, delivery-safe signals such as:

- Composition rights documented / further clearance required
- Master authority documented / further clearance required
- Samples or interpolations present and their clearance state
- Representation or per-deal approval requirement
- Available use categories, territories, term boundaries and exclusivity posture
- Delivery-safe contributor credits and identifiers

Avoid a single vague “rights cleared” badge. Show what is documented and what still requires action.

### Information The Crate must not expose automatically

- Upstream artist agreements
- Legal names or private identity/contact information
- Lawyer comments, review notes or privileged/restricted material
- Internal commission, negotiation or staff notes
- Signer bearer URLs, storage paths or restricted Passport facts

A buyer sees the deal documents they are authorized to review or sign, not every agreement supporting the artist's chain of title.

### Deal lifecycle

```text
Sound Vault readiness
  -> Sync Library submission and human admission
  -> buyer discovery in The Crate
  -> license request tied to exact work + recording
  -> rights/authority and artist-guardrail check
  -> commercial negotiation
  -> deal terms agreed
  -> deal-specific license generated
  -> required artist/Funūn/counsel approvals
  -> buyer and rights holders sign
  -> executed agreement stored in Contract Locker
  -> contract + payment gates clear
  -> authorized clean-master delivery
  -> cue sheet, reporting and payment follow-up
```

The executed deal license links to the buyer request, buyer organization, exact composition, exact master version, Vault project/track and relevant upstream authority evidence.

## Agreement taxonomy and why each exists

Exact legal language, supported jurisdictions and variants remain counsel decisions.

### Creation and ownership foundation

1. **Split sheet** — records composition writers and publishing shares.
2. **Producer agreement** — governs production services, compensation/points, credit and master ownership/control.
3. **Work-for-hire or contributor agreement** — documents ownership/control of commissioned recording contributions where that structure is appropriate.
4. **Featured-artist agreement** — governs permission, credit, compensation and use of a featured performance.
5. **Session-musician release** — records performance authorization and credit for narrower session work.
6. **Collaboration/co-writer agreement** — covers broader ongoing obligations beyond a single split confirmation.
7. **Beat/instrumental license** — records exclusivity, permitted uses, term, transferability, monetization and sync restrictions.

### Third-party rights and clearance

8. **Composition sample/interpolation clearance** — clears borrowed compositional elements.
9. **Master sample clearance** — clears use of the sampled sound recording.
10. **Cover/mechanical-license evidence** — records release authority for a cover where required.
11. **Artwork/photo/model/likeness release** — clears visual and promotional assets associated with the release.

### Release, catalogue and administration

12. **Distribution agreement** — records distributor rights, fees, term, territories and takedown/exit rules.
13. **Label services, master license or assignment** — establishes who owns or controls the recording and for what scope.
14. **Publishing administration or co-publishing agreement** — establishes composition administration/control.
15. **Management or representation agreement** — supports a representative's authority; a professional role alone never does.
16. **Sync representation/shopping authorization** — defines whether Funūn may present, pitch, negotiate, approve or execute within explicit limits.
17. **Content ID/aggregator authorization** — supports the selected partner's clearance or administration actions where the product model requires it.

Many third-party distribution, label, publishing and management agreements will initially be uploaded and linked rather than generated by Funūn.

### The Crate transaction documents

18. **NDA/confidentiality agreement** — protects unreleased music, buyer briefs, scripts, campaigns or confidential deal material.
19. **Deal memo** — records agreed commercial terms; its binding or non-binding status must be explicit.
20. **Combined synchronization and master-use license** — grants both composition and recording rights when the same licensor validly controls both.
21. **Separate synchronization license** — grants composition rights when publishing is separately controlled.
22. **Separate master-use license** — grants recording rights when a label or other party controls the master.
23. **Option/expanded-rights addendum** — expands a limited initial grant into streaming, theatrical, broadcast, advertising or other agreed media.
24. **Amendment** — changes an executed agreement without erasing the original.
25. **Termination/release agreement** — records termination, release or relinquishment of prior rights/obligations.

Cue sheets, invoices, payment statements and delivery receipts are transaction evidence but are not substitutes for the governing agreements.

## Recommended build and counsel order

### Foundation first

1. Split sheet
2. Producer agreement
3. Work-for-hire/session agreement
4. Featured-artist agreement
5. Beat license
6. Sample/interpolation clearance variants

These establish the composition/master chain needed before the catalogue can make reliable clearance claims.

### Catalogue authority second

7. Sync representation/shopping authorization
8. Content ID/aggregator authorization if included in the operating model

These define what Funūn and its partners may do before a buyer deal exists.

### Buyer transaction third

9. Deal memo
10. Combined sync/master-use license
11. Separate sync and master-use variants
12. Options, amendments and termination/release forms

These execute the specific commercial use requested through The Crate.

### External agreements as linked evidence

Distribution, label, publishing, management and other third-party agreements should be supported as private uploads with structured metadata and links even before Funūn offers governed templates for them.

## Independent counsel is recommended, not required

Not having a lawyer must not hard-stop a user from generating, reviewing, sending or signing an agreement. Funūn should offer **Invite a lawyer** at the review step, but the user may choose **Continue without a lawyer** after seeing and acknowledging a short risk warning.

Recommended user-facing copy, subject to counsel approval:

> **Lawyer review is recommended, not required. Continuing without it may leave important risks or terms unaddressed.**

Actions:

- `Invite a lawyer`
- `Continue without a lawyer`

If the user continues, record the user, contract instance, disclosure version, timestamp and action. Do not repeatedly interrupt the same unchanged revision; show the warning again when protected language or material deal terms change.

This non-blocking rule applies only to the user's choice to retain independent counsel. Missing required rights, authority, party approvals, signatures, published-template eligibility, payment or delivery gates may still block the relevant action. Funūn's template-review and publication requirements also remain mandatory before a template can be presented as counsel-reviewed.

## Product rules

- Contract Locker owns the agreement lifecycle; Passport, Vault and Crate consume authorized references and facts.
- One contract may cover many resources; one resource may have many contracts.
- A multi-song or release-level agreement must preserve an exact covered-item snapshot; later project changes do not alter signed scope.
- Professional roles and catalogue admission do not grant legal authority.
- A buyer never receives blanket access to upstream contracts.
- Contract-derived facts require confirmation/dispute handling; linking is not adjudication.
- Composition and master rights remain separate unless evidence supports combined control.
- AI may assist explanation, extraction and completeness checks but cannot silently rewrite governed legal clauses or decide clearance.
- No clean-master delivery before the required authority, executed-contract and payment gates.
- Executed agreements, certificates and audit history are immutable and privately stored.
- Amendments and supersession preserve the complete historical chain.
- Independent counsel is recommended but not required; a user may proceed after a short, recorded risk acknowledgment.

## Implementation dependencies

- Governed template/version/review registry
- Contract instances, parties, lifecycle events and immutable artifacts
- `contract_resource_links` or equivalent many-to-many linkage
- Immutable agreement-scope snapshots and covered-item rows capable of generating a Schedule A
- Passport agreement cards and contract-sourced fact proposals
- Sound Vault readiness rules that point to exact missing agreements
- The Crate buyer-safe clearance summary and deal-specific document access
- Contract-matter permissions for users and their lawyers
- Generic e-sign envelopes and webhook-driven execution evidence
- Counsel-approved agreement language, disclosure copy, roles, jurisdictions and review rules
- Security/privacy approval for legal data visibility, retention and access revocation

## Success test

A user can open a song and see the exact agreements supporting its composition, master, contributors and release; resolve missing documents from Sound Vault; admit only appropriately prepared music to the Sync Library; let a buyer see a truthful, limited clearance summary in The Crate; generate and execute the correct deal-specific license; and trace that license back to the exact work, recording, parties, deal, payment and delivery evidence without exposing unrelated private contracts or inferring authority from a profile label or catalogue status.
