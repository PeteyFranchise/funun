# Sound Vault Master Custody

**Status:** Ten-item owner deliberation complete; published to The Playbook via human-gated migration 141; ready for consolidated GSD planning
**Owner approval:** D-01 through D-10 locked 2026-09-01
**Applies to:** Sound Vault originals, versions, previews, controlled shares and approved deliveries

## Permanent doctrine

Funūn treats every uploaded master as a private asset. A master is accessible only to
its owner and explicitly authorized parties through authenticated, time-limited
access. Original uploads remain immutable, previews never expose a clean master, and
delivery either produces a controlled copy or grants purpose-bound access through an
approved delivery workflow.

Every recording version has its own identity, history, contributors, ownership status
and relationship to the song. New audio creates a new version rather than silently
replacing an earlier file.

Every original and derived asset receives its own cryptographic fingerprint and
traceable derivation record. Recipient attribution and online-use detection are
separate capabilities that require recipient-specific forensic copies and approved
rights-management partners.

Access is deny-by-default and granted per action, asset, purpose and duration. Creative
participation, record custody, legal authority and clean-master delivery are separate
capabilities and must never be inferred from one another.

External access credentials expire and can be revoked. Long-lived catalogue listings,
authenticated records and executed agreements may persist without creating permanent
audio, download or signing links.

Protected and clean-file transmissions create accountable, privacy-conscious records
that state what Funūn observed without claiming knowledge of what happened on a
recipient's device afterward.

Every formal delivery creates an immutable manifest and outcome receipt binding the
exact assets, metadata, rights, authority, agreement, purpose and acknowledgments.

Authorized actors may stop future access until the documented delivery commit point,
subject to executed agreements and other legal obligations. Revocation never rewrites
a completed delivery or implies remote destruction of a recipient's copy.

No listening, browsing, sharing, pitching or evaluation surface can access an original
clean-master path. Owner retrieval, licensed delivery and distributor release use
separate, explicitly authorized services and immutable delivery evidence.

Uploaded originals remain byte-immutable while retained. Designation, approval,
metadata correction, derivation, delivery, retention and deletion occur through
versioned lifecycle records rather than overwriting source history.

This is a product and architecture rule, not a claim that all controls below are
already complete in production.

## D-01 - Private master storage (LOCKED)

The owner approved private master storage as a permanent Sound Vault custody doctrine
on 2026-09-01.

### Required behavior

- Master storage containers are private.
- The browser never receives a permanent public master URL.
- Funūn checks authorization before generating short-lived access.
- Preview/listening permission is separate from clean-master download permission.
- Entering the Writer's Room or becoming a creative collaborator does not itself grant
  clean-master download rights.
- Database records retain the asset identity and private storage locator rather than a
  reusable public URL.
- Backups and derived assets receive protections appropriate to their sensitivity.
- Access attempts, successful downloads and privileged administrative actions are
  auditable.
- Removing permission blocks future access. Funūn must not imply that it can retrieve
  a file that an authorized recipient has already downloaded.
- Previews must never expose the clean master, by stream or download.

### Permission model to carry into planning

1. **Owner** - manages the master and its permissions.
2. **Creative collaborator** - may receive protected listening access but no automatic
   clean-master download permission.
3. **Approved recipient** - receives controlled access for a defined purpose and time.
4. **Authorized administrator** - receives exceptional, role-limited and logged access
   for support, compliance or delivery operations.

Planning must define whether approved-recipient clean-master access is granted by the
owner alone, by a signed-and-paid deal gate, or by an audited staff override. That
delivery authorization question is not settled by D-01.

### Security and product boundaries

- Private storage does not mean Funūn can guarantee that an authorized recipient will
  never copy a file after receiving it.
- Protection before delivery should combine permissions, expiring access, protected
  preview copies, watermarking where appropriate, audit records and contractual gates.
- Signed URLs are an access mechanism, not the authorization model. Authorization must
  be evaluated before each link is minted.
- Preview and master accessors should be structurally separate so a preview route cannot
  accidentally resolve the original-master storage path.
- Logging must serve security, support and rights evidence without becoming creative
  surveillance.

### Definition of success

A user can upload a master without creating a public URL. An unauthorized person cannot
stream or download it. Every authorized access is permission-checked and recorded, and
previewing a song never reveals the original master file.

## D-02 - Version and ownership records (LOCKED)

The owner approved version and ownership records as a permanent Sound Vault custody
doctrine on 2026-09-01.

### Required version record

Each voice memo, demo, rough mix, instrumental, clean edit, radio edit, final mix,
master or alternate master receives its own record containing:

- A unique version ID and user-facing name
- Uploader and upload timestamp
- Recording and production contributors
- Source asset and file hash when available
- Parent version when the recording derives from another version
- Working, approved, superseded or withdrawn status
- Master designation, where applicable
- The relevant versioned Song Passport snapshot
- Ownership/control status and supporting evidence links

Replacing audio creates a new version. It must not overwrite the prior version or its
history. Calling a recording the "final master" is a workflow designation, not proof
of legal ownership.

### Composition and master control remain separate

Composition copyright and sound-recording/master ownership are distinct records. A
person may hold a songwriting interest without owning the master, or may own/control
the recording without owning the underlying composition.

Funūn records declarations, acknowledgments, linked documents and provenance. It does
not adjudicate ownership disputes or present an internal status as a legal ruling.

### Ownership and control states

1. **Unconfirmed** - no ownership declaration is complete.
2. **Claimed** - a user has stated who owns or controls the recording.
3. **Contributor-confirmed** - relevant parties have acknowledged the information.
4. **Document-supported** - the record links to executed agreements or other evidence.
5. **Disputed** - claims conflict or a relevant party has objected.
6. **Cleared for a defined use** - the required parties have authorized a particular
   release, delivery or sync transaction.

