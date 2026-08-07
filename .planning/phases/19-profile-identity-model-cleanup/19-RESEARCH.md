# Phase 19: Profile & Identity Model Cleanup - Research

**Researched:** 2026-07-23
**Domain:** Postgres/Supabase schema consolidation, data-rescue migrations, Next.js Settings/Contract-Locker UX, notification-driven correction workflow, PDF renderer callout
**Confidence:** HIGH — every claim below was verified by reading the live migration files and current runtime source in this repo, not by web search. This phase has no new external dependency; it is a closed-world refactor of code already in the tree.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Claim pre-fill confirmation (R2)**
- D-01: Confirmation surface = Settings, reusing Phase 18's legal-name confirm-and-lock pattern — pre-filled fields render in an "unconfirmed — review" state, with a gentle first-login nudge pointing there. No new modal or onboarding-step flow.
- D-02: Per-field confirm/edit (matches the legal-name lock granularity) — the user can fix one wrong value without rejecting the rest.
- D-03: Provenance is named — e.g. "We filled this from a credit [collaborator] added you to." Not a new disclosure: a claimed user can already see the sheets they're credited on.
- D-04: Pre-filled values are live-but-flagged — they populate the profile immediately (so a new split sheet isn't blank) but carry an "unconfirmed" flag until reviewed. Confirming clears the flag; the flag never gates the value out of the user's own new drafts.

**Correction flag flow (R4)**
- D-05: Flag entry point = the Contract Locker credit view (Phase 18 per-party view) — a "this info is wrong" action on the claimed user's own row, on a frozen (`esign_pending`/`executed`) sheet.
- D-06: Owner notified via both the Phase 10 in-app notification bell and email (Resend).
- D-07: Flag payload is a structured field + suggested value (P18-13 — no free-text channel).
- D-08: Guided apply — the notification deep-links to the sheet with the suggested change staged and the correct lifecycle step offered: void-first for `esign_pending`, start-amendment for `executed`. Never mutates the signed document or regenerates the PDF/Certificate directly.

**Licensee note (R5)**
- D-09: Placement = a boxed callout beside the parties/rights block on the split-sheet PDF (where the stale-able payee info is).
- D-10: Wording = the full version (working draft, pending counsel) — verbatim in Specific Ideas.
- D-11: Surfaces = the note appears on the generated PDF AND the read-only share/export views (travels with the record wherever a recipient sees it).

**Settings rights section (R1)**
- D-12: Keep the "Rights & Royalties" section; add one help line — "Used on your split sheets, metadata, and registrations." No regroup of the contact fields into a new section.

### Claude's Discretion
Exact "unconfirmed" badge styling, the Locker "this is wrong" affordance placement, R4 notification copy, and the R1 rescue migration's verification/log surface — follow existing patterns; not user-facing decisions.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. (The rename is already carved into Phase 20; Tier-2 payee snapshot and `industry_profiles` reconciliation are recorded as out-of-scope in the SPEC.)

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| R1 | Delete `user_profiles`, single rights input, re-point `claim_collaborators()` + `backfill_claimed_collaborators()`, semantic-blank data-rescue before drop | Exact current SQL of both functions read below; exact `artist_profiles` column inventory confirmed; ProfileForm.tsx's two rights forms located line-by-line; migration-sequencing pattern proposed |
| R2 | Confirmable reverse pre-fill on claim with per-field provenance + unconfirmed flag, idempotent | `claim_collaborators()`/collaborators schema read to identify exact pre-fillable source fields; Phase 18 legal-name lock pattern (`legal_name_locked_at`) read as the D-01 model to mirror; schema design options presented |
| R3 | Preserve `resolvePartyIdentity` live-link + freeze boundary through the table changes | `lib/split-sheets/live-identity.ts` and the `[id]/page.tsx` batch loader read in full; freeze boundary in `lifecycle.ts` confirmed unchanged (esign_pending/executed) |
| R4 | Flag-for-fix on frozen sheets, notify owner, guided apply into void/amendment, no cross-user writes | `ContractLocker.tsx`, `void/route.ts`, notification builder catalog (`lib/social/notifications.ts`), `createNotification()` (`lib/notifications/index.ts`) all read; **no existing "start amendment" route was found** — flagged as an open question below |
| R5 | Licensee note on newly-generated PDFs + read-only share/export views | `lib/vault/pdf/split-sheet.tsx` + `lib/split-sheets/agreement.ts` (`GUIDANCE_NOTES`) read; `/approve/[token]/page.tsx` located as the read-only share/export surface |

</phase_requirements>

## Summary

This phase is a pure internal refactor with zero new external dependencies: delete a duplicate identity table (`user_profiles`), rescue any data stranded in it into the real canonical table (`artist_profiles`), re-point two Postgres functions, remove a duplicate Settings form, and build three small, well-precedented features (a per-field "confirm this" UX that already exists once in this codebase for legal name; a structured correction-flag notification; a PDF callout box). Every one of R1–R5's supporting code paths already exists in the repo in a form the planner can directly imitate — this is a "find the twin, build the sibling" phase, not a greenfield build.

The single highest-risk element is **migration sequencing under the human-gated-push constraint**: `user_profiles` must never be dropped before (a) the semantic-blank rescue has copied stray data into `artist_profiles`, and (b) both `claim_collaborators()` and `backfill_claimed_collaborators()` no longer reference `user_profiles` at all (a function body change lands instantly on `CREATE OR REPLACE`, but the drop is destructive and irreversible without a rescue). This repo has *already* gotten this table wrong twice — migrations 026 (create) → 053 (defensive re-create after drift) — so a third pass deserves an explicit pre/post row-count log and a documented rollback story before Pete pushes it.

The second-highest-risk element is **R2's schema shape**: unlike R1's legal-name lock (one boolean sentinel, one composed field), R2 needs a **per-field** confirm state across up to six columns (`pro`, `ipi`, `publisher`, `contact_phone`, `mailing_address`, `administrator` — and arguably the four decomposed legal-name columns), each with its own provenance pointer back to a source `collaborators` row. A single new nullable `artist_profiles.claim_prefill JSONB` column (keyed by field name) is the natural fit — it follows this codebase's existing JSONB-for-structured-state convention (`mailing_address`, `sound_identity`, `open_to`) rather than adding six-plus new boolean/text columns.

**Primary recommendation:** stage three migrations in strict order — (1) rescue, logged; (2) re-point both functions + add R2's `claim_prefill` column; (3) drop `user_profiles` — author all three as separate files for auditability, push together in one human-gated checkpoint (matching this repo's migrations 066–070 precedent of stacking several files into one push event), and verify with `supabase migration list` (LOCAL=REMOTE) exactly as every prior phase has.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `user_profiles` deletion + data rescue | Database / Storage | — | Pure SQL migration; no app-tier logic needed beyond removing the two callers |
| Single rights input (Settings) | Frontend Server (SSR) + Browser | API / Backend | `ProfileForm.tsx` (client) posts to `/api/profile` (already the canonical write path); no new tier |
| `claim_collaborators()` / `backfill_claimed_collaborators()` re-point | Database / Storage | API / Backend (callers unchanged) | SQL function bodies change; `/api/claim-collaborators` and `/api/profile` callers need zero code changes since they call by RPC name |
| Confirmable reverse pre-fill (R2) | Database / Storage (SQL function extension) | Frontend Server (Settings UI) | The provenance write happens inside the claim SQL function (server-owned, atomic with claiming); the confirm/edit UI is a Settings client component mirroring the legal-name lock |
| Live-linked identity preservation (R3) | API / Backend (server component read) | — | `resolvePartyIdentity()` is a pure function called from `[id]/page.tsx`'s server component; only its `artist_profiles` read target needs to keep working, no tier change |
| Flag-for-fix + notification (R4) | API / Backend | Browser (Locker UI action) + Database (new flag table) | New POST route writes a structured flag row + calls `createNotification()` (bell) and `sendEmail()` (Resend) — both existing lib functions, no new tier |
| Guided apply (void/amendment deep-link) (R4) | Browser (deep-link routing) | API / Backend (existing void route) | Deep-links into the existing `/split-sheets/[id]` page with a query param staging the suggested value; void is the existing `POST .../void` route. **Amendment has no existing route — new API surface required (see Open Questions).** |
| Licensee note on PDF (R5) | Database-adjacent pure module (`lib/vault/pdf`) | Browser (share/export view) | `lib/split-sheets/agreement.ts` constants + `lib/vault/pdf/split-sheet.tsx` renderer (server-side, invoked by the mint route); the same string also needs to render in `/approve/[token]/page.tsx` (a React server component, Browser/SSR tier) |

