# Song Passport Doctrine

**Status:** Owner-approved product doctrine consolidated on 2026-09-01
**Authority:** Canonical internal definition and decision record for Phase 37.3
**Product home:** Sound Vault, attached to one underlying musical work
**Internal reference:** The Playbook → Company-wide → Standards & Doctrine
**Related phases:** 37.3 Song Passport; 37.4 standards exports; 37.5 partner-validated delivery

## Executive definition

The **Song Passport** is the living, versioned record of a song's credits, rights,
provenance, recording versions, release facts and delivery history. It begins with the
underlying work and follows that song from the first hum or lyric through demos, masters,
release preparation, exports, corrections, ownership changes and controlled delivery.

It is not a contract, split sheet, copyright registration, DDEX certificate, proof of
ownership or distributor account. It connects and cites those records without replacing
their legal or operational authority.

The governing promise is:

> Enter a fact once, preserve where it came from, confirm it at the right moment, and
> carry the approved truth forward without silently rewriting history.

## Capability truth as of 2026-09-01

### Shipped foundations

- Sound Vault works, recording versions, collaborators, lyric blocks, AI disclosures and
  an append-only creative diary
- Writer's Room membership, private presence, section-aware soft locks, recoverable lyric
  snapshots and comments
- Collaborator profiles and identity reconciliation
- Split-sheet drafting, explicit locking/approval and e-signature workflows
- Contract Locker document storage and lifecycle tracking
- Release-level Metadata Studio and Release Report readiness foundations
- Immutable source-file handling for generated delivery-safe tagged MP3s and metadata
  sidecars, with hashes, snapshots, manifests and receipts

### Planned in Phase 37.3

- One canonical Passport per work with field-level provenance, trust state and privacy class
- Source-authority and conflict-resolution rules across profiles, splits, contracts,
  recording versions and releases
- Confirmation and approval workflows that never silently rewrite locked or delivered facts
- Passport UI inside Sound Vault, with tasks, readiness explanation and scoped sharing
- Final-master selection and graduation into the Release Report without re-entry
- Immutable Passport snapshots, portable exports and custody-transfer records

### Partner-dependent or later

- Normative CWR, RIN and ERN/DDEX production exports and validation belong to Phase 37.4
- Certified or accepted direct delivery to any distributor, DSP, society or Secretly
  belongs to Phase 37.5 and requires a named recipient's sandbox/UAT evidence
- Content ID, acoustic matching, forensic watermark recovery, collections and payments
  require separate authorized partner programs and production validation

## Permanent doctrine

### SP-01 — One Passport per underlying work

One canonical Song Passport belongs to the composition-level work. Recording versions and
release manifestations attach to that Passport; they do not create competing Passports.
The system must prevent accidental duplicate canonical records and provide an explicit
merge/reconciliation process when legacy data suggests the same work more than once.

### SP-02 — Sound Vault is the product home

The Passport lives inside Sound Vault with the song. The Writer's Room remains the default
creative view for an unreleased work, while Passport, versions, rights and delivery history
are local views of the same record. This does not require a new primary navigation room or
a wholesale redesign of the current site.

### SP-03 — Four distinct truth layers

The Passport keeps four layers separate:

1. **Contributor identity:** professional and legal identity, roles, PRO, IPI/CAE, IPN,
   ISNI, publisher and permissioned professional contact data.
2. **Composition:** title, writers, roles, publishing shares, lyrics, language, ISWC,
   publisher, authorship provenance and AI contribution history.
3. **Recording version:** performers, producers, engineers, recording context, duration,
   vocal/instrumental state, version label, master designation, recording ownership and
   AI-performed elements.
4. **Release:** ISRC, UPC, release date, label, catalogue number, track sequence, P-line,
   C-line, release title and distributor-facing facts.

A composition fact follows its recordings. A recording fact may differ by version. A
release-only fact never flows backward into a rough demo merely because another recording
of the work was released.

### SP-04 — The record is living; snapshots are immutable