Counsel must review the final labels and user-facing explanations before implementation.
No state alone guarantees legal title, and "cleared" must always name the authorized
use rather than operate as a universal status.

### Revision and transaction rules

- Ownership/control edits create dated revisions rather than rewriting history.
- Executed, registered or previously delivered snapshots remain immutable evidence of
  what the parties and Funūn relied on at that time.
- Later corrections create a successor record and may mark an earlier record outdated;
  they do not alter the historical snapshot.
- A disputed version cannot be represented as delivery-ready.
- Clean-master delivery binds to the exact recording version and ownership/control
  snapshot approved for that transaction.
- Version contributors, uploaders, owners, controllers and authorized users are
  separate concepts and must not be inferred from one another.

### Definition of success

An artist can trace every recording through its version history, see who uploaded and
contributed to it, understand who claims or has documented control of the master, and
identify the exact recording and ownership snapshot used for a release or deal.

## D-03 - File integrity, provenance and rights enforcement (LOCKED)

The owner approved file integrity, derivation provenance, recipient-specific delivery
attribution and licensed-use enforcement as permanent doctrine on 2026-09-01.

### File integrity and derivation provenance

Funūn fingerprints every completed original upload and records an auditable chain for
every version, preview, export and delivery copy derived from it.

Each asset record must include:

- SHA-256 hash, with the data model able to support additional hash algorithms later
- Original filename, file format, byte size and technical audio details
- Uploader identity and server-recorded upload completion time
- Work ID, recording-version ID and private storage locator
- Upload method or source and validation/malware-scan outcome
- Parent asset where the file is derived from another asset
- Transformation or operation that created the derivative
- Versioned Song Passport/metadata snapshot used
- Service or authorized actor responsible for the operation

Every derivative receives its own hash. A tagged MP3, protected preview, recipient-
specific copy and clean-master delivery must never reuse the source WAV's fingerprint.

### Integrity controls

- Generate and verify the authoritative hash server-side after upload completion.
- Do not trust a browser-supplied hash as the sole integrity record.
- Verify the expected hash before high-value delivery.
- Make provenance events append-only in normal operation; corrections create new
  events rather than silently changing history.
- Flag missing objects, hash mismatches, broken parent links and incomplete derivation
  chains for review.
- Bind every delivery to the exact recording version, asset hash, metadata snapshot,
  rights snapshot, recipient and authorization record.

### Evidence boundaries

- A matching cryptographic hash proves byte-for-byte identity.
- A hash does not prove copyright ownership, authorship or licence authority.
- A Funūn timestamp records when Funūn received or created the asset; it does not by
  itself prove when the song was written or recorded.
- Re-encoding, tagging or other byte changes produce a new hash even when the recording
  sounds substantially identical.
- Hashes support custody evidence and operational trust. They must not be marketed as
  copyright registration or guaranteed legal proof.

### Recipient-specific delivery attribution

A delivery log proves which recipient was authorized to receive which asset. It does
not by itself identify the source of a later leak when multiple recipients received the
same file.

Where attribution is required, Funūn must create a distinct copy for each recipient
through a production-grade forensic audio-watermarking partner. The embedded payload
should resolve to an opaque internal delivery ID, not directly expose personal data.
Funūn records the mapping between delivery ID, recipient, asset, deal, purpose and time.

Forensic watermark recovery may support a leak investigation after transcoding or
editing, but Funūn must not promise perfect survival or treat a recovered identifier as
automatic proof that the named recipient personally committed the misuse.

### Licensed-use detection and enforcement

Recipient watermarking answers which controlled delivery produced a copy. Acoustic
fingerprinting and platform rights-management systems answer where matching audio is
being used online. These remain distinct systems.

The approved workflow is:

1. The artist or rights holder expressly authorizes administration for a defined
   recording, right, territory and period.
2. Funūn verifies the selected master, identity, ownership/control evidence, conflicts,
   third-party material and platform/partner eligibility.
3. An approved partner receives the eligible reference file and accurate metadata.
4. Matches return to a Funūn review queue with platform, territory, use and confidence.
5. Funūn checks each match against its licence and allowlist ledger.
6. Authorized uses are allowlisted, released or otherwise protected from improper
   claims.
7. Suspected unauthorized uses receive human rights review before action.
8. The authorized rights holder or properly authorized administrator chooses the
   permitted response: track, monetize, block, contact, claim or legally reviewed
   takedown.
9. Claims, disputes, releases, counter-notices, outcomes and recovered revenue remain
   tied to the asset, rights snapshot and authority used.

Enforcement must never be fully automatic. Fair use or other exceptions, territory,
term, ownership disputes, samples, non-exclusive material and valid third-party licences
can make an apparent match authorized or non-actionable.

YouTube Content ID requires qualifying rights and responsible reference/claim
administration. Production-library music licensed at scale may require manual review.
Current policy must be revalidated with the chosen partner before launch:

- https://support.google.com/youtube/answer/2797370
- https://support.google.com/youtube/answer/2605065
- https://support.google.com/youtube/answer/107008
- https://www.copyright.gov/policy/section512/section-512-full-report.pdf

### Build-versus-partner boundary

Funūn owns:

- Master, version, hash and derivation records
- Recipient, access and delivery ledger
- Licence, territory, term and allowlist ledger
- Artist authorization and revocation status
- Rights/conflict readiness and evidence packages
- Human review queues, claim status and user-facing reporting

Specialist partners initially provide:

- Production-grade forensic audio watermarking and recovery
- Platform-scale acoustic matching
- Content ID or equivalent platform administration
- Platform claim delivery, dispute operations and revenue collection where contracted

Funūn must not advertise any partner-supplied capability until a real integration,
authority model, operational process and production validation exist.

### Implementation stages

1. **Integrity foundation** - server-side hashing, immutable asset records, parent-child
   derivation graph and verification alerts.
2. **Delivery identity** - per-recipient delivery records tied to asset, recipient,
   purpose, rights snapshot and metadata snapshot.
