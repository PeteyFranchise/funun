# Phase 17: Split-Sheet E-Sign - Research

**Researched:** 2026-07-19
**Domain:** E-signature integration (DocuSeal hosted API), PDF generation, readiness-state machine convergence, cross-account document distribution
**Confidence:** MEDIUM-HIGH (internal codebase findings are HIGH/VERIFIED via direct file reads; DocuSeal API mechanics are MEDIUM/CITED via official docs cross-checked across 2+ pages; a few provider-billing specifics remain LOW/unresolved pending the human provider-verification gate already called out in 17-CONTEXT.md)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-18b:** embedded (never leave Funūn) + mobile-first (studio-with-only-a-phone is the canonical test); dual-provider behind `lib/esign/provider.ts`.
- **AM-1:** free for all artists until the AM-3 trigger; wet-sign upload remains the universal fallback.
- **AM-2:** structural guardrails — Funūn split-sheet template ONLY (no arbitrary PDFs), ~10/mo per-artist soft cap with admin bump, project-readiness minimum where a project exists.
- **AM-3:** $500/mo spend re-opens the access-model deliberation with data.
- **AM-5:** executes BEFORE Phase 16; claims migrations 062+; Phase 16's drafted plans get a migration-number touch-up before their execution.
- Spikes 006a/006b/007: DocuSeal mobile UX validated; hosted path AGPL-clear (MIT embed SDK); embedding is Pro-paid even self-hosted → hosted ~$0.20/completed-doc tier.

**P17-01 (signing lifecycle):** Two-step by default — the existing approve/counter loop settles terms; unanimous approval mints the DocuSeal envelope; parties sign the rendered PDF. Initiator fast lane per sheet: a "skip straight to signing" option for splits already agreed in person. In the fast lane the completed signature BACKFILLS approval state (signature ⊃ approval).

**P17-02 (void/objection):** Any-party objection voids a minted envelope (before all signatures land): envelope voids, sheet returns to the approval/counter stage, re-consensus mints a NEW envelope. Whether voided envelopes bill (and thus count toward the AM-2 cap) is a provider-gate verification item.

**P17-03 (readiness tiers):** Tiers 5 / 10 / 15 on the existing 15-point `split_sheets` item. Draft = 0. Sent-awaiting = 5. Countered = 5 with a "renegotiating" flag (progress, never scores above consensus). All-approved-signatures-pending = 10 (fast-lane sheets ENTER at 10 on send-for-signature). Fully executed = 15 via signed PDF + Certificate landing in `vault_documents` as `split_sheet`/`signed`.

**P17-03-impl:** the executed=15 endpoint reuses the existing `signedOf()` gate unchanged, but 5/10 partial tiers require the split-sheet item's status derivation to read PIPELINE state (`split_sheets.status`) — extending BOTH `readinessItemsForProject()` (breakdown UI) AND the DB trigger computing `vault_readiness_score`. This is a derivation change, NOT a `READINESS_ITEMS` registry/points change (item stays 15 points).

**P17-04 (notifications):** Initiator notifications (Phase 10 bell + per-party chips): party approved, party signed, counter received (highest urgency), fully executed, AND viewed-but-no-action nudges (page-visit tracking, not email-open tracking) — a party who opened the link but hasn't acted within ~3 days triggers a nudge notification with one-tap re-send. Nudge cadence is planner discretion.

**P17-05 (standalone sheets):** Full e-sign + personal locker + attachable later. Identical approve→sign flow; executed PDF lands in the initiator's Contract Locker unattached; any party with an account can ATTACH the executed sheet to a matching vault project they own — at which point THAT project's readiness moves. The document follows the song, not the project row.

**P17-05a / AM-2a:** the template-only guardrail is satisfied by "the Funūn split-sheet template," project OPTIONAL — standalone sheets relax AM-2's letter while preserving its intent. The project-readiness minimum applies only when a project is attached at initiation time.

**P17-06 (cap + distribution):** The send consumes the initiator's ~10/mo allowance. Every party — account or not — can retrieve the executed PDF + Certificate from their token link; parties WITH Funūn accounts ALSO get it in their own Contract Locker.

**P17-07 (reconciliation):** The executed sheet is authoritative; write-back is OFFERED, never silent. On execution (or later attach), Funūn offers a one-tap sync of signed percentages into `tracks.metadata.composers[]`, showing a diff the artist confirms. No silent mutation of registration-feeding data. Until resolved, a visible mismatch warning renders.

### Claude's Discretion

- DocuSeal API mechanics (template management, webhook events, embed token flow) — from official docs during research.
- Exact nudge cadence/copy; chip visual states; renegotiating-flag rendering.
- Schema for envelope/e-sign state (new columns on `split_sheet_parties` vs a new table) — follow migration 018's shape and the 040/056/058 privilege doctrine; all writes server-owned.
- PDF layout of the split-sheet renderer (follow metadata-sheet/credits-sheet precedent; include PRO/IPI per party — the data is already captured).

### Deferred Ideas (OUT OF SCOPE)

- Embedded license-ID metadata in executed PDFs (standing roadmap candidate, gated on its own discussion).
- Counter-proposal UX for splits ranges/percentages negotiation beyond the existing counter flow.
- Open-tracking-based email analytics beyond the page-visit nudge signal.
- Split-sheet template variants (producer points, sample clearance riders) — one template only.

### Provider Verification Gate (HUMAN — before plan-phase execution, not before planning)