The current Passport may evolve. Every approval, export, delivery, registration or
ownership event binds to an immutable snapshot of the exact facts used at that moment.
Later corrections create successor values and snapshots. They never rewrite what a prior
recipient, registry, agreement or release relied on.

### SP-05 — Every meaningful fact has provenance

Each field records its source, source record, responsible actor, timestamp, trust state,
privacy class and revision relationship. The interface must show enough provenance for a
user to answer, “Where did this come from, who confirmed it, and what used it?”

Funūn records declarations and evidence. It does not adjudicate authorship, ownership or
legal disputes.

### SP-06 — Source authority is explicit

Sources do not have equal authority:

- A person controls confirmation of their own identity and permissioned profile facts.
- An executed split sheet controls the approved composition shares it covers.
- An executed agreement controls the legal terms and authority it covers.
- A recording-version record controls version-specific performer and production facts.
- An approved Release Report snapshot controls release-only facts for that release.
- A prior immutable delivery or registration snapshot remains authoritative for what was
  actually sent, even after the living record changes.

When sources disagree, Funūn shows a conflict and routes it for review. It must not choose
a legally meaningful winner silently.

### SP-07 — Trust states govern propagation

Every meaningful value uses these states:

- **Inherited:** copied from an approved upstream source and still allowed to refresh.
- **Draft:** entered or proposed but not formally confirmed for this context.
- **Confirmed:** affirmed for the work or version by an authorized person.
- **Locked:** tied to an executed agreement, registration, approved release or delivery.
- **Outdated:** an upstream source changed after confirmation or locking and review is due.
- **Disputed:** conflicting claims or evidence prevent approval or delivery for the affected use.

Inherited values may refresh automatically. Drafts may be edited by authorized contributors.
Confirmed, locked, delivered or disputed values are never silently overwritten.

### SP-08 — Confirmation and approval are different actions

Confirmation means an authorized person affirms a fact within their authority. Approval
means the responsible controller accepts a defined snapshot for a specific use, such as a
release, registration or delivery. Self-confirmation must not become universal authority.
Material changes after approval require a new approval or successor snapshot.

### SP-09 — Creative collaboration and legal consent stay separate

Live collaboration covers lyrics, notes, presence and meaningful creative diary events.
Publishing percentages, legal names, identity records, executed agreements, final release
identifiers, approved metadata and audio-file bytes stay outside simultaneous creative
editing. Writers may discuss or propose changes, but legal and commercial facts require
explicit review and approval.

Writer's Room membership grants creative access, not ownership, signing authority,
licensing authority, metadata approval or clean-master access.

### SP-10 — Tasks route work; facts determine readiness

Passport tasks live with the song and may be assigned to responsible people. A task can
point to a missing, outdated, disputed or approval-required fact. Completing a task does
not change readiness by itself. Readiness changes only when the underlying required fact,
evidence or approval reaches the qualifying state.

The readiness view must explain the rule that passed or failed and link to the source fact.

### SP-11 — Recording versions never overwrite one another

Every hum, demo, rough, instrumental, clean edit, final mix, master and alternate master is
a distinct version. Replacing audio creates a new version and lineage link. Version labels
and “final master” are workflow designations, not proof of ownership.

If the final mix was not uploaded in the Writer's Room, it may be uploaded later through
Sound Vault or the Release Report, linked to the same work and treated as a new recording
version. Confirmed composition facts may carry forward; recording facts and master status
must still be reviewed.

### SP-12 — Final-master selection is explicit and reversible only by successor action

An authorized release controller selects the release master from an exact recording
version. The system freezes the selected version and Passport snapshot for that release.
A later replacement creates a successor master selection and new readiness review; it does
not rewrite the earlier designation or delivery history.

### SP-13 — Original uploaded audio is immutable evidence

Funūn never edits or overwrites uploaded source bytes. Tagging, normalization, conversion,
trimming, watermarking and replacement audio create separate derivatives or versions.
Every original and derivative has its own asset identity, hash and provenance link.