## Standard Stack

No new libraries. This phase reuses the project's existing stack exclusively:

| Library | Version (installed) | Purpose here |
|---------|---------|--------------|
| Supabase (`@supabase/supabase-js`, `supabase` CLI) | 2.45.0 / 1.200.0 (from `package.json`) [VERIFIED: codebase] | Migrations, RLS, SECURITY DEFINER functions, `createServiceClient()`/`createApiClient()` |
| Next.js App Router | 15.0.0 [VERIFIED: codebase] | Settings/Locker/split-sheet server components, API routes |
| `resend` | 4.0.0 [VERIFIED: codebase] | R4's owner-notification email, via existing `lib/email/index.ts` → `sendEmail()` |
| `@react-pdf/renderer` | 4.5.1 [VERIFIED: codebase] | R5's PDF callout, added to the existing `lib/vault/pdf/split-sheet.tsx` |
| Jest / ts-jest | 30.4.2 / 29.4.11 [VERIFIED: codebase] | Regression tests for the freeze-boundary (R3), rescue-migration fixtures (R1), and idempotency (R2) |

### Alternatives Considered

None applicable — every requirement has a direct existing-pattern precedent in this codebase (see Architecture Patterns below), so introducing any new library would be a hand-rolled duplicate of infrastructure that already exists here.

**Installation:** none required.

## Package Legitimacy Audit

**Not applicable.** This phase installs zero external packages — it is a pure refactor of existing first-party code plus new Postgres migrations. The Package Legitimacy Gate is skipped per its own trigger condition ("whenever this phase installs external packages").

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────┐
                     │   Settings page (R1/R2)     │
                     │  app/(artist)/settings/     │
                     │  page.tsx + ProfileForm.tsx │
                     └───────────┬──────────────────┘
                                 │ PATCH (single rights input,
                                 │ EDITABLE_FIELDS allowlist)
                                 ▼
                     ┌─────────────────────────────┐
                     │  PATCH /api/profile          │◄──── R2 confirm/edit
                     │  (existing route, unchanged  │      also PATCHes here
                     │   allowlist + service client) │      (new confirm fields)
                     └───────────┬──────────────────┘
                                 │ UPDATE
                                 ▼
                     ┌─────────────────────────────┐
        signup ─────►│      artist_profiles        │◄──── R3 resolvePartyIdentity()
   (handle_new_user)  │  (canonical, single table)  │       reads THIS table live
        │              └───────────┬──────────────────┘
        │                          │ SELECT pro/ipi/publisher/
        ▼                          │ contact_phone/mailing_address/administrator
┌─────────────────────┐            │ (re-pointed, was user_profiles)
│ claim_collaborators()│───────────┘
│ (SECURITY DEFINER,   │
│  fires on signup +   │  UPDATE claimed_by, COALESCE-backfill collaborators,
│  /api/claim-         │  + NEW: write R2 provenance into
│  collaborators)      │  artist_profiles.claim_prefill JSONB
└──────────┬───────────┘
           │ SELECT rights fields FROM collaborators WHERE claimed_by = user
           ▼
  ┌─────────────────────┐        ┌──────────────────────────────┐
  │    collaborators     │        │  split_sheet_parties (frozen  │
  │  (roster rows added   │        │  snapshot at mint time)       │
  │  by OTHER artists)    │        └───────────┬────────────────────┘
  └─────────────────────┘                     │
                                                │ resolvePartyIdentity()
                                                │ (pre-mint: live-merge from
                                                │  artist_profiles; post-mint:
                                                │  frozen snapshot, UNCHANGED)
                                                ▼
                                   ┌──────────────────────────┐
                                   │ /split-sheets/[id] page   │
                                   │ (initiator builder +      │
                                   │  read-only party summary) │
                                   └──────────────────────────┘

  R4 flag flow (frozen sheets only):
  Contract Locker credit row ──"this is wrong"──► POST /api/split-sheets/[id]/
                                                    correction-flag (NEW route)
                                                    │ writes structured flag row
                                                    │ (new table, NOT split_sheet_parties)
                                                    ▼
                                       createNotification() bell + sendEmail()
                                                    │ deep-link with staged value
                                                    ▼
                                  esign_pending → existing void route
                                  executed      → NEW "start amendment" flow
                                                  (no existing route — gap)

  R5 note flow:
  lib/split-sheets/agreement.ts (new NOTE_TO_LICENSEES const)
        │                                   │
        ▼                                   ▼
  lib/vault/pdf/split-sheet.tsx      app/approve/[token]/page.tsx
  (mint-time PDF render)             (read-only share/export view)
