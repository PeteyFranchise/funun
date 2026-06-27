# Phase 01: Collaborator Profiles - Research

**Researched:** 2026-06-26
**Domain:** Supabase PostgreSQL schema, Next.js 15 App Router, React 18 client components, token-based approval flows, Resend email
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Each composer row in MetadataStudio gets a "pick from roster" button. The existing per-track Composer form stays unchanged — no replacement of the freeform entry, just an augmentation.
**D-02:** Picking a collaborator auto-fills: name, PRO, IPI, email, phone. Role (composer/lyricist/etc.) is always set per song — no default stored on the collaborator profile. Split is always set per song — never auto-filled.
**D-03:** If a collaborator's PRO or IPI is missing, the pick still proceeds but the composer row is flagged ("IPI missing — complete before export"). Missing-IPI triggers an email to both the collaborator and the artist on track save (not on export).
**D-04:** The collaborator email explains: what IPI is, why it matters for royalty collection, how to register with their PRO, and what to tell the artist when done. The artist email explains: what to do in Funūn once the collaborator has their IPI.
**D-05:** Missing-IPI warnings surface in two places: (1) the collaborator's card on the /collaborators roster page, and (2) the vault project readiness checklist.
**D-06:** The picker includes an inline "Add new collaborator" option — artist can create a new collaborator without leaving MetadataStudio. The new record saves to the global roster and auto-fills the row.
**D-07:** Rights-identity fields edited at the song level (IPI, PRO, publisher, email, phone) show an optional "Save to [Name]'s collaborator profile?" nudge. Split is always song-specific and never offered for global sync.
**D-08:** Missing-IPI email to the collaborator includes a proper Funūn invite link (not just a CTA/referral). The invite is a genuine invite flow, not just a signup redirect.
**D-09:** After a collaborator signs up via invite, they land on a view-only profile page showing the data the artist recorded for them. Includes a "flag a correction" link (mailto-style to the artist). Full self-edit access is deferred to a future phase.
**D-10:** New top-level `/collaborators` route in the artist layout sidebar (alongside /vault, /dashboard, etc.).
**D-11:** Layout: card grid — one card per collaborator with name, PRO, and IPI status badge. Cards with missing IPI display a warning badge.
**D-12:** Editing a collaborator opens an edit modal overlay (consistent with EditProjectForm pattern).
**D-13:** Signer rows with a "Select collaborator" dropdown per row. Selecting auto-fills name, email, PRO, IPI for that row. Inline creation of new collaborators is also available here.
**D-14:** Split sheet pre-fills split % to an even split (100% / number of collaborators) as a starting point.
**D-15:** In-app split approval flow in Phase 1. Once the artist sets splits, all collaborators receive an email with the proposed split breakdown and an approval link (token-based, no Funūn account required to respond).
**D-16:** On the approval page, a collaborator can either "Approve" or enter a counter-proposed split % and submit it. The artist is notified of approvals and counter-proposals and can iterate until all parties approve.
**D-17:** No default split % stored on the collaborator profile. Split is always song-specific.
**D-18:** Split sheets are decoupled from vault projects. `vault_project_id` is nullable on split sheets; project link is optional.
**D-19:** A split sheet can live in the contract locker of multiple parties. One source of truth, multiple viewers. Edits propagate to all parties.
**D-20:** Non-artist Funūn users can access split sheet creation. Entry point is the industry profile or a dedicated `/split-sheets` route accessible from their account.

### Claude's Discretion

- Exact UI treatment of the "Save to profile?" sync nudge (inline tooltip, small icon, dismissible banner)
- Token-based approval link implementation details (expiry, re-send mechanics)
- Exact email templates and copy for missing-IPI and split-approval notifications (beyond the content requirements described above)

### Deferred Ideas (OUT OF SCOPE)

- **Collaborator self-edit portal**: After signup, collaborators can update their own IPI, PRO, and contact info directly in Funūn. Deferred to a future phase — Phase 1 is view-only post-signup.
- **SMS signature confirmation**: Tied to Dropbox Sign (deferred to when paid account is active).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COLLAB-01 | Artist can create a collaborator profile with name, email, phone, PRO affiliation, IPI/CAE number, publisher, MLC/SoundExchange IDs, and mailing address | New `collaborators` table (migration 018); `app/api/collaborators/route.ts` POST handler; `CollaboratorForm` component |
| COLLAB-02 | Artist can edit and delete collaborator profiles from a global collaborators list | `app/api/collaborators/[id]/route.ts` PATCH + DELETE; edit modal following `EditProjectForm` pattern; `/collaborators` page |
| COLLAB-03 | When creating a split sheet or contract, artist can select collaborators from their saved list (auto-fills contact + rights data) | `CollaboratorPicker` component integrated into `ComposerEditor` (MetadataStudio) and `ContractLocker`; `SplitSheetBuilder` rework |
| COLLAB-04 | Collaborators are stored globally per artist (reusable across all vault projects) | `collaborators` table keyed by `user_id`; data returned by `GET /api/collaborators` and client-side cached in component state |
</phase_requirements>

---

## Summary