Pete runs a DocuSeal trial (~30 min) before EXECUTION starts: (1) inspect a real Certificate of Signature; (2) confirm white-label scope/price; (3) run a 3-signer async multi-party template test; (4) deliverability check; (5) confirm whether VOIDED envelopes bill. Discussion/planning may proceed without this; execution must not start before it. This research flags every place its answer changes a recommendation.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| P17-01 | Two-step approve→sign default + per-sheet fast lane that backfills approval from signature | DocuSeal `order` param + submission creation confirmed (Architecture Patterns, Pattern 2); fast-lane backfill logic sketched in Code Examples |
| P17-02 | Any-party objection voids a minted envelope; re-consensus mints a new one; void-billing unknown | DocuSeal has no dedicated "void" endpoint — `DELETE /submissions/{id}` archives; billing-on-archive is undocumented (Common Pitfalls #5, Open Questions #1) |
| P17-03 / P17-03-impl | 5/10/15 readiness tiers derived from `split_sheets.status` pipeline state, extending both the DB trigger and `readinessItemsForProject()` | `calculate_vault_readiness()` located and quoted verbatim (migration 016, current canonical version); recommended tier-derivation SQL in Code Examples; flagged as the single highest-complexity task in the phase |
| P17-04 | Initiator notifications incl. page-visit-based nudge tracking | Phase 10 notification catalog (`lib/social/notifications.ts`) read; new notification types + a page-visit timestamp column recommended (Architecture Patterns, Pattern 5) |
| P17-05 / P17-05a | Standalone (`vault_project_id = null`) sheets get full e-sign, land in initiator's locker unattached, attachable later | **Materially harder than CONTEXT assumes** — Contract Locker's current query cannot render a projectless document at all (Common Pitfalls #1). Attach-flow authorization pattern recommended (Architecture Patterns, Pattern 4). |
| P17-06 | Initiator's cap consumption; every party gets the executed record; account-holders get it in their own locker | Cross-account distribution via duplicate `vault_documents` rows per user (not a shared-doc join table) — fits existing RLS doctrine with zero new policies (Architecture Patterns, Pattern 3) |
| P17-07 | Offered (never silent) write-back of executed splits into `tracks.metadata.composers[]` | Confirmed no FK/collaborator_id link between `split_sheet_parties` and `composers[]` — matching must be by normalized name, which is fragile (Common Pitfalls #7) |

</phase_requirements>

## Summary

Phase 17 is a convergence phase, not a greenfield feature: three systems that already exist and already work in isolation — the migration-018 approve/counter pipeline, the `vault_documents`/`vault_readiness_score` gate, and the Metadata Studio's `composers[]` splits — get wired together at the moment of signature, with DocuSeal (hosted, embedded, MIT SDK) as the first live e-sign provider behind the pre-existing `lib/esign/provider.ts` seam. The codebase is unusually well-prepared for this: `vault_documents`'s evidence-guard constraint (migration 049/045) already requires exactly the `document_data.esign.completedAt` shape the abstraction defines, split-sheet PDF rendering has two direct precedents (`metadata-sheet.tsx`, `credits-sheet.tsx`) to clone, and the approve/counter API already establishes every pattern this phase needs to repeat (ownership-check-with-session-client → service-role write, best-effort email, public-token public page).

The research surfaced two things materially harder than the phase's framing assumes. First, the existing `/approve/[token]` page's "is this link still valid" check (`app/approve/[token]/page.tsx:26-30`) treats any `approval_status !== 'pending'` as an expired link — which would actively break the plan (implied by the phase brief) to reuse that same token/URL to host the post-approval signing step, since a party's status becomes `'approved'` the moment they approve. That gating logic must change as part of this phase, not just get new UI bolted onto it. Second, Contract Locker's current data-fetching query (`app/(artist)/contracts/page.tsx:73-81`) only ever reaches `vault_documents` rows by joining FROM `vault_projects` — there is no query path today that can surface a `vault_documents` row with `project_id = NULL`. Since P17-05's entire "standalone sheet lands unattached in the initiator's locker" promise depends on exactly that, Contract Locker needs a second, direct `vault_documents` query (or a UNION) added in this phase, not assumed to already work.

The readiness-tiering task (P17-03-impl) is the single highest-complexity item: `calculate_vault_readiness()` is a plpgsql function (currently ~90 lines, last redefined in migration 016) that computes a binary 0-or-15 signal purely from `vault_documents`; making it tier-aware means teaching it to also read `split_sheets.status` for the project's sheet(s), decide a per-sheet tier, and take the pessimistic (minimum) tier across however many split sheets are tied to one project — while leaving the wet-sign-upload path (AM-1's universal fallback) as an equally valid route to the full 15 points. The TypeScript twin (`readinessItemsForProject()` in `lib/vault/readiness.ts`) needs the identical derivation, which means its `ReadinessInput` type needs a new `split_sheets` field threaded in from every caller.

**Primary recommendation:** add two new tables (`esign_envelopes`, `esign_envelope_signers`) rather than columns on `split_sheets`/`split_sheet_parties` — this cleanly supports P17-02's void→re-mint cycle (each mint attempt gets its own row, preserving audit history of voided attempts) without clobbering approval-stage data, and gives P17-03/AM-3 telemetry a single source of truth to query. Generate the split-sheet PDF with `@react-pdf/renderer` at mint time (approval-consensus or fast-lane send), submit it to DocuSeal's PDF-template API with embedded text-tag fields per party, and do not persist the pre-sign PDF in Supabase Storage — regenerate on demand, since its content is fully derived from `split_sheets`/`split_sheet_parties`/`collaborators` state. Only the DocuSeal-executed PDF + Certificate get stored.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Split-sheet PDF generation | API / Backend | — | `@react-pdf/renderer` runs server-side only (Node runtime, not Edge); mirrors `lib/vault/pdf/*` precedent, invoked from an API route or the mint-time server action |
| DocuSeal envelope creation/mint | API / Backend | — | Server-owned; never expose `DOCUSEAL_API_KEY` to the client; the mint call happens inside a service-role-gated route after ownership + cap checks |
| Embedded signing UI | Browser / Client | Frontend Server (SSR shell) | `@docuseal/react`'s `DocusealForm` is a client component (iframe-backed); the hosting page (`/approve/[token]`) is server-rendered for the initial token lookup, then hands off to the client embed |
| Webhook ingestion (signature events) | API / Backend | — | `POST /api/webhooks/docuseal` — must run as a Node serverless function (raw-body access required for HMAC verification), never Edge runtime |
| Readiness tiering (5/10/15) | Database / Storage (trigger) | API / Backend (TS twin) | `calculate_vault_readiness()` is a Postgres trigger function — the source of truth for the stored score; `readinessItemsForProject()` is a pure TS mirror for the UI breakdown and MUST stay logically identical to the trigger |
| Cross-account document distribution | Database / Storage | API / Backend | Achieved via RLS-scoped duplicate `vault_documents` rows (one per Funūn-account party), not a new sharing table — Database tier owns the access-control primitive (existing `USING (auth.uid() = user_id)` policy), Backend tier owns the fan-out INSERT logic in the webhook handler |
| Notifications (chips, nudges) | API / Backend | Browser / Client | `lib/social/notifications.ts` catalog + `createNotification()` write from Backend; bell/chip rendering is Client |
| Splits reconciliation diff | API / Backend | Browser / Client | Diff computation (comparing `split_sheet_parties` vs `composers[]`) is a pure Backend function; the confirm-or-dismiss UI is Client |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@docuseal/react` | 1.0.75 (npm, verified `npm view`) | Embedded signing form (`DocusealForm`) | MIT-licensed (verified via `npm view @docuseal/react license` → `MIT`); official DocuSeal-maintained package; matches spike 007's licensing finding exactly `[VERIFIED: npm registry]` |
| DocuSeal hosted API (no SDK required for server calls — plain `fetch`) | REST, `X-Auth-Token` header auth | Template creation, submission creation, webhook receipt, document/audit-log retrieval | Front-runner per prior deliberation + spikes 006a/007; no official Node server SDK is required — the API is plain REST/JSON, so a thin internal wrapper (`lib/esign/docuseal.ts`) implementing `EsignProvider` is the correct shape, not a vendor SDK dependency `[CITED: docuseal.com/docs/api]` |
| `@react-pdf/renderer` | ^4.5.1 (already in `package.json`, confirmed current via `npm view`) | Split-sheet PDF renderer (new `lib/vault/pdf/split-sheet.tsx`) | Existing precedent (`metadata-sheet.tsx`, `credits-sheet.tsx`); zero new dependency `[VERIFIED: npm registry]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node built-in `crypto` | n/a (built-in) | HMAC-SHA256 webhook signature verification (`crypto.timingSafeEqual`) | Verifying `X-Docuseal-Signature` on the webhook route — no new dependency, mirrors the existing `randomBytes`-based token pattern in `lib/split-sheets/approval.ts` |
| `resend` (existing) | ^4.0.0 | Nudge / notification emails | Reuse `lib/email/index.ts`'s `sendEmail()` wrapper exactly as `send-for-approval/route.ts` does today |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DocuSeal hosted API + embed | Self-hosted DocuSeal (Docker, AGPL core) | Spike 007 already resolved this: embedded signing is a paid Pro feature even self-hosted, so self-hosting buys near-zero savings at this phase's volume while adding ops burden. Do not revisit without a volume trigger (AM-3). |
| Two new `esign_envelopes`/`esign_envelope_signers` tables | Columns directly on `split_sheets`/`split_sheet_parties` | Simpler migration, but P17-02's void→re-mint cycle would overwrite the prior attempt's signer state with no history, which is a bad look for the "audit trail" DocuSeal is being chosen for in the first place. Rejected. |
| Regenerate pre-sign PDF on demand at mint time | Persist the pre-sign PDF in `release-documents` storage | Persisting adds a storage write + staleness-invalidation problem (a party could counter-propose and change the splits between generation and re-mint) for a PDF that is fully derivable from DB state. Only the EXECUTED PDF needs persisting. |
| Reuse `/approve/[token]` for both approve and sign phases | New `/sign/[token]` route | A second route means a second token/email-link lifecycle to manage and a second link the artist has to explain to collaborators. The existing token+page already IS the party's durable identity link; extend it (with the `isExpired` fix noted in Common Pitfalls #1) rather than fork it. |

**Installation:**
```bash
npm install @docuseal/react
```
No server-side SDK package is required — DocuSeal's REST API is called via plain `fetch` from `lib/esign/docuseal.ts`, following the same "no vendor SDK imported" philosophy `lib/esign/provider.ts`'s existing header comment already states for Dropbox Sign.

**Version verification:** `@docuseal/react` confirmed on npm registry: version `1.0.75`, license `MIT`, published 2026-05-13, ~243k weekly downloads, `postinstall` script: none (verified via `npm view @docuseal/react scripts.postinstall` — empty). `@react-pdf/renderer` confirmed already at `^4.5.1` in `package.json`, matching the latest registry version.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@docuseal/react` | npm | published 2026-05-13 (current major version line; DocuSeal itself is a multi-year-old OSS project) | ~242,930/week | `github.com/docusealco/docuseal-react` | **OK** | Approved (`gsd-tools query package-legitimacy check` → `verdict: OK`, no postinstall script, real repo) |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

The package name `@docuseal/react` was discovered via WebSearch/training knowledge (no context7/exa MCP tool was available in this session — see Metadata section), so per the package-name-provenance rule it is tagged `[ASSUMED]` for the *name itself* despite passing the registry check, until cross-confirmed against DocuSeal's own docs page (`docuseal.com/docs/embedded/form/react`) — which WAS fetched directly and shows the identical package name and `DocusealForm` API, upgrading it to `[CITED: docuseal.com/docs/embedded/form/react]`.

## Architecture Patterns

### System Architecture Diagram

```text
 Initiator (artist)                Collaborator (party)
        │                                   │
        ▼                                   │
 SplitSheetBuilder (existing)                │
   → POST /api/split-sheets (draft)          │
   → POST /api/split-sheets/[id]/send-for-   │
     approval (existing, unchanged)          │
        │                                    │
        ▼                                    │
 split_sheets.status = 'pending_approval'    │
   per-party approval_token emailed ─────────┴──► /approve/[token]  (existing page,
                                                    THIS PHASE: gating-logic fix)
                                                         │
                                            approve ─────┼───── counter
                                                 │                 │
                                                 ▼                 ▼
                                   all approved? ──no──► split_sheets.status='countered'
                                        │yes                (renegotiating flag, tier 5)
                                        ▼
                     ┌─────────────────────────────────────────┐
                     │  NEW: mint-envelope step (this phase)    │
                     │  1. render split-sheet PDF               │
                     │     (lib/vault/pdf/split-sheet.tsx)       │
                     │  2. POST DocuSeal /templates/pdf          │
                     │     (per-submission generated template)   │
                     │  3. POST DocuSeal /submissions             │
                     │     (order='random' — parallel async)     │
                     │  4. INSERT esign_envelopes + …_signers     │
                     │  5. split_sheets.status='esign_pending'    │
                     │     (readiness tier → 10)                  │
                     └─────────────────────────────────────────┘
                                        │
                     fast lane (P17-01): initiator can enter here
                     directly from draft, skipping approval —
                     backfills split_sheet_parties.approval_status
                     ─────────────────────────────────────────────
                                        │
                                        ▼
                     /approve/[token] (SAME url, now shows the
                     embedded DocusealForm for this party's
                     esign_envelope_signers row)
                                        │
                     any party objects (P17-02) ──► void: archive
                     envelope, split_sheets.status → 'countered'/
                     'pending_approval', loop back to mint step
                                        │
                     all parties sign
                                        ▼
                     DocuSeal webhook: submission.completed
                                        │
                                        ▼
                     POST /api/webhooks/docuseal (NEW)
                       1. verify HMAC (X-Docuseal-Signature)
                       2. download combined_document_url +
                          audit_log_url (40-min-expiry URLs —
                          fetch immediately, re-upload to
                          release-documents bucket)
                       3. esign_envelopes.status='completed'
                       4. split_sheets.status='executed'
                       5. INSERT vault_documents (type='split_sheet',
                          status='signed', file_url=…, document_data.
                          esign={…}) — ONE ROW PER FUNŪN-ACCOUNT PARTY
                          (P17-06 fan-out)
                       6. trigger fires → calculate_vault_readiness()
                          → tier 15 (if vault_project_id set)
                       7. notifications: fully-executed, per party
                       8. offer write-back diff (P17-07) — never silent
```

### Recommended Project Structure

```
lib/esign/
├── provider.ts          # existing contract — extend EsignState.provider union
├── docuseal.ts           # NEW: DocuSealProvider implementing EsignProvider
└── webhook.ts            # NEW: HMAC verification + payload parsing (pure fn, testable)

lib/vault/pdf/
├── metadata-sheet.tsx    # existing precedent
├── credits-sheet.tsx     # existing precedent
└── split-sheet.tsx       # NEW: per-party rows incl. PRO/IPI + signature text-tag fields

lib/split-sheets/
├── approval.ts           # existing — token/validation helpers, UNCHANGED
├── envelopes.ts          # NEW: tier derivation, cap-check, fast-lane backfill helpers
└── reconciliation.ts     # NEW: split_sheet_parties ↔ composers[] diff (P17-07)

app/api/split-sheets/
├── [id]/send-for-approval/route.ts   # existing, unchanged
├── [id]/mint-envelope/route.ts       # NEW: fast-lane entry + post-consensus auto-mint
├── [id]/void/route.ts                # NEW: P17-02 any-party void
└── [id]/attach/route.ts              # NEW: P17-05 standalone-sheet attach-to-project

app/api/approve/[token]/route.ts      # existing — EXTEND: sign-phase actions alongside approve/counter
app/api/webhooks/docuseal/route.ts    # NEW: signature-verified webhook intake

app/approve/[token]/page.tsx          # existing — EXTEND: render embed when in esign_pending
components/split-sheets/
├── SplitApprovalView.tsx             # existing — EXTEND: post-approval sign step
└── SplitSheetSigningEmbed.tsx        # NEW: thin client wrapper around DocusealForm

supabase/migrations/
└── 062_split_sheet_esign_envelopes.sql   # NEW (AM-5: claims 062+)
```

### Pattern 1: Envelope/signer state as two new tables, not columns

**What:** `esign_envelopes` (one row per DocuSeal submission attempt: `id`, `split_sheet_id` FK, `docuseal_submission_id`, `status` — `pending`/`completed`/`voided`/`expired`, `order_mode`, `template_id`, `executed_file_path`, `audit_log_path`, `billed` (nullable bool — filled once the provider-gate answer is known), `created_at`, `voided_at`, `completed_at`) and `esign_envelope_signers` (`id`, `envelope_id` FK, `split_sheet_party_id` FK, `docuseal_submitter_id`, `signer_slug`, `status` — `pending`/`opened`/`completed`/`declined`, `opened_at`, `signed_at`).

**When to use:** Any time a split sheet is minted, re-minted after a void, or has its sign progress tracked per party.

**Example (schema sketch — planner finalizes exact columns/constraints):**
```sql
-- Source: pattern derived from migration 018_collaborators_split_sheets.sql's own
-- split_sheets/split_sheet_parties two-table shape, extended with a third
-- "attempt" layer to preserve void history (P17-02).
CREATE TABLE esign_envelopes (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  split_sheet_id         UUID REFERENCES split_sheets ON DELETE CASCADE NOT NULL,
  docuseal_submission_id TEXT,
  docuseal_template_id   TEXT,
  status                 TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'completed', 'voided', 'expired')),
  order_mode             TEXT NOT NULL DEFAULT 'random', -- parallel async signing (P17-01/-02)
  executed_file_path     TEXT,
  audit_log_path         TEXT,
  billed                 BOOLEAN, -- null until provider-gate answer confirms
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  voided_at              TIMESTAMPTZ,
  completed_at           TIMESTAMPTZ
);