```

### Recommended Project Structure (files touched, not created fresh)

```
supabase/migrations/
├── 071_user_profiles_data_rescue.sql      # NEW — semantic-blank rescue, logs counts
├── 072_repoint_claim_functions.sql        # NEW — re-point both functions + R2 claim_prefill column
└── 073_drop_user_profiles.sql             # NEW — DROP TABLE, only after 071+072 verified live

app/(artist)/settings/page.tsx             # remove UserProfile GET/type, keep single artist_profiles read
components/profile/ProfileForm.tsx         # DELETE Rights Identity section/state/handler; add D-12 help line;
                                            # add R2 per-field confirm UI (mirrors legal-name lock, lines 591-633)
app/api/user-profiles/route.ts             # DELETE (route removed entirely)
app/api/profile/route.ts                   # extend EDITABLE_FIELDS-adjacent confirm-flag write (R2, mirrors
                                            # the existing lock_legal_name signal pattern, lines 196-215)
app/api/claim-collaborators/route.ts       # unchanged — calls RPC by name, RPC body changes underneath it

app/api/split-sheets/[id]/correction-flag/route.ts   # NEW (R4)
supabase/migrations/07X_split_sheet_identity_flags.sql # NEW — flags table (R4)
components/contracts/ContractLocker.tsx    # add "this is wrong" affordance on claimed user's own row (R4)
lib/social/notifications.ts                # add buildIdentityCorrectionFlagNotification() (R4, mirrors
                                            # existing split_sheet_* builders, lines 35-40)

lib/split-sheets/agreement.ts              # add NOTE_TO_LICENSEES const (R5, mirrors GUIDANCE_NOTES, line 40)
lib/vault/pdf/split-sheet.tsx              # render the note as a boxed callout beside parties/rights (R5)
app/approve/[token]/page.tsx               # render the same note (R5 D-11 — read-only share/export surface)

__tests__/claim-collaborators-rpc.test.ts  # UPDATE — this test currently asserts migration 053's exact file
                                            # content as evidence the runtime table exists; it will keep
                                            # passing after the drop (file content is immutable) but stops
                                            # being true evidence of live behavior — add a companion test
                                            # against migration 072/073 instead (see Pitfall 5)
```

### Pattern 1: Semantic-blank rescue, canonical-wins

**What:** A migration that treats NULL, trimmed-empty string, and `'{}'::jsonb` as equivalently "blank," and only copies a stranded `user_profiles` value into `artist_profiles` when the canonical column is blank by that definition.
**When to use:** R1's rescue step, before the drop.
**Example (illustrative pattern — write as new migration 071):**
```sql
-- Source: this codebase's own convention (migrations 020/021/040/066/063) —
-- additive-only ALTER, IF NOT EXISTS guards, and a comment block explaining
-- the deploy story. No external reference; this is standard Postgres.
DO $$
DECLARE
  v_rescued_count INT := 0;
  v_stranded_count INT := 0;
BEGIN
  WITH candidates AS (
    SELECT up.id,
      up.pro, up.ipi, up.publisher, up.phone, up.mailing_address,
      up.display_name, up.bio,
      ap.pro AS ap_pro, ap.ipi AS ap_ipi, ap.publisher AS ap_publisher,
      ap.contact_phone AS ap_contact_phone, ap.mailing_address AS ap_mailing_address,
      ap.artist_name AS ap_artist_name, ap.bio AS ap_bio
    FROM public.user_profiles up
    JOIN public.artist_profiles ap ON ap.id = up.id
  )
  UPDATE public.artist_profiles ap SET
    pro = CASE WHEN COALESCE(TRIM(ap.pro), '') = '' THEN c.pro ELSE ap.pro END,
    ipi = CASE WHEN COALESCE(TRIM(ap.ipi), '') = '' THEN c.ipi ELSE ap.ipi END,
    publisher = CASE WHEN COALESCE(TRIM(ap.publisher), '') = '' THEN c.publisher ELSE ap.publisher END,
    contact_phone = CASE WHEN COALESCE(TRIM(ap.contact_phone), '') = '' THEN c.phone ELSE ap.contact_phone END,
    mailing_address = CASE
      WHEN ap.mailing_address IS NULL OR ap.mailing_address = '{}'::jsonb
        THEN COALESCE(c.mailing_address, ap.mailing_address)
      ELSE ap.mailing_address
    END,
    artist_name = CASE WHEN COALESCE(TRIM(ap.artist_name), '') = '' THEN c.display_name ELSE ap.artist_name END,
    bio = CASE WHEN COALESCE(TRIM(ap.bio), '') = '' THEN c.bio ELSE ap.bio END
  FROM candidates c
  WHERE ap.id = c.id;

  GET DIAGNOSTICS v_rescued_count = ROW_COUNT;

  -- Stranded-value count (SPEC AC line 3): rows where user_profiles had a
  -- non-blank value in ANY field that the canonical row was blank on —
  -- logged via RAISE NOTICE so it appears in the push output Pete reviews.
  SELECT COUNT(*) INTO v_stranded_count
  FROM public.user_profiles up
  JOIN public.artist_profiles ap ON ap.id = up.id
  WHERE (COALESCE(TRIM(up.pro), '') <> '' AND COALESCE(TRIM(ap.pro), '') = '')
     OR (COALESCE(TRIM(up.phone), '') <> '' AND COALESCE(TRIM(ap.contact_phone), '') = '')
     OR (up.mailing_address IS NOT NULL AND up.mailing_address <> '{}'::jsonb
         AND (ap.mailing_address IS NULL OR ap.mailing_address = '{}'::jsonb));
     -- extend with ipi/publisher/display_name/bio per the same shape

  RAISE NOTICE 'user_profiles rescue: % rows touched, % stranded-value rows found pre-rescue',
    v_rescued_count, v_stranded_count;