Phase 1 introduces a global collaborator roster system to Funūn. The work touches six functional areas: (1) a new `collaborators` database table and CRUD API, (2) a `/collaborators` roster page with card grid and edit modal, (3) a `CollaboratorPicker` component integrated into MetadataStudio's `ComposerEditor` and the ContractLocker signer rows, (4) a standalone split-sheet data model with a `split_sheet_parties` join table to support shared document visibility, (5) a token-based split approval email flow using the existing `sendEmail`/Resend setup, and (6) a collaborator invite flow backed by a `collaborator_invites` table with a post-signup view-only profile page.

The key architectural insight is that all of this is **additive** — no existing tables are mutated beyond adding readiness sub-checks. The collaborator roster is a new global entity keyed by `user_id` (matching the established pattern). Split sheets become a first-class standalone entity no longer tied to `vault_projects`, with a separate `split_sheet_parties` table giving every named collaborator visibility into the same record. The token-based approval flow requires no external signing vendor: approval tokens live in a `split_approval_tokens` table (or colocated in `split_sheet_parties`), and the approval page at `/approve/[token]` is a public, unauthenticated route.

**Primary recommendation:** Build in this sequence — DB migration → collaborator CRUD API → roster page → CollaboratorPicker component → MetadataStudio integration → split sheet rework → approval flow → invite flow → view-only collaborator profile page. This ordering lets each piece be independently testable before integrating the next.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Collaborator CRUD (create, edit, delete) | API / Backend | Database | Data validation, RLS enforcement, and mutation must happen server-side |
| Collaborator roster page (/collaborators) | Frontend Server (SSR) | Browser / Client | Page fetches collaborator list server-side; edit modal is client-side state |
| CollaboratorPicker (MetadataStudio, ContractLocker) | Browser / Client | API / Backend | Picker is an interactive overlay inside existing client components; fetches roster via GET API on mount |
| Split sheet data model (standalone) | Database / Storage | API / Backend | New `split_sheets` + `split_sheet_parties` tables; API enforces ownership and visibility rules |
| Split approval email + token | API / Backend | Database / Storage | Token generation and email dispatch in route handler; tokens stored in DB for validation |
| Token-based approval page (/approve/[token]) | Frontend Server (SSR) | Browser / Client | Server fetches and validates token; client form submits approve/counter |
| Collaborator invite flow | API / Backend | Database / Storage | Invite tokens generated server-side; `collaborator_invites` table tracks invite status |
| View-only collaborator profile (/collaborator/[token]) | Frontend Server (SSR) | — | Renders data the inviting artist captured; no client-side mutations |
| Missing-IPI readiness check | API / Backend | Database / Storage | Sub-check runs in `lib/vault/readiness.ts` against collaborator profiles; no new DB column needed |
| Industry split sheet entry point | Frontend Server (SSR) | Browser / Client | `/split-sheets` route under `app/(industry)/`; shares the same API as the artist flow |

---

## Standard Stack

### Core (no new packages — all from existing dependency set)
[VERIFIED: package.json in project root]

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.45.0 | Database CRUD, RLS, Storage | Already the project's data layer |
| `@supabase/auth-helpers-nextjs` | ^0.10.0 | `createApiClient()`, `createServerClient()` factories | Established auth pattern — all existing API routes use it |
| `next` | ^15.0.0 | App Router pages, API route handlers | Full-stack framework for all pages and APIs |
| `react` | ^18.3.0 | Client components (picker, form, modals) | UI layer |
| `zod` | ^3.23.0 | Input validation in API route handlers | Already used for validation throughout the project |
| `resend` | ^4.0.0 | Missing-IPI emails, split approval emails, invite emails | Existing `lib/email/index.ts` `sendEmail()` wrapper handles all three |
| Node.js `crypto` | built-in | Token generation (`crypto.randomBytes(32).toString('hex')`) | No external package needed; Node built-in confirmed available |

### No New Packages Required

This phase introduces zero new npm dependencies. Every capability needed (database, auth, email, validation, UI) is already in the installed stack. The token generation for approval and invite links uses Node.js built-in `crypto` — confirmed available.

**Package Legitimacy Audit:** N/A — no new packages.

---

## Architecture Patterns

### System Architecture Diagram

```
Artist browser
    |
    |-- GET /collaborators page
    |     └─ Server component fetches collaborators via createServerClient()
    |
    |-- GET /api/collaborators          ← list all collaborators for user
    |-- POST /api/collaborators         ← create new collaborator
    |-- PATCH /api/collaborators/[id]   ← edit collaborator
    |-- DELETE /api/collaborators/[id]  ← delete collaborator
    |
    |-- CollaboratorPicker (client component, embedded in MetadataStudio + ContractLocker)
    |     └─ Fetches GET /api/collaborators on mount
    |     └─ Posts to POST /api/collaborators for inline "Add new"
    |
    |-- POST /api/split-sheets          ← create split sheet (standalone, vault_project_id nullable)
    |-- POST /api/split-sheets/[id]/send-for-approval  ← send approval emails + create tokens
    |
    |-- Public route: GET /approve/[token]     ← collaborator approves or counter-proposes
    |-- Public route: POST /api/approve/[token] ← persist approval / counter
    |
    |-- POST /api/collaborators/[id]/invite  ← send invite email + create invite record
    |-- Public route: GET /join/[inviteToken]  ← post-signup landing (view-only profile)
    |
Database (Supabase PostgreSQL)
    |-- collaborators             (user_id FK, global roster)
    |-- split_sheets              (initiator_user_id FK, vault_project_id nullable)
    |-- split_sheet_parties       (split_sheet_id FK, user_id nullable, email, approval tokens)
    |-- collaborator_invites      (collaborator_id FK, inviting_user_id FK, token, status)
```