CREATE TABLE esign_envelope_signers (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  envelope_id            UUID REFERENCES esign_envelopes ON DELETE CASCADE NOT NULL,
  split_sheet_party_id   UUID REFERENCES split_sheet_parties ON DELETE CASCADE NOT NULL,
  docuseal_submitter_id  TEXT,
  signer_slug            TEXT, -- the /s/{slug} DocuSeal embed source
  status                 TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'opened', 'completed', 'declined')),
  opened_at              TIMESTAMPTZ,
  signed_at              TIMESTAMPTZ
);

-- Server-owned writes only (mirrors migration 056's dm_threads hardening):
REVOKE INSERT, UPDATE, DELETE ON esign_envelopes FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON esign_envelope_signers FROM authenticated, anon;
-- SELECT policies scoped to initiator / party, mirroring split_sheet_parties' own
-- "Initiator sees all" + "Party sees own row" pair from migration 018.
```

### Pattern 2: PDF-then-envelope mint (DocuSeal per-submission generated template)

**What:** At mint time (unanimous approval, or fast-lane send), render the split sheet as a PDF with `@react-pdf/renderer` using DocuSeal's text-tag field syntax embedded directly in the rendered text (e.g. a signature line per party rendered as literal text `{{Signature;role=Party1;type=signature}}` at the correct PDF coordinates), `POST` it to `/templates/pdf` to create a one-off template, then `POST /submissions` against that `template_id` with `order: 'random'` (parallel async — matches P17-01/P17-02's days-apart signing requirement) and one `submitters[]` entry per party (`role` matching the tag, `email`, `name`).

**When to use:** Every mint and every re-mint after a void. This satisfies AM-2's "Funūn template only" guardrail by construction — the artist never supplies a PDF; Funūn's own renderer is the only path that ever reaches DocuSeal's template API.

**Example:**
```typescript
// Source: pattern combines lib/vault/pdf/credits-sheet.tsx's renderToBuffer()
// precedent with DocuSeal's documented PDF-API text-tag syntax
// (docuseal.com/docs/api — POST /templates/pdf).
import { renderToBuffer } from '@react-pdf/renderer'
import { SplitSheetDocument } from '@/lib/vault/pdf/split-sheet'

async function mintEnvelope(sheet: SplitSheetWithParties) {
  const pdfBuffer = await renderToBuffer(
    <SplitSheetDocument sheet={sheet} /> // embeds {{Signature;role=Party1;type=signature}}
                                          // text tags per party at each signature line
  )

  const templateRes = await fetch('https://api.docuseal.com/templates/pdf', {
    method: 'POST',
    headers: { 'X-Auth-Token': process.env.DOCUSEAL_API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Split sheet — ${sheet.song_name}`,
      documents: [{ name: 'split-sheet.pdf', file: pdfBuffer.toString('base64') }],
    }),
  })
  const template = await templateRes.json()

  const submissionRes = await fetch('https://api.docuseal.com/submissions', {
    method: 'POST',
    headers: { 'X-Auth-Token': process.env.DOCUSEAL_API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_id: template.id,
      order: 'random', // parallel — days-apart signing (P17-01/-02)
      submitters: sheet.parties.map(p => ({ role: p.roleTag, email: p.email, name: p.name })),
    }),
  })
  // … persist esign_envelopes + esign_envelope_signers rows from the response
}
```

### Pattern 3: Cross-account distribution via duplicate `vault_documents` rows

**What:** On webhook completion, `INSERT` one `vault_documents` row per party who has a Funūn account (`split_sheet_parties.user_id IS NOT NULL`), each scoped `user_id = party.user_id`, `type = 'split_sheet'`, `status = 'signed'`, all pointing at the SAME storage path (no file duplication — only the DB row is duplicated).

**When to use:** P17-06's "every party with an account gets it in their own locker" requirement.

**Example:**
```typescript
// Source: pattern follows the existing "Artists manage own documents"
// RLS policy (migration 001, USING (auth.uid() = user_id)) — no new
// policy or table needed; fan-out is a plain INSERT loop.
const accountHolders = envelope.signers.filter(s => s.splitSheetParty.user_id)
for (const signer of accountHolders) {
  await service.from('vault_documents').insert({
    project_id: sheet.vault_project_id, // NULL for standalone sheets (P17-05)
    user_id: signer.splitSheetParty.user_id,
    type: 'split_sheet',
    status: 'signed',
    signed_at: envelope.completed_at,
    file_url: executedFileUrl,
    document_data: {
      esign: {
        provider: 'docuseal',
        requestId: envelope.docuseal_submission_id,
        signers: envelope.signers.map(s => ({ name: s.name, email: s.email, status: 'signed' })),
        signedFileUrl: executedFileUrl,
        auditTrailUrl: auditLogUrl,
        completedAt: envelope.completed_at,
      },
    },
  })
}
```
This satisfies `vault_documents_status_requires_evidence_chk` (migration 045) automatically, since both `file_url` and `document_data.esign.completedAt` are populated.

### Pattern 4: Attach-later authorization (P17-05)

**What:** A standalone sheet's executed document can be attached to a vault project only when the acting user is BOTH (a) a party on the split sheet (initiator OR a signer with an account) AND (b) the owner of the destination project.

**Example:**
```typescript
// Source: pattern mirrors app/api/split-sheets/[id]/send-for-approval/route.ts's
// ownership-check-with-session-client-then-service-write structure (lines 19-37).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiClient = await createApiClient()
  const { data: { user } } = await apiClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { vault_project_id } = await request.json()

  // Party-or-initiator check (session client, RLS-scoped read)
  const { data: sheet } = await apiClient
    .from('split_sheets')
    .select('id, initiator_user_id, split_sheet_parties(user_id)')
    .eq('id', id)
    .maybeSingle()
  const isParty = sheet?.initiator_user_id === user.id ||
    sheet?.split_sheet_parties?.some((p: { user_id: string | null }) => p.user_id === user.id)
  if (!sheet || !isParty) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  // Target-project ownership check
  const { data: project } = await apiClient
    .from('vault_projects').select('id').eq('id', vault_project_id).eq('user_id', user.id).maybeSingle()
  if (!project) return NextResponse.json({ error: 'You do not own that project' }, { status: 403 })

  const service = createServiceClient()
  await service.from('split_sheets').update({ vault_project_id }).eq('id', id)
  await service.from('vault_documents').update({ project_id: vault_project_id })
    .eq('user_id', user.id).eq('type', 'split_sheet') /* scoped to this envelope's doc row */
  // → recompute triggers fire on vault_documents UPDATE, moving readiness (existing trigger)
}
```

### Pattern 5: Page-visit nudge tracking (P17-04)

**What:** A `viewed_at` (or `first_viewed_at`) TIMESTAMPTZ column on `split_sheet_parties` (or on `esign_envelope_signers` for the sign-phase view), set the first time `/approve/[token]` is rendered for that party, distinct from the DocuSeal `form.viewed` webhook (which only fires once the party reaches the DocuSeal-hosted embed, not Funūn's own page). A scheduled/cron-style check (or a lazy check on the initiator's next dashboard load) compares `viewed_at` against `NOW() - INTERVAL '3 days'` with `status = 'pending'` to decide whether to fire the nudge notification.

**When to use:** Distinguish "opened the Funūn link" (page-visit, per CONTEXT's explicit instruction — NOT email-open tracking) from "opened the DocuSeal embed" — these are two different systems and two different signals; P17-04 asks specifically for the former.

### Anti-Patterns to Avoid

- **Treating the DocuSeal webhook payload's document URLs as permanent:** `combined_document_url`/`audit_log_url` expire in ~40 minutes per DocuSeal's docs. The webhook handler must fetch and re-upload to Funūn's own storage (`release-documents` bucket) synchronously within the handler, not queue it for later.
- **Firing the mint step directly from the client:** all envelope creation must go through a server-owned route after the cap check (AM-2) and ownership check — never expose `DOCUSEAL_API_KEY` or allow a client to directly request a submission.
- **Letting the `readinessItemsForProject()` TS mirror drift from the SQL trigger:** these two implementations of the SAME scoring logic already exist as separate files (`lib/vault/readiness.ts` vs `calculate_vault_readiness()` in migration 016) — the phase's biggest single risk is these two derivations disagreeing after the P17-03 tiering change. Write one shared design doc/test fixture both must satisfy (see Validation Architecture).
- **Assuming a stable identity link between `split_sheet_parties` and `tracks.metadata.composers[]`:** none exists (verified — `Composer` type has no `collaborator_id`/`party_id` field). Any reconciliation code must match by normalized name and treat the result as a suggestion, never an automatic key.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Signature capture UI (draw/type/camera, mobile field wizard) | A custom `<canvas>` signature pad + PDF field overlay | `@docuseal/react`'s `DocusealForm` | Spike 006a already validated the bottom-sheet mobile wizard, camera-capture, and zero-redirect embed at 375px — re-building this is strictly worse and re-opens legal-defensibility questions the vendor already solves |
| Webhook signature verification | A custom HMAC scheme | Node's built-in `crypto.timingSafeEqual` against DocuSeal's documented `X-Docuseal-Signature` `[timestamp].[signature]` format | The scheme is simple but timing-attack-safe comparison and raw-body handling are easy to get subtly wrong; follow the vendor's documented algorithm exactly |
| Legal audit trail / certificate of completion | A custom "who signed when from what IP" log | DocuSeal's Certificate of Signature (separate PDF via `audit_log_url`) | This is the entire reason a hosted provider was chosen over hand-rolling e-sign (per `docs/e-sign-integration.md`'s original rationale) — do not partially reinvent it |
| Split-sheet PDF layout/rendering | A new from-scratch PDF library integration | `@react-pdf/renderer` (already a dependency), cloning `metadata-sheet.tsx`/`credits-sheet.tsx` structure | Zero new dependency; consistent styling/footer/branding across all three generated PDFs |
| Usage/spend telemetry for AM-3 | A dedicated metering/analytics table with running counters | Query `esign_envelopes` directly (`COUNT(*) WHERE status='completed' AND completed_at >= date_trunc('month', now())`) × the known per-doc rate | `esign_envelopes` is already the authoritative ledger of every mint attempt; a second counter table would just be a cache that can drift from it |

**Key insight:** This phase's actual net-new hand-rolled surface area should be small — two tables, one PDF renderer, one provider adapter, one webhook route, and a set of derivation-logic edits to two existing files. Everything with legal/compliance weight (signing, audit trail, tamper-evidence) is bought, not built.

## Common Pitfalls

### Pitfall 1: `/approve/[token]`'s expiry check will reject a party the moment they approve — breaking the reuse-the-same-link plan

**What goes wrong:** `app/approve/[token]/page.tsx:26-30` computes `isExpired` as true whenever `party.approval_status !== 'pending'`. The instant a party approves (or fast-lane-backfills), their `approval_status` becomes `'approved'`, so any subsequent visit to their OWN `/approve/[token]` link — which this phase needs to now show the signing embed — renders the "This link has expired" screen instead.
**Why it happens:** The check was originally written to prevent re-submission of an already-decided approval/counter action; it wasn't designed with a second lifecycle phase (signing) in mind.
**How to avoid:** Split the gating logic into two questions: "is the token itself expired/invalid" (unchanged: missing row, `token_expires_at < now`) vs. "what phase is this party in" (`pending` → approve/counter UI; `approved` + sheet in `esign_pending` → signing UI; `approved` + sheet still `pending_approval`/`countered` → a "waiting on other parties" state, not an error). This is a required code change in this phase, not incidental UI work.
**Warning signs:** Any manual test where a party approves, then clicks their own email link again expecting to sign, and instead sees an error page.

### Pitfall 2: Contract Locker cannot render standalone (projectless) documents today

**What goes wrong:** `app/(artist)/contracts/page.tsx:73-81` fetches documents by starting the query at `vault_projects` and nesting `vault_documents(...)` as a child selection, scoped `.eq('user_id', ...)` on the PROJECT owner. A `vault_documents` row with `project_id = NULL` (P17-05's standalone-sheet case) has no parent `vault_projects` row to be nested under, so it is invisible to this query no matter how correctly it's inserted.
**Why it happens:** Contract Locker was built when every document belonged to a project (Wave 2); split sheets decoupled from projects only in migration 018, and Contract Locker's query was never revisited.
**How to avoid:** Add a second, direct query — `vault_documents` filtered by `user_id = user.id AND project_id IS NULL` — and merge its rows into the same `rows` array Contract Locker already renders. This is new code, not a byproduct of the webhook/distribution work.
**Warning signs:** A standalone sheet executes successfully (webhook fires, `vault_documents` row inserted correctly) but never appears in the artist's Contract Locker UI.

### Pitfall 3: Two independent implementations of the same scoring logic must not drift

**What goes wrong:** `calculate_vault_readiness()` (SQL, migration 016) and `readinessItemsForProject()` (TypeScript, `lib/vault/readiness.ts`) are two hand-written implementations of overlapping logic. P17-03 requires editing BOTH to add tiering; if the tier boundaries or the "pessimistic across multiple split sheets per project" rule are implemented even slightly differently in each, the stored `vault_readiness_score` (0-100 headline number) and the on-screen breakdown chip for the same item will visibly disagree.
**Why it happens:** No shared source of truth or test fixture currently enforces parity between the two.
**How to avoid:** Write the tier-derivation rule ONCE as a design comment (in the migration and in the TS file, verbatim-matching) and add a Jest test (mirroring the existing `migration-061.test.ts` string-assertion pattern) that snapshots key CASE-clause SQL fragments, PLUS a small table-driven test in `readiness.test.ts` exercising the same scenarios both implementations must agree on.
**Warning signs:** A manually-tested project shows 15/15 overall but the split-sheets chip in the breakdown UI still shows "sent, awaiting" or vice versa.

### Pitfall 4: No collaborator↔composer identity link exists for reconciliation

**What goes wrong:** P17-07's write-back diff needs to compare `split_sheet_parties` (name, split %) against `tracks.metadata.composers[]` (name, split %), but `Composer` (`lib/metadata/schema.ts:64-74`) has no `collaborator_id` or `party_id` field — matching can only be done by name string comparison.
**Why it happens:** `composers[]` predates the collaborator-profile/split-sheet system (Wave 2 sequencing); Phase 4's identity reconciliation work (migration 026) links `collaborators` to `auth.users` via `claimed_by`, but never extended into the per-track `composers[]` JSONB.
**How to avoid:** Match by normalized (trim + case-fold) name as a best-effort default, but the diff UI must let the artist manually re-map any unmatched/ambiguous party to the correct composer row rather than silently guessing — consistent with P17-07's "never silent" mandate.
**Warning signs:** Two composers with similar names (or a composer entered with a middle initial in one place and not the other — the exact "legal name consistency" problem `docs/e-sign-integration.md` already documents) produce a false "no match" or a wrong match in the diff.

### Pitfall 5: Void-billing and voided-envelope-cap-counting are genuinely unknown, not just unverified

**What goes wrong:** P17-02 explicitly makes cap-counting conditional on whether DocuSeal bills for voided/archived submissions — and this research could not find that answer in public docs (no dedicated "void" endpoint was found at all; `DELETE /submissions/{id}` archives, `submission.archived` fires, but billing behavior on an incomplete-then-archived submission is undocumented).
**Why it happens:** This is exactly the kind of billing-edge-case vendors often don't document publicly, requiring account access to observe.
**How to avoid:** This is already flagged in `17-CONTEXT.md`'s Provider Verification Gate item 5 — do not let planning invent a specific cap-counting rule for voided envelopes; implement the cap-check logic behind a single named constant/config (`VOIDED_ENVELOPES_COUNT_TOWARD_CAP: boolean`) that Pete flips after the trial, rather than hard-coding an assumption into scattered call sites.
**Warning signs:** N/A pre-verification — this is a known-unknown, not a bug to catch.

### Pitfall 6: `@react-pdf/renderer` must run in the Node runtime, not Edge

**What goes wrong:** `renderToBuffer()` depends on Node-only APIs (fonts, buffers); if the mint-envelope API route is accidentally configured for the Edge runtime (or a future default changes), PDF generation will fail at runtime with an unhelpful bundler/runtime error.
**Why it happens:** Next.js 15 route handlers default to Node runtime, but it's easy to add `export const runtime = 'edge'` for latency reasons on other routes in the same app without realizing this one can't use it.
**How to avoid:** Do not add an `edge` runtime export to the mint-envelope route; mirror the existing export-pack route (`app/api/vault/[projectId]/export/route.ts`), which already renders PDFs successfully with the default Node runtime.
**Warning signs:** A cryptic build or runtime error referencing missing Node built-ins (`fs`, `stream`) inside the PDF renderer.

### Pitfall 7: Idempotent webhook handling — DocuSeal may retry delivery

**What goes wrong:** Most webhook providers (DocuSeal's docs do not explicitly rule this out) retry delivery on a non-2xx response or timeout; a naive handler that inserts `vault_documents` rows and fires notifications on every delivery could double-mint documents or double-notify on a retried `submission.completed` event.
**Why it happens:** Standard webhook-provider behavior; not unique to DocuSeal, but easy to overlook when building the FIRST live webhook integration in this codebase.
**How to avoid:** Make the handler idempotent on `docuseal_submission_id` — check `esign_envelopes.status = 'completed'` before doing any of the fan-out INSERT/notify work; if already completed, return 200 immediately without repeating side effects.
**Warning signs:** Duplicate notifications or duplicate `vault_documents` rows for the same envelope after a network blip.

## Code Examples

### Extending the existing `EsignProvider` contract for DocuSeal

```typescript
// Source: lib/esign/provider.ts (existing) — only the provider union and
// EsignState.provider type need extending; the interface itself is unchanged.
export type EsignState = {
  provider: 'dropbox_sign' | 'docusign' | 'docuseal' // ADD 'docuseal'
  requestId: string // maps to esign_envelopes.docuseal_submission_id
  signers: EsignSigner[]
  signedFileUrl?: string
  auditTrailUrl?: string
  completedAt?: string
}
```

### Readiness-tier derivation (SQL sketch — planner finalizes)

```sql
-- Source: pattern extends calculate_vault_readiness() (currently defined in
-- 016_release_distribution.sql). Pessimistic (MIN) tier across all split_sheets
-- rows tied to the project; falls back to the existing binary vault_documents
-- check so wet-sign uploads (AM-1 universal fallback) remain a valid path to 15.
DECLARE
  sheet_tier INTEGER;
BEGIN
  -- … existing variable declarations …

  SELECT MIN(
    CASE ss.status
      WHEN 'executed'         THEN 15
      WHEN 'esign_pending'    THEN 10
      WHEN 'countered'        THEN 5
      WHEN 'pending_approval' THEN 5
      ELSE 0 -- 'draft'
    END
  ) INTO sheet_tier
  FROM split_sheets ss
  WHERE ss.vault_project_id = project_uuid;

  SELECT COUNT(*) INTO doc_count FROM vault_documents
    WHERE project_id = project_uuid AND type = 'split_sheet' AND status = 'signed';

  IF doc_count > 0 THEN
    score := score + 15; -- legacy wet-sign-upload path, unchanged
  ELSIF sheet_tier IS NOT NULL THEN
    score := score + sheet_tier; -- new pipeline-aware tiering
  END IF;
  -- … remainder of function unchanged …
```

### Fast-lane backfill (P17-01)

```typescript
// Source: pattern — no direct precedent exists yet; sketch based on
// app/api/approve/[token]/route.ts's approve-action shape (lines 57-98).
async function fastLaneMint(sheetId: string, service: ReturnType<typeof createServiceClient>) {
  const now = new Date().toISOString()
  // Signature backfills approval — the fast lane's entire premise (P17-01):
  await service.from('split_sheet_parties')
    .update({ approval_status: 'approved', approved_at: now })
    .eq('split_sheet_id', sheetId)
  await service.from('split_sheets')
    .update({ status: 'esign_pending', all_approved_at: now }) // ENTERS at tier 10
    .eq('id', sheetId)
  // … proceed to mintEnvelope() (Pattern 2) …
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Upload-only e-sign (artist wet-signs offline, uploads PDF, marks signed) | Embedded, in-app e-signing via DocuSeal, with wet-sign upload retained as the universal fallback | This phase (2026-07-19 decision) | Wet-sign path is NOT removed — `signedOf()`/`calculate_vault_readiness()`'s existing `vault_documents`-based binary check stays valid; e-sign is an additive, faster path to the same 15 points |
| `split_sheets.status` enum: `draft`/`pending_approval`/`approved`/`countered` (migration 018) | Extended enum: `+ 'esign_pending'`, `+ 'executed'` | This phase | Any code with a hardcoded `VALID_STATUSES` allowlist (e.g. `app/api/split-sheets/[id]/route.ts:57`) must be updated or it will silently reject the new statuses on PATCH |
| Binary split-sheets readiness signal (0 or 15) | Tiered signal (0/5/10/15) | This phase (P17-03) | First readiness item in the codebase with intermediate tiers driven by pipeline state rather than a simple existence/completeness check — sets precedent for future items |

**Deprecated/outdated:** `docs/e-sign-integration.md`'s Dropbox Sign vs. DocuSign comparison (dated 2026-06-23) is superseded by the 2026-07-18/19 deliberation (`esign-split-sheet-economics.md`) and its DocuSeal spikes — that document's recommendation ("Start with Dropbox Sign") no longer reflects the locked decision (D-18b: DocuSeal for split sheets, SignWell for sync licenses, dual-provider). It remains useful only for the ESIGN/UETA legal-defensibility framing and the signer-copy/legal-name-consistency language, both of which are still directly relevant to this phase's PDF/signing UX.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@docuseal/react`'s exact prop set (`src`, `email`, `name`, `role`, `token`, `onComplete`) | Standard Stack, Code Examples | Low — this is a thin, actively-maintained wrapper; worst case is a minor prop-name correction during implementation. Confirmed against the official docs page directly (`docuseal.com/docs/embedded/form/react`), so risk is low despite `[ASSUMED]` package-name provenance tag. |
| A2 | DocuSeal's webhook event catalog (`form.viewed`, `form.started`, `form.completed`, `form.declined`, `submission.created`, `submission.archived`, `submission.completed`, `submission.expired`, `template.created`, `template.updated`) | Architecture Patterns, Common Pitfalls | Medium — if an event name is slightly wrong, the webhook route's event-type switch will silently no-op for that event type. Verify exact event names against the live webhook payload during the human provider-verification pass. |
| A3 | Whether voided/archived-but-incomplete DocuSeal submissions bill the $0.20 completion fee | Common Pitfalls #5, Open Questions | Medium/High for AM-2/AM-3 accuracy — already flagged as a Provider Verification Gate item in CONTEXT; do not implement a hardcoded assumption. |
| A4 | DocuSeal signer/embed links (per-submitter slugs) do not have their own independent expiry separate from the submission's `expire_at` | Common Pitfalls #1 (token lifecycle interplay) | Medium — if signer links DO expire independently and sooner than Funūn's 30-day approval token, a party could hit a dead DocuSeal-side link while their Funūn-side token is still valid, producing a confusing broken-embed state. Verify during the provider trial. |
| A5 | No rate limits are enforced on DocuSeal's hosted API at Funūn's expected volume (~10/mo/artist cap keeps aggregate volume low pre-AM-3) | Standard Stack | Low at current guardrail volume; revisit only if AM-3's $500/mo trigger fires. |

**If this table is empty:** N/A — assumptions exist and are itemized above; none should be treated as locked fact until the human provider-verification pass (already gated per CONTEXT) resolves A2-A4.

## Open Questions

1. **Does DocuSeal bill for voided/archived submissions before completion?**
   - What we know: `DELETE /submissions/{id}` archives a submission and fires `submission.archived`; no dedicated "void" endpoint was found in public docs.
   - What's unclear: Whether an archived-but-never-completed submission counts toward the $0.20/completed-document charge, and therefore whether it should count toward the AM-2 monthly cap.
   - Recommendation: Implement cap-counting behind a single named boolean config flag (see Common Pitfalls #5) that Pete sets after the provider-verification trial; do not block planning on this, but the planner should NOT hardcode "voids never count" or "voids always count" into scattered call sites.

2. **Does a DocuSeal per-submitter signing link (`/s/{slug}`) have its own expiry independent of the submission's `expire_at`?**
   - What we know: Submissions support an `expire_at` parameter at creation.
   - What's unclear: Whether an individual signer's link becomes invalid before the submission-level expiry (e.g., after some fixed TTL from when it was generated), which would interact with Funūn's own 30-day `approval_token` expiry in ways that need reconciling (see Common Pitfalls #1 / Assumption A4).
   - Recommendation: Verify during the human provider trial's 3-signer async test (already scheduled per CONTEXT's Provider Verification Gate); if signer links DO expire independently, the mint step should set `expire_at` generously (e.g. 30+ days) to outlast Funūn's own token window.

3. **How many split sheets can realistically exist per vault project, and does the "pessimistic MIN across all sheets" tiering rule (Code Examples) match the product's actual mental model?**
   - What we know: `split_sheets.vault_project_id` is a single nullable FK — nothing in the schema prevents multiple split sheets (e.g., one per track) from pointing at the same project.
   - What's unclear: Whether the phase's intent is "the project's readiness reflects its WORST split sheet" (this research's recommendation, consistent with `signedOf()`'s existing all-or-nothing philosophy) or some per-track weighted average.
   - Recommendation: Confirm the pessimistic-MIN interpretation with the CONTEXT owner before finalizing the trigger SQL — CONTEXT.md's P17-03 language ("all-approved-signatures-pending", "fully executed") reads singular/project-level, suggesting the common case is one sheet per project, but the schema doesn't enforce that.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `DOCUSEAL_API_KEY` (env var) | Envelope mint, PDF-template creation, document/audit-log fetch | ✗ (not yet configured — no live DocuSeal account exists in this codebase today) | — | None — this is the Provider Verification Gate's precondition; Pete creates the trial account before plan-phase execution per `17-CONTEXT.md` |
| `DOCUSEAL_WEBHOOK_SECRET` (env var, `whsec_...`) | Webhook HMAC verification | ✗ | — | None — obtained from the DocuSeal webhook config UI once the account exists |
| `NEXT_PUBLIC_APP_URL` | Building `/approve/[token]` links in emails | ✓ (already used by `send-for-approval/route.ts`) | — | — |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Nudge / notification emails | ✓ (already configured for existing send-for-approval and approve/counter notification emails) | — | — |
| `@docuseal/react` (npm package) | Embedded signing UI | ✗ (not yet installed) | 1.0.75 available on npm | None needed — trivial `npm install` |
| Supabase `release-documents` storage bucket | Storing executed PDF + Certificate | ✓ (bucket already exists, used by upload-signed-copy flow) | — | — |

**Missing dependencies with no fallback:**
- `DOCUSEAL_API_KEY` / `DOCUSEAL_WEBHOOK_SECRET` — blocks ALL live e-sign functionality until the human provider-verification trial account exists. This is already the explicit gate `17-CONTEXT.md` establishes between planning and execution; the plan itself can be written now, but no task in it can be *executed* against a real DocuSeal account until these exist.

**Missing dependencies with fallback:**
- None — `@docuseal/react` is a trivial install with no risk.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30.4.2 + ts-jest 29.4.11 (already configured, `npm test` runs `jest`) |
| Config file | `jest.config.js` |
| Quick run command | `npx jest __tests__/<new-file>.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P17-01 | Fast-lane mint backfills all parties to `approved` and sheet to `esign_pending` | unit | `npx jest __tests__/split-sheet-envelopes.test.ts -t "fast lane"` | ❌ Wave 0 |
| P17-02 | Void resets sheet to `pending_approval`/`countered` and marks envelope `voided` (not deleted — audit trail preserved) | unit | `npx jest __tests__/split-sheet-envelopes.test.ts -t "void"` | ❌ Wave 0 |
| P17-03 / impl | `calculate_vault_readiness()` migration SQL contains the tiered CASE mapping (string-assertion pattern, mirroring `migration-061.test.ts`) | unit (migration-string) | `npx jest __tests__/migration-062.test.ts` | ❌ Wave 0 |
| P17-03 / impl | `readinessItemsForProject()` returns matching tiers for the same fixture scenarios the SQL test uses | unit | `npx jest __tests__/readiness.test.ts -t "split_sheets tier"` | ❌ Wave 0 (existing `readiness.ts` has no test file today — confirmed via search) |
| P17-04 | Nudge fires only when `viewed_at` is set, party still `pending`, and `NOW() - viewed_at > 3 days` | unit | `npx jest __tests__/split-sheet-nudges.test.ts` | ❌ Wave 0 |
| P17-05 | Contract Locker's direct (non-project-nested) `vault_documents` query surfaces a `project_id IS NULL` row | integration (query-shape) | `npx jest __tests__/contracts-standalone-docs.test.ts` | ❌ Wave 0 |
| P17-06 | Webhook handler fan-out inserts one `vault_documents` row per account-holder party, zero for non-account parties | unit | `npx jest __tests__/docuseal-webhook.test.ts -t "fan-out"` | ❌ Wave 0 |
| P17-06 | Cap check blocks a 11th mint in a calendar month absent an admin override | unit | `npx jest __tests__/split-sheet-envelopes.test.ts -t "cap"` | ❌ Wave 0 |
| P17-07 | Reconciliation diff correctly flags mismatched normalized-name pairs and leaves `composers[]` untouched until confirmed | unit | `npx jest __tests__/split-sheet-reconciliation.test.ts` | ❌ Wave 0 |
| — | Webhook HMAC verification rejects tampered/stale (>5min) signatures | unit | `npx jest __tests__/docuseal-webhook-hmac.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** run the specific new test file for that task (`npx jest __tests__/<file>.test.ts`)
- **Per wave merge:** `npm test` (full suite — this codebase's suite is currently small enough that full-suite runs stay fast)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `__tests__/migration-062.test.ts` — string-assertion coverage of the new `esign_envelopes`/`esign_envelope_signers` migration + the tiered `calculate_vault_readiness()` redefinition (mirrors `migration-061.test.ts` pattern)
- [ ] `__tests__/readiness.test.ts` — currently does not exist for `lib/vault/readiness.ts` at all; this phase is the first to need one (table-driven fixtures covering all 4 tiers × both the legacy-upload-path and pipeline-path routes to 15)
- [ ] `__tests__/docuseal-webhook.test.ts` + `__tests__/docuseal-webhook-hmac.test.ts` — new webhook route needs both payload-parsing and signature-verification coverage; HMAC test can use Node's own `crypto` to construct valid/invalid signatures against fixture secrets, no live DocuSeal calls needed
- [ ] `__tests__/split-sheet-envelopes.test.ts`, `__tests__/split-sheet-nudges.test.ts`, `__tests__/split-sheet-reconciliation.test.ts`, `__tests__/contracts-standalone-docs.test.ts` — net-new unit coverage for the net-new `lib/split-sheets/envelopes.ts` and `lib/split-sheets/reconciliation.ts` modules and the Contract Locker query fix
- Framework install: none — Jest/ts-jest already fully configured project-wide

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | yes | Public `/approve/[token]` and the new sign-phase surface remain token-authenticated (no password), matching the existing 256-bit `crypto.randomBytes(32)` token scheme (`lib/split-sheets/approval.ts`) — do not weaken to a shorter/guessable token for the sign phase |
| V3 Session Management | partial | Initiator-side actions (mint, void, attach, cap-check) run through the normal Supabase session (`createApiClient()` + `auth.getUser()`), consistent with every other API route in this codebase |
| V4 Access Control | yes | Ownership checks BEFORE any service-role write, exactly matching `send-for-approval/route.ts`'s pattern (verify `.eq('initiator_user_id', user.id)` with the session client, THEN switch to `createServiceClient()`); the new attach-route (Pattern 4) needs a DOUBLE ownership check (party-of-sheet AND owner-of-target-project) |
| V5 Input Validation | yes | Webhook payload must be treated as untrusted input until HMAC-verified; cap value / `vault_project_id` / party IDs on all new routes validated server-side (never trust client-supplied `initiator_user_id` or `split_sheet_id` ownership) |
| V6 Cryptography | yes | HMAC-SHA256 webhook verification via Node's built-in `crypto.timingSafeEqual` — never a naive `===` string comparison (timing-attack surface); never hand-roll the HMAC algorithm itself |
| V9 Communication Security | yes | All DocuSeal API calls and webhook receipt occur over HTTPS by construction (DocuSeal's API is HTTPS-only); no additional control needed beyond standard TLS |
| V13 API and Web Service | yes | `DOCUSEAL_API_KEY` must be a server-only env var, never `NEXT_PUBLIC_*`; the client `DocusealForm` embed uses a `src`/`token` value scoped to one signer only, never the raw API key |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Webhook spoofing (attacker POSTs a fake `submission.completed` to mark an unpaid/unsigned sheet as executed) | Spoofing / Tampering | HMAC-SHA256 verification of `X-Docuseal-Signature` against the raw request body, using `DOCUSEAL_WEBHOOK_SECRET`; reject if signature invalid or timestamp >5 min old (per DocuSeal's own documented recommendation) |
| Webhook replay (a captured valid webhook payload re-sent later to re-trigger fan-out/notifications) | Tampering / Repudiation | Idempotency check on `docuseal_submission_id` + `esign_envelopes.status` before performing any side effect (Common Pitfalls #7); the 5-minute timestamp window in the HMAC check also bounds simple replay |
| Approval-token/sign-token confusion (a party's approval token, still valid, used to access another party's signing session) | Elevation of Privilege | The DocuSeal signer `src`/`token` value is minted server-side per `esign_envelope_signers` row and is never derived from or interchangeable with the Funūn `approval_token` — the Funūn token only gates WHICH page loads; DocuSeal's own signer link scopes WHO can sign |
| Cap/guardrail bypass (a user scripting repeated `POST /mint-envelope` calls to exceed the ~10/mo cap) | Elevation of Privilege / DoS (cost) | Server-side cap check inside the mint route itself (never client-enforced), counting `esign_envelopes` rows for the calendar month before allowing a new mint — this is a cost-control guardrail (AM-2), not just a UX nicety |
| Arbitrary-PDF injection (attempting to submit a non-Funūn-generated PDF as a "split sheet" template to bypass AM-2's template-only guardrail) | Tampering | The mint route ONLY ever calls `/templates/pdf` with a PDF buffer freshly rendered by `lib/vault/pdf/split-sheet.tsx` from server-side DB state — there is no code path where client-supplied file bytes reach the DocuSeal template API |

## Sources

### Primary (HIGH confidence — internal codebase, read directly)
- `supabase/migrations/018_collaborators_split_sheets.sql` — split_sheets/split_sheet_parties/collaborator_invites schema
- `supabase/migrations/016_release_distribution.sql` — canonical current `calculate_vault_readiness()` definition
- `supabase/migrations/045_pitch_token_expiry_document_status_guard.sql` + `049_validate_document_status_evidence_guard.sql` — `vault_documents` evidence-guard constraint
- `supabase/migrations/040_artist_profiles_column_privileges.sql`, `056_harden_dm_write_privileges.sql`, `058_trust_safety_schema.sql` — server-owned-write privilege doctrine
- `lib/esign/provider.ts`, `docs/e-sign-integration.md` — existing e-sign abstraction and its design intent
- `lib/split-sheets/approval.ts`, `app/api/split-sheets/route.ts`, `app/api/split-sheets/[id]/route.ts`, `app/api/split-sheets/[id]/send-for-approval/route.ts`, `app/approve/[token]/page.tsx`, `app/api/approve/[token]/route.ts`, `components/split-sheets/SplitApprovalView.tsx` — full approval pipeline
- `lib/vault/pdf/metadata-sheet.tsx`, `lib/vault/pdf/credits-sheet.tsx` — PDF renderer precedent
- `lib/vault/readiness.ts`, `app/(artist)/contracts/page.tsx` — readiness breakdown and Contract Locker query (the P17-05 gap)
- `lib/social/notifications.ts` — Phase 10 notification-type catalog
- `lib/storage/index.ts`, `lib/vault/documents.ts`, `lib/email/index.ts` — storage bucket and email-send helpers
- `lib/metadata/schema.ts` — `Composer` type (confirmed no collaborator_id linkage)
- `.planning/phases/17-split-sheet-esign/17-CONTEXT.md`, `17-DISCUSSION-LOG.md`, `.planning/deliberations/esign-split-sheet-economics.md`, `.planning/spikes/006a-docuseal-mobile-embed/README.md`, `.planning/spikes/007-docuseal-license-audit-trail/README.md` — locked decisions and verified spike findings
- `npm view @docuseal/react version license scripts.postinstall`, `npm view @react-pdf/renderer version` — registry verification

### Secondary (MEDIUM confidence — WebSearch/WebFetch cross-checked against official DocuSeal docs pages)
- [API Reference | DocuSeal Docs](https://www.docuseal.com/docs/api) — auth header, template/submission endpoints, order param, document/audit-log retrieval, 40-min URL expiry
- [Use Webhooks | DocuSeal Docs](https://www.docuseal.com/resources/use-webhooks) — HMAC-SHA256 scheme, `X-Docuseal-Signature` header format, 5-min staleness rule
- [Embedded Signing Form | DocuSeal Docs](https://www.docuseal.com/docs/embedded/form/react) / [React Document Signing | DocuSeal](https://www.docuseal.com/react-document-signing) — `DocusealForm` props
- [Download Signed Documents | DocuSeal Guides](https://www.docuseal.com/guides/download-signed-documents) — `combined_document_url` vs separate `audit_log_url`, temporary-URL behavior
- [Set signing order | DocuSeal Docs](https://www.docuseal.com/resources/set-signing-order), [Add multiple signing parties | DocuSeal Docs](https://www.docuseal.com/resources/add-multiple-signing-parties) — `order: 'preserved'|'random'`, order groups
- npm registry pages for `@docuseal/react` (v1.0.75, MIT) and `@docuseal/api` (v1.0.24, MIT)

### Tertiary (LOW confidence — WebSearch summary only, not cross-checked against a primary doc page)
- Void/archive billing behavior — no dedicated void endpoint or billing-on-archive documentation found; flagged throughout as an open question for the human provider-verification gate
- Exact DocuSeal API rate limits — no rate-limit documentation found in any searched source

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `@docuseal/react` and `@react-pdf/renderer` both verified directly against the npm registry; DocuSeal API shape cross-checked across 2+ official doc pages per claim
- Architecture: HIGH for the internal-codebase half (schema, privilege doctrine, existing routes all read directly with file:line citations); MEDIUM for the DocuSeal-side half (documented but not yet exercised against a live account)
- Pitfalls: HIGH — Pitfalls #1, #2, #3, #4, #6 are all derived from direct reads of existing source files, not inference; #5 and #7 are flagged explicitly as open/unverified rather than asserted

**Research date:** 2026-07-19
**Valid until:** ~14 days for the DocuSeal-API-specific claims (fast-moving vendor docs; also explicitly superseded once the human provider-verification trial runs) — 30 days for the internal-codebase findings (stable unless another phase lands first)
