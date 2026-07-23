<!-- generated-by: gsd-doc-writer -->
# Split Sheets

A split sheet is Funūn's record of who wrote a song and what percentage of
the songwriting/publishing each person owns. The feature was built across
two phases — **Phase 17 (Split-Sheet E-Sign)** and **Phase 18 (Split-Sheet
Home)** — and this is the first document that covers it end to end. (The
project's `.claude/CLAUDE.md` still describes the older "Wave 2: Rights &
Registration Rails" framing; this doc describes the system as it actually
exists in code today.)

## Overview

A split sheet starts as a **living draft** the initiator edits freely
(`/split-sheets/[id]`, `components/split-sheets/SplitSheetBuilder.tsx`),
moves through an **approval loop** where named parties agree or counter
(`/approve/[token]`), and — once everyone agrees — can be **minted for
e-signature** via DocuSeal (`POST /api/split-sheets/[id]/mint-envelope`).
A completed, executed agreement becomes a `vault_documents` row for every
account-holding party and shows up in their **Contract Locker**
(`/contracts`). Every release track's coverage feeds the Vault's
**readiness score**.

## Data model

### Core tables

| Table | Added in | Purpose |
|---|---|---|
| `collaborators` | 018 | A user's roster of people they work with — reused across sheets/split sheets/contracts. |
| `split_sheets` | 018 | One row per agreement: song, status, work-detail fields. |
| `split_sheet_parties` | 018 | One row per named party on a sheet — a **frozen snapshot** of name/email/PRO/etc. at creation time. |
| `split_sheet_attachments` | 067 | Join table: which release(s)/track(s) a sheet covers. |
| `esign_envelopes` / `esign_envelope_signers` | 062 | One row per DocuSeal submission attempt, and one row per signer per attempt. |
| `collaborator_invites` | 018 | Invite-by-email tracking for collaborators missing IPI (unrelated to sheet e-sign). |

### Key columns by migration

- **018** (`supabase/migrations/018_collaborators_split_sheets.sql`) —
  base tables above. `split_sheets.status` starts as
  `draft | pending_approval | approved | countered`.
  `split_sheet_parties` carries `approval_status`, `approval_token`
  (for `/approve/[token]`), `counter_proposal`.
- **062** (`062_split_sheet_esign_envelopes.sql`) — widens
  `split_sheets.status` to add `esign_pending` and `executed`; adds
  `split_sheet_parties.first_viewed_at` (nudge tracking); redefines
  `calculate_vault_readiness()` to read split-sheet status tiers.
- **063** (`063_split_sheet_legal_grade.sql`) — legal-grade document
  fields: `split_sheet_parties.legal_name` / `publishing_designee` /
  `administrator`; `split_sheets.artist_name` / `album_project_title` /
  `record_label`; `artist_profiles.administrator`.
- **064** (`064_fix_split_sheet_rls_recursion.sql`) — fixes a mutually
  recursive RLS policy pair between `split_sheets` and
  `split_sheet_parties` via two `SECURITY DEFINER` helper functions
  (`is_split_sheet_initiator`, `is_split_sheet_party`). No visibility
  change, just breaks the 42P17 recursion.
- **065** (`065_esign_certificate_path.sql`) — `esign_envelopes.certificate_path`,
  Funūn's own Certificate of Completion (distinct from the provider's
  `audit_log_path`).
- **066** (`066_split_sheet_identity_foundation.sql`) —
  `collaborators.legal_name` / `collaborators.status` (`pending`/`confirmed`),
  `artist_profiles.legal_name_locked_at`. Two triggers auto-confirm a
  collaborator: on `claimed_by` being set, and on a linked party's
  `approval_status` leaving `pending`.
- **067** (`067_split_sheet_song_attachment.sql`) — `split_sheets.track_id`
  (nullable — a sheet can cover one song or a whole release) and
  `split_sheets.source` (`funun`/`uploaded`); the `split_sheet_attachments`
  join table (one sheet can cover the same composition on two releases,
  e.g. a single AND an album).
- **068** (`068_split_sheet_coverage_readiness.sql`) — redefines
  `calculate_vault_readiness()`'s split-sheet branch to score **coverage
  across every track**, not just "are the sheets I have signed."

### The collaborator identity chain