### Recommended Project Structure

```
app/
├── (artist)/
│   ├── collaborators/
│   │   └── page.tsx             # Roster page (server, fetches + renders CollaboratorRoster)
│   └── layout.tsx               # Add /collaborators nav item to ArtistNav ITEMS array
├── (industry)/
│   └── split-sheets/
│       └── page.tsx             # Industry split sheet initiation entry point
├── approve/
│   └── [token]/
│       └── page.tsx             # Public: split approval page (no auth required)
├── join/
│   └── [inviteToken]/
│       └── page.tsx             # Public: post-signup view-only collaborator profile
└── api/
    ├── collaborators/
    │   ├── route.ts             # GET (list), POST (create)
    │   └── [id]/
    │       ├── route.ts         # PATCH (edit), DELETE (delete)
    │       └── invite/
    │           └── route.ts     # POST (send invite email)
    ├── split-sheets/
    │   ├── route.ts             # GET (list visible), POST (create)
    │   └── [id]/
    │       ├── route.ts         # PATCH (edit), DELETE (delete — initiator only)
    │       └── send-for-approval/
    │           └── route.ts     # POST (send approval emails, create tokens)
    └── approve/
        └── [token]/
            └── route.ts         # POST (persist approve or counter-propose)

components/
├── collaborators/
│   ├── CollaboratorRoster.tsx   # Card grid, calls edit modal
│   ├── CollaboratorCard.tsx     # Name + PRO + IPI badge
│   ├── CollaboratorForm.tsx     # Create/edit form (modal overlay)
│   └── CollaboratorPicker.tsx   # Dropdown picker + inline "Add new" (reused in MetadataStudio + ContractLocker)
└── split-sheets/
    ├── SplitSheetBuilder.tsx    # Standalone split sheet creation form
    └── SplitApprovalView.tsx    # The approval page UI

lib/
├── collaborators/
│   └── index.ts                 # sanitizeCollaborator(), validateCollaboratorFields()
└── split-sheets/
    └── approval.ts              # generateApprovalToken(), validateApprovalTotal()

supabase/
└── migrations/
    └── 018_collaborators_split_sheets.sql
```

### Pattern 1: Global CRUD API (follows profile/route.ts model)

**What:** API routes with explicit EDITABLE_FIELDS allowlist, auth check via `createApiClient()`, Supabase RLS enforces per-user isolation.
**When to use:** All collaborator CRUD endpoints.

```typescript
// Source: app/api/profile/route.ts (existing pattern, [VERIFIED: codebase grep])
const EDITABLE_FIELDS = [
  'name', 'email', 'phone', 'pro', 'ipi',
  'publisher', 'mlc_id', 'soundexchange_id', 'mailing_address',
] as const

export async function POST(request: Request) {
  const supabase = createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as Record<string, unknown>
  const update = sanitizeCollaborator(body)
  if (!update.name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('collaborators')
    .insert({ ...update, user_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
```

### Pattern 2: CollaboratorPicker (augments ComposerEditor, not replaces)

**What:** A UI component rendered alongside the freeform composer row that opens a panel to select from the roster. On selection, patches the Composer state object with the collaborator's fields, leaving `role` and `split` untouched (D-02).
**When to use:** Inside `ComposerEditor` in MetadataStudio and in ContractLocker signer rows.

```typescript
// Source: components/vault/MetadataStudio.tsx ComposerEditor (existing, [VERIFIED: codebase read])
// The picker is injected per composer row alongside the existing freeform inputs:
function ComposerEditor({ composers, onChange, collaborators }: {
  composers: Composer[]
  onChange: (next: Composer[]) => void
  collaborators: CollaboratorProfile[]  // <-- new prop
}) {
  function pickCollaborator(i: number, collab: CollaboratorProfile) {
    onChange(composers.map((c, idx) =>
      idx === i
        ? { ...c, name: collab.name, pro: collab.pro ?? 'none', ipi: collab.ipi, email: collab.email, phone: collab.phone }
        : c
    ))
    // If IPI missing, flag row — email sent on track save (D-03)
  }
  // ...
}
```

### Pattern 3: Token-based Approval (no external dep)

**What:** On "Send for approval", server generates a 32-byte hex token per party, stores it in `split_sheet_parties.approval_token`, emails each collaborator a link to `/approve/[token]`. The approval page is public (no auth). On submit, API validates token, records status, notifies artist via `sendEmail`.
**When to use:** Split sheet approval flow (D-15, D-16).