3. **Forensic partner pilot** - vendor review, security/privacy diligence, opaque payload
   contract, survival testing and controlled recovery drills.
4. **Licence and allowlist ledger** - territory, term, media, permitted use, buyer and
   authorization records capable of determining whether a detected use is licensed.
5. **Detection partner pilot** - eligible catalogue intake, reference submission,
   match ingestion and test-library exclusions.
6. **Human enforcement operations** - review queue, authority checks, claim/release/
   dispute actions, evidence preservation, audit and artist reporting.
7. **Controlled launch** - small rights-clean catalogue, named staff operator, counsel-
   approved terms, false-positive monitoring and stop conditions.

Stages 3, 5, 6 and 7 require product, security, privacy, operations and music/IP counsel
review plus actual partner agreements.

### Definition of success

Funūn can identify the exact file uploaded, trace every derivative to it, detect
unintended changes and show precisely which recording and metadata/rights snapshots
were delivered to each recipient. For a controlled pilot, Funūn can create distinct
recipient copies, recover a test watermark after agreed transformations, ingest an
online match, determine whether the use is licensed, protect valid licensees and route
only reviewed, properly authorized cases into enforcement.

## D-04 - Least-authority access permissions (LOCKED)

The owner approved detailed, least-authority access permissions as a permanent Sound
Vault custody doctrine on 2026-09-01.

### Governing rule

Access is granted per action, per asset, for a defined purpose and duration. Being
connected to a song does not automatically grant control over its masters, rights,
contracts, metadata or delivery.

A Sound Vault record custodian organizes the record but is not automatically the sole
legal owner or controller of the composition or master.

### Permission bundles

Permission bundles simplify common workflows but do not replace action-level checks:

- **Record custodian** - organizes the Sound Vault record and proposes permissions.
- **Creative collaborator** - enters the Writer's Room and may receive protected
  listening, lyrics, notes or version permissions.
- **Rights participant** - reviews the relevant credits, splits, ownership claims and
  approvals for which they have standing.
- **Project manager** - coordinates work and contributors without automatic legal,
  signing or master-download authority.
- **Approved recipient** - receives a specific preview or delivery for a recorded
  purpose and period.
- **Authorized Funūn operator** - receives role-limited operational access required for
  an assigned workflow.
- **Security administrator** - receives exceptional, logged break-glass access for a
  defined incident or recovery action.

### Separately controlled actions

The authorization model must independently control whether a person may:

- Enter a Writer's Room
- Stream a protected preview
- Add lyrics, notes or creative versions
- Upload a new recording version
- Edit draft metadata
- Propose contributor, ownership or control changes
- Confirm or lock approved metadata
- View sensitive identity, contact or payment information
- View a specific contract or legal record
- Sign, acknowledge or approve an agreement
- Manage collaborators and permission grants
- Create or forward a protected share
- Download a protected or watermarked copy
- Approve clean-master delivery
- Download or receive the clean master
- Authorize a release, sync use, platform claim or enforcement action
- Revoke future access within the actor's authority

### Authority boundaries

- Uploading a master does not prove ownership.
- Contributor status does not grant download or delivery rights.
- Project management does not grant signing or licensing authority.
- Signing a split sheet does not authorize clean-master delivery.
- Creative approval does not approve rights, metadata, release or licensing.
- Manager or representative authority must be expressly delegated and scoped.
- One rights participant cannot approve for another without documented authority.
- No user may grant a permission greater than the authority they hold.
- Material changes to the asset, recipient, purpose, agreement or rights snapshot
  require fresh authorization where the permission depends on those facts.

### Enforcement and audit rules

- Deny access by default.
- Evaluate sensitive authorization server-side for every request.
- Enforce data isolation and write authority at the database/RLS boundary as a second
  control; hiding a button is never sufficient.
- Scope grants to the relevant work, version, asset, document, deal or delivery.
- Require stronger/recent authentication for clean-master delivery, legal approval and
  permission administration.
- Record grants, uses, changes, failed sensitive attempts, revocations and overrides.
- End future access promptly when a relationship ends while retaining historical
  evidence and executed records.
- Never expose unrelated contributors' private identity, payment or legal data merely
  because someone can collaborate creatively.

### Staff and break-glass access

Employment at Funūn does not create routine clean-master access. Staff permissions are
role-limited, purpose-specific and time-limited where practical. Privileged access is
audited and cannot silently change rights, approvals or delivery authority.

Exceptional support, security or recovery access must use a documented break-glass
workflow with reason, approving authority, time, affected records and follow-up review.

### Revocation boundary

Revocation can prevent future streams, link openings and downloads that have not yet
occurred. It cannot retrieve a file already downloaded by an authorized recipient.
User-facing language must state that limitation honestly.

### Definition of success

Two collaborators can work creatively on the same song while seeing only the records
and assets necessary for their roles. Neither can download, authorize, sign for,
deliver or disclose anything beyond documented authority, and every sensitive decision
can be reconstructed from the audit record.

## D-05 - Expiring access and link lifecycle (LOCKED)

The owner approved expiring links, renewable Crate preview access and signing-link
lifecycle as a permanent Sound Vault custody doctrine on 2026-09-01.

### Governing rule

Every external Sound Vault link expires, can be revoked and grants only the minimum
access required for its stated purpose. Expiration applies to the invitation or access
credential; it does not silently delete the underlying song, legal record or audit
history.

### Two-layer access model

1. **Parent access grant** - names the asset or record, permitted action, recipient or
   bearer policy, purpose, start, expiration, revocation state and limits.
2. **Short-lived storage/media credential** - generated only after the parent grant and
   current authorization are checked.

A seven-day share must not contain a seven-day direct storage URL. Each permitted media
request generates a credential lasting only minutes, and no child credential may
outlive the parent access grant.

### Approved default durations