END $$;
```
This must run and be verified **before** migration 072 re-points the functions and **before** migration 073 drops the table — three separate files enforce this ordering by filename alone, and each can be independently reviewed by Pete at push time.

### Pattern 2: Re-point a SECURITY DEFINER function to a new source table

**What:** `CREATE OR REPLACE FUNCTION` with the body's `FROM public.user_profiles` changed to `FROM public.artist_profiles`, column names re-mapped (`phone` → `contact_phone`).
**When to use:** R1's `claim_collaborators()` and `backfill_claimed_collaborators()` re-point.
**Example:**
```sql
-- Source: this repo's migration 051 (which already re-created claim_collaborators()
-- once, for a schema-cache reason) — same CREATE OR REPLACE shape, new source table.
CREATE OR REPLACE FUNCTION public.claim_collaborators(
  p_user_id UUID,
  p_email   TEXT
)
RETURNS VOID AS $$
DECLARE
  v_pro TEXT; v_ipi TEXT; v_publisher TEXT; v_phone TEXT; v_address JSONB;
BEGIN
  UPDATE public.collaborators SET claimed_by = p_user_id
  WHERE LOWER(email) = LOWER(p_email) AND claimed_by IS NULL;

  -- RE-POINTED: was `FROM public.user_profiles`, now the canonical table.
  -- Column rename: phone -> contact_phone (R1 target).
  SELECT pro, ipi, publisher, contact_phone, mailing_address
    INTO v_pro, v_ipi, v_publisher, v_phone, v_address
    FROM public.artist_profiles
    WHERE id = p_user_id;

  IF FOUND THEN
    UPDATE public.collaborators
      SET pro = COALESCE(pro, v_pro), ipi = COALESCE(ipi, v_ipi),
          publisher = COALESCE(publisher, v_publisher),
          phone = COALESCE(phone, v_phone),
          mailing_address = COALESCE(mailing_address, v_address)
    WHERE claimed_by = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
