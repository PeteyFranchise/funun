-- ============================================================
-- Funūn — The Playbook: Sound Vault Master Custody Doctrine
-- Migration 141: activate Company-wide + publish D-01 through D-10
--
-- HUMAN-GATED: review and apply with `supabase db push`. This migration
-- publishes owner-approved doctrine; it does not claim the described
-- implementation program is already complete in production.
-- ============================================================

UPDATE public.playbook_rooms
SET coming_soon = false
WHERE key = 'company-wide';

INSERT INTO public.playbook_sub_groups (room_id, key, label, sort_order)
SELECT id, 'standards-and-doctrine', 'Standards & Doctrine', 10
FROM public.playbook_rooms
WHERE key = 'company-wide'
ON CONFLICT (room_id, key) DO UPDATE
SET label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order;

WITH doctrine_entries(title, items) AS (
  VALUES
    (
      'Sound Vault Master Custody Doctrine — Overview',
      ARRAY[
        'Status: Permanent company doctrine. D-01 through D-10 were approved by the owner on September 1, 2026.',
        'Purpose: protect artists, masters, rights evidence and authorized deliveries from first upload through release, sync, distribution, correction, retention and deletion.',
        'Private custody: masters are private assets. Original storage paths and permanent public master URLs are never exposed.',
        'Non-destructive history: every recording version, metadata revision, derivative, permission decision and delivery remains traceable.',
        'Least authority: creative access, custody, legal authority, signing, metadata approval and clean-master delivery are separate permissions.',
        'Preview isolation: listening, browsing, pitching and evaluation surfaces use protected derivatives and fail closed if those derivatives are unavailable.',
        'Formal delivery: clean masters leave custody only through explicit owner retrieval or an approved delivery profile with a frozen manifest and receipt.',
        'Evidence honesty: hashes, timestamps, download history and receipts record what Funūn observed; they do not by themselves prove ownership, human conduct or external acceptance.',
        'External partners: forensic watermarking, Content ID, acoustic matching and direct distributor/DDEX acceptance may be described as live only after real integration and validation.',
        'Implementation status: doctrine is locked; full platform-wide implementation requires the approved Sound Vault Custody Implementation Program.'
      ]::TEXT[]
    ),
    (
      'D-01 — Private Master Storage',
      ARRAY[
        'Store masters in private containers. The browser never receives a permanent public master URL.',
        'Check authorization before generating short-lived access. A signed URL is a delivery mechanism, not the authorization model.',
        'Separate preview/listening permission from clean-master download permission.',
        'Writer’s Room membership or creative collaboration never automatically grants clean-master access.',
        'Protect backups and derivatives according to their sensitivity and audit privileged access.',
        'Removing permission stops future access but cannot retrieve a file already downloaded by an authorized recipient.',
        'Previews never expose the clean master by stream or download.',
        'Permission bundles: record custodian, creative collaborator, approved recipient and authorized administrator; every sensitive action is still checked individually.',
        'Success standard: unauthorized users cannot stream or download the master, every authorized access is checked and recorded, and previewing never reveals the original.'
      ]::TEXT[]
    ),
    (
      'D-02 — Version and Ownership Records',
      ARRAY[
        'Every voice memo, demo, rough mix, instrumental, edit, final mix, master and alternate master receives a distinct version record.',
        'Replacing audio creates a new version; it never overwrites the earlier file or history.',
        'Record version ID/name, uploader/time, contributors, source/hash, parent version, workflow status, master designation, Song Passport snapshot and control evidence.',
        'Composition copyright and sound-recording/master ownership remain separate.',
        'Funūn records declarations, acknowledgments, documents and provenance; it does not adjudicate title or ownership disputes.',
        'Control states: unconfirmed, claimed, contributor-confirmed, document-supported, disputed and cleared for a specifically named use.',
        'Final master is a workflow designation, not proof of ownership.',
        'Executed, registered and previously delivered snapshots remain immutable; later corrections create successor records.',
        'A disputed version cannot be represented as delivery-ready.',
        'Every release or deal binds to the exact recording version and rights/control snapshot used.'
      ]::TEXT[]
    ),
    (
      'D-03 — File Integrity, Provenance and Rights Enforcement',
      ARRAY[
        'Generate the authoritative SHA-256 hash server-side after upload completes; keep the model open to additional algorithms.',
        'Every original and derivative receives its own asset identity, hash and parent/operation provenance.',
        'Record filename, format, size, technical details, uploader, time, work/version, storage locator, validation result, transformation and metadata snapshot.',
        'A matching hash proves byte identity; it does not prove authorship, ownership, licence authority or copyright registration.',
        'Verify hashes before high-value delivery and flag mismatches, missing objects and broken derivation chains.',
        'A delivery log shows which recipient received which authorized asset; it does not attribute a later leak when recipients received the same file.',
        'Recipient attribution requires a distinct forensic copy with an opaque delivery ID and a validated watermarking partner.',
        'Online-use detection requires separate acoustic matching or Content ID capability plus eligible rights and accurate reference metadata.',
        'Every match is checked against licences and allowlists. Valid licensees are protected and suspected misuse receives human review.',
        'No automatic accusation, claim, block or takedown occurs without documented rights-holder authority and review.',
        'Funūn owns custody, delivery, licence, authorization, evidence and review records; specialist partners initially provide watermark recovery, matching and platform claim/revenue rails.',
        'Do not advertise automatic online protection, perfect leak tracing or Content ID until the real partner workflow passes production validation.'
      ]::TEXT[]
    ),
    (
      'D-04 — Least-Authority Access',
      ARRAY[
        'Deny by default. Grant access per action, asset, purpose and duration.',
        'A Sound Vault record custodian organizes the record but is not automatically the legal owner or controller.',
        'Separate Writer’s Room entry, preview streaming, creative edits, uploads, draft metadata, ownership proposals, approvals, private identity, contracts, signing, sharing, protected downloads, clean delivery, release/sync authority and revocation.',
        'Uploading does not prove ownership; contributor status does not grant downloads; project management does not grant signing or licensing authority.',
        'A split-sheet signature does not authorize clean-master delivery, and creative approval does not approve rights, metadata or release.',
        'Managers and representatives receive only expressly delegated, scoped authority.',
        'No person can grant greater authority than they hold. Material changes may require fresh authorization.',
        'Enforce sensitive decisions server-side and at the database/RLS boundary; hidden buttons are not security controls.',
        'Staff access is role-limited, purpose-specific and audited. Exceptional access uses a documented break-glass workflow.',
        'Revocation stops future access but cannot retrieve a completed download.'
      ]::TEXT[]
    ),
    (
      'D-05 — Expiring Access and Link Lifecycle',
      ARRAY[
        'Every external Sound Vault link expires, can be revoked and grants the minimum required access.',
        'Separate the parent access grant from minute-scale child media/storage credentials. A child credential never outlives its parent.',
        'Approved defaults: protected preview and shortlist seven days; watermarked download and clean delivery 24 hours; signing invitation seven days or until the signing event closes it.',
        'Bearer links are limited to expressly approved low-risk previews. Clean masters, sensitive documents and attributed downloads require named recipients.',
        'Team sharing creates separate recipient records instead of one informal shared credential.',
        'The Crate stays continuously browsable while a song remains admitted and artist-authorized, but each stream uses renewable short-lived protected-preview access.',
        'Withdrawing a Crate song blocks new discovery/streams while preserving existing pitches, deals and history; executed obligations still govern.',
        'Contract Locker rule: the invitation expires; the legal record does not. Executed documents and certificates remain available through authenticated access.',
        'Expired/revoked links reveal no artist, song, recipient, deal, document or storage context.',
        'Renewal creates a new auditable grant/token. Expiration cannot erase content already downloaded or captured.'
      ]::TEXT[]
    ),
    (
      'D-06 — Accountable Download History',
      ARRAY[
        'Every protected or clean-file delivery records what Funūn authorized and what its controlled systems transmitted.',
        'Bind each session to recipient, song/version, exact asset hash, asset class, access grant, purpose/deal, authority snapshots, limits, expiration/revocation and watermark ID where applicable.',
        'Use precise states: requested, authorized, started, substantially transmitted, interrupted, refused and revoked before access.',
        'Server transmission does not prove that a human saved, opened, listened to or used the file.',
        'Group byte ranges, resumes and technical retries into one logical session. A failed retry does not automatically consume another allowance.',
        'Artist-facing history shows useful recipient, asset, purpose, time and status without exposing raw IP addresses or invasive device details.',
        'Collect only security, delivery, accounting, licensing and support data that is necessary; disclose tracking and apply approved retention.',
        'Security alerts flag unusual activity for human review; they do not automatically accuse, suspend or enforce.',
        'Download history cannot by itself prove who controlled a device, where a file was stored, who copied it later or whether a later use was unlicensed.'
      ]::TEXT[]
    ),
    (
      'D-07 — Immutable Delivery Receipts',
      ARRAY[
        'Every formal delivery creates an immutable receipt identifying what Funūn authorized and transmitted, to whom, for what purpose, and under which agreement and rights snapshot.',
        'Create an immutable pre-dispatch delivery manifest and a separate immutable final outcome receipt.',
        'Bind receipt IDs, sender/recipient, files/hashes, source relationships, asset classes, Song Passport and rights snapshots, agreement, restrictions, access grant, transmission, watermark and acknowledgments.',
        'Receipt states: prepared, released, access granted/dispatched, transmitted, acknowledged, failed/rejected, revoked and superseded.',
        'Transmitted and acknowledged are never interchangeable. External acceptance exists only when the recipient or partner actually confirms it.',
        'Corrections preserve the original and create a linked successor manifest/receipt; supersession never erases prior delivery.',
        'One canonical receipt is referenced from Contract Locker, the deal/release, recipient delivery, provenance and Song Passport history.',
        'Provide matching human-readable and machine-readable representations with a receipt hash and tamper-verification mechanism.',
        'A Funūn receipt is not notarization, registration, DDEX certification or conclusive legal proof.',
        'For direct distributor/DDEX delivery, preserve dispatch, raw acknowledgments, errors, rejection, correction, update, takedown and actual partner-accepted state separately.'
      ]::TEXT[]
    ),
    (
      'D-08 — Pre-Delivery Revocation',
      ARRAY[
        'Authorized actors may stop future access until the documented delivery commit point, subject to executed agreements and legal obligations.',
        'Define the commit point for every method: prepared, released, opened, transfer started, substantially transmitted and acknowledged.',
        'After the commit point, say future access revoked—not delivery revoked.',
        'Revocation authority is action-specific: authorized controller/rights participant/representative, scoped Funūn operator or narrow deterministic safety control.',
        'Record requester, authority, reason, explanation, current delivery state, affected credentials, notifications and result.',
        'Valid reasons include wrong recipient/version, integrity failure, rights dispute, approval withdrawal before commitment, agreement replacement, uncleared payment, compromise or legal restriction.',
        'Executed licence and payment/approved-credit obligations can limit or deny revocation; preserve the decision and authority.',
        'Recheck revocation immediately before every child credential and make authorization/issuance atomic or equivalently race-safe.',
        'Use minute-scale child credentials and controlled clean delivery where interruption matters; refuse new ranges after revocation where supported.',
        'Never erase manifests, history or receipts to make a delivery appear not to have occurred, and never claim remote destruction of a downloaded copy.'
      ]::TEXT[]
    ),
    (
      'D-09 — Clean-Master Isolation and Distributor Delivery',
      ARRAY[
        'No listening, browsing, sharing, pitching or evaluation surface can access the original clean-master path.',
        'Asset classes are original master, protected preview/evaluation copy and approved delivery asset.',
        'Writer’s Room, Sound Vault playback, The Crate, Selects, pitches, embeds and public pages use protected derivatives; test-sync uses a recipient-watermarked evaluation copy.',
        'AI/waveform processing receives narrow service access and cannot return reusable master URLs.',
        'Use separate preview, evaluation, owner-retrieval and clean-delivery capabilities that accept constrained IDs—not arbitrary storage paths.',
        'If a preview or protected render is unavailable, fail closed with preparing/unavailable status. Never fall back to the master.',
        'Sync default: signed and paid before clean delivery unless approved credit terms are recorded.',
        'Distributor delivery is separate: The Release Report verifies release master, rights, Song Passport, identifiers, artwork, territories, artist authority, distributor relationship and frozen manifest.',
        'Distributor payment is required only when that distributor arrangement requires it; the sync payment gate is not universal.',
        'Manual export means prepared/exported only. Distributor receipt or acceptance requires imported or direct confirmation.',
        'Phase 31 proves Selects isolation only. Audit every player, export, email, admin, AI, partner, debugging and storage procedure before claiming platform-wide isolation.'
      ]::TEXT[]
    ),
    (
      'D-10 — Immutable Source and Controlled Delivery',
      ARRAY[
        'Never edit or overwrite uploaded original bytes. Immutable means unchanged while retained—not retained forever.',
        'Distinguish uploaded original, designated master, use-approved master and exact delivery asset.',
        'Normalization, conversion, trimming, watermarking, tagging and replacement audio create derivatives or new versions.',
        'Human recipients normally receive separately identified controlled delivery assets; forensic attribution always uses a distinct recipient copy.',
        'A byte-identical copy may share the source hash while retaining a separate delivery identity, grant, manifest and receipt. Any changed byte creates a new hash.',
        'Validated machine-to-machine distributor delivery may transmit verified source bytes without duplicate storage, but never exposes the source path and records hash, outcome and acknowledgment.',
        'Owner original retrieval is explicit, strongly authenticated and audited.',
        'Song Passport corrections create new metadata revisions and future tagged copies/sidecars; historical receipts keep their original snapshots.',
        'Authorized deletion stops access and follows approved obligations, legal holds, retention, primary deletion and backup-aging rules; a minimal tombstone may remain without the audio.',
        'Corrupt objects are quarantined. Restore only identical hash-matching bytes; otherwise a newly supplied file becomes a new asset/version.',
        'Success means the artist can always distinguish the original, designated master, use-approved master and exact delivered asset without silent history changes or reusable external storage access.'
      ]::TEXT[]
    )
),
company_room AS (
  SELECT id
  FROM public.playbook_rooms
  WHERE key = 'company-wide'
),
standards_group AS (
  SELECT sg.id
  FROM public.playbook_sub_groups sg
  JOIN company_room room ON room.id = sg.room_id
  WHERE sg.key = 'standards-and-doctrine'
)
INSERT INTO public.playbook_entries (
  room_id,
  sub_group_id,
  entry_type,
  title,
  content,
  status
)
SELECT
  room.id,
  subgroup.id,
  'sop',
  entry.title,
  jsonb_build_object('items', to_jsonb(entry.items)),
  'published'
FROM doctrine_entries entry
CROSS JOIN company_room room
CROSS JOIN standards_group subgroup
WHERE NOT EXISTS (
  SELECT 1
  FROM public.playbook_entries existing
  WHERE existing.room_id = room.id
    AND existing.title = entry.title
);

NOTIFY pgrst, 'reload schema';