```
collaborators.claimed_by  ──►  auth.users.id  ──►  artist_profiles.id
        │                                              │
        │ (roster entry, may be unclaimed)             │ (live PRO/IPI/
        │                                               │  legal name/etc.)
        ▼                                               ▼
split_sheet_parties.collaborator_id            resolvePartyIdentity()
   (frozen name/email/PRO snapshot)            (lib/split-sheets/live-identity.ts)
```

- `split_sheet_parties` rows are a **denormalized snapshot** at creation
  time — legal documents should not silently change under later
  collaborator edits.
- If a party is linked to a `collaborators` row that has been `claimed_by`
  a Funūn user, `resolvePartyIdentity()` resolves the party's *displayed*
  identity fields (PRO, IPI, publishing designee, administrator, legal
  name) from that user's **current** `artist_profiles` data, live, up
  until the sheet is minted — see [Live-linked identity](#live-linked-identity-phase-18-05).

### Relationship sketch

```
 split_sheets ──< split_sheet_parties        (one sheet, many named parties)
      │  │
      │  └──< esign_envelopes ──< esign_envelope_signers
      │
      └──< split_sheet_attachments >── vault_projects / tracks
                                          (many-to-many: a sheet can cover
                                           multiple releases/tracks)

 vault_documents  (fan-out row per account-holding party, created by the
                    DocuSeal webhook on execution — this is what the
                    Contract Locker's "settled archive" ultimately shows)
```

## The surfaces

### The living draft (`/split-sheets`, Phase 18-01)

- **`/split-sheets`** (`app/(artist)/split-sheets/page.tsx`) — list of every
  sheet the viewer initiated or is named on, via
  `fetchSplitSheetsForUser()` (`lib/split-sheets/list.ts`). A `draft` sheet
  is visible **only** to its initiator (enforced both in the query and
  defensively in `mergeSplitSheetRows()`).
- **`/split-sheets/new`** and **`/split-sheets/[id]`** — create/edit, both
  rendered by `SplitSheetBuilder.tsx`. The initiator is **auto-included as
  party 1** on both create and edit (no manual "add yourself" step) —
  `buildInitialParties()` in `SplitSheetBuilder.tsx`.
- **`PartyPicker.tsx`** (new component, Phase 18) — email/phone-first party
  add flow. Deliberately **separate** from
  `components/collaborators/CollaboratorPicker.tsx` (that component has a
  third, untested caller in `MetadataStudio`'s `ComposerEditor`, and is
  left byte-for-byte untouched). Two ways to add a party: pick an existing
  roster collaborator (`kind: 'full'`), or fast-add by email/phone alone
  (`kind: 'fastAdd'`, via `POST /api/collaborators` with `status: 'pending'`).
- **Redistribution** (`lib/split-sheets/redistribute.ts`) — adding or
  removing a party redistributes the remaining splits (`'even'` or
  `'proportional'` mode) so the total always rounds to exactly 100.000%,
  with any rounding residue applied to the largest share.
- **Read-only share** — a non-initiator account-holding party viewing
  `/split-sheets/[id]` gets `ReadOnlyPartySummary` (only the initiator can
  `PATCH`, enforced server-side regardless of what the UI shows).
- **§7 recipient self-correction** (`/approve/[token]`,
  `app/api/approve/[token]/route.ts`) — a distinct `action: 'update_identity'`
  lets a responding party correct their own `legal_name`/`pro`/`ipi`/
  `publishing_designee`/`administrator` (an explicit allowlist —
  `IDENTITY_FIELDS`). Blocked once the sheet is `esign_pending`/`executed`.
  When the party is linked to a `collaborators` row, the same update is
  applied there too (overwrite semantics — "a person's own verified
  identity correcting itself," never additive like `backfill_claimed_collaborators()`).

### Live-linked identity (Phase 18-05)

`resolvePartyIdentity()` (`lib/split-sheets/live-identity.ts`) is a pure
function: given the frozen `split_sheet_parties` snapshot, the claimed
user's current `artist_profiles`-derived identity (or `null` if unclaimed),
and the sheet's status, it decides what to display:

- **Pre-mint** (`draft`, `pending_approval`, `approved`, `countered`) **and**
  a claimed profile exists → each identity field is **overwritten** by the
  live value, field-by-field, falling back to the frozen value only when
  the live field is null/blank.
- **Post-mint** (`esign_pending`, `executed`) **or** no claimed profile →
  the frozen snapshot is returned unchanged. The freeze boundary
  (see [Lifecycle](#lifecycle--freeze-boundary)) already blocks writes
  past `esign_pending`, so mint time *is* the snapshot moment — no separate
  snapshot mechanism was needed.

Settings has a **legal-name confirm-and-lock** control
(`components/profile/ProfileForm.tsx`, `app/api/profile/route.ts`,
migration 066's `artist_profiles.legal_name_locked_at`) — a one-time
attestation banner ("Legal name confirmed on {date}"), not a field freeze;
the underlying legal-name fields stay editable afterward. Per code review
finding **IN-01**, `legal_name_locked_at` currently has **no downstream
consumer** beyond that banner — it does not yet gate anything in the
split-sheet builder or elsewhere.

### The e-sign flow (Phase 17)

Kept at reference level here — see the Phase 17 summaries
(`.planning/phases/17-split-sheet-esign/`) for full detail.

- **`lib/esign/provider.ts`** — vendor-agnostic `EsignProvider` interface
  (`createRequest`, `downloadSignedPdf`, `parseWebhook`). Designed so
  DocuSeal is the first live implementation but not the only one the
  interface could ever support.
- **`lib/esign/docuseal.ts`** — the concrete DocuSeal adapter, a plain
  `fetch`-based client (no vendor SDK server-side). `DOCUSEAL_API_KEY`
  never reaches the browser; the browser only ever gets a per-signer
  `slug` embed credential (`components/split-sheets/SplitSheetSigningEmbed.tsx`
  uses `@docuseal/react` for the embed only).
- **`POST /api/split-sheets/[id]/mint-envelope`** — the one route that
  spends money ($0.20/completed doc) and sends real signature emails.
  Runs every gate (counsel-review flag, monthly new-recipient cap) before
  the first DocuSeal call. Supports two entry paths: the normal
  post-consensus loop (`sheet.status === 'approved'`) and a **fast lane**
  (`sheet.status === 'draft'`, initiator skips straight to signing on a
  sheet already agreed in person) — the fast lane backfills approval onto
  every party after a successful mint so downstream logic sees one
  consistent truth.
- **The webhook** (`app/api/webhooks/docuseal/route.ts`) — verifies the
  HMAC signature (`lib/esign/webhook.ts`), stores the executed PDF, the
  provider's audit log, and Funūn's own rendered **Certificate of
  Completion** (`lib/vault/pdf/completion-certificate.ts`,
  `esign_envelopes.certificate_path`), flips the sheet to `executed`, and
  fans out one `vault_documents` row per account-holding party — this is
  how a signed sheet lands in the Contract Locker.

### Contract Locker (Phase 18-02)

`app/(artist)/contracts/page.tsx` + `components/contracts/ContractLocker.tsx`,
data layer in `lib/contracts/locker-rows.ts` and
`lib/contracts/locker-attention.ts`.

- **Attention-first landing** — `buildAttentionSections()` reads both
  `vault_documents` (signed/verified documents) and in-flight
  `split_sheets`, bucketing into four ordered sections plus a settled
  archive: awaiting signature, drafts in progress, unattached executed,
  songs with no sheet.
- **The 3-state per-party label** — `derivePartyProgressState()` derives
  `invited | opened | signed` purely from two already-shipped columns
  (`approval_status`, `first_viewed_at`) — **no new schema**. This is
  distinct from `collaborators.status` (roster-level "has this person
  engaged with Funūn at all" — 18-05); the two never substitute for each
  other.
- **Per-party views + soft hide** — every attention row resolves the
  *viewer's own* share/state (`resolveViewerContext()`), never another
  party's figure; a document a viewer no longer wants to see can be
  soft-hidden (`document_data.hidden`) via
  `app/api/contracts/documents/[id]/hide/route.ts` — hidden from that
  viewer's own Locker only, never a hard delete, never visible to any
  other party.
- **The P18-12 block exception** — the attention read deliberately does
  **not** apply block-enforcement filtering: two co-writers who later
  block each other still co-own the composition, and neither may lose the
  record of what they signed. This is documented in-source
  (`app/(artist)/contracts/page.tsx`, `app/api/split-sheets/[id]/attach/route.ts`,
  `app/api/split-sheets/[id]/detach/route.ts` all cite "P18-12") as a
  deliberate decision, not an oversight.

## Coverage readiness (Phase 18-04)

The Vault's `calculate_vault_readiness()` SQL function (migration 068,
`supabase/migrations/068_split_sheet_coverage_readiness.sql`) and its TS
twin `coverageTier()` (`lib/vault/readiness-coverage.ts`) both score the
split-sheet readiness gate by **coverage across the project's own
tracks**, via `split_sheet_attachments`, rather than "are the split-sheet
documents I have signed" — a 5-track EP with one signed sheet used to read
complete at 15/15 with four undocumented songs; it no longer does.

- Every track needs its own sheet — **no exception** for solo-written
  songs (`tracksNeedingSheet()`, `lib/vault/coverage.ts`); absence of a
  sheet is absence of proof, not proof of sole authorship.
- A track's own tier is the **best (max)** tier across every sheet
  attached to it.
- When every needing track has *some* attached sheet, the score is the
  **pessimistic MIN** across their tiers (unchanged pre-068 semantic, now
  per-track).
- When at least one needing track has **no** sheet at all, points become
  the **rounded average** across every needing track instead — so a
  5-track EP with 4 executed sheets and 1 uncovered doesn't collapse to
  0/15.
- `status` only reads `'complete'` when the full tier (15) is reached —
  which the MIN branch can only hit when every track individually is at
  top tier, and the average branch cannot reach while any track is
  uncovered.
- Both derivations are checked against the same shared fixture set
  (`lib/vault/coverage-fixtures.ts`) — neither the SQL nor the TS side is
  the source of truth; the fixtures are.

## Lifecycle / freeze boundary

`lib/split-sheets/lifecycle.ts` is the single, pure module governing when
a sheet may be edited:

| Status | Editable? | Notes |
|---|---|---|
| `draft`, `countered` | Freely | The "living draft" states. |
| `pending_approval`, `approved` | Yes, but editing parties **resets consensus to `draft`** | `CONSENSUS_RESET_STATUSES`. |
| `esign_pending` | No | Must void the envelope first. |
| `executed` | No | Immutable — the signed agreement's own operative text requires a written amendment signed by all co-writers; Funūn's answer is a new amendment sheet. |

- `partiesActuallyChanged()` diffs the incoming party set against what's
  persisted (reusing `summarizePartyChanges()`) so a value-for-value
  resave (or a live-identity-only refresh) does **not** force an
  unnecessary consensus reset — this closed **WR-04** from the Phase 18
  code review (previously, *any* PATCH containing a `parties[]` array
  forced a reset, even when nothing about who's on the sheet or their
  splits had changed).
- `isAllowedStatusTransition()` blocks a client from PATCHing an executed
  or `esign_pending` sheet back to `draft` to sidestep the freeze — status
  advancement belongs only to the dedicated routes (send-for-approval,
  mint, void, webhook completion).

## Known gaps / follow-ups

These are tracked outside this doc — see `.planning/phases/18-split-sheet-home/18-REVIEW.md`
and `.planning/phases/17-split-sheet-esign/17-RESUME-HERE.md` for full
detail; not re-derived here.

- **Mint-envelope legal-name gate (open).** A party fast-added by
  email/phone alone can have a blank `legal_name`.
  `POST /api/split-sheets/[id]/mint-envelope` does not currently require a
  real legal name before minting, so a fast-added party could be minted
  onto the legal PDF with a bare em-dash for their name. Surfaced by the
  Phase 18 security audit and code review; a fix (gate mint until every
  party has a real legal name) is in progress in a separate session.
- **WR-03 — change-summary never reaches the parties it's meant to
  inform (open).** `summarizePartyChanges()`
  (`lib/split-sheets/change-summary.ts`) correctly computes what changed
  when a consensus reset happens, but the diff is only ever rendered in
  the *initiator's own browser* (`SplitSheetBuilder.tsx`) — it is never
  persisted, emailed, or passed into `send-for-approval`'s email or the
  `/approve/[token]` page the other parties actually land on. They see the
  same generic "please review" copy as a brand-new sheet, with no
  indication of what changed from what they already approved.
- **WR-01 and WR-02**, also raised in the same review, have **already been
  fixed** (commits `3befed7` and `b7535ff`): the Contract Locker's
  "songs with no sheet" section now considers `split_sheet_attachments`,
  and the readiness page no longer shows a coverage-warning widget next
  to a gate that already reads "Passed" via the legacy signed-document
  path.
- **Attorney review of the operative document language** is still the
  long-lead blocker on live production minting
  (`assertCounselReviewedForProduction()` in `lib/split-sheets/agreement.ts`);
  see `17-RESUME-HERE.md` §3 for the two open questions (template
  provenance, master-rights disclaimer placement).