“Immutable” means unchanged while retained, not retained forever. Approved deletion and
backup-aging policies still apply.

### SP-14 — Metadata follows the song without exposing private data

Delivery-safe tags may include title, public artist credits, album/release title, composer,
producer and performer credits, copyright lines, publisher, lyrics, language, genre, BPM
and assigned identifiers.

Do not embed by default: email, phone, address, payment data, signatures, contract language,
internal notes, private split negotiations, sensitive identity facts or legal documents.
Explicitly authorized sidecars may contain approved professional contact information.

### SP-15 — ID3 is a delivery copy; non-MP3 formats use sidecars first

Funūn may generate real MP3 ID3 delivery copies from an immutable source and a versioned
Passport snapshot. The first safe workflow for WAV, FLAC, AIFF and other formats is an
unchanged audio asset plus human-readable and machine-readable sidecars. Container-specific
embedding may be added only after format-level validation and compatibility testing.

### SP-16 — DDEX is not embedded “in the song”

DDEX, CWR and RIN are structured messages or export packages. They are not an audio tag,
identity watermark or certification embedded in a master. The Passport provides one
canonical source for those outputs, while each standard retains its own schema, version,
validation and recipient requirements.

Funūn must not say it is “DDEX certified.” It may obtain a DDEX Implementation Licence and
DPID, implement named standards and report real validation or partner acceptance evidence.

### SP-17 — Direct distributor delivery requires a named accepted path

Today, a user may receive a prepared package and still need to enter or verify information
inside a distributor portal. Zero re-entry is a future integration outcome, not an export
claim. Funūn may say direct delivery is live only after a named recipient accepts the exact
message profile, package, transport and correction choreography through sandbox/UAT and a
controlled production pilot.

### SP-18 — Deliveries bind exact files to exact snapshots

Each formal delivery identifies recipient, purpose, authority, agreement, recording
version, exact asset hash, Passport snapshot, restrictions, transmission outcome and any
real recipient acknowledgment. “Prepared,” “sent,” “transmitted” and “accepted” are not
interchangeable states. Corrections create linked successor receipts.

### SP-19 — Visibility and sharing are scoped

The owner or authorized administrator may share only the fields and artifacts required for
a named purpose. Creative members, identity subjects, signatories, release operators and
external recipients see different subsets. Sensitive legal and identity data is denied by
default, and clean-master access is a separate capability.

### SP-20 — Ownership changes preserve chain of title

When a master or catalogue interest is sold, Funūn records the previous controller, new
controller, effective date, scope, territory, term, consideration status where appropriate,
governing instrument and affected versions. The transaction creates a new control period;
it does not replace the historical owner or retroactively alter earlier receipts.

The buyer receives only the access and records authorized by the transaction. Private
creative notes, unrelated contracts and personal data do not transfer automatically.

### SP-21 — Custody transfer and portability are first-class

An authorized controller can export a portable package containing the approved Passport
snapshot, source/derivative manifest, hashes, credits, rights references, version lineage
and delivery history allowed by policy. A custody transfer records sender, recipient,
authority, manifest, transfer state and acknowledgment. Export never deletes Funūn history
or implies that the recipient accepted legal title.

### SP-22 — Retention and deletion are explicit

Deletion must distinguish the living Passport, source audio, derivatives, executed
documents, delivery receipts, security logs, legal holds and backup copies. Authorized
deletion removes future access and follows contractual, legal and backup-aging obligations.
A minimal tombstone may remain to preserve that an identifier, transfer or delivery once
existed without retaining the audio or unnecessary personal data.

### SP-23 — AI may assist but may not manufacture authority

AI may suggest classifications, mappings, missing-field prompts and likely conflicts. It
may not confirm identity, assign ownership, approve splits, sign agreements, designate
legal authority or silently change approved metadata. AI-generated and AI-performed
contributions remain disclosed using the existing work/version distinction and require
human review before release or export.

### SP-24 — The Passport remains provider-neutral