- Protected listening preview: seven days; deliberate extension up to 30 days.
- Buyer shortlist or Selects share: seven days; named recipient where attribution or
  sensitive access matters; forwarding policy explicit.
- Watermarked download: 24 hours with a defined download limit.
- Clean-master delivery: 24 hours, named recipient, verified account/identity and
  stronger recent authentication.
- Contract or sensitive-document invitation: seven days or until the governing signing
  event closes it, whichever applies.
- Writer's Room participation: authenticated account permission rather than a reusable
  external bearer link.

Product planning may tune durations by threat model, but indefinite external asset and
signing links are prohibited. Renewal is an intentional, recorded action that creates
new access credentials.

### Bearer, named-recipient and team access

- **Bearer access** permits anyone holding the token to exercise its narrow permission.
  It is acceptable only for explicitly approved low-risk preview experiences.
- **Named-recipient access** binds access to a verified email/account and is mandatory
  for clean masters, sensitive documents and recipient-attributed downloads.
- **Team access** creates a separate recipient/access record for each approved person;
  one delivery credential should not become an informal team credential.

If a supervisor needs an editor or colleague involved, the product should make adding
that person easy rather than encouraging credential forwarding.

### The Crate: continuous catalogue, renewable access

The Crate remains a browsable collection while a song is admitted and artist-authorized.
Continuous discoverability does not create permanent audio access.

For each play, Funūn checks that:

- The song remains active and available to that viewer/audience.
- The artist has not paused or withdrawn it.
- The selected version is approved for preview.
- Any applicable buyer, territory or rights restrictions pass.
- The stream resolves only to a protected derivative, never the clean master.

The application then generates a short-lived preview credential and renews it
transparently during an authorized listening session. The buyer can browse and listen
without repeatedly handling expiring links, while the underlying media URL remains
temporary.

When a song is withdrawn, new discovery and streams stop and existing media credentials
expire within their short technical lifetime. Existing pitches, deals and history
remain. An executed agreement may create obligations that artist withdrawal cannot
silently undo; the deal and contract state govern that case.

External Crate shortlists receive their own expiring access grants. Expiration of a
shortlist does not prevent an otherwise authorized Crate member from finding an active
song through normal catalogue access.

Routine Crate streams may use a protected preview plus renewable session access.
Recipient-specific forensic copies are reserved initially for attributed downloads,
sensitive advances or other higher-risk use cases.

### Contract Locker and signing invitations

The permanent rule is: **The invitation expires; the legal record does not.**

A contract or split-sheet signing invitation closes when its deadline arrives or when
the recipient signs, all parties complete, the sender voids it, authority is revoked,
or a replacement version is issued. Completion or voiding may close the link before
the seven-day default.

If an unsigned invitation expires, an authorized sender may issue a new invitation for
the same unchanged document. If terms change, the old signing request is voided and a
new version/workflow is issued; the old link cannot open or sign the replacement.

Executed documents, signature certificates and their immutable versions remain in the
authorized parties' authenticated Contract Lockers. Users must not depend on an old
email signing link as permanent document storage.

### Security controls

- Generate high-entropy, unguessable external tokens and store only cryptographic token
  hashes.
- Keep private storage paths and personal/song-identifying data out of tokens and URLs.
- Recheck authorization, expiration, revocation, recipient, asset/version status and
  usage limits on every request.
- Use server time as the lifecycle authority.
- Prevent token exposure through analytics, referrer headers, application logs and
  unnecessary third-party resources.
- Rate-limit and monitor repeated invalid-token attempts.
- Record creation, open, failed attempt, renewal, successful access/download,
  expiration, revocation, void and replacement.
- Give authorized custodians one place to review and revoke active external access.

### Expired and revoked behavior

- Reveal no artist, song, recipient, deal, document or storage details.
- Show a neutral "This link is no longer available" state.
- Refuse new media/storage credentials immediately.
- Allow already minted credentials to die within their short technical lifetime.
- Create a new grant/token for renewal rather than silently reviving an old credential.
- Preserve the underlying asset, executed document and historical access record.

Expiration and revocation prevent future access. They cannot erase a file already
downloaded, screen-recorded or otherwise captured during valid access.

### Definition of success

An artist can see every active external access grant, understand who can access what
and until when, and revoke it centrally. The Crate remains continuously browsable to
authorized audiences without exposing stable media URLs or clean masters. Expired
links leak no context, and signing invitations can expire or close while executed legal
records remain safely available in Contract Locker.

## D-06 - Accountable download history (LOCKED)

The owner approved accountable download history as a permanent Sound Vault custody
doctrine on 2026-09-01.

### Governing rule

Every protected or clean-file delivery creates an understandable, tamper-resistant
activity record showing what Funūn authorized and what its systems transmitted.
Download history remains distinct from ordinary preview listening.

### Required download record

- Download-session/event ID
- Recipient and verified account where the access class requires identity
- Song, recording version, asset type and exact file hash
- Clean master, protected/watermarked copy, stems, sidecar or document classification
- Parent access grant and authorization decision
- Purpose, deal, pitch, agreement or workflow context
- Rights, ownership/control and metadata snapshots relied upon
- Request, authorization, transmission-start and terminal timestamps
- Expected and transmitted byte counts where technically observable
- Download limit, counted-use decision and remaining uses
- Expiration and revocation state at authorization time
- Forensic watermark/delivery ID where applicable
- Restricted security context necessary for investigation and support

### Technically honest states

1. **Requested** - a recipient asked for the file.
2. **Authorized** - Funūn approved that request under a current grant.
3. **Started** - the system began transmission.
4. **Substantially transmitted** - the controlled delivery surface transmitted the
   expected file or met the documented completion threshold.
5. **Interrupted** - the observed transmission ended before that threshold.
6. **Refused** - permission, identity, expiration, revocation, limit, integrity or
   security checks failed.
7. **Revoked before access** - authority ended before transmission began.

