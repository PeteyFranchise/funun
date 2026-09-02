-- ============================================================
-- Funūn — The Playbook: Song Passport Doctrine v1.0
-- Migration 150: publish the owner-approved internal reference
--
-- HUMAN-GATED: review and apply with `supabase db push`. This migration
-- publishes approved doctrine and accurately labels the Passport product
-- itself as planned. It does not claim Phase 37.3, DDEX production exports
-- or partner-validated direct delivery are already live.
-- ============================================================

INSERT INTO public.playbook_sub_groups (room_id, key, label, sort_order)
SELECT id, 'standards-and-doctrine', 'Standards & Doctrine', 10
FROM public.playbook_rooms
WHERE key = 'company-wide'
ON CONFLICT (room_id, key) DO UPDATE
SET label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order;

WITH passport_entry(title, items) AS (
  VALUES (
    'Song Passport Doctrine v1.0 — Definitions, Role and Operating Rules',
    ARRAY[
      'Authority: Owner-approved Funūn product doctrine consolidated September 1, 2026. This v1.0 entry is the internal definition and decision reference for Phase 37.3.',
      'Definition: The Song Passport is the living, versioned record of a song''s credits, rights, provenance, recording versions, release facts and delivery history from first idea through later corrections and custody changes.',
      'Promise: Enter a fact once, preserve where it came from, confirm it at the right moment, and carry the approved truth forward without silently rewriting history.',
      'It is not: a contract, split sheet, copyright registration, proof of ownership, DDEX certificate, distributor account or substitute for legal counsel. It connects and cites authoritative records without replacing them.',
      'Capability status — shipped foundation: works and recording versions, Writer''s Room collaboration/history, collaborator profiles, split sheets, Contract Locker, Release Report metadata/readiness and delivery-safe MP3/sidecar evidence already exist.',
      'Capability status — planned Phase 37.3: the canonical Passport ledger/UI, field provenance and trust states, source conflicts, approvals, tasks, master graduation, portability and custody history are implementation-scoped but not yet live.',
      'Capability status — partner-dependent: production CWR/RIN/ERN validation is Phase 37.4; named distributor/DSP/society delivery and real acknowledgments are Phase 37.5.',
      'SP-01 — One Passport per work: one canonical Passport belongs to the underlying composition. Recording versions and releases attach to it rather than creating competing Passports.',
      'SP-02 — Product home: the Passport lives with the song inside Sound Vault. The Writer''s Room remains the default creative view; Passport, versions, rights and delivery history are local views of the same work.',
      'SP-03 — Four layers: contributor identity, composition, recording version and release facts remain structurally distinct. Release-only facts never flow backward into rough demos.',
      'SP-04 — Living record and immutable snapshots: current facts may evolve, while every approval, export, registration, release and delivery binds to an immutable snapshot. Corrections create successors.',
      'SP-05 — Provenance: every meaningful fact records source, source record, actor, timestamp, trust state, privacy class and revision relationship. Funūn records evidence but does not adjudicate ownership.',
      'SP-06 — Source authority: people confirm their identity; executed split sheets control covered shares; executed contracts control covered authority; version records control recording facts; approved Release Reports control release facts; receipts control what was actually sent.',
      'SP-07 — Trust states: inherited, draft, confirmed, locked, outdated and disputed are distinct. Only inherited values refresh automatically; confirmed, locked, delivered or disputed facts never change silently.',
      'SP-08 — Confirmation versus approval: confirmation affirms a fact within a person''s authority; approval accepts an immutable snapshot for a named use. Self-confirmation is never universal authority.',
      'SP-09 — Creative/legal separation: live collaboration covers lyrics, notes, presence and meaningful diary actions. Splits, legal identity, executed agreements, approved metadata, final identifiers and audio bytes require explicit workflows.',
      'SP-10 — Tasks and readiness: tasks assign responsibility and point to missing/outdated/disputed facts. Completing a task never changes readiness by itself; the underlying qualifying fact, evidence or approval does.',
      'SP-11 — Version integrity: every hum, demo, rough, instrumental, clean edit, final mix and master is a distinct version. Replacing audio creates a successor and never overwrites history.',
      'SP-12 — Final master: an authorized release controller selects an exact version and freezes the related Passport snapshot. A replacement creates a successor selection and reopens required review.',
      'SP-13 — Immutable source: uploaded original bytes are never edited in place. Tagging, conversion, trimming, normalization and watermarking create separate derivatives with their own identities and hashes.',
      'SP-14 — Privacy-safe metadata: public credits and assigned identifiers may enter approved delivery artifacts. Contact, payment, signatures, contracts, internal notes, private split negotiations and sensitive identity data stay out by default.',
      'SP-15 — File behavior: MP3 may receive a real generated ID3 delivery copy. WAV, FLAC, AIFF and other non-MP3 workflows use unchanged audio plus human/machine sidecars first, until container-specific behavior is validated.',
      'SP-16 — DDEX boundary: DDEX, CWR and RIN are structured messages/packages, not identities embedded in audio. Funūn must not claim DDEX certification; it may report a licence, DPID, implemented standard and real validation evidence.',
      'SP-17 — Distributor boundary: an exported package may still require portal entry or verification. Zero re-entry/direct delivery is claimed only after a named recipient accepts the profile, package, transport and corrections through UAT and production evidence.',
      'SP-18 — Delivery evidence: each formal delivery binds recipient, purpose, authority, agreement, version, asset hash, Passport snapshot, restrictions and outcome. Prepared, transmitted and accepted are never interchangeable.',
      'SP-19 — Scoped visibility: creative members, identity subjects, signatories, release controllers, recipients and staff see only purpose-required subsets. Clean-master access is always a separate capability.',
      'SP-20 — Master sales: record previous and new controller, effective scope/date, territory/term, governing instrument and affected versions. New control is prospective and never erases earlier ownership or receipts.',
      'SP-21 — Portability/custody: authorized controllers may export an approved snapshot, manifest, hashes, credits, rights references, lineage and allowed history. Transfer records authority and acknowledgment but does not itself prove legal title.',
      'SP-22 — Retention/deletion: treat current Passport data, audio, derivatives, executed documents, receipts, holds and backups separately. Approved deletion stops access and may leave only a policy-approved minimal tombstone.',
      'SP-23 — AI boundary: AI may suggest mappings, classifications, gaps and conflicts. It may not confirm identity, assign ownership, approve splits, sign contracts, designate legal authority or silently change approved metadata.',
      'SP-24 — Provider neutrality: Sound Vault, Song Passport, Split Sheets, Contract Locker and Release Report remain canonical. Partner adapters translate approved snapshots; they do not become the only source of truth.',
      'SP-25 — Claims follow evidence: always label capabilities shipped, planned or partner-dependent. Do not market roadmap or partner work as currently available.',
      'Authority rule: Writer''s Room membership grants creative access, not ownership, signature, licensing, metadata approval, release authority or clean-master access. No actor can grant more authority than they hold.',
      'Final mix outside the Writer''s Room: upload it later through Sound Vault or Release Report, link it to the same work, complete version-specific facts and explicitly designate it. Never fabricate creative history or overwrite an earlier version.',
      'Master sale example: store the transfer instrument in Contract Locker, create a new control period in the Passport, preserve the former controller and prior delivery history, and change access only for the authorized scope.',
      'Distributor example: freeze the approved master/Passport snapshot and generate the allowed package. Mark it prepared until transmission occurs and accepted only after real recipient acknowledgment.',
      'First shippable boundary: one work, two contributors, three recording versions, one graduation, one tagged MP3 and sidecars; no privacy leakage, source mutation, duplicate entry or silent rewrite of approved history.',
      'Governance: leadership owns doctrine. Engineering cites the relevant SP rule. Review after every Phase 37.3 slice and before any Phase 37.4/37.5 claim. Changes require a dated successor revision and Playbook update.'
    ]::TEXT[]
  )
),
company_room AS (
  SELECT id
  FROM public.playbook_rooms
  WHERE key = 'company-wide'
),
standards_group AS (
  SELECT subgroup.id
  FROM public.playbook_sub_groups subgroup
  JOIN company_room room ON room.id = subgroup.room_id
  WHERE subgroup.key = 'standards-and-doctrine'
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
FROM passport_entry entry
CROSS JOIN company_room room
CROSS JOIN standards_group subgroup
WHERE NOT EXISTS (
  SELECT 1
  FROM public.playbook_entries existing
  WHERE existing.room_id = room.id
    AND existing.title = entry.title
);

NOTIFY pgrst, 'reload schema';