Sound Vault, the Song Passport, Split Sheets, Contract Locker and the Release Report remain
canonical even when Funūn integrates a distributor, DDEX recipient, rights society,
watermark provider or detection service. Partner adapters translate approved snapshots;
they do not become the only copy of Funūn's truth.

### SP-25 — Claims follow evidence

Internal and public language must separate:

- **Shipped:** proven in the current product and production environment.
- **Planned/coming soon:** owner-approved and implementation-scoped, but not yet live.
- **Partner-dependent/exploring:** requires external commercial, legal or technical agreement.

Do not claim simultaneous Google Docs-style editing, universal embedded DDEX identity,
certified delivery, complete native contract generation, counsel-complete sync
representation, automated Content ID/collections/payments or undefined permanent pricing
until each claim is supported by the real capability and applicable approvals.

## Authority matrix doctrine

| Actor | May draft | May confirm | May approve/freeze | May deliver/share |
|---|---|---|---|---|
| Work owner/custodian | Work and version facts within authority | Own declarations | Named use when authorized | Scoped artifacts when authorized |
| Administrator member | Creative/operational facts | Own declarations | Only expressly delegated scopes | Only expressly delegated scopes |
| Contributor | Lyrics, notes, credits and proposals | Own identity/contribution | No universal approval | No clean-master right by membership |
| Identity subject | Own profile facts | Own identity | No work/release authority by identity alone | Approves permitted use of private identity data |
| Split-sheet party | Proposed shares | Own party facts | Executed sheet through explicit signature | No master/release authority by signature alone |
| Contract signatory | Agreement terms within workflow | Own acknowledgments | Signature only for granted authority | Contract-defined only |
| Release controller | Release facts | Release declarations | Release snapshot/master selection | Approved release/distributor package |
| External recipient | No canonical edits | May acknowledge receipt | No internal approval | Receives only granted package |
| Funūn staff | No rights ownership | Operational verification only | Role-limited; break-glass audited | Only documented support/operations purpose |

No actor may grant more authority than they hold. Server and database controls—not hidden
buttons—enforce sensitive actions.

## First shippable Phase 37.3 boundary

The first complete Song Passport release must support one work, two contributors, three
recording versions and one graduation into the Release Report. Approved identity and
composition facts carry forward; recording facts remain version-specific; the selected
master and release-only facts are reviewed; tagged MP3 and sidecar artifacts bind to one
immutable snapshot; no private field leaks; no source audio changes; and later profile
changes do not rewrite locked or delivered history.

The first release does not require direct partner delivery, every container-tag format,
automated society registration, Content ID enforcement, payments or completed general
contract generation.

## Internal operating examples

### A writer changes their IPI

Unconfirmed Passports may inherit the new value. Confirmed or locked Passports become
outdated and request review. Prior split sheets, registrations and delivery snapshots keep
the IPI value they actually used.

### A final master arrives outside the Writer's Room

The owner uploads it into Sound Vault or the Release Report, links it to the work, completes
version-specific credits and explicitly selects it as the release master. No creative
history is fabricated, and no existing version is overwritten.

### A master is sold

The executed transfer instrument is stored in Contract Locker; the Passport records a new
control period and the exact versions/scope transferred. Earlier ownership and delivery
history remain visible to authorized users. Access changes prospectively.

### A distributor package is prepared

Funūn freezes the approved release/master snapshot and generates the allowed audio,
artwork, metadata and manifest package. The status is “prepared” until a real transfer
occurs and “accepted” only if the recipient actually acknowledges acceptance.

## Governance

- Product doctrine owner: Funūn leadership.
- Engineering changes must cite the relevant SP decision and preserve its invariants.
- Legal source records remain under lawyer-reviewed Contract Locker doctrine; Funūn does
  not act as the user's attorney.
- Review this doctrine after each Phase 37.3 slice and before any Phase 37.4/37.5 claim.
- Changes require a dated successor revision and corresponding Playbook update.
