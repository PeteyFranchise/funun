# CWR (Common Works Registration) — build & business plan

Status: **Path A built as a draft export** · Path B owner-approved direction, not started
(business/legal/recipient-gated)
Last updated: 2026-09-26

Company doctrine:
`.planning/deliberations/direct-rights-registration-publishing-distribution-doctrine.md`

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

## Path B — Funūn as the registered sender (the real product)

**Goal:** Funūn becomes an approved registration sender with two deliberately
separate client modes: (A) registering works/shares Funūn represents as a
publisher or administrator and (B) registering non-administered works under a
narrow, express filing mandate. The same generator can contribute to both; the
difference is the recipient-approved submission rail, Funūn's declared
capacity and the authority bound to each work/share.

This is also part of a wider owner-approved direction: Funūn should eventually
operate publishing-administration and music-distribution businesses while
minimizing avoidable middlemen. Those roles may reuse canonical data and
infrastructure, but their rights and contracts must never be conflated.

### Business / legal (the long pole — weeks to months)
1. **Counsel the operating modes.** Start with a registration-only mandate that
   permits preparation, submission, monitoring and correction without taking
   publishing or collection rights. Separately define the later publishing-
   administration agreement and the additional accounting/claims operation it
   requires.
2. **Establish Funūn's approved publishing/sender identity** — the legal entity,
   society affiliation(s), publisher IPI and recipient-specific identifiers.
   Do not reduce this to “affiliate with CISAC”; CISAC supplies standards and
   shared infrastructure, while practical onboarding occurs through the
   applicable societies/recipient programs.
3. **Evaluate MusicMark first for ASCAP/BMI/SOCAN** — its public materials
   describe one publisher CWR/EBR submission, a test cycle and first plus
   society acknowledgements. Confirm Funūn's eligibility, on-behalf-of rules,
   current format, transport and terms directly. Treat SESAC, GMR, The MLC and
   international societies as separate recipient workstreams until confirmed.
   (SoundExchange is recording-side / ISRC-fed — *not* CWR; keep separate.)
4. **Bind authority per work/share** — an agreement and machine-readable grant
   identifying Funūn's capacity, permitted actions, works/shares, territory,
   term, correction/revocation rules and source instrument.
5. **Prepare the operation behind the submit button** — conflicts, duplicates,
   rejections, accepted-with-change outcomes, corrections, registry support and
   member communications need named owners before a production pilot.

**Dual payoff:** this entity/publisher/society workstream can also advance IPI
identity consistency. CISAC says publishers may request the IPI Pocket Edition,
and the ISWC IPI Context Search is a publisher-facing API for finding creator
IPI numbers from names and known works. That makes the initial entity/capacity
decision high leverage, but not a universal access grant: registration sender
approval and each IPI/ISWC service still require their own confirmed eligibility,
agreements and credentials.

### Engineering (once the rail exists)
1. Reuse the Path A generator; swap sender identity to Funūn's onboarded ID
   (sender type `AA`).
2. Per-society submission queue (sequence numbers, transmission logs).
3. **Acknowledgment (ACK) ingestion** — parse each society's EDI response files
   and surface per-work status (registered / conflict / rejected) back to the
   artist. *This is the real engineering depth and the thing that makes it feel
   like a product rather than a file dump.*
4. Conflict/duplicate handling and revisions (`REV` transactions).

### Strategic note
Path B is now an owner-approved company direction, not merely a technical
option. The staged starting mode is registration-only; the longer destination
also includes publishing administration. That does not let the product imply
Funūn publishes, administers, collects or distributes before the corresponding
agreements and operations exist.

Prefer direct recipient relationships and portable standards. A vendor may be
used when it provides necessary access or reliability, but canonical identity,
authority, snapshots, submissions, acknowledgements and status remain in
Funūn, with an exit path.

---

## Sequencing

1. **Now:** keep Path A labeled as a draft export until its exact profile passes
   the selected recipient's current validator. Preserve it as a self-submit
   option even after direct registration exists.
2. **In parallel:** start counsel/entity/recipient work from the Path B todo;
   recipient eligibility and testing are the long pole.
3. **Run the recipient-approved sender pilot:** if onboarding requires
   publisher/admin repertoire, use one unambiguous work/share under Funūn's own
   approved capacity; prove rejection, correction and acknowledgements.
4. **Prove Mode B before its user-facing launch:** use one non-administered work
   under the separate registration-only mandate. Verify the registry records
   the intended claimants and does not imply a Funūn publishing interest.
5. **Expand recipient by recipient:** light up central submission only where
   authority, validation, secure transport, acknowledgements, corrections and
   controlled production evidence are complete.

“One click” is not a file upload. Product status must distinguish prepared,
submitted, received, accepted/accepted-with-change and registered, with
duplicate, conflict, rejected and revoked/corrected branches.