The interface may use plain language such as "download completed" when the technical
threshold is met, but the evidence record must preserve the precise observed state.
Funūn cannot prove that a recipient permanently saved, opened, listened to or used the
file merely because the server transmitted it.

### Sessions, ranges and retries

Browsers and media clients may request one file through multiple byte-range requests.
Related ranges must be grouped into one download session rather than shown as multiple
human downloads.

The counted-use policy must distinguish:

- A technical retry
- A resumed/interrupted transfer
- A new deliberate download
- A different device or recipient
- Suspicious repeated access

A failed or resumed technical transfer should not automatically consume a fresh
download allowance. Session grouping and the completion threshold must be testable and
documented for every supported delivery path.

### Artist-facing history

Authorized artists/custodians receive plain, contextual entries, for example:

> Maya Chen downloaded the recipient-watermarked WAV of "Fractured Heart - Final
> Master" for the Northline campaign on September 4 at 2:18 PM.

The artist view includes the recipient, asset/version, access type, purpose, status,
time and related deal/delivery record. Raw IP addresses, detailed device signals and
restricted security notes are not exposed merely because a user can see delivery
history.

### Privacy and retention

Collect only what is necessary for security, delivery evidence, accounting, licensing
and support. Funūn must avoid invasive device fingerprinting, unnecessary precise
location, productivity-style monitoring and indefinite raw-IP retention.

- Disclose meaningful download/activity tracking to recipients.
- Keep raw technical/security data restricted to authorized operational roles.
- Prefer coarse user-facing security context.
- Apply a documented retention and deletion/anonymization schedule.
- Preserve longer-term evidence only where a delivery, agreement, dispute, security
  incident or legal obligation justifies it.
- Obtain privacy and counsel approval before implementation.

### Review-only alerts

Funūn may flag high-volume downloads, materially inconsistent access context, repeated
post-revocation attempts, apparent limit manipulation, hash mismatch or a recipient-
specific copy involved in an investigation.

Alerts initiate human review. They do not automatically accuse a recipient, terminate
an account, assert infringement or trigger enforcement.

### Evidence boundaries

Download history can establish what Funūn authorized, which file its controlled system
transmitted, which grant/account exercised access and when the observed event occurred.
It cannot by itself establish who physically controlled a device, where the file was
stored, who later copied it, whether it was used, or whether a later public use was
unlicensed.

### Definition of success

An authorized artist can reconstruct every protected or clean-file delivery without
unnecessary recipient-data exposure. Funūn accurately distinguishes a substantially
transmitted file, interrupted transfer, technical retry, refused attempt and revoked
request, and can bind the event to the exact asset, authority and delivery context.

## D-07 - Immutable delivery receipts (LOCKED)

The owner approved delivery receipts as a permanent Sound Vault custody doctrine on
2026-09-01.

### Governing rule

Every formal delivery creates an immutable receipt identifying exactly what Funūn
authorized and transmitted, to whom, for what purpose, and under which agreement and
rights snapshot.

Download history supplies technical events. The receipt packages the authoritative
transaction context and observed outcome into a durable human- and machine-readable
record.

### Required receipt content

- Unique delivery, manifest and receipt IDs
- Sender/authorizing actor and named recipient
- Song, recording version, asset classification and exact delivered-file hashes
- Source/derived relationships for every delivered asset
- Clean master, protected/watermarked copy, stems, metadata, artwork or document labels
- Versioned Song Passport metadata snapshot
- Ownership/control, rights and authorization snapshots
- Related deal, licence, agreement, release or other governing record
- Permitted purpose plus territory, media, term and restrictions where applicable
- Delivery method, parent access grant, issue and expiration times
- Transmission state and timestamps from D-06
- Recipient-specific forensic watermark/delivery ID where applicable
- Express recipient acknowledgment where actually received
- Transport/provider/DDEX acknowledgment where actually received
- Failure, rejection, revocation, correction and supersession relationships

### Manifest and final receipt

- **Delivery manifest** - immutable pre-dispatch record of exactly what Funūn intends to
  deliver after required gates pass.
- **Final delivery receipt** - immutable outcome record of what Funūn actually made
  available or transmitted and which acknowledgments, failures or corrections followed.

The final receipt references the manifest. Any difference between preparation and
actual delivery is stated explicitly rather than silently rewriting the manifest.

### Receipt lifecycle

1. **Prepared** - the manifest binds files, metadata, permissions and authorization.
2. **Released for delivery** - required legal, rights, approval and payment/credit gates pass.
3. **Access granted/dispatched** - controlled access or transport begins.
4. **Transmitted** - Funūn observes the D-06 transmission threshold.
5. **Acknowledged** - the recipient or delivery partner expressly confirms receipt.
6. **Failed/rejected** - delivery does not complete or a recipient/partner rejects it.
7. **Revoked** - access ends before completion where the governing authority permits.
8. **Superseded** - a corrected delivery and successor receipt replace the package for
   future reliance while preserving the original history.

"Transmitted" and "acknowledged" are never interchangeable. Funūn must not say the
recipient accepted files, rights or terms merely because its system transmitted bytes.

### Corrections and supersession

Issued manifests and receipts are not edited. When a wrong file or metadata snapshot
is delivered:

1. Preserve and mark the original receipt as affected/superseded.
2. Create a corrected package and new manifest.
3. Issue a successor receipt linked in both directions.
4. Record notification and any request that the recipient disregard/delete the earlier file.
5. Preserve whether the recipient acknowledged the correction.

Funūn cannot guarantee deletion from a recipient's device and must not imply that
supersession erases the original delivery.

### Storage and presentation

One canonical receipt record is referenced from:

- The authorized artist's Contract Locker
- The related deal/licence/release record
- The recipient's controlled delivery page or package
- The recording version's provenance history
- Song Passport export/delivery history

These surfaces must not maintain independently editable receipt copies.

