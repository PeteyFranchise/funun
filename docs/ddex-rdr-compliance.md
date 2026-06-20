# DDEX RDR Compliance — neighbouring rights (recording side)

> Status: Analysis + build reference · Last updated: 2026-06-19
> Source: DDEX "Recording Data and Rights Standards (RDR)" overview, May 2024
> (https://new.ddex.net/ — RDR Knowledge Base)

## What RDR is (and isn't)
**RDR = Recording Data and Rights Standards.** It's the DDEX suite for the
**master / sound-recording side of neighbouring rights** — registering a
recording and its **performers and producers (record companies)** with
**Music Licensing Companies (MLCs / CMOs)** such as **SoundExchange (US),
PPL (UK), GVL, and the SCAPR network**, so neighbouring-rights royalties get
collected and paid.

It is **not**:
- DSP release delivery → that's **ERN** (Electronic Release Notification).
- The publishing/composition side (writers, PROs, The MLC) → that's the
  **MWL / CWR** lane, which we already model (`lib/metadata/cwr.ts`,
  `lib/metadata/registration.ts`).

RDR is the "**get the recording's performance royalties collected**" pipe —
directly aligned with Funūn's "money artists leave uncollected" thesis.

## The four parts
1. **Part 1 — Communication Protocol** — how RDR messages are exchanged.
2. **Part 2 — RDR-N (Notification)** — claim rights in a recording/music-video
   with an MLC; covers **both record companies (producers) and performers**.
3. **Part 3 — RDR-R (Revenue Reporting)** — an MLC reports revenue to a sister
   MLC or a record company.
4. **Part 4 — RDR-C (Rights Claim Conflict)** — flag + resolve conflicting claims.

## Message types
**RDR-N — record-company (producer) claims (XML):**
- `DeclarationOfSoundRecordingRightsClaimMessage` — declare claims/mandates
- `RevokeSoundRecordingRightsClaimMessage` — revoke
- `RequestSoundRecordingRightsClaimMessage` — request
- `RightsClaimStatusUpdateMessage` — confirm status

**RDR-N — performer mandates (XML):**
- `AssertionOfCollectionMandateMessage` — declare (no "request" form)
- `RevokeCollectionMandateMessage` — revoke
- `AssertionOfCollectionMandateStatusUpdateMessage` — confirm status

**RDR-R (TSV flat-file):** `RevenueDeclarationMessage`. Records: `RHEA` (header),
`RS01` (statement summary), `RS02` (allocated party summary), `RD01` (sound
recordings), `RD02` (music videos), `RD03` (other), `RFOO` (footer). Same TSV
convention as DDEX DSR/CDM: tab = 1st delimiter, pipe `|` = 2nd, escapable, UTF-8.

## The compliance bar — two conformance profiles
| Profile | DDEX definition | What it buys the artist |
|---|---|---|
| **Core** | "sufficient data for many MLCs to **register** a recording" | Gets the recording on file / claimable |
| **Recommended** | "sufficient to **allocate revenue** … and **pay out** within the next distribution" | Gets the artist **paid faster** |

**Target: meet Core, aim for Recommended.**

## How RDR is used in practice (our posture)
- **RDx (Repertoire Data Exchange)** — WIN + IFPI, operated by PPL; uses RDR-N.
  The **record-company / master-owner channel**: producers submit repertoire,
  MLCs subscribe, RDx does centralised conflict detection.
- **VRDB** — SCAPR's Virtual Recording DataBase; the **performer channel**.

Individual indie artists do **not** connect directly to RDx/VRDB — those are
for record companies, CMOs, and aggregators. **Funūn's realistic posture:
capture RDR-N-conformant data and route submission through a partner**
(SoundExchange/PPL/a distributor/aggregator), exactly like our CWR and ERN
approach. We are *RDR-ready*, not an RDx node.

## Field-level gap analysis
Indie artists are usually both the record company **and** the performer, so
RDR-N applies. Mapping RDR-N to what Funūn captures:

**Already captured** → ISRC (incl. self-assignment), recording title, main +
featuring artists, duration, P-line, copyright year, label / rights owner.

**Added in this pass** (`lib/metadata/schema.ts`, stored in `tracks.metadata`):
- `Performer[]` — name, `role` (featured / non_featured), `contribution`
  (instrument/vocal), `ipn` (International Performer Number), `isni`.
- `RecordingInfo` — `recordingDate`, `recordingCountry` (ISO-3166 α-2),
  `originalPurpose` (general / library / commissioned — RDR-N v1.5),
  `commerciallyAvailable` (RDR-N v1.5 CommercialAvailability).

**Still TODO before real submission:**
- Collection-mandate party + **territory** of the claim, `RightsStatementProfile`.
- A **DPID** (DDEX Party ID) for the submitting party.
- `HostSoundCarrierComposite` for compilations / private-copying levy.

## Readiness assessor
`lib/metadata/rdr.ts` → `assessRdrReadiness(tracks)` returns, per recording, a
`profile` of `none | core | recommended` plus `coreMissing[]` /
`recommendedMissing[]`. This drops into the readiness / Rights-Coach engine as a
**"neighbouring-rights" lane** alongside the existing CWR/PRO/MLC checks.

## Recommended roadmap
1. ✅ Data model — `Performer` + `RecordingInfo` in `tracks.metadata` (no migration).
2. ✅ Readiness assessor — `assessRdrReadiness` (Core vs Recommended).
3. ☐ UI — a "Performers & neighbouring rights" section in the Metadata Studio
   (mirrors the composer/lyrics editors).
4. ☐ Surface the RDR lane in Release Readiness + Rights Coach.
5. ☐ RDR-N XML export (or partner feed) — Core first, then Recommended.
6. ☐ Validate against the normative RDR-N **XSD**, not the overview deck.
7. ☐ Partner routing (SoundExchange/PPL/aggregator) — we don't build a direct
   RDx/VRDB connection.

## Honest caveats
- The source is an **overview slide deck, not the normative spec.** Mandatory-
  vs-optional-per-profile rules, allowed value sets, and the XSD live in the
  RDR-N standard + implementation guides on the DDEX Knowledge Base — needed
  before claiming real conformance.
- "Compliant" for Funūn = **RDR-ready data + partner-routed submission**, not
  operating as a CMO-grade RDx node.

## Related
- Publishing side: `lib/metadata/cwr.ts`, `lib/metadata/registration.ts`,
  `docs/cwr-plan.md`.
- Release delivery: ERN export in `lib/metadata/export.ts` (`buildDdexErn`).
- Partner strategy: `docs/publishing-admin-partners.md`.