```typescript
// Source: Node.js built-in crypto ([VERIFIED: runtime check])
import { randomBytes } from 'crypto'
const token = randomBytes(32).toString('hex')
// Stored in split_sheet_parties.approval_token (expires_at: NOW() + 30 days)
```

### Pattern 4: Invite Flow

**What:** On missing-IPI save, server generates an invite token, inserts into `collaborator_invites`, and sends email to collaborator via `sendEmail`. The invite link points to Funūn's standard `/signup?invite=[token]`. Post-signup middleware detects the `invite` param, looks up the record, and redirects to `/join/[inviteToken]` which shows the view-only profile page.
**When to use:** D-08, D-09.

### Anti-Patterns to Avoid

- **Replacing ComposerEditor:** The picker augments the existing freeform form. Do not rewrite or replace ComposerEditor — the add-writer button and freeform fields remain fully functional (D-01).
- **Storing split % on the collaborator profile:** Never add a `default_split` field to the `collaborators` table. Split is always song-specific (D-17).
- **Tying split sheets to `vault_projects` as required:** `vault_project_id` must be nullable — split sheets are standalone (D-18).
- **Requiring Funūn auth on the approval page:** `/approve/[token]` must be accessible without login. The middleware's `isProtected` list must NOT include this route (D-15).
- **Sending IPI-missing emails on export:** Emails trigger on track save, not on export (D-03).
- **Using `artist_id` as the FK:** The existing codebase uses `user_id` throughout (e.g., `vault_projects.user_id`, `tracks.user_id`). The `collaborators` table must also use `user_id` so non-artist users (industry pros) can maintain a roster (D-18, D-20).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email delivery | Custom SMTP client or queue | `lib/email/index.ts` `sendEmail()` | Already wraps Resend with no-op safety for unconfigured keys; handles from-address and error returns |
| Approval token generation | UUID v4 or Math.random() | `crypto.randomBytes(32).toString('hex')` | Cryptographically secure; UUID is shorter and carries format risk; no package needed |
| RLS per-user data isolation | Manual WHERE clauses | Supabase RLS policies | Existing pattern; all tables use RLS. Adding `WHERE user_id = auth.uid()` in policies means the API never needs to filter manually |
| Split % validation (totals to 100) | Ad-hoc number check | Extend existing `buildSplitSheet()` in `lib/tools/splitsheet.ts` | Already normalizes contributor percentages and validates total === 100 |
| PRO enum | New string constants | `PRO`, `PRO_LABELS`, `PRO_VALUES` from `lib/metadata/schema.ts` | Already covers all major PROs including ASCAP, BMI, SESAC, GMR, SOCAN, GEMA, etc. |
| Modal overlay pattern | Custom dialog | Follow `EditProjectForm.tsx` pattern | Existing modal uses `useState(open)` + absolute-positioned overlay; consistent with design system |

**Key insight:** This phase is almost entirely integration and data-modeling work. The email, validation, PRO constants, and modal patterns are all pre-built — the job is wiring them to new tables and routes.

---

## Database Schema Design

[ASSUMED: based on codebase analysis and established Supabase patterns]

### Migration 018: collaborators + split_sheets

Key design decisions verified against existing schema:
- `user_id` FK (not `artist_id`) — matches every other table in the schema [VERIFIED: codebase read of 001_initial_schema.sql]
- `split_sheets.vault_project_id` nullable — standalone entity per D-18 [VERIFIED: CONTEXT.md D-18]
- RLS on all new tables — matches established pattern [VERIFIED: codebase read]
- `collaborator_invites.invited_email` stored separately — the collaborator may not have a `user_id` yet at invite time [ASSUMED]