Each issued receipt includes a human-readable page/PDF, machine-readable JSON, receipt
hash, creation time and schema/version identifier. A server signature or equivalent
tamper-verification mechanism should make alteration detectable.

### Evidence and external-acknowledgment boundaries

A Funūn receipt records what Funūn prepared, authorized and observed. It is not
notarization, government registration, DDEX certification or conclusive legal proof.

For outside distributor/DDEX delivery, preserve separately:

- Funūn dispatch receipt
- Transport/provider response
- Actual DDEX acknowledgment message where supported
- Error, rejection, correction, update or takedown messages
- Final partner-accepted state only when explicitly confirmed

Only a real recipient/provider acknowledgment supports an accepted state. Funūn must
never infer external acceptance from dispatch alone.

### Example

> On September 4, Funūn granted Maya Chen controlled access to "Fractured Heart -
> Final Master," SHA-256 ending `...92af`, the approved instrumental and Song Passport
> snapshot 14 under Licence FRH-NORTH-004. The files were substantially transmitted at
> 2:18 PM. Maya acknowledged receipt at 2:24 PM.

If no acknowledgment exists, the last sentence instead states: "Recipient
acknowledgment has not been received."

### Definition of success

An artist, recipient or authorized operator can open one durable record and identify
the exact files, metadata, rights, agreement, purpose, authorization, delivery outcome
and genuine acknowledgments associated with a transaction without relying on scattered
emails or editable notes.

## D-08 - Pre-delivery revocation (LOCKED)

The owner approved pre-delivery revocation as a permanent Sound Vault custody doctrine
on 2026-09-01.

### Governing rule

Authorized users may stop future access until a delivery reaches its documented point
of no return, subject to executed agreements and other legal obligations.

Revocation is distinct from deleting a master, withdrawing a Crate listing, cancelling
an agreement, issuing a takedown or retrieving a downloaded file.

### Delivery commit point

Every delivery method must define and display its commit point:

- **Prepared, not released** - cancel the proposed delivery.
- **Released, access unopened** - revoke the parent access grant.
- **Access opened, transfer not started** - refuse the download/transmission request.
- **Transfer started** - stop remaining transmission where the controlled method can do so.
- **Substantially transmitted** - revoke future access without claiming file recovery.
- **Recipient/provider acknowledged** - close future access where permitted while
  preserving the completed delivery and acknowledgment as historical fact.

After the commit point, the product says "future access revoked," not "delivery
revoked." The exact commit threshold is bound to the delivery method and D-06 state
machine rather than inferred from a button click or URL issuance.

### Revocation authority

Revocation may be initiated only by an actor with action-specific authority:

- Artist/master controller within documented authority
- Rights participant whose approval is required for that delivery
- Properly delegated manager or representative
- Authorized Funūn operator for a documented security, integrity, legal or operational reason
- Narrow automated safety control for expiration, integrity failure or another
  pre-approved deterministic condition

Creative collaborator or project-manager status alone does not grant clean-master
revocation authority. No actor may revoke beyond the authority they hold.

### Approved reasons and evidence

Reason codes include wrong recipient, wrong version, integrity/hash failure, rights or
authority dispute, approval withdrawal before commitment, agreement void/replacement,
uncleared payment, suspected fraud/account compromise, valid legal restriction and
artist preview withdrawal before binding obligation.

Every event records requester, authority, reason, explanation where required, delivery
state, commit-point result, affected credentials, notifications and outcome.

### Contract and payment boundary

- Before execution/payment, an authorized artist can normally revoke a proposed clean-
  master delivery.
- After signing but before cleared payment, delivery remains blocked under the signed-
  and-paid rule unless documented approved credit terms apply.
- After execution and cleared payment/approved credit, the agreement determines whether
  Funūn is obligated to deliver and whether revocation is permitted.
- After completed delivery, disputes move through the deal, contract, refund,
  enforcement or legal workflow; the product does not simulate file recall.

A revocation request may therefore be denied or limited when the requester lacks
authority or a binding obligation controls. The reason and deciding authority must be
visible to the appropriate parties and preserved.

### Technical controls

- Recheck current grant, authority, revocation, asset/version and obligation state
  immediately before every child media/storage credential is issued.
- Make authorization and credential issuance atomic or equivalently race-safe.
- Keep child credentials minute-scale and subordinate to the parent grant.
- Prefer a controlled delivery endpoint for clean masters when mid-transfer
  interruption and accurate observability are required.
- Invalidate unused one-time credentials where supported.
- Refuse new byte-range requests after revocation and record whether an active session
  was interrupted or substantially transmitted.
- Preserve manifest, download history, receipt and revocation evidence.
- Notify affected authorized parties without disclosing unnecessary dispute details.
- Never erase audit evidence to make a delivery appear not to have happened.

A previously issued direct signed URL may remain usable until its short technical
expiry. This limitation must be documented; it is why clean-master child credentials
last minutes even if the parent delivery window lasts 24 hours.

### Revocation states

1. **Active**
2. **Revocation requested**
3. **Revoked before access**
4. **Revoked during transmission**
5. **Future access revoked after transmission**
6. **Revocation denied or limited by authority/obligation**
7. **Superseded by corrected delivery**

### Correction example

If the wrong mix is prepared and the artist revokes before access, the parent grant
closes, the recipient sees a neutral unavailable state, and the original manifest plus
revocation remain preserved. The correct mix receives a new manifest, grant and receipt.

If the wrong mix was already substantially transmitted, Funūn records future access as
revoked, asks the recipient to disregard/delete it, issues the correction and preserves
both histories. It does not claim the earlier copy was remotely destroyed.

### Definition of success

An authorized person can stop an incorrect, unauthorized, compromised or no-longer-
valid delivery before completion. The system accurately records whether access was
prevented, interrupted or had already occurred, and no revocation control silently
overrides an executed legal obligation or erases custody evidence.