```
Apply the identical transform to `backfill_claimed_collaborators()`. **Both must change in the same migration** — the SPEC's Edge Coverage table explicitly calls out "Missed reader" as a covered risk, because it was nearly missed once already (026 shipped only `claim_collaborators()`'s COALESCE-from-`user_profiles` pattern, and `backfill_claimed_collaborators()` mirrors it — both must move together).

### Pattern 3: Per-field confirm-and-lock (R2 — extends the legal-name model)

**What:** Legal name (migration 066) uses one sentinel (`legal_name_locked_at IS NOT NULL`) for one composed value. R2 needs the *same UX shape*, multiplied across several independent fields, each with a provenance string.
**When to use:** R2's Settings confirm UI.
**Recommended schema (new, part of migration 072):**
```sql
-- New nullable JSONB column, following this codebase's established
-- JSONB-for-structured-per-field-state convention (mailing_address,
-- sound_identity). Keyed by canonical field name; each entry:
--   { "confirmed": bool, "source_collaborator_id": uuid, "filled_at": ts }
-- A field absent from this map was never claim-pre-filled (either
-- user-entered from the start, or still blank) — the UI only shows the
-- "unconfirmed — review" badge for keys present with confirmed: false.
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS claim_prefill JSONB DEFAULT '{}';
-- PRIVATE column (migration 040 doctrine) — do NOT add to the GRANT
-- SELECT list; read/written server-side only, same posture as
-- legal_name_locked_at/administrator.
```
The claim function writes into this map (server-owned, atomic with the claim) only for fields it actually pre-fills; `/api/profile` PATCH clears an individual key's `confirmed` flag to `true` (or removes the key) when the user edits or explicitly confirms that field — mirroring the existing `lock_legal_name === true` signal-flag pattern in `app/api/profile/route.ts` (lines 196–215) rather than trusting a client-supplied JSON blob.

### Pattern 4: Structured correction flag, never free text (R4)

**What:** A new table (not a reuse of `split_sheet_parties`, which the flagged user has no write access to) holding `{ split_sheet_id, party_id, flagged_by, field, suggested_value, status, created_at }`.
**When to use:** R4's flag submission.
**Precedent to follow:** P18-13's "structured actions only" doctrine (`.planning/phases/17-split-sheet-esign/17-DUAL-ENTRY-DESIGN.md` §10c-ii) — the same table already documents this exact pattern for a different structured-action need ("propose amendment," "raise dispute"). No free-text field, ever — `field` is drawn from an allowlist (`pro | ipi | publisher | administrator | legal_name`), `suggested_value` is a plain string.

### Anti-Patterns to Avoid

- **Dropping `user_profiles` in the same migration as the rescue:** if the rescue's `UPDATE` has a bug, there is no data to re-derive from once the `DROP TABLE` in the same transaction/file also runs. Keep them in separate, separately-reviewable files (Pattern 1 vs. the drop).
- **Editing migration 026/051/053 in place:** historical migrations are immutable in this project (explicit Prohibition in the SPEC). Every change is `CREATE OR REPLACE` / `ALTER` / `DROP` in a *new* file — verified this is the pattern every prior 040/051/053/066 migration already follows.
- **Writing R2's `claim_prefill` confirm state from the client:** mirror the `lock_legal_name` boolean-signal pattern (server computes the timestamp/JSON, client only signals intent) — never accept a client-supplied provenance object, which would let a user fake "this was provided by someone else" as an excuse to bypass edit history.
- **Routing R4's "start amendment" through the mint-envelope route directly:** that route creates a NEW envelope for the CURRENT sheet; R4 needs a NEW split sheet (a genuine amendment record), not a re-mint of the existing one — see Open Questions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-field "needs review" UI | A new confirm-workflow component/library | Copy the existing legal-name lock block (`ProfileForm.tsx` lines 591–633) verbatim as the template, parametrized per field | It's already built, already styled, already has a router.refresh() pattern proven to work |
| Owner notification (bell + email) | A new notification pipeline | `lib/social/notifications.ts` builder + `lib/notifications/index.ts`'s `createNotification()` (already does bell insert + optional Resend email in one call) | Exactly this dual-channel pattern already exists for `split_sheet_countered` etc. |
| Cross-user "propose a change" record | A general-purpose comments/messaging table | A dedicated, narrowly-scoped flag table (Pattern 4) | P18-13 already ruled out free-text/messaging across a shared-document boundary for exactly this reason — reuse the doctrine, not the infra |
| Blank-detection logic for JSONB/text | A generic "isEmpty" utility library | Inline `COALESCE(TRIM(x), '') = ''` for text and `x IS NULL OR x = '{}'::jsonb` for JSONB, matching the SPEC's exact semantic-blank definition | The SPEC's definition is specific (NULL / trimmed-empty / empty-JSON) — a generic isEmpty() would treat other falsy shapes inconsistently |

**Key insight:** every sub-problem in this phase already has a live, working sibling somewhere in this codebase (legal-name lock, split-sheet notification builders, structured-actions doctrine). The work is disciplined imitation, not invention.

## Runtime State Inventory

> Triggered: this phase deletes a table (`user_profiles`) and re-points two DB functions — a data-migration phase.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `user_profiles` rows for any user who used the (buggy, rarely-discovered) "Rights Identity" Settings section — real PRO/IPI/publisher/phone/address/display_name/bio values that never reached `artist_profiles`. Exact row count is unknown until the rescue migration's `RAISE NOTICE` runs against the live remote DB. | **Data migration** (Pattern 1, migration 071) — must run and be verified before the drop. |
| **Live service config** | None found. No external service (DocuSeal, Resend, Stripe) stores a reference to the `user_profiles` table name or its columns. | None. |
| **OS-registered state** | None. No cron/task/pm2 process references this table. | None. |
| **Secrets/env vars** | None. No env var is named after `user_profiles` or its columns. | None. |
| **Build artifacts / generated types** | `types/index.ts` is hand-maintained (no `types/supabase.ts` generated-types file exists in this repo currently — `npm run db:types` is a manual, not-checked-in script) [VERIFIED: codebase, confirmed via file-not-found]. The `UserProfile` type is defined inline in `app/(artist)/settings/page.tsx` (lines 61–72) — a **code edit**, not a data migration, to delete. | **Code edit**: delete the `UserProfile` type, the `GET /api/user-profiles` server read in `settings/page.tsx`, and the entire `app/api/user-profiles/route.ts` file. |
| **Test fixtures asserting old behavior** | `__tests__/claim-collaborators-rpc.test.ts` reads migration files 051/052/053 as byte-content assertions (see Pitfall 5). These assertions will keep PASSING after the drop (file content is immutable) but no longer reflect the live schema. | **Code edit**: add a new test asserting migration 072/073's content instead; do not delete the old test (it correctly documents historical migration content). |

**Canonical question answered:** after every file in the repo is updated (functions re-pointed, Settings form removed), the only runtime system still holding old-shape data is the `user_profiles` table itself — which is precisely what the rescue-then-drop sequence exists to close out. Nothing external retains a reference.

## Common Pitfalls

### Pitfall 1: Dropping before both functions are re-pointed
**What goes wrong:** `backfill_claimed_collaborators()` (called from the old `/api/user-profiles` PATCH route, which R1 also deletes — but if sequencing is wrong, a race could hit it mid-cutover) still has `FROM public.user_profiles` in its body when the table is dropped, causing every future claim to error.
**Why it happens:** migration 026 added the table and both functions in one file, making it easy to forget the SPEC's explicit requirement that BOTH functions move together — this was already flagged as a specific Edge Coverage risk ("Missed reader") because `backfill_claimed_collaborators()` is easy to overlook since only one caller (`/api/user-profiles`) invokes it, and that caller is *also* being deleted in this same phase.
**How to avoid:** re-point both functions in the SAME migration file (072), and grep the whole repo for `user_profiles` immediately before authoring the drop migration (073) to confirm zero remaining references outside historical migration files.
**Warning signs:** any `grep -rn "user_profiles"` hit outside `supabase/migrations/026*`, `051*`, `053*` after R1's code changes land.

### Pitfall 2: Treating `user_profiles.bio`/`display_name` as unmapped
**What goes wrong:** assuming these two columns have "no home" on `artist_profiles` and dropping them silently.
**Why it happens:** the SPEC's prose describes `phone`→`contact_phone` as "the" rename, which draws attention away from `display_name`/`bio`.
**How to avoid:** `artist_profiles` already has a `bio` column (migration 001) — same name, direct semantic-blank rescue, no rename. `display_name` has no same-named column; the closest semantic equivalent is `artist_name` (both are the human-facing display name) — confirmed both are `TEXT` and both mean "what shows on the profile." The rescue migration (Pattern 1) maps `display_name` → `artist_name` explicitly, per the SPEC's own explicit instruction.
**Warning signs:** a rescue migration that only handles `pro`/`ipi`/`publisher`/`phone`/`mailing_address` and silently drops `display_name`/`bio` data.

### Pitfall 3: R2's provenance source is ambiguous without a join
**What goes wrong:** D-03's copy pattern is "We filled this from a credit [collaborator] added you to" — but `collaborators` rows don't carry a human-readable "who added this" name directly usable in that sentence; `collaborators.user_id` is the artist who OWNS the roster row (i.e., the person who credited/invited the claimed user), and their display name has to be joined from `artist_profiles.artist_name`. A naive implementation might instead surface the *song name* (`split_sheet_parties`/project title), which is a different (also plausible) sentence.
**Why it happens:** the CONTEXT.md decision names the placeholder `[collaborator]` without specifying whether it resolves to the inviting artist's name or the song/project title.
**How to avoid:** flagged explicitly below in Open Questions — resolve during planning or discuss-phase before writing the confirm UI copy.
**Warning signs:** the provenance sentence reads grammatically wrong at implementation time (e.g., "We filled this from a credit `null` added you to" when the collaborator row's owning artist has no display name set).

### Pitfall 4: "Amendment" has no existing route to route into (R4/D-08)
**What goes wrong:** D-08 says the guided-apply flow offers "start-amendment for executed" — but a repo-wide search (`grep -rln "amend"`) found this word ONLY in code comments and error-message copy (`lifecycle.ts` line 88, `[id]/page.tsx` line 51: "Amend with a new split sheet if terms change"). **There is no `/amend` route, no "create amendment" button, no linkage between an amendment sheet and the original it amends.** The current UX for "amending" an executed sheet is: the user manually creates an entirely new, unrelated split sheet from scratch.
**Why it happens:** prior phases (17/18) built the copy/messaging around the amendment concept but never built the mechanism, because nothing before Phase 19 needed to actually trigger one programmatically.
**How to avoid:** this is a genuine build item inside R4, not a "reuse existing" item — the planner needs a task to (a) decide whether an amendment sheet needs a new `amends_split_sheet_id` linkage column, or whether pre-filling a fresh `SplitSheetBuilder` draft with the flagged field corrected is sufficient for v1, and (b) build whatever deep-link target D-08 promises.
**Warning signs:** a plan that says "route to the amendment flow" without a task that builds that flow.

### Pitfall 5: Test-by-file-content doesn't catch behavioral drift
**What goes wrong:** `__tests__/claim-collaborators-rpc.test.ts` will continue to pass after `user_profiles` is dropped, because it asserts against the immutable historical migration FILE text (051/053), not live DB state. A reviewer skimming green CI could wrongly conclude the runtime table still exists.
**Why it happens:** this test was written as a "route and migration stay in sync" regression guard (see its own docstring), not as a live-schema assertion — Jest cannot execute PL/pgSQL against a real Postgres instance in this project's setup (confirmed: `jest.config.js` uses `ts-jest`/`babel-jest` with no DB integration).
**How to avoid:** add a NEW, clearly-named test asserting the current-state migration (072/073) contains `DROP TABLE`/`FROM public.artist_profiles`, so a future reader has an up-to-date behavioral anchor alongside the historical one.
**Warning signs:** none surfaced by the existing suite — this is a coverage gap, not a failing test, which is exactly why it's easy to miss.

### Pitfall 6: `mailing_address` blank-check must use `'{}'::jsonb`, not `IS NULL` alone
**What goes wrong:** both `artist_profiles.mailing_address` and (the doomed) `user_profiles.mailing_address` default to `'{}'::jsonb`, NOT `NULL` (confirmed: `DEFAULT '{}'` on both table definitions, migrations 021 and 026). A rescue check using only `IS NULL` will treat a freshly-created, still-unfilled `artist_profiles` row as "already has an address" (empty object is not null) and silently skip rescuing real data sitting in `user_profiles`.
**Why it happens:** Postgres JSONB defaults are easy to overlook when writing a blank-check condition by analogy to text columns.
**How to avoid:** always check `x IS NULL OR x = '{}'::jsonb` for this specific column, exactly as the SPEC itself calls out ("the `{}`-address... cases specifically covered").
**Warning signs:** the rescue migration's stranded-value count comes back as 0 for `mailing_address` even when test fixtures show real stranded addresses.

## Code Examples

### R2: confirm/edit signal pattern (mirrors the existing legal-name lock exactly)

```typescript
// Source: app/api/profile/route.ts lines 196-215 (existing, read this session)
// Applied pattern for R2 — one call per confirmed field, or a batch
// { confirm_fields: string[] } signal, following the same
// "server owns the timestamp, client only signals intent" discipline:
if (Array.isArray(body.confirm_prefill_fields)) {
  const { data: current } = await service
    .from('artist_profiles')
    .select('claim_prefill')
    .eq('id', user.id)
    .maybeSingle()

  const prefillMap = { ...(current?.claim_prefill as Record<string, unknown> ?? {}) }
  for (const field of body.confirm_prefill_fields as unknown[]) {
    if (typeof field === 'string' && field in prefillMap) {
      prefillMap[field] = { ...(prefillMap[field] as object), confirmed: true }
    }
  }
  update.claim_prefill = prefillMap
}
```

### R3: no code change needed — regression test to add

```typescript
// Source: lib/split-sheets/live-identity.ts (existing, read this session) —
// resolvePartyIdentity() is a pure function; R3's ENTIRE job is "don't break
// this." Add a regression test asserting the freeze boundary is unchanged
// post-R1, e.g.:
test('esign_pending and executed never live-resolve, even with a non-null claimedProfile', () => {
  const frozen = { pro: 'ASCAP', ipi: '1', publishing_designee: null, administrator: null, legal_name: 'A' }
  const claimed = { pro: 'BMI', ipi: '2', publishing_designee: null, administrator: null, legal_name: 'B' }
  expect(resolvePartyIdentity(frozen, claimed, 'esign_pending')).toEqual(frozen)
  expect(resolvePartyIdentity(frozen, claimed, 'executed')).toEqual(frozen)
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Two separate identity tables (`artist_profiles` complete, `user_profiles` thin duplicate written only by one obscure Settings section) | One canonical `artist_profiles`, all rights data | This phase (R1) | Fixes the "saved PRO reads None" bug and makes claim/backfill actually populate data going forward |
| Table re-created defensively twice already (`026` → `053` after live-schema drift) | N/A — being deleted, not repaired a third time | This phase | Removing the table removes the recurring drift-repair burden entirely |
| No amendment mechanism, only comment-text pointing users at "create a new sheet" | Still no amendment mechanism — R4 needs to build one | This phase (gap, see Pitfall 4) | Planner must budget a real task for this, not assume it exists |

**Deprecated/outdated:** `user_profiles` table and its two RLS-policy sets (026's original three, 053's replacement three) — both become historical-only after the drop; no code should reference them going forward except the immutable migration files themselves.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | R2's per-field confirm state is best modeled as a single new `artist_profiles.claim_prefill JSONB` column rather than N new boolean/text columns | Architecture Patterns, Pattern 3 | If the planner/user prefers a side table (e.g. `profile_field_provenance`) for query-ability or auditability, the migration and API shape both change; low risk to redo since it's additive-only, but worth confirming during planning, not assumed silently |
| A2 | The `[collaborator]` in D-03's provenance sentence resolves to the inviting artist's display name (`collaborators.user_id` → `artist_profiles.artist_name`), not the song/project title | Common Pitfalls, Pitfall 3 | If the intended meaning is "which song this credit came from," the join target and UI copy are different — this should be confirmed explicitly before implementation, flagged as Open Question 1 below |
| A3 | R4's "start-amendment" flow can ship as "pre-fill a brand-new draft `SplitSheetBuilder` with the corrected field, no formal `amends_split_sheet_id` linkage" for v1, since no linkage mechanism exists today and the SPEC doesn't explicitly require one | Common Pitfalls, Pitfall 4 | If the user actually wants amendment lineage tracking (which prior sheet this amends), that's a schema addition the planner needs to scope explicitly, not infer |

**If this table is empty:** N/A — see above.

## Open Questions

1. **R2 provenance source: inviting artist's name, or the song/project the credit came from?**
   - What we know: D-03's copy pattern is "We filled this from a credit [collaborator] added you to."
   - What's unclear: grammatically this could mean "[Jane Doe] added you to [a credit]" (name) or could be read as naming the song. The `collaborators` table's owning artist (`user_id`) is the most direct join target for a personal name; the split-sheet/project title would need an additional join through `split_sheet_parties.collaborator_id` → `split_sheets.song_name`.
   - Recommendation: resolve to the inviting artist's `artist_name` (A2 above) as the primary subject, and consider adding the song name as a parenthetical for extra clarity — but confirm the exact copy with the user/discuss-phase before the planner locks the UI string, since CONTEXT.md's `<specifics>` block only gives the pattern, not a worked example.

2. **R4's amendment mechanism: does it need a lineage column, or is a fresh unlinked draft sufficient for v1?**
   - What we know: no existing route or schema column links one split sheet to "the sheet it amends." The lifecycle copy has always told users to manually create a new sheet.
   - What's unclear: whether R4's "guided apply... start-amendment for executed" acceptance criterion is satisfied by simply deep-linking to "create new split sheet" pre-filled with the corrected value (no formal linkage), or whether the SPEC's intent requires a queryable `amends_split_sheet_id` relationship so a later viewer can trace "this sheet amends that one."
   - Recommendation: default to the lighter no-linkage version (A3) unless the planner's acceptance-criteria pass with the user surfaces a need for traceable lineage — building the FK is cheap to add later (additive migration) but expensive to retrofit onto already-created amendment sheets if skipped now.

3. **Where exactly does R4's flag table live, and does it need its own RLS?**
   - What we know: P18-13's structured-actions doctrine (17-DUAL-ENTRY-DESIGN.md §10c-ii) already anticipated "propose amendment" / "raise dispute" as needed mechanisms on a shared, possibly-blocked document; a new flags table is the natural continuation of that doctrine.
   - What's unclear: whether the flag table should be scoped per-`split_sheet_parties` row (tying a flag to the exact frozen snapshot at flag time) or per-`split_sheets` + `field` (simpler, but loses the "what did the flagger actually see when they flagged it" context).
   - Recommendation: scope to `split_sheet_parties.id` (the frozen party row) — it's the natural foreign key already available, is`NOT NULL` there, and the block-exception precedent (§10c) already establishes that co-parties on a shared executed document can see each other's rows regardless of any later block.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI (`supabase`) | Migration authoring + `supabase migration list` verification | ✓ [VERIFIED: codebase, `package.json` devDependency] | 1.200.0 | — |
| Live Supabase remote DB push access | R1's rescue/re-point/drop migrations | Requires Pete (human-gated per project constraint) | — | None — this is a hard human checkpoint by project convention, not a fallback-able gap |
| Resend API | R4's owner-notification email | ✓ [VERIFIED: codebase, `resend` in `package.json`, `lib/email/index.ts` exists] | 4.0.0 | — |
| `@react-pdf/renderer` (font-safe rendering, ESIGN-15) | R5's PDF callout | ✓ [VERIFIED: codebase, already used by `lib/vault/pdf/split-sheet.tsx`] | 4.5.1 | — |

**Missing dependencies with no fallback:** none — every dependency this phase needs is already installed and configured.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.4.2 + ts-jest 29.4.11 (transpile-only, `isolatedModules: true`) [VERIFIED: codebase] |
| Config file | `jest.config.js` (root) |
| Quick run command | `npx jest <path-to-test-file>` |
| Full suite command | `npm test` (`jest`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R1 | Semantic-blank rescue logic (NULL/''/`{}` treated as blank; canonical-wins) | unit (pure-function extraction of the blank-check + mapping logic, mirroring the pattern of `lib/split-sheets/change-summary.ts`'s tested pure functions) | `npx jest __tests__/rescue-semantic-blank.test.ts -x` | ❌ Wave 0 |
| R1 | `claim_collaborators()`/`backfill_claimed_collaborators()` re-point (file-content regression, same style as the existing RPC test) | unit | `npx jest __tests__/claim-collaborators-rpc.test.ts -x` | ✅ existing — needs new companion assertions for migration 072/073 |
| R1 | Settings renders exactly one rights input | manual UAT (no component-rendering test harness detected in this repo — confirmed no `@testing-library/react` in `package.json`) | — | manual-only, justified: no React component test infra exists in this project |
| R2 | Idempotent claim pre-fill (never overwrites confirmed/edited/non-blank; most-recent-wins on conflict) | unit (pure-function extraction of the "which source wins" decision, same style as `resolvePartyIdentity`'s existing unit tests) | `npx jest __tests__/claim-prefill.test.ts -x` | ❌ Wave 0 |
| R3 | Freeze boundary regression (esign_pending/executed never live-resolve) | unit | `npx jest lib/split-sheets/live-identity.test.ts -x` | ❌ Wave 0 — extend the existing `live-identity.ts` module with a co-located test file, following this repo's convention of `.test.ts` next to the source module (e.g. `lib/split-sheets/esign-invite.test.ts`) |
| R4 | No non-owner code path writes another user's `split_sheet_parties` row or `split_percentage`/`role` | unit + negative RLS test (mirrors `13-04`'s "RLS + route authorization negative test" precedent) | `npx jest __tests__/split-sheet-correction-flag.test.ts -x` | ❌ Wave 0 |
| R5 | Newly generated PDF contains the note; executed PDFs never regenerated | unit — byte-extraction test against real rendered PDF bytes (this repo's own precedent from ESIGN-15/P17-08: "no PDF-parsing dependency — Node zlib only") | `npx jest lib/vault/pdf/split-sheet.test.ts -x` | ✅ existing file — extend with the new assertion |

### Sampling Rate
- **Per task commit:** the single relevant test file above (`npx jest <file>`)
- **Per wave merge:** `npm test` (full suite; last known-green baseline per STATE.md: several hundred tests, "tsc/lint/build clean")
- **Phase gate:** full suite green + `npm run lint` + `tsc --noEmit` clean before `/gsd-verify-work`, matching every prior phase's gate in this project

### Wave 0 Gaps
- [ ] `__tests__/rescue-semantic-blank.test.ts` — pure-function unit tests for the semantic-blank detection + field-mapping logic that migration 071's SQL implements (extract the decision logic into a small TS helper purely for test coverage, since Jest cannot execute PL/pgSQL directly — same "structurally proxy-tested" approach this repo already uses for `coverage-fixtures.ts` per STATE.md's Phase 18-04 decision log entry)
- [ ] `__tests__/claim-prefill.test.ts` — R2 idempotency + most-recent-wins conflict resolution
- [ ] `lib/split-sheets/live-identity.test.ts` — R3 freeze-boundary regression (currently no test file exists for this module at all, despite it being load-bearing for R3)
- [ ] `__tests__/split-sheet-correction-flag.test.ts` — R4 cross-user-write negative test
- [ ] Migration companion test — extend `__tests__/claim-collaborators-rpc.test.ts` with assertions against the new migration 072/073 files (Pitfall 5)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Unrelated to this phase — no auth flow changes |
| V3 Session Management | no | Unrelated |
| V4 Access Control | **yes** | Every existing route this phase touches already uses the "session-verified ownership, service-role client only after the check" pattern (`app/api/profile/route.ts`); R4's new correction-flag route MUST follow the identical pattern — flagger authenticated via `createApiClient().auth.getUser()`, write scoped to a server-derived `flagged_by = user.id`, never a client-supplied id (mirrors `claim_collaborators()`'s own T-mass-assign mitigation) |
| V5 Input Validation | **yes** | R4's `field` value MUST be validated against an explicit allowlist (`pro | ipi | publisher | administrator | legal_name`) exactly like `EDITABLE_FIELDS` in `app/api/profile/route.ts`; R2's `confirm_prefill_fields` array must be filtered against `Object.keys(current.claim_prefill)`, never trusted blindly |
| V6 Cryptography | no | No crypto/secrets work in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-user write via a "flag" route that forgets to scope by `auth.uid()` | Tampering / Elevation of Privilege | R4's new route follows `claim_collaborators()`'s exact SECURITY DEFINER discipline: elevated-privilege writes are scoped strictly by a server-derived id (the flagging user's own `auth.uid()`, the frozen `split_sheet_parties.id` the flag targets), never a client-supplied party id |
| Free-text injection into a cross-user-visible notification | Tampering / Information Disclosure | P18-13's structured-actions doctrine already forecloses this — R4's flag payload is `{field, suggested_value}` from a closed set, no arbitrary message field, matching `createNotification()`'s existing `esc()` HTML-escaping discipline for the fields that ARE freeform (title/body) |
| Column-privilege bypass via direct PostgREST on `artist_profiles.claim_prefill` | Information Disclosure | New `claim_prefill` column must NOT be added to migration 040's `GRANT SELECT`/`GRANT UPDATE` lists — inherits private-by-default posture exactly like `legal_name_locked_at`/`administrator` (confirmed this is the established, correct pattern for every private column added since migration 040) |
| Stale/incomplete rescue silently loses PII | Repudiation (no audit trail of what was dropped) | The rescue migration's `RAISE NOTICE` pre/post + stranded-count log (Pattern 1) is the audit trail requirement the SPEC itself demands (AC line 3) — do not ship the rescue without it |

## Sources

### Primary (HIGH confidence — direct codebase reads this session)
- `supabase/migrations/001, 018, 020, 021, 026, 040, 051, 053, 063, 066` — exact table/column history, RLS policies, GRANT/REVOKE doctrine
- `lib/split-sheets/live-identity.ts`, `lib/split-sheets/lifecycle.ts`, `lib/split-sheets/agreement.ts` — resolver, freeze boundary, guidance-note precedent
- `app/(artist)/split-sheets/[id]/page.tsx`, `app/api/split-sheets/[id]/void/route.ts`, `app/approve/[token]/page.tsx` — read/authorization patterns, share/export surface
- `app/api/profile/route.ts`, `app/api/user-profiles/route.ts`, `components/profile/ProfileForm.tsx`, `app/(artist)/settings/page.tsx` — the exact duplicate-input bug and the legal-name lock precedent to mirror
- `lib/notifications/index.ts`, `lib/social/notifications.ts`, `lib/email/index.ts` — R4's notification/email infrastructure, already built
- `components/contracts/ContractLocker.tsx` — R4's flag entry surface
- `.planning/phases/17-split-sheet-esign/17-DUAL-ENTRY-DESIGN.md` §10c/§10c-ii — structured-actions doctrine R4 must follow
- `.planning/phases/19-profile-identity-model-cleanup/19-SPEC.md`, `19-CONTEXT.md` — locked requirements and decisions
- `.planning/STATE.md` — project decision history, prior-phase migration-sequencing precedent
- `package.json`, `jest.config.js` — installed dependency versions, test framework config

### Secondary (MEDIUM confidence)
None — no external documentation lookup was needed for this phase; every fact is grounded in this repo's own code.

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; every library version confirmed directly from `package.json`
- Architecture: HIGH — every pattern cited is a direct read of existing, working code in this repo
- Pitfalls: HIGH for R1/R2/R3/R5 (grounded in exact schema/code reads); MEDIUM-leaning-flagged for R4's amendment mechanism specifically, since it is a genuine gap requiring a design decision the planner must make explicit (see Open Questions 2–3)

**Research date:** 2026-07-23
**Valid until:** this research is tied to the exact current state of the codebase (migrations through 070); it becomes stale the moment any other in-flight phase lands a competing migration in the 071+ range or touches `artist_profiles`/`collaborators`/`split_sheet_parties`. Re-verify migration numbering immediately before authoring new migration files if significant time has passed.