```sql
-- collaborators: global roster per user
CREATE TABLE collaborators (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name             TEXT NOT NULL,
  email            TEXT,
  phone            TEXT,
  pro              TEXT,          -- matches PRO type from schema.ts
  ipi              TEXT,          -- IPI/CAE number
  publisher        TEXT,
  mlc_id           TEXT,          -- MLC (The MLC) member ID
  soundexchange_id TEXT,
  mailing_address  JSONB DEFAULT '{}',  -- structured: street, city, state, zip, country
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE collaborators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own collaborators" ON collaborators
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_collaborators_user_id ON collaborators (user_id);

-- split_sheets: standalone, decoupled from vault_projects
CREATE TABLE split_sheets (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  initiator_user_id   UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  vault_project_id    UUID REFERENCES vault_projects ON DELETE SET NULL, -- nullable (D-18)
  song_name           TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'pending_approval', 'approved', 'countered')),
  all_approved_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE split_sheets ENABLE ROW LEVEL SECURITY;
-- Initiator manages their own split sheets
CREATE POLICY "Initiator manages split sheet" ON split_sheets
  USING (auth.uid() = initiator_user_id) WITH CHECK (auth.uid() = initiator_user_id);
-- Party members can view split sheets they are named on (D-19)
CREATE POLICY "Parties can view split sheets" ON split_sheets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM split_sheet_parties
      WHERE split_sheet_id = split_sheets.id AND user_id = auth.uid()
    )
  );

-- split_sheet_parties: one row per named party, links to split_sheets (D-19)
CREATE TABLE split_sheet_parties (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  split_sheet_id    UUID REFERENCES split_sheets ON DELETE CASCADE NOT NULL,
  collaborator_id   UUID REFERENCES collaborators ON DELETE SET NULL, -- null if not in roster
  user_id           UUID REFERENCES auth.users ON DELETE SET NULL,    -- null until they sign up
  name              TEXT NOT NULL,      -- snapshot at time of creation (denormalized)
  email             TEXT,
  pro               TEXT,
  ipi               TEXT,
  split_percentage  NUMERIC(6,3) NOT NULL CHECK (split_percentage >= 0 AND split_percentage <= 100),
  role              TEXT,               -- lyrics, melody, production, etc.
  approval_status   TEXT NOT NULL DEFAULT 'pending'
                    CHECK (approval_status IN ('pending', 'approved', 'countered')),
  counter_proposal  NUMERIC(6,3),       -- filled if countered
  approval_token    TEXT UNIQUE,        -- 64-char hex token for approval link (D-15)
  token_expires_at  TIMESTAMPTZ,
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE split_sheet_parties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Initiator sees all parties" ON split_sheet_parties
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM split_sheets
      WHERE id = split_sheet_parties.split_sheet_id AND initiator_user_id = auth.uid()
    )
  );
CREATE POLICY "Party sees own row" ON split_sheet_parties
  FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_split_sheet_parties_sheet_id ON split_sheet_parties (split_sheet_id);
CREATE INDEX idx_split_sheet_parties_token    ON split_sheet_parties (approval_token);

-- collaborator_invites: tracks invite emails sent (D-08)
CREATE TABLE collaborator_invites (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collaborator_id   UUID REFERENCES collaborators ON DELETE CASCADE NOT NULL,
  inviting_user_id  UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  invited_email     TEXT NOT NULL,
  invite_token      TEXT UNIQUE NOT NULL, -- 64-char hex
  token_expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'expired')),
  accepted_user_id  UUID REFERENCES auth.users ON DELETE SET NULL,
  sent_at           TIMESTAMPTZ DEFAULT NOW(),
  accepted_at       TIMESTAMPTZ
);

ALTER TABLE collaborator_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Inviting user manages invites" ON collaborator_invites
  USING (auth.uid() = inviting_user_id) WITH CHECK (auth.uid() = inviting_user_id);
CREATE INDEX idx_collaborator_invites_token ON collaborator_invites (invite_token);
CREATE INDEX idx_collaborator_invites_collab_id ON collaborator_invites (collaborator_id);
```

---

## Common Pitfalls

### Pitfall 1: Approval Page Must Be Publicly Accessible

**What goes wrong:** Developer adds `/approve` to the `isProtected` list in middleware, causing unauthenticated collaborators to be redirected to `/signin` instead of seeing the approval form.
**Why it happens:** The middleware currently protects routes by prefix. A new `/approve` route is easy to accidentally include.
**How to avoid:** Ensure `/approve` is NOT in the `isProtected` list in `middleware.ts`. Verify by testing with a fresh incognito session — the approval page must render without a login session.
**Warning signs:** Collaborator clicks approval link, lands on `/signin`, can't proceed without creating an account.

### Pitfall 2: Split Total Validation Skipped on Counter-Proposals

**What goes wrong:** Artist saves a counter with percentages that sum to something other than 100%. The system accepts it and data becomes invalid.
**Why it happens:** Counter-proposals come from an unauthenticated form; easy to skip server-side re-validation.
**How to avoid:** The `POST /api/approve/[token]` handler must re-validate that all party percentages across the split sheet sum to 100 before persisting a counter-proposal. Use the existing `buildSplitSheet()` validation logic or a new equivalent in `lib/split-sheets/approval.ts`.
**Warning signs:** A split sheet shows 95% total or 110% total after a counter is submitted.

### Pitfall 3: Denormalized Party Data Stale After Collaborator Edit

**What goes wrong:** An artist edits a collaborator's name or email after a split sheet is created. The `split_sheet_parties` row still shows the old snapshot. The split approval email goes to the wrong address.
**Why it happens:** `split_sheet_parties.email` and `split_sheet_parties.name` are snapshots (denormalized) taken at creation time to decouple the split sheet from later collaborator edits.
**How to avoid:** This is intentional — split sheets are legal snapshots, not live references. Document clearly in code. If the artist needs to fix a party's contact info post-creation, provide a dedicated PATCH on `split_sheet_parties.email` rather than auto-syncing from the collaborator profile.
**Warning signs:** None — this is by design, but failing to document it causes future confusion.

### Pitfall 4: Missing-IPI Email Sent on Every Save

**What goes wrong:** If the IPI-missing check fires every time a track is saved (even when the email was already sent), collaborators receive the same educational email repeatedly.
**Why it happens:** The track save handler checks IPI on every PATCH, not just on the first save where IPI is absent.
**How to avoid:** Gate the email send on a state transition: only send when a composer row is newly missing IPI (i.e., the collaborator was just picked from the roster and IPI was absent at pick time), or when a collaborator's IPI transitions from present to absent. A simple approach: track a `ipi_notification_sent_at` in the `collaborator_invites` table and skip the email if one was sent in the last 24 hours for that pair (collaborator + artist).
**Warning signs:** Collaborator reports getting the same IPI-explanation email five times.