## D-09 - Clean-master isolation and distributor delivery (LOCKED)

The owner approved permanent preview/clean-master separation plus the authorized
distributor-delivery lane as a Sound Vault custody doctrine on 2026-09-01.

### Governing rule

No listening, browsing, sharing, pitching or evaluation surface may access the
original clean-master path. Clean masters move only through a dedicated, explicitly
authorized owner-retrieval or formal-delivery workflow.

The boundary is structural in application code, database references, storage/service
permissions and tests; it is not a staff convention or optional UI toggle.

### Asset classes

1. **Original master** - immutable private source used to create derivatives and
   approved deliveries; never an ordinary playback fallback.
2. **Protected preview/evaluation copy** - separately stored derivative for playback,
   pitching, test-sync or other evaluation, with its own hash and provenance.
3. **Approved delivery copy** - clean or recipient-protected transaction asset bound to
   a named recipient, authority, purpose, agreement/profile, snapshots, manifest and receipt.

Byte-identical delivery copies may share the original's content hash while retaining
their own delivery record. Any encoding, tagging or byte-level transformation creates a
new hash and derivation event.

### Surface policy

- Writer's Room and normal Sound Vault browser playback use protected high-quality derivatives.
- The Crate, Selects, pitches, embedded players and public pages use protected previews only.
- Test-sync downloads use recipient-watermarked evaluation copies.
- AI, waveform and internal processing receive narrowly scoped service access and never
  return a reusable master URL to a user-facing surface.
- Formal sync/licensing delivery uses the approved-delivery service and its applicable gate.
- Distributor delivery uses The Release Report's approved release-delivery service.
- Owner original retrieval is an explicit, strongly authenticated custody action, not
  an ordinary player/download fallback.

### Structural boundaries

Avoid any public/shared general accessor that can sign an arbitrary storage path.
Separate capabilities accept constrained record IDs and resolve only their asset class,
for example:

- Protected preview access by preview-asset ID
- Evaluation download by delivery/evaluation ID
- Approved clean delivery by delivery ID
- Owned-original retrieval by original-asset ID

Public and bearer-token services must be unable to read the original-master namespace.
Preview records cannot point to original assets. The approved-delivery service cannot
release an original/delivery copy without a valid, current manifest and gate decision.

### Fail-closed rule

If preview creation or watermarking is unavailable, show "Preview preparing" or
"Preview unavailable," retry safely and alert operations as appropriate. Never stream
the clean master as fallback.

If a protected evaluation render is unavailable, prepare it or refuse the download.
Never substitute a clean master for convenience.

### Sync/licensed-use delivery profile

The default sync rule remains: **Signed and paid before clean delivery, unless an
authorized operator records approved credit terms.** The exact version, rights,
approvals, agreement, payment/credit, recipient, integrity and manifest gates must pass.

### Distributor/release delivery profile

Distribution is an approved formal-delivery workflow and may receive a clean,
high-quality WAV. The Release Report—not a preview surface—authorizes it after:

- Exact release master selection and integrity/technical validation
- Required master-control, contributor and rights readiness
- Approved Song Passport metadata
- Release identifiers, date, credits, copyright lines, artwork and territories as required
- Explicit artist/release authority approval
- Authenticated distributor account/relationship and any required distribution agreement
- Frozen manifest and no blocking dispute or integrity failure

Payment is a distributor gate only when the selected distributor/delivery arrangement
requires it. The sync signed-and-paid rule is not a universal distributor-payment rule.

The delivery asset is a controlled copy of the immutable original. It may be byte-
identical or transformed only to satisfy the distributor's documented technical rules.
Every result retains its own delivery/provenance record.

### Direct versus manual distributor delivery

With a validated direct connection, preserve dispatch, transport, acknowledgment,
acceptance/rejection, correction, update and takedown evidence from the named partner.

Without a direct integration, Funūn may securely prepare/export a release-ready package
for the artist to upload manually. Funūn may say the package was prepared and exported;
it may not say the distributor received or accepted it without imported or direct
confirmation.

Rejections and corrections create new versions/manifests/receipts linked to the prior
attempt. Nothing is silently overwritten.

### Complete surface audit

Planning must inspect players, export packs, email attachments, admin/support tools,
AI-processing routes, metadata/audio exports, partner adapters, debugging routes,
migrations/backfills, storage-console procedures and every "download original" action.
An overlooked utility is part of the security boundary.

### Security verification

- Public/bearer routes cannot resolve original-master storage.
- Preview routes fail closed when derivatives are missing.
- Evaluation downloads return only their approved protected asset class.
- Only dedicated delivery/retrieval services can access originals/delivery copies.
- Clean delivery fails unless the selected delivery profile's gates pass.
- Asset-ID/path substitution and cross-account requests cannot change asset class.
- Revoked/expired grants cannot mint new credentials.
- Logs, receipts and errors do not leak private master paths.

### Current-state honesty

Phase 31 structurally protects the Selects player, which is a strong foundation. It
does not prove that every Sound Vault, export, admin, AI or partner route complies.
Funūn must complete the cross-surface audit and remediation before claiming full
platform-wide clean-master isolation or direct distributor delivery.

### Definition of success

A clean master cannot be reached accidentally through preview, missing-derivative
fallback or public-route manipulation. It leaves custody only through explicit owner
retrieval or an approved delivery profile. A distributor receives the correct clean
release package through The Release Report, and the record truthfully distinguishes
package export, dispatch, acknowledgment, rejection and acceptance.

## D-10 - Immutable source and controlled delivery (LOCKED)

The owner approved immutable originals and controlled delivery as the tenth permanent
Sound Vault custody doctrine on 2026-09-01.

### Governing rule

Funūn never edits or overwrites an uploaded original. Every preview, conversion,
metadata-tagged file, watermarked copy, correction and external delivery is traceable
to that source through a separate version, derivative or delivery record.

