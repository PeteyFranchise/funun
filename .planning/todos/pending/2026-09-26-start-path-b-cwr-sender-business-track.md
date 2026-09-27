# Start Path B's business track — Funūn as a registered CWR sender

**Captured:** 2026-09-26 · **Status:** design already written, business track not started
**Owner ask:** become an affiliated publisher with CISAC so we can cross-reference ISWC and IPI,
and build into the MLC API.

**The design for this already exists and is good: `docs/cwr-plan.md`.** This todo is not a second
plan. It exists because that document's status line has read *"Path B not started
(business-gated)"* for a while, and the gate is not engineering — nobody has started the paperwork.

## What the existing plan already says

- **CWR** (Common Works Registration) is the CISAC-standard EDI format the composition-side
  societies accept — ASCAP, BMI, SESAC, The MLC and their international equivalents.
- **Path A** — generate the file. Built: `lib/metadata/cwr.ts` emits CWR 2.1, with a surface at
  `app/(artist)/vault/[projectId]/metadata/cwr/page.tsx`. Marked DRAFT: the record *structure* is
  faithful, but exact column offsets must pass each society's validator during onboarding.
- **Path B** — Funūn becomes the registered submitter and registers centrally on artists' behalf.
  *"The Songtrust / CD Baby Pro model."*

**The gate is the sender ID.** A CWR file for someone without an onboarded sender ID *"can be
produced but not submitted."* The plan's own table is blunt about both blocking identifiers: we
cannot issue a writer IPI (assigned when the writer affiliates with a PRO) and we cannot issue a
sender ID (each society onboards it).

## The four business steps, from the plan

1. **Pick the entity model.** *Admin-agency-only* (we submit registrations, no money flows through
   us) is the recommended start. *Full publishing administrator* means trust/escrow accounting,
   1099s and possible money-transmission exposure — the plan says defer, and that looks right.
2. **Get Funūn its own publisher IPI** — register a publishing entity.
3. **Onboard as a CWR sender with each society** — ASCAP, BMI, SESAC, The MLC. Each has its own
   data agreement, test-file cycle and possible fees. *(SoundExchange is recording-side and
   ISRC-fed — not CWR. Keep it separate.)*
4. **Artist authorization** — an agreement granting the right to register their works, explicitly
   admin-only. We do not take their publishing.

Weeks to months, per the plan. Step 2 gates steps 3 and 4.

## Why this is worth starting before it is needed

**The same affiliation unlocks identity verification.** The IPI register (SUISA, for CISAC) and
CISAC's ISWC IPI Context Search are both restricted to society members and affiliated publishers.
One relationship serves both registering works and checking that the identity data we hold is
consistent — see `2026-09-26-cross-reference-identity-against-pro-databases.md`.

## On the MLC specifically — answering the owner's question

**The MLC Public Search API is read-only.** It searches works; it cannot register one. Building
into it does *not* produce one-button registration. It is useful for the consistency checking in
the companion todo, and that is a different job.

**What produces one-button registration is the CWR sender rail** — Path B, exactly as scoped. Two
honest caveats to keep the expectation accurate:

- **CWR is the composition side only.** It reaches the PROs and the MLC. It does **not** cover
  SoundExchange (recording-side, ISRC-fed) or a copyright.gov filing. "Everything registers with
  one button" is one button for the composition side and separate rails for the rest.
- **The engineering depth is the acknowledgment loop, not the send.** The plan names this: parsing
  each society's EDI ACK files and surfacing per-work status — registered, conflict, rejected —
  back to the artist. *"This is the real engineering depth and the thing that makes it feel like a
  product rather than a file dump."* A submission with no ACK ingestion is a file dump with better
  manners.

## First concrete action

Decide the entity model (step 1). Everything else is sequenced behind it, and it is a decision, not
a project — an afternoon with counsel rather than a phase.