### Pitfall 5: `user_id` vs. `artist_id` Confusion

**What goes wrong:** The new `collaborators` table is created with `artist_id` FK instead of `user_id`, breaking the data model for non-artist users (producers, songwriters) who want to maintain their own roster (D-20).
**Why it happens:** The `STATE.md` initial notes say "Collaborators table keyed by `artist_id`, global across projects" — this is stale. The CONTEXT.md D-20 and code context section override this.
**How to avoid:** Use `user_id` (references `auth.users`) throughout. The `STATE.md` entry is outdated — the CONTEXT.md is the authoritative locked decision.
**Warning signs:** Industry users can't see their collaborator roster; API returns 401/403 for non-artist accounts.

### Pitfall 6: SplitSheet Tool vs. New Split Sheet Model

**What goes wrong:** The existing `lib/tools/splitsheet.ts` produces a `SplitSheetData` written to `vault_documents.document_data` via the tool output system. Phase 1's new standalone split sheet model (`split_sheets` table) is a separate entity. If the planner conflates these, tasks will either rewrite the existing tool unnecessarily or fail to build the new standalone model.
**Why it happens:** Both are called "split sheets" but serve different architectural roles.
**How to avoid:** The new `split_sheets` table is the Phase 1 entity for the collaborative approval flow (D-18, D-19). The existing SplitSheet tool (`lib/tools/splitsheet.ts`, stored as `vault_documents`) is a separate, pre-existing document artifact. Phase 1 does NOT replace the existing tool — it adds a parallel standalone model. The planner should keep these distinct in task scope.
**Warning signs:** Tasks that say "rewrite `lib/tools/splitsheet.ts`" — that module should not change in Phase 1.

---

## Integration Points (Critical for Planning)

### 1. ArtistNav — Add /collaborators

**File:** `components/nav/ArtistNav.tsx`
**Change:** Add one entry to the `ITEMS` array:
```typescript
{ href: '/collaborators', label: 'Collaborators', match: '/collaborators', Icon: CollaboratorsIcon }
```
A new icon component (SVG) is needed; follow the same pattern as `VaultIcon`, `LockerIcon`, etc. in `./icons`.

### 2. MetadataStudio — Augment ComposerEditor

**File:** `components/vault/MetadataStudio.tsx`
**Change:** `ComposerEditor` receives an additional `collaborators` prop (array of `CollaboratorProfile`). A "Pick from roster" button appears per row and opens a `CollaboratorPicker` dropdown. The `MetadataStudio` component fetches collaborators via `GET /api/collaborators` on mount (client-side, added to existing `useState` initialization). The missing-IPI email dispatch happens in the track save route handler (`app/api/vault/[projectId]/tracks/[id]/route.ts` or equivalent), not in the component.

### 3. ContractLocker — Signer Row Picker

**File:** `components/contracts/ContractLocker.tsx`
**Change:** Signer rows in the new split sheet builder (not the existing `ContractRow` display) use `CollaboratorPicker`. The existing `ContractLocker` display UI is largely unchanged; the picker integration is in the new `SplitSheetBuilder` component and in any signer-setup UI.

### 4. Readiness Checklist — Missing IPI Sub-check

**File:** `lib/vault/readiness.ts` and `types/index.ts`
**Change:** The `metadata` readiness item currently checks `composersComplete()` which only validates that splits sum to 100%. Add a secondary check: if any composer row was populated from a collaborator pick but that collaborator's IPI is missing, the metadata item returns `'warning'` (not `'missing'`). This requires either (a) checking the `collaborators` table in the readiness function, or (b) storing a flag in the track's `metadata` JSONB when an IPI-missing collaborator was used. Option (b) is preferable to keep `readinessItemsForProject()` self-contained (it currently receives pre-fetched data, not a DB client).

### 5. Middleware — Public Routes

**File:** `middleware.ts`
**Change:** Ensure `/approve` and `/join` are NOT in the `isProtected` list. Currently `isProtected` is explicit (`/vault`, `/dashboard`, `/settings`), so new routes are unprotected by default — verify this holds and document the intent.

### 6. Industry Layout — Split Sheet Entry Point

**File:** `app/(industry)/layout.tsx`
**Change:** Add a nav link for `/split-sheets` in the industry header nav alongside Opportunities and Post. The `/split-sheets` page under `app/(industry)/` shares the same `SplitSheetBuilder` component and the same API as the artist flow.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Split sheet data in `vault_documents.document_data` JSONB (tool output) | New standalone `split_sheets` + `split_sheet_parties` tables | Enables shared visibility, approval tracking, and non-project-tied sheets |
| Freeform composer name entry only | CollaboratorPicker auto-fill from global roster | Eliminates re-entry across projects |
| No collaborator identity outside track metadata JSONB | Global `collaborators` table with full rights identity fields | Single source of truth; update once, reflected everywhere |