"Immutable" means unchanged while retained. It does not mean Funūn owns the file,
retains it forever or refuses an authorized deletion request.

### Distinct identities

- **Uploaded original** - exact bytes the user placed into Sound Vault.
- **Designated master** - recording version currently selected as the authoritative master.
- **Use-approved master** - designated master that passed the specific rights, metadata,
  technical and approval profile for a release, sync deal or other purpose.
- **Delivery asset** - exact file transmitted under a frozen manifest to a recipient.

"Final master" is a version designation. Approval is always use-specific and must name
the delivery profile or transaction for which the version is cleared.

### Original lifecycle

- Store exact uploaded bytes privately and calculate/verify the authoritative hash.
- Assign an immutable asset ID, uploader, completion time and version relationship.
- Never modify the original to normalize, convert, trim, watermark or add metadata.
- Treat replacement audio as a new asset/version.
- Preserve prior designated masters when a newer version is selected.
- Restore from backup only when the restored bytes reproduce the expected hash.
- Treat any unexpected hash change as an integrity incident.

### Controlled delivery assets

Human-facing external delivery normally creates a separately identified asset in a
delivery namespace. It may be byte-identical, converted, metadata-tagged, recipient-
watermarked or packaged with related files.

A byte-identical copy may share the source content hash while retaining a distinct
delivery identity, recipient, purpose, grant, manifest and receipt. Any byte change
creates a new hash and derivation event.

### Controlled direct machine transmission

A validated machine-to-machine distributor workflow may securely read and transmit the
verified source bytes without first persisting a duplicate delivery object when:

- The delivery service is authorized for that exact frozen transaction.
- The original storage path is never exposed to the recipient.
- Integrity is verified immediately before transmission.
- The manifest names the source asset and expected transmitted hash.
- The transmitted hash and transport outcome are recorded.
- Actual partner acknowledgments are preserved.
- The recipient receives no continuing Sound Vault storage access.

This is controlled transmission from the source, not a shared link to the original.

### Approved delivery policy

- Human recipient: separate controlled delivery asset.
- Recipient-attributed delivery: separate forensic copy.
- Manual distributor export: separate release package.
- Validated machine distributor delivery: controlled direct source transmission may be used.
- Owner retrieval: strongly authenticated custody action may stream the verified original.

No mode reveals the private storage address.

### Metadata revisions

Metadata edits never rewrite original audio. A Song Passport correction creates a new
metadata revision; future tagged copies/sidecars bind to that approved revision.
Historical manifests and receipts continue to reference the exact snapshot previously
used.

### Deletion, retention and tombstones

An authorized owner can request deletion subject to active agreements/delivery
obligations, legal holds, fraud/security investigations, required accounting/transaction
records, backup-aging timelines and other counsel-approved duties.

When deletion is permitted:

- New access stops and pending credentials are revoked.
- The primary storage object is deleted under the approved procedure.
- Backups age out on a documented schedule.
- A minimal tombstone may preserve asset ID, hash, dates, deletion authority and
  necessary transaction references without retaining the audio.
- Executed receipts/transaction history may remain only where legally and contractually appropriate.

The product must disclose retention and backup-aging behavior and must not retain audio
merely to describe its historical record as immutable.

### Corruption and recovery

Quarantine an asset that fails integrity verification. Restore only an identical,
hash-matching backup and preserve the incident record. If the original bytes cannot be
restored, do not silently replace them; a newly supplied file becomes a new asset and
version with a new hash.

### Definition of success

An artist can always distinguish the uploaded original, current designated master,
version approved for a particular use and exact delivered asset. No process silently
changes history, authorized deletion remains possible under a transparent retention
policy, and no external recipient receives reusable access to the private original-
master location.

## Existing foundation to preserve

- Sound Vault already uses private Supabase Storage and signed-URL patterns.
- Phase 31 established a structural rule that Selects players serve only derived
  preview paths and never the clean-master path.
- The current audible preview tag is strongest for WAV input; compressed-source
  watermarking remains a known follow-up. This limitation does not relax the permanent
  prohibition against serving clean masters through preview routes.

Implementation planning must verify the entire upload, storage, backup, access,
administrative and delivery surface rather than assuming the existing foundation fully
satisfies D-01.

## Doctrine completion and planning handoff

All ten custody decisions are owner-approved. GSD planning must treat D-01 through D-10
as one security and evidence system rather than ten unrelated features.

The team-facing standards reference is seeded into **The Playbook / Company-wide /
Standards & Doctrine** by migration 141 as one overview plus D-01 through D-10 SOP
entries. The migration must be applied to production before the entry is visible there.

Start with a platform-wide audit and shared asset/provenance model, then sequence access
control, derivatives, delivery, history/receipts, revocation, retention/recovery and
partner integrations. Do not start with Content ID, DDEX transport or receipt PDFs
before the custody and authorization foundations exist.

## Related records

- `.planning/REQUIREMENTS.md` - R12, never a clean master through Selects
- `.planning/phases/31-ae-client-workspace-selects-my-client-partners-client-partne/31-VERIFICATION.md`
- `.planning/todos/pending/2026-08-16-research-watermarking-alternatives-and-competitor-content-pr.md`
- `.planning/deliberations/sync-library-operating-model.md`
- `.planning/deliberations/ddex-production-readiness.md`
- `.planning/todos/pending/2026-09-01-provenance-delivery-attribution-rights-enforcement.md`
- `.planning/todos/pending/2026-09-01-expiring-access-link-lifecycle.md`
- `.planning/todos/pending/2026-09-01-accountable-download-history.md`
- `.planning/todos/pending/2026-09-01-immutable-delivery-receipts.md`
- `.planning/todos/pending/2026-09-01-pre-delivery-revocation.md`
- `.planning/todos/pending/2026-09-01-clean-master-isolation-distributor-delivery.md`
- `.planning/todos/pending/2026-09-01-immutable-source-controlled-delivery.md`
