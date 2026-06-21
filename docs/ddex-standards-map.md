# DDEX Standards Map — which standards Funūn needs

> Status: Reference · Last updated: 2026-06-19
> Sources: DDEX Knowledge Base — "Which standard do I need?"
> (https://kb.ddex.net/about-ddex-standards/which-standard-do-i-need/) and the
> Open-Source Software directory
> (https://kb.ddex.net/reference-material/open-source-software/).

An indie artist is **both a "record company" (owns the master) and a "creator,"**
so both DDEX audience tracks apply. Mapped to Funūn functions:

| Standard | Full name | Funūn function | Status |
|---|---|---|---|
| **ERN** | Electronic Release Notification | Deliver release + resources + terms to distributors/DSPs | ⚠️ export improved → ERN 4.3-aligned (`buildDdexErn`); validate vs XSD |
| **RIN** | Recording Information Notification | Capture studio session: contributors, **roles, instrumentation** | 🟡 performer data captured (Metadata Studio); RIN message not emitted |
| **RDR** | Recording Data & Rights | Claim **neighbouring rights** with MLCs (SoundExchange/PPL) | 🟡 data model + readiness done (`lib/metadata/rdr.ts`); partner-routed |
| **MWDR** | Musical Work Data & Rights | Works + rights to publishers/PROs | ✅ ≈ our CWR lane (`lib/metadata/cwr.ts`) |
| **DSR** | Digital Sales Reporting | **Receive** sales/usage data → Earnings room | ☐ not built (parse with open-source `dsrf`) |
| **PIE** | Party Identification & Enrichment | Artist/contributor identity (ISNI / DPID) | ☐ relevant — fills RDR-N Recommended-profile + ERN DPID gaps |
| **MEAD** | Media Enrichment & Description | Rich non-core metadata (moods, marketing) | ☐ later |
| **BWARM / AR / Simple Music NFT** | Bulk DB / anomaly reports / NFT delivery | Niche | ☐ later |

**The data spine:** performer/role/instrument data flows **RIN (capture) → ERN
(delivery credits) → RDR-N (neighbouring-rights claims)**. We now capture it once
in `tracks.metadata` and feed all three.

## Priority order
1. **ERN** — the delivery standard, already emitted; finish conformance (below).
2. **PIE** — party identity (ISNI/IPN/DPID); unblocks RDR-N Recommended + ERN DPIDs.
3. **MWDR (have) + RDR-N (scaffolded)** — the rights/money lanes.
4. **DSR** — receive earnings data → real Earnings room.

## Open-source we can use (no need to build validators)
- **DDEX Workbench** (JS) — ERN 3.8.2/4.2/4.3 validation platform with a public
  API → validate `buildDdexErn`. https://github.com/daddykev/ddex-workbench
- **ern-validator-api / -client** (JS) — server/client ERN validators.
  https://github.com/ddexnet/ern-validator-api
- **dsrf** (Python) — parse DSR flat-files (Earnings feed later).
  https://github.com/ddexnet/dsrf
- ERN parsers in Python/PHP/Ruby/C# (DeDEX, ddexreader, DDEXPythonParser, …).
- **Telling gap:** essentially **no open-source RDR tooling** → confirms our
  "route RDR submission through a partner, don't build a node" posture.

## ERN export — conformance status (`lib/metadata/export.ts` → `buildDdexErn`)
**Fixed in this pass** (output now validates as well-formed XML):
- `ern/43` namespace + `MessageSchemaVersionId`.
- `MessageHeader` (thread/id/sender/recipient/created-time) — was missing entirely.
- `ResourceReference` (A1…) on each SoundRecording + `ReleaseResourceReferenceList`
  linking them from the Release — proper resource↔release wiring.
- `Duration` as ISO-8601 (`PT3M21S`), not raw seconds.
- Dropped `ISWC` from SoundRecording (it's a work-side identifier, not recording).
- `DisplayArtist` structured with `PartyName` + `DisplayArtistRole`.
- Performers as `ResourceContributor`; writers as `IndirectResourceContributor`.

### XSD validation — DONE ✅ (ERN 3.5.1, schema-valid)
`buildDdexErn` now emits **ERN 3.5.1** and **validates clean against the
normative DDEX XSD**. We targeted 3.5.1 (not 4.3) deliberately: 3.x uses
**inline parties** (matching our structure) and is still the most widely
accepted version across distributors; 4.x's `PartyList`/party-reference
architecture is a larger rework, deferred.

Reproduce the validation locally with libxml's `xmllint`:
```
curl -sL -o /tmp/ern351.xsd http://ddex.net/xml/ern/351/release-notification.xsd
xmllint --noout --schema /tmp/ern351.xsd your-ern.xml   # → "validates"
```
(or use the JS **DDEX Workbench**.) Key 3.5.1 specifics now handled:
`MessageThreadId` before `MessageId`; `UpdateIndicator`; the
`SoundRecordingDetailsByTerritory` / `ReleaseDetailsByTerritory` pattern;
AVS-valid values (`ReleaseType` Single/Album…, `ResourceContributorRole`
FeaturedArtist/AssociatedPerformer, `IndirectResourceContributorRole` Composer);
`ICPN IsEan`; PLine/CLine after the territory block.

**Still TODO before a real delivery package:**
- Replace placeholder DPIDs with registered DDEX Party IDs (PIE / registration).
- `TechnicalDetails` (file refs, codecs, hashes) for actual audio delivery.
- An ERN **4.x** variant (PartyList architecture) if a target DSP requires it.

### RDR-N export — also XSD-valid ✅
`buildRdrN` (lib/metadata/rdr-export.ts) now **validates against the normative
MLC 1.31 XSD**. Key finding: RDR-N messages live in the DDEX **MLC schema**
(namespace `http://ddex.net/xml/mlc/131`, file `music-licensing-companies.xsd`),
not a standalone `rdrn` namespace. Root: `DeclarationOfSoundRecordingRightsClaimMessage`.
Specifics handled: prefixed root (elementFormDefault is unqualified → children
unqualified, like ERN); `RightsController` requires `RightsControllerType`
(OriginalOwner) + `DelegatedUsageRights` (UseType + PeriodOfRightsDelegation +
TerritoryOfRightsDelegation); performers as FeaturedArtist/NonFeaturedArtist.
Validate with:
```
curl -sL -o /tmp/mlc.xsd http://service.ddex.net/xml/mlc/131/music-licensing-companies.xsd
# (xmllint can't compile the imported xmldsig X509Data — patch/stub it, or use DDEX Workbench)
xmllint --noout --schema /tmp/mlc.xsd your-rdr-n.xml
```

## Related
- `docs/ddex-rdr-compliance.md` — neighbouring-rights (RDR) deep dive.
- `docs/cwr-plan.md` — publishing/CWR lane.
- `docs/publishing-admin-partners.md` — partner strategy.