**Existing tool remains:** `lib/tools/splitsheet.ts` (the existing single-project PDF-oriented tool output) is unchanged. Phase 1 adds a parallel standalone flow; it does not retire the existing tool.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `mailing_address` stored as JSONB (structured sub-fields) rather than a single TEXT | Database Schema | Low — if flat TEXT is preferred, the migration changes one column type; no downstream code impact |
| A2 | Token expiry set to 30 days for both invite and approval tokens | Database Schema / Token Pattern | Low — expiry is a config decision; longer or shorter window is a PATCH to the migration |
| A3 | Missing-IPI re-send gated on 24-hour cooldown per collaborator+artist pair | Pitfall 4 | Medium — if no cooldown, repeated saves spam the collaborator; if too long, they miss critical first notification |
| A4 | `split_sheet_parties.email` is denormalized (snapshot, not live reference to collaborator) | Database Schema | Low — this is the correct architecture for legal documents; only risk is misunderstanding |
| A5 | Approval page route is `/approve/[token]` and invite page is `/join/[inviteToken]` | Architecture Patterns | Low — naming is Claude's discretion; planner can rename if it conflicts with existing routes |
| A6 | Industry split sheet entry point is `app/(industry)/split-sheets/page.tsx` added to the industry nav | Integration Points | Low — D-20 says "researcher should determine exact route placement"; this is the recommended placement |
| A7 | `ipi_notification_sent_at` tracking lives in `collaborator_invites` table (not a separate column on `collaborators`) | Pitfall 4 / Schema | Low — alternative is a `last_ipi_notification_at` on the `collaborators` table itself |

---

## Open Questions

1. **Icon for /collaborators nav item**
   - What we know: ArtistNav expects an `Icon` component following the pattern in `components/nav/icons.tsx` (SVG-based, accepts `gradient` and `className` props)
   - What's unclear: Whether an existing icon can be repurposed or a new SVG is needed
   - Recommendation: Create a new `CollaboratorsIcon` (people/group SVG) following the exact same component shape as existing icons

