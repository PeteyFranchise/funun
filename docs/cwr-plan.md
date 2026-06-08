# CWR (Common Works Registration) — build & business plan

Status: **Path A in progress** · Path B not started (business-gated)
Last updated: 2026-06-08

CWR is the CISAC-standard EDI file format that composition-side societies
(ASCAP, BMI, SESAC, The MLC, and their international equivalents) accept for
registering musical **works** — writers, roles, splits, IPIs, ISWC. It is the
machine equivalent of the pre-filled registration packages we already ship at
`/vault/[projectId]/metadata/registrations`.

This doc captures the two ways to deliver CWR and the sequencing between them.
The short version: **the file is the easy 20%; the two identifiers it depends
on are the hard 80%, and neither can be issued by us.**

---

## The two identifiers that gate everything

| Identifier | What it is | How it's obtained | Can we issue it? |
|---|---|---|---|
| **Writer IPI** | Global ID for each songwriter/publisher (CISAC IPI System, run by SUISA). Required in every writer record. | Assigned when the writer **affiliates with a PRO** (ASCAP/BMI/etc.). No standalone registry. | **No** — we route to the PRO and capture it. |
| **Sender ID** | Identifies the file's submitter in the transmission header (type PB/AA/SO/WR + an IPI). | The society must **onboard** the sender. An indie writer who hasn't registered as a publisher has none. | **No** — issued per-society. |

Because of the sender-ID gate, a CWR file generated for someone without an
onboarded sender ID can be produced but **not submitted**. That gate is the
whole reason Path B exists.

---

## Path A — Generator + acquisition flow (self-submit)

**Goal:** generate a structurally valid CWR 2.1 file from the metadata we
already capture, and build the flow that helps a writer obtain the IPIs and
sender access they need to submit it themselves.

### Scope we can do correctly today
- **Writer-controlled works** (self-published, or the artist's own publisher
  where the writer keeps 100%). These need only the writer record (`SWR`) with
  PR/MR shares — no third-party publisher math.
- US PROs first (ASCAP / BMI / SESAC), whose CISAC society codes are verified.

### Honest limitations (tracked as future work)
- **Third-party publishers.** Correct CWR splits a writer's share between the
  writer (PR writer's share, usually 50%) and their publisher (PR + full MR).
  Our data model captures a single "publishing ownership %" per writer, not the
  writer/publisher breakdown. So when a third-party publisher is named, we flag
  the work as not-ready and explain what's missing, rather than emit wrong
  shares. → Future: capture writer-vs-publisher share + publisher IPI.
- **Society codes.** Only PROs with a verified CISAC society number are
  emitted; others (GMR, most international) flag the work as not-ready until
  their codes are confirmed against the CISAC society list.
- **Draft status.** The generator produces faithful CWR 2.1 record structure
  (control records, ordering, key fields). Exact column offsets must still be
  validated with each society's CWR validator during onboarding (Path B). The
  file is labeled a **draft export** until then.
- **IPI check digit.** We validate IPI shape/length only. The IPI mod-101 check
  digit algorithm is not implemented (not verified) — we don't fake it.

### Build checklist
- [x] `lib/metadata/cwr.ts` — society/role maps, `assessCwrReadiness(bundle)`,
      `buildCwrFile(bundle, sender, now)`. Pure, client-safe.
- [x] IPI helpers in `lib/metadata/identifiers.ts` (`normalizeIpi`,
      `isValidIpi`).
- [x] `app/api/vault/[projectId]/metadata/cwr/route.ts` — `.V21` download,
      DEMO→400, readiness-gated.
- [x] `app/(artist)/vault/[projectId]/metadata/cwr/page.tsx` — readiness view,
      IPI/sender-ID acquisition guidance, download.
- [x] Link from the registrations page.
- [ ] Capture writer-vs-publisher share + publisher IPI (unblocks third-party
      publisher works).
- [ ] Confirm international + GMR society codes.

---

## Path B — ArtistOS as the registered sender (the real product)

**Goal:** ArtistOS becomes a registered CWR submitter and registers works
centrally on artists' behalf — the Songtrust / CD Baby Pro model. The same
generator powers it; the difference is the submission rail and the business
relationships behind it.

### Business / legal (the long pole — weeks to months)
1. **Pick the entity model.**
   - *Admin-agency-only* — we submit registrations, no money flows through us.
     Recommended start.
   - *Full publishing administrator* — we collect and pass through royalties for
     a %. Much bigger: trust/escrow accounting, 1099s, possibly
     money-transmission considerations. Defer.
2. **Get ArtistOS its own publisher IPI** (register a publishing entity).
3. **Onboard as a CWR sender with each society** — ASCAP, BMI, SESAC, The MLC —
   each with its own data agreement, test-file cycle, and possible fees.
   (SoundExchange is recording-side / ISRC-fed — *not* CWR; keep separate.)
4. **Artist authorization** — agreement granting us the right to register their
   works, explicitly admin-only (we don't take their publishing).

### Engineering (once the rail exists)
1. Reuse the Path A generator; swap sender identity to ArtistOS's onboarded ID
   (sender type `AA`).
2. Per-society submission queue (sequence numbers, transmission logs).
3. **Acknowledgment (ACK) ingestion** — parse each society's EDI response files
   and surface per-work status (registered / conflict / rejected) back to the
   artist. *This is the real engineering depth and the thing that makes it feel
   like a product rather than a file dump.*
4. Conflict/duplicate handling and revisions (`REV` transactions).

### Strategic note
Path B is a direct shot at the publishing-admin incumbents' core moat — the
upside, and the reason it's a company-level commitment rather than a sprint.
Decide deliberately. Start the society onboarding early in parallel with Path A
engineering, because onboarding is the slow, relationship-driven part.

---

## Sequencing

1. **Now:** ship Path A (generator + readiness + acquisition flow). Artists get
   the IPI flow and a draft CWR export immediately. The Path A generator is
   architected so the sender identity is a parameter — it drops straight into
   Path B.
2. **In parallel:** begin Path B *business* onboarding (society agreements),
   since that's the long pole.
3. **Later:** as each society clears, light up central submission + ACK
   ingestion, and lift the third-party-publisher and international-society
   limitations.