2. **Non-artist user split sheet entry point access control**
   - What we know: Industry layout currently has only `Opportunities` and `Post` nav items; middleware does not explicitly protect `/split-sheets`
   - What's unclear: Whether non-artist users should have an unrestricted `/split-sheets` route or whether a subscription check applies
   - Recommendation: No subscription gate for Phase 1; any authenticated user can create a split sheet (it's a rights document, not a premium feature)

3. **Approval counter-proposal UX for multi-party sheets**
   - What we know: D-16 says the artist is notified of counter-proposals and can iterate until all parties approve
   - What's unclear: Whether each iteration resets all approval statuses or only the party who countered has status reset
   - Recommendation: Only reset the single counter-proposing party's status; other parties who already approved retain their approval status (reduces friction)

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI | Migration push | ✓ | ^1.200.0 | — |
| Node.js crypto | Token generation | ✓ | built-in | — |
| Resend API key | Email delivery | ✓ (env var present) | resend ^4.0.0 | sendEmail() no-ops safely when unconfigured |
| Next.js App Router | All pages + API routes | ✓ | ^15.0.0 | — |

Missing dependencies with no fallback: None.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected in dependencies — no test framework installed |
| Config file | None |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COLLAB-01 | Create collaborator with all fields | manual-only | — | ❌ No test framework |
| COLLAB-02 | Edit and delete collaborator | manual-only | — | ❌ No test framework |
| COLLAB-03 | Picker auto-fills composer row | manual-only | — | ❌ No test framework |
| COLLAB-04 | Roster available across projects | manual-only | — | ❌ No test framework |

No test framework is installed (no `jest`, `vitest`, `playwright`, or similar in `package.json`). All verification is manual against the running app. The planner should include manual UAT steps in the verification plan.

### Wave 0 Gaps
None applicable — no test infrastructure exists and Wave 0 test setup is out of scope for this phase.

---

## Security Domain

`security_enforcement: true` (from config.json). ASVS Level 1 applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes — most routes require auth | `createApiClient()` + `supabase.auth.getUser()` on every handler; established pattern |
| V3 Session Management | Yes — cookie-based sessions | Supabase `auth-helpers-nextjs` manages session cookies; no changes needed |
| V4 Access Control | Yes — collaborators are per-user private data | RLS `USING (auth.uid() = user_id)` on `collaborators` table; API ownership check before mutation |
| V5 Input Validation | Yes — all API inputs | EDITABLE_FIELDS allowlist pattern (from `profile/route.ts`); sanitizeCollaborator() function |
| V6 Cryptography | Yes — approval and invite tokens | `crypto.randomBytes(32)` — cryptographically secure; tokens stored hashed or as opaque strings |

### Token Security Specifics

The approval token at `/approve/[token]` is a public, unauthenticated endpoint. Security requirements:
- Tokens must be unguessable: `crypto.randomBytes(32).toString('hex')` produces 256 bits of entropy [VERIFIED: runtime check]
- Tokens must expire: `token_expires_at` column with a 30-day window [ASSUMED]
- Tokens must be single-use (or at least final-state-locked): once a party approves or counters, re-submitting to the same token should be a no-op or graceful error
- No PII beyond name and split % should be exposed on the approval page without the artist's intent

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized collaborator access (another user reading roster) | Information Disclosure | RLS `USING (auth.uid() = user_id)` blocks cross-user reads |
| Token brute-force on approval page | Spoofing | 256-bit random tokens make brute-force computationally infeasible |
| Mass assignment (extra fields in POST body) | Tampering | EDITABLE_FIELDS allowlist; sanitizeCollaborator() strips unknown keys |
| Approval page CSRF | Spoofing | Token in URL is the CSRF defense (unguessable secret path); no session required |
| Stale invite token reuse | Elevation of Privilege | `token_expires_at` check on every `/join/[inviteToken]` render and on approval POST |

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase |
|-----------|----------------|
| No semicolons at end of statements | All new TypeScript files must follow this convention |
| 2-space indentation | All new files |
| `@/*` absolute imports only — no relative `../` imports | All component and lib imports |
| camelCase for functions | `sanitizeCollaborator`, `generateApprovalToken`, etc. |
| SCREAMING_SNAKE_CASE for constants | `COLLABORATOR_EDITABLE_FIELDS`, `APPROVAL_TOKEN_EXPIRY_DAYS` |
| PascalCase for types | `CollaboratorProfile`, `SplitSheetParty`, `InviteStatus` |
| Named exports preferred | All new modules use `export function` / `export type` |
| `'use client'` at top of client components | `CollaboratorPicker`, `CollaboratorForm`, `CollaboratorRoster`, `SplitSheetBuilder` |
| `router.refresh()` after mutations | All client components that trigger data changes |
| No `console.log` in committed code | —  |
| Throw descriptive Error instances | `throw new Error('Collaborator not found')` not generic errors |
| Sanitize input with explicit allowlist | `sanitizeCollaborator()` must use EDITABLE_FIELDS pattern |
| Tables keyed by `user_id` not `artist_id` | `collaborators.user_id`, `split_sheets.initiator_user_id` |
| RLS on all new tables | Required on `collaborators`, `split_sheets`, `split_sheet_parties`, `collaborator_invites` |
| `createApiClient()` for route handlers | All new API routes use this (not `createServerClient`) |
| `createServiceClient()` only for service-role operations | Use only in `send-for-approval` route where cross-user notification inserts are needed |

---

## Sources

### Primary (HIGH confidence)
- `lib/metadata/schema.ts` — PRO enum, Composer type, ComposerEditor patterns [VERIFIED: codebase read]
- `supabase/migrations/001_initial_schema.sql` — Table structure, RLS patterns, user_id FK convention [VERIFIED: codebase read]
- `components/vault/EditProjectForm.tsx` — Modal pattern for edit overlays [VERIFIED: codebase read]
- `app/api/profile/route.ts` — EDITABLE_FIELDS sanitization pattern [VERIFIED: codebase read]
- `components/nav/ArtistNav.tsx` — ITEMS array pattern for adding nav items [VERIFIED: codebase read]
- `lib/email/index.ts` — sendEmail() wrapper, Resend integration [VERIFIED: codebase read]
- `lib/notifications/index.ts` — createNotification() + sendEmail() combined pattern [VERIFIED: codebase read]
- `components/vault/MetadataStudio.tsx` — ComposerEditor internals (what the picker augments) [VERIFIED: codebase read]
- `lib/tools/splitsheet.ts` — Existing SplitSheetData model (separate from new Phase 1 split sheets) [VERIFIED: codebase read]
- `middleware.ts` — isProtected list, approval page must be excluded [VERIFIED: codebase read]
- `app/(industry)/layout.tsx` — Industry nav structure for split sheet entry point [VERIFIED: codebase read]
- `lib/esign/provider.ts` — EsignSigner type (relevant to signer row design) [VERIFIED: codebase read]
- `supabase/migrations/011_contract_verification.sql` — Document source/verification pattern [VERIFIED: codebase read]

### Secondary (MEDIUM confidence)
- Node.js `crypto.randomBytes()` for token generation [VERIFIED: runtime check in this session]
- `.planning/config.json` — security_enforcement: true, nyquist_validation: true [VERIFIED: config read]

### Tertiary (LOW confidence)
- Token expiry duration (30 days), cooldown window (24 hours), route naming (`/approve/`, `/join/`) — all [ASSUMED] and documented in Assumptions Log

---

## Metadata

**Confidence breakdown:**
- Database schema: HIGH — all patterns drawn from verified existing migrations
- API route patterns: HIGH — directly modeled on `app/api/profile/route.ts` (verified)
- Component integration: HIGH — ComposerEditor source verified; picker is an additive change
- Token security: HIGH — crypto.randomBytes verified at runtime
- Email flow: HIGH — sendEmail() wrapper verified in codebase
- Route placement (industry): MEDIUM — D-20 grants Claude discretion; recommendation is `app/(industry)/split-sheets/`
- Token expiry values: LOW — 30-day window is reasonable but not verified against any requirement

**Research date:** 2026-06-26
**Valid until:** 2026-09-26 (stable stack — Next.js 15, Supabase v2 APIs unlikely to change significantly)
