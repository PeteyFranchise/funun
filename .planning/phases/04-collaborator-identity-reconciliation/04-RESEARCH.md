# Phase 04: Collaborator Identity Reconciliation — Research

**Researched:** 2026-06-29
**Domain:** Supabase DB triggers, RLS cross-user writes, Next.js 15 middleware, PostgreSQL identity linking
**Confidence:** HIGH (all findings grounded in codebase grep and existing migration patterns)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** A Supabase DB function triggered on `auth.users` INSERT handles the signup case atomically. Matches `collaborators.email` (case-insensitive) against new user's auth email and sets `claimed_by = auth.users.id` for all matching rows, regardless of which artist owns those rows.
- **D-02:** A nullable `claimed_at TIMESTAMPTZ` is added to `artist_profiles`. When `claimed_at IS NULL`, middleware re-runs the claim function on the next request (handles first post-signup login). Once set, middleware skips further claim checks.
- **D-03:** The claim function is idempotent — only writes when `claimed_by IS NULL`. Safe to run on every login until claimed.
- **D-04:** `/collaborators` page restructured into two sections: (1) **My Credits** — every song/project where the logged-in user is credited via `claimed_by`, filterable by role; (2) **My Roster** — people the artist has added to their own projects (existing Phase 1 behavior).
- **D-05:** Dashboard shows a compact Credits preview below stats cards. Visible only when claimed records exist. Includes "View all" link to full Credits section.
- **D-06:** Credits entries are permanent (not an onboarding card).
- **D-07:** A new `user_profiles` table (keyed by `auth.users.id`) for all Funūn users. Fields: PRO, IPI/CAE, publisher, phone, address, display name, bio, social links. Settings page writes to this table.
- **D-08:** Back-fill runs at two moments: (1) at claim time — claim function reads new user's `user_profiles` and fills NULL fields on matching collaborator rows; (2) on every settings save — re-runs back-fill for any collaborator rows the user owns via `claimed_by`.
- **D-09:** Back-fill fields: `pro`, `ipi`, `publisher`, `phone`, `address`. Never overwrites existing non-NULL values. Name and email excluded.
- **D-10:** For collaborator cards where `claimed_by IS NOT NULL`, delete button is replaced by an Archive button. Hard delete blocked at API level for claimed records.
- **D-11:** Archived collaborators hidden from active roster. Archived toggle/filter reveals them. Artist can unarchive.
- **D-12:** `/collaborators` My Roster adds Favorites — a star toggle per card. Most Recent group shown at top of MetadataStudio picker and split sheet signer picker.

### Claude's Discretion

- Exact DB migration structure for `user_profiles` — whether it coexists with or partially supersedes `artist_profiles` for rights-identity fields.
- Exact UI layout of the two-section /collaborators page (tabs vs. sections within one scroll view).
- Pagination/limit behavior for the Credits section if a user has many credits.
- Exact Favorites storage mechanism (boolean column on `collaborators` row, or a separate join table).

### Deferred Ideas (OUT OF SCOPE)

- Unified user profile replacing artist_profiles/industry_profiles (additive coexistence only for now).
- Collaborator self-edit portal (deferred from Phase 1; still deferred).
- "You've been credited" notification email.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COLLAB-05 | When a non-Funūn collaborator later creates a Funūn account, their existing split sheet and contract contributions are automatically linked to their new profile via email-based claim — no re-entry required by either party | DB trigger pattern verified in migration 001; RLS SECURITY DEFINER bypass for cross-user writes confirmed; middleware claimed_at check pattern documented below |
</phase_requirements>

---

## Summary

Phase 04 is a multi-layer identity reconciliation system. The core mechanism is simple: when a user signs up, a PostgreSQL trigger matches their auth email against every `collaborators.email` entry in every artist's roster and writes that user's ID into `claimed_by`. This is an extension of a pattern the project already uses — `handle_new_user()` in migration 001 is already an `AFTER INSERT ON auth.users` trigger that creates `artist_profiles` and `subscriptions` rows.

The secondary path (first post-signup login) is handled in middleware. Because signup may happen before middleware can run, a `claimed_at` timestamp on `artist_profiles` tracks whether the claim check has been completed. The middleware reads this flag and, if NULL, calls a server-side RPC to re-run the claim function. This ensures that even edge cases (e.g., invite links that bypass the trigger timing) are caught on first navigation.

On top of the identity layer, the phase restructures the collaborators page into a Credits view (what projects credit this user) and My Roster (who the user has added). It also adds Favorites + Most Recent UX to the collaborator picker, and soft-deletes claimed records instead of hard-deleting them. A new `user_profiles` table captures rights identity data for all user types and drives the settings back-fill.

**Primary recommendation:** Extend `handle_new_user()` to include the claim logic (or add a second trigger on `auth.users`), add the `user_profiles` table and `claimed_by`/`archived_at`/`is_favorite` columns in a single migration (026), and layer the UI changes on top.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Email-based claim on signup | Database (DB trigger) | — | Atomic, cross-user write requires SECURITY DEFINER; can't use RLS-bound API client |
| First-login claim fallback | API / Backend (RPC call from middleware) | Middleware | Middleware detects `claimed_at IS NULL`, API route calls service-role RPC |
| Back-fill on settings save | API / Backend | Database | Settings PATCH route triggers a back-fill RPC after saving `user_profiles` |
| Credits view data | API / Backend (server component query) | — | Cross-user read: fetch collaborator rows WHERE `claimed_by = auth.uid()` |
| Archive / unarchive | API / Backend | — | Hard-delete guard enforced at API level; RLS alone is insufficient |
| Favorites + Most Recent | Database (columns) + Frontend Server | — | `is_favorite` column on collaborators row; Most Recent derived from `created_at` ordering in query |
| Settings → user_profiles | API / Backend | — | New PATCH endpoint with EDITABLE_FIELDS allowlist following profile/route.ts pattern |
| Collaborators page restructure | Browser / Client | Frontend Server (SSR) | Two-section layout; Credits data fetched server-side, Roster already client-managed |
| Dashboard Credits preview | Frontend Server (SSR) | — | Server component adds a new query for `claimed_by = user.id` collaborator rows |

---

## Standard Stack

This phase installs **no new packages**. All capabilities are implemented using the existing project stack.

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.45.0 (project) / 2.108.2 (latest) | DB trigger via SQL migration; RPC calls; RLS | Core data layer for all Funūn persistence |
| `@supabase/auth-helpers-nextjs` | 0.10.0 | `createMiddlewareClient` for session in middleware | Already used in `middleware.ts` — do not change |
| Next.js | 15.0.0 | Middleware, server components, API routes | Project framework |
| TypeScript | 5.5.0 | Type safety for new table shapes | Project language |

### No New Packages Required

All Phase 4 work is SQL migrations + TypeScript extending existing modules. The `createServiceClient()` from `lib/supabase/server.ts` (already present) handles the service-role RPC calls needed for cross-user claim writes.

---

## Package Legitimacy Audit

> No new packages are installed in this phase. The audit below covers packages already in the project that this phase's code depends on.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@supabase/supabase-js` | npm | 8+ yrs (latest: 2026-06-15) | 20.7M/wk | github.com/supabase/supabase-js | SUS (too-new version) | Already installed — no new install action |
| `@supabase/auth-helpers-nextjs` | npm | Deprecated (Nov 2025) | 262K/wk | github.com/supabase/ssr | SUS (deprecated) | Already installed — do NOT upgrade during this phase; replacement is `@supabase/ssr` but migration is out of scope |

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious (SUS):** Both flagged by registry scanner, but both are already installed project dependencies — no new install action is taken in Phase 4. The deprecation of `@supabase/auth-helpers-nextjs` is a known technical debt item; migration to `@supabase/ssr` is out of scope for this phase.

*Note: `@supabase/auth-helpers-nextjs` is deprecated upstream. The project continues to use it as-is. The planner should NOT include a migration to `@supabase/ssr` in Phase 4 plans.*

---

## Architecture Patterns

### System Architecture Diagram

```
[Signup (auth.users INSERT)]
        │
        ▼
[handle_new_user() DB trigger — SECURITY DEFINER]
        │
        ├──► INSERT artist_profiles + subscriptions (existing)
        │
        └──► claim_collaborators() — NEW
                   │
                   ├── UPDATE collaborators SET claimed_by = NEW.id
                   │   WHERE LOWER(email) = LOWER(NEW.email)
                   │   AND claimed_by IS NULL
                   │
                   └── Back-fill: read user_profiles WHERE id = NEW.id
                       UPDATE collaborators SET pro=, ipi=, etc.
                       WHERE claimed_by = NEW.id AND field IS NULL

[First Post-Signup Login — middleware]
        │
        ▼
[middleware.ts — check artist_profiles.claimed_at IS NULL]
        │
        ▼
[POST /api/claim-collaborators — service role RPC]
        │
        └──► supabase.rpc('claim_collaborators', { user_id, email })
             UPDATE artist_profiles SET claimed_at = NOW()

[Settings Save — /api/user-profiles PATCH]
        │
        ▼
[Back-fill RPC: UPDATE collaborators SET pro=, ipi=...
 WHERE claimed_by = user.id AND field IS NULL]

[GET /collaborators page]
        │
        ├── My Credits section:
        │   SELECT collaborators.*, split_sheets.*, vault_projects.*
        │   WHERE collaborators.claimed_by = auth.uid()
        │   (cross-user read via RLS policy allowing claimed_by access)
        │
        └── My Roster section:
            SELECT * FROM collaborators
            WHERE user_id = auth.uid()
            AND (archived_at IS NULL)
            ORDER BY is_favorite DESC, name ASC

[Dashboard Credits preview]
        │
        ▼
[Server component: SELECT COUNT(*) + sample rows
 FROM collaborators WHERE claimed_by = user.id]
```

### Recommended Project Structure

New files for Phase 4 (no restructuring of existing files):

```
supabase/migrations/
└── 026_collaborator_identity_reconciliation.sql  # all schema changes

app/api/
├── claim-collaborators/
│   └── route.ts          # POST: middleware-triggered claim RPC
└── user-profiles/
    └── route.ts          # GET + PATCH: user_profiles table

lib/
└── collaborators/
    └── index.ts          # extend with claim + back-fill helpers

components/collaborators/
├── CollaboratorCard.tsx      # extend: Archive button, Favorite star, Funūn-member badge
├── CollaboratorRoster.tsx    # extend: two-section layout (My Credits + My Roster), Archived toggle
└── CollaboratorPicker.tsx    # extend: Favorites group + Most Recent group at top

app/(artist)/
├── collaborators/
│   └── page.tsx          # extend: pass credits data + roster data as separate props
└── dashboard/
    └── page.tsx          # extend: Credits preview below stats cards
```

### Pattern 1: Extend handle_new_user() DB Trigger

**What:** The existing `handle_new_user()` trigger in migration 001 already fires on `AFTER INSERT ON auth.users`. The claim logic is added to this same function body (or as a call to a new `claim_collaborators(NEW.id, NEW.email)` sub-function).

**When to use:** Signup path — guaranteed to fire once, atomically, before any session is returned to the client.

```sql
-- Source: migration 001 pattern (codebase verified)
CREATE OR REPLACE FUNCTION public.claim_collaborators(
  p_user_id UUID,
  p_email   TEXT
)
RETURNS VOID AS $$
DECLARE
  v_pro       TEXT;
  v_ipi       TEXT;
  v_publisher TEXT;
  v_phone     TEXT;
  v_address   JSONB;
BEGIN
  -- Claim all matching collaborator rows (idempotent: only when claimed_by IS NULL)
  UPDATE public.collaborators
    SET claimed_by = p_user_id,
        claimed_at_collab = NOW()
  WHERE LOWER(email) = LOWER(p_email)
    AND claimed_by IS NULL;

  -- Back-fill from user_profiles if the user already has one
  SELECT pro, ipi, publisher, phone, mailing_address
    INTO v_pro, v_ipi, v_publisher, v_phone, v_address
    FROM public.user_profiles
    WHERE id = p_user_id;

  IF FOUND THEN
    UPDATE public.collaborators
      SET pro       = COALESCE(pro, v_pro),
          ipi       = COALESCE(ipi, v_ipi),
          publisher = COALESCE(publisher, v_publisher),
          phone     = COALESCE(phone, v_phone),
          mailing_address = COALESCE(mailing_address, v_address)
    WHERE claimed_by = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Called from handle_new_user():
-- PERFORM public.claim_collaborators(NEW.id, NEW.email);
```

### Pattern 2: Middleware claimed_at Guard

**What:** On every authenticated request, check `artist_profiles.claimed_at`. If NULL, fire the claim API and set the timestamp. This catches the first post-signup navigation.

**When to use:** First request after signup when the DB trigger already ran — this path handles the settings back-fill update and confirms claim completion.

```typescript
// Source: middleware.ts pattern (codebase verified)
// Inside middleware(), after session check:
if (session && !isAuthRoute) {
  const { data: ap } = await supabase
    .from('artist_profiles')
    .select('claimed_at')
    .eq('id', session.user.id)
    .maybeSingle()

  if (ap && ap.claimed_at === null) {
    // Fire-and-forget claim completion (DB trigger already ran;
    // this marks the first-login check as done)
    await fetch(`${req.nextUrl.origin}/api/claim-collaborators`, {
      method: 'POST',
      headers: { 'x-user-id': session.user.id, 'x-user-email': session.user.email ?? '' },
    })
  }
}
```

**Warning:** The middleware DB query adds latency to every page load until `claimed_at` is set. The check short-circuits once `claimed_at IS NOT NULL`. Keep the SELECT lightweight (single column, primary key lookup).

### Pattern 3: Settings Back-fill on user_profiles Save

**What:** When `/api/user-profiles` PATCH succeeds, immediately run the back-fill RPC for the user's owned collaborator rows (those where `claimed_by = user.id`).

**When to use:** Every time the user saves their PRO/IPI/publisher/phone/address in settings.

```typescript
// Source: app/api/profile/route.ts EDITABLE_FIELDS pattern (codebase verified)
const USER_PROFILES_EDITABLE_FIELDS = [
  'pro', 'ipi', 'publisher', 'phone', 'mailing_address',
  'display_name', 'bio',
] as const

// After saving user_profiles:
// Back-fill claimed collaborator rows (additive only — never overwrite non-NULL)
await supabase.rpc('backfill_claimed_collaborators', { p_user_id: user.id })
```

### Pattern 4: Credits View Query (Cross-User Read)

**What:** The Credits section shows projects where the logged-in user appears as a collaborator (via `claimed_by`). This is a cross-user read — the collaborator rows are owned by other artists but the logged-in user needs to see them.

**RLS consideration:** A new RLS policy `"Claimed users can see own claimed rows"` must allow `SELECT` on `collaborators WHERE claimed_by = auth.uid()` in addition to the existing `WHERE user_id = auth.uid()`.

```sql
-- Source: RLS pattern from 018_collaborators_split_sheets.sql (codebase verified)
CREATE POLICY "Claimed users see own credits" ON collaborators
  FOR SELECT
  USING (auth.uid() = claimed_by);
```

```typescript
// Server component query for Credits section
const { data: credits } = await supabase
  .from('collaborators')
  .select(`
    id, name, pro, ipi,
    user_id,
    split_sheet_parties (
      split_percentage, role,
      split_sheets (
        song_name, vault_project_id,
        vault_projects (title, type)
      )
    )
  `)
  .eq('claimed_by', user.id)
  .is('archived_at', null)
```

### Anti-Patterns to Avoid

- **Hard-deleting claimed collaborator rows:** Once `claimed_by IS NOT NULL`, the row represents a real person's contribution record. Blocking hard delete at the API route level (check `claimed_by`, return 409 if set) prevents data loss.
- **Running the claim check on every request for claimed users:** Once `claimed_at IS NOT NULL` on `artist_profiles`, the middleware must skip the DB query entirely — check the session cache, not the DB, on every hot path.
- **Using ILIKE in the UPDATE WHERE clause without a functional index:** `WHERE LOWER(email) = LOWER(p_email)` works correctly only if paired with a `CREATE INDEX ON collaborators (LOWER(email))`. Without the index, the claim scan is a full-table scan across all artists' rosters.
- **Back-fill overwriting non-NULL values:** The `COALESCE(existing_col, new_value)` pattern ensures additive-only updates. Never use `SET pro = v_pro` — always use `SET pro = COALESCE(pro, v_pro)`.
- **Calling the claim API from the client:** The claim endpoint must be server-to-server only (from middleware). A client calling it directly could trigger claim races or spoof the user ID. Use `x-user-id` from the session, not from the request body.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Case-insensitive email match | Custom normalization in TypeScript | `LOWER()` function index + `WHERE LOWER(email) = LOWER(p_email)` in SQL | SQL performs this at scan time; TypeScript normalization happens after fetch — too late for the claim trigger |
| Idempotency guard | Version counters, upsert with conflict | `WHERE claimed_by IS NULL` predicate in the UPDATE | PostgreSQL UPDATE atomically skips already-claimed rows; no separate lock or version needed |
| Cross-user write from API | Custom admin client factory | `createServiceClient()` already in `lib/supabase/server.ts` with SUPABASE_SERVICE_ROLE_KEY | Service role bypasses RLS; already used in the codebase for storage operations |
| RLS bypass for credits read | Query via service role | New RLS SELECT policy on `collaborators` WHERE `claimed_by = auth.uid()` | Let RLS do its job; service role for reads is wasteful and bypasses per-row security |
| Favorites ordering | Separate favorites table with join | `is_favorite BOOLEAN DEFAULT false` column on `collaborators` | One column, one ORDER BY clause; a join table is over-engineering for a boolean toggle |
| Most Recent collaborators | Separate usage log table | ORDER BY `created_at DESC` on `collaborators` WHERE `user_id = auth.uid()` | "Most recent" = most recently added to the roster; no separate event log needed |

**Key insight:** The entire claim mechanism is a single SQL UPDATE in a SECURITY DEFINER function. Resist the urge to implement this as an application-level loop — the DB trigger fires synchronously during signup, requires no network round-trips, and handles all artists' rosters in one pass.

---

## Common Pitfalls

### Pitfall 1: Functional Index Missing for LOWER(email)

**What goes wrong:** The claim trigger scans all collaborator rows using `LOWER(email) = LOWER(p_email)`. Without a functional index, this is a sequential scan — O(n) across all collaborators in the database. At scale, this adds latency to every signup.

**Why it happens:** `CREATE INDEX idx_collaborators_user_id ON collaborators (user_id)` exists (migration 018) but it does not help an email scan. A plain `email` index doesn't help either because the `LOWER()` call prevents index use.

**How to avoid:** Migration 026 must include:
```sql
CREATE INDEX idx_collaborators_lower_email ON collaborators (LOWER(email));
```

**Warning signs:** Slow signup response time as the collaborators table grows; `EXPLAIN ANALYZE` on the claim UPDATE showing Seq Scan.

### Pitfall 2: claimed_at Middleware Check Adds Latency on Every Request

**What goes wrong:** If the middleware always queries `artist_profiles.claimed_at`, every page load for every user hits the DB — even for users who were claimed months ago.

**Why it happens:** The simple implementation reads `claimed_at` from the DB on every request. For claimed users, this is wasted work.

**How to avoid:** Structure the middleware check so that it only runs when `session` exists AND the session doesn't already carry a confirmed-claim signal. The simplest approach: after setting `claimed_at`, the next session refresh carries this through. Alternatively, store `claimed_at` in the user metadata on `auth.users` so it's available in the session object without a DB round-trip.

**Better pattern:** Store a flag in `auth.users.user_metadata` at claim time:
```sql
-- Inside claim_collaborators():
UPDATE auth.users SET raw_user_meta_data =
  raw_user_meta_data || '{"collaborators_claimed": true}'::jsonb
WHERE id = p_user_id;
```
Then middleware reads `session.user.user_metadata?.collaborators_claimed` — zero extra DB query.

### Pitfall 3: user_profiles vs artist_profiles Field Overlap

**What goes wrong:** Both `artist_profiles` and the new `user_profiles` table store `pro`, `ipi`, `publisher`. If the settings page writes to `artist_profiles` (existing behavior) AND `user_profiles` (new behavior), they diverge.

**Why it happens:** The settings page currently reads from and writes to `artist_profiles`. Phase 4 adds `user_profiles`. Without a clear ownership rule, both tables get stale data.

**How to avoid:** The planner must decide the ownership boundary:
- **Option A (recommended):** `user_profiles` is the single source of truth for identity fields (`pro`, `ipi`, `publisher`, `phone`, `mailing_address`). Settings page writes to `user_profiles` only. `artist_profiles` rights fields from migration 020 are read-only fallbacks or deprecated in a future phase.
- **Option B:** Settings page writes to both tables in a single transaction. More write amplification but simpler read path.

The CONTEXT.md (D-07) says settings writes to `user_profiles` — follow Option A.

### Pitfall 4: Hard Delete of Claimed Rows

**What goes wrong:** The existing `DELETE /api/collaborators/[id]` endpoint allows deletion of any collaborator the user owns (matching `user_id`). If `claimed_by IS NOT NULL`, this deletes a real person's credit record.

**Why it happens:** The Phase 1 delete endpoint has no claim check — it was written before the claim mechanism existed.

**How to avoid:** The PATCH endpoint for Phase 4 must add:
```typescript
// Check before deletion
if (existing.claimed_by) {
  return NextResponse.json({ error: 'Cannot delete a claimed collaborator — use archive instead' }, { status: 409 })
}
```

The existing `DELETE /api/collaborators/[id]` route must be updated to include this guard.

### Pitfall 5: Back-fill Race Between Trigger and user_profiles Creation

**What goes wrong:** The claim trigger fires on `auth.users` INSERT, which happens before the user has ever visited settings. At trigger time, `user_profiles` may not exist yet for this user (the table is new and only populated on first settings save). The back-fill in the trigger will find no `user_profiles` row and skip back-fill — which is correct. But the planner must ensure the settings-save back-fill path is the primary back-fill path and is clearly documented.

**Why it happens:** Signup creates `auth.users` → trigger fires → `user_profiles` doesn't exist yet → back-fill skipped → user fills in settings later → back-fill must run then.

**How to avoid:** The trigger-time back-fill is a best-effort optimization (works when the user already has a `user_profiles` row, e.g., from a prior partial session). The settings-save back-fill (D-08 second moment) is the primary path. Both are idempotent.

---

## Code Examples

Verified patterns from codebase inspection:

### Migration 026 Schema Changes

```sql
-- Source: codebase migrations 018, 019, 020 pattern (codebase verified)

-- ─── user_profiles (new table for all user types) ──────────────
CREATE TABLE user_profiles (
  id              UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  pro             TEXT,
  ipi             TEXT,
  publisher       TEXT,
  phone           TEXT,
  mailing_address JSONB DEFAULT '{}',
  display_name    TEXT,
  bio             TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own profile" ON user_profiles
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ─── collaborators: claim + archive + favorites columns ─────────
ALTER TABLE collaborators
  ADD COLUMN IF NOT EXISTS claimed_by    UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS archived_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_favorite   BOOLEAN NOT NULL DEFAULT false;

-- Functional index for case-insensitive email claim scan
CREATE INDEX IF NOT EXISTS idx_collaborators_lower_email
  ON collaborators (LOWER(email));

-- Index for credits query (all rows claimed by a user)
CREATE INDEX IF NOT EXISTS idx_collaborators_claimed_by
  ON collaborators (claimed_by);

-- ─── artist_profiles: claimed_at sentinel ──────────────────────
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- ─── RLS: claimed users can read rows they appear in ───────────
CREATE POLICY "Claimed users see own credits" ON collaborators
  FOR SELECT
  USING (auth.uid() = claimed_by);
```

### Extending handle_new_user()

```sql
-- Source: migration 001 handle_new_user() pattern (codebase verified)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Existing: create artist profile + subscription
  INSERT INTO public.artist_profiles (id) VALUES (NEW.id)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active')
    ON CONFLICT (user_id) DO NOTHING;

  -- New Phase 4: claim matching collaborator rows
  UPDATE public.collaborators
    SET claimed_by = NEW.id
  WHERE LOWER(email) = LOWER(NEW.email)
    AND claimed_by IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- (Trigger on_auth_user_created already exists — no new CREATE TRIGGER needed)
```

### Middleware claimed_at Check

```typescript
// Source: middleware.ts (codebase verified) — pattern extension
// After existing session check and before isProtected/isAuthRoute logic:
if (session && !isAuthRoute) {
  const claimedMeta = session.user.user_metadata?.collaborators_claimed
  if (!claimedMeta) {
    // Best-effort: fire claim completion in background
    // Uses internal API route with service role to set claimed_at
    fetch(`${req.nextUrl.origin}/api/claim-collaborators`, {
      method: 'POST',
      headers: {
        'x-supabase-user-id': session.user.id,
        'x-supabase-user-email': session.user.email ?? '',
      },
    }).catch(() => {
      // Non-blocking — will retry on next request
    })
  }
}
```

### CollaboratorCard: Claimed State + Archive Button

```typescript
// Source: components/collaborators/CollaboratorCard.tsx (codebase verified)
// Extend CollaboratorProfile type to include claimed_by, archived_at, is_favorite
// Replace Delete button with Archive for claimed rows:
const isClaimed = Boolean(collaborator.claimed_by)

{isClaimed ? (
  <button type="button" onClick={onArchive}
    className="absolute bottom-3 right-4 text-xs text-white/50 hover:text-amber-300">
    Archive
  </button>
) : (
  <button type="button" onClick={onDelete}
    className="absolute bottom-3 right-4 text-xs text-white/50 hover:text-red-400">
    Delete
  </button>
)}

{/* Funūn member badge */}
{isClaimed && (
  <span className="inline-flex items-center rounded-full border border-brandindigo/30 bg-brandindigo/10 px-2 py-0.5 text-[10px] font-bold text-brandindigo">
    Funūn member
  </span>
)}
```

### CollaboratorPicker: Favorites + Most Recent

```typescript
// Source: components/collaborators/CollaboratorPicker.tsx (codebase verified)
// Add grouping to the list:
const favorites = roster.filter(c => c.is_favorite)
const recentNonFav = roster
  .filter(c => !c.is_favorite)
  .slice(0, 5) // last 5 by created_at (API returns ordered desc)
const rest = roster.filter(c => !c.is_favorite).slice(5)

// Render order: Favorites → Most Recent → Rest
```

---

## Runtime State Inventory

> This phase modifies existing tables — not a rename/refactor phase, but it adds columns and a new table. No runtime state migration required.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `collaborators` table: existing rows have `claimed_by = NULL` (correct default) | None — new column defaults to NULL |
| Stored data | `artist_profiles` table: existing rows have `claimed_at = NULL` | None — new column defaults to NULL, triggers claim check on first login |
| Stored data | `user_profiles` table: does not exist yet | Migration 026 creates it |
| Live service config | Supabase RLS policies on `collaborators` | Migration 026 adds new SELECT policy for `claimed_by` |
| OS-registered state | None | None |
| Secrets/env vars | `SUPABASE_SERVICE_ROLE_KEY` already present — used by `createServiceClient()` | None — already in place |
| Build artifacts | None | None |

**Nothing found requiring data migration:** All column additions are nullable with safe defaults.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-artist collaborator records with no identity linkage | Email-based claim via DB trigger linking to `auth.users` | Phase 4 | Enables cross-artist credits view, settings back-fill |
| Hard delete of any owned collaborator | Soft-delete (archive) for claimed records | Phase 4 | Preserves contribution history for real people |
| Flat collaborator list (no ordering) | Favorites + Most Recent groups in picker | Phase 4 | Faster repeat-collaborator selection |

**Deprecated/outdated within this codebase:**
- The `DELETE /api/collaborators/[id]` endpoint behavior: must be updated to block deletion of claimed rows (returns 409 with archive suggestion).

---

## Open Questions

1. **user_profiles vs artist_profiles field duplication**
   - What we know: `artist_profiles` has `pro`, `ipi`, `publisher`, `mlc_id`, `soundexchange_id` (migration 020). The new `user_profiles` table will have the same fields. Settings page currently writes to `artist_profiles`.
   - What's unclear: Should Phase 4 settings page write to BOTH tables, or only `user_profiles`? Writing only to `user_profiles` leaves `artist_profiles` stale for existing reads.
   - Recommendation: Write to both in the same PATCH handler (read-modify-write pattern). Flag as technical debt for future consolidation. This avoids breaking any existing code that reads `artist_profiles.pro` for MetadataStudio auto-fill.

2. **Middleware claim API security**
   - What we know: The middleware fires a fetch to `/api/claim-collaborators`. That route must be protected against direct external calls.
   - What's unclear: Best mechanism — a shared secret header vs. Supabase session check in the route handler.
   - Recommendation: The `/api/claim-collaborators` route must call `createApiClient().auth.getUser()` and validate the session user ID matches the `x-supabase-user-id` header. No additional shared secret needed.

3. **Credits section pagination**
   - What we know: CONTEXT.md marks this as Claude's Discretion.
   - What's unclear: At what threshold should pagination kick in?
   - Recommendation: Limit to 20 credits, with a "Show more" button fetching the next page via client-side fetch. No infinite scroll for now — keeps the implementation simple.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI | Migration 026 push | ✓ | `supabase` 1.200.0 (package.json) | — |
| PostgreSQL (Supabase) | DB trigger, functional index | ✓ | Supabase production | — |
| `SUPABASE_SERVICE_ROLE_KEY` | `createServiceClient()` in claim API | ✓ | In `.env.local` (existing) | — |

**Missing dependencies with no fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected — no testing dependencies in package.json |
| Config file | None |
| Quick run command | N/A — no test runner installed |
| Full suite command | N/A |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COLLAB-05 | Email-based claim links collaborator rows to new user | manual smoke test | — (no test runner) | ❌ Wave 0 |
| COLLAB-05 | Back-fill on settings save propagates to claimed rows | manual smoke test | — | ❌ Wave 0 |
| COLLAB-05 | Archive replaces delete for claimed collaborators | manual UI check | — | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** Manual smoke test against local Supabase dev instance
- **Per wave merge:** End-to-end: signup with email matching an existing collaborator → verify `claimed_by` is set
- **Phase gate:** All 5 success criteria from ROADMAP.md verified manually before `/gsd-verify-work`

### Wave 0 Gaps

- No test framework installed. All verification is manual smoke testing against local Supabase.
- This is consistent with Phases 1–3 (same finding).

---

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1`

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (session check in middleware claim path) | `createMiddlewareClient` session validation |
| V3 Session Management | yes (middleware reads session to determine claim need) | Supabase cookie-based session |
| V4 Access Control | yes — critical (cross-user write in claim trigger) | SECURITY DEFINER function; service role; ownership-then-service-client pattern |
| V5 Input Validation | yes (user_profiles PATCH endpoint) | EDITABLE_FIELDS allowlist, same pattern as `app/api/profile/route.ts` |
| V6 Cryptography | no | — |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Mass assignment via user_profiles PATCH | Tampering | `USER_PROFILES_EDITABLE_FIELDS` allowlist — drop `id`, `claimed_by`, timestamps |
| Claim spoofing via `/api/claim-collaborators` direct call | Elevation of Privilege | Route must validate `session.user.id` — never trust client-supplied user ID header |
| Deleting another user's collaborator claim record | Tampering | API delete route checks `claimed_by IS NULL` before allowing delete; `user_id` ownership check already present |
| Overly broad SELECT via new RLS policy | Information Disclosure | New `"Claimed users see own credits"` policy uses `auth.uid() = claimed_by` — row-scoped, not table-wide |
| back-fill overwriting artist-provided data | Tampering | `COALESCE(existing, new)` pattern — additive only, enforced in SQL |

**ASVS V4 note:** The claim trigger writes to rows owned by other artists. This cross-user write is intentional and safe only because it runs inside a SECURITY DEFINER PostgreSQL function (never in application code with a user-session client). The ownership-then-service-client pattern from STATE.md (T-01-12) applies to the middleware claim API route — call `createApiClient()` first to validate the session user, then use `createServiceClient()` for the actual claim write.

---

## Sources

### Primary (HIGH confidence — codebase verified)

- `/Users/peterzora/Desktop/funun/supabase/migrations/001_initial_schema.sql` — `handle_new_user()` trigger pattern, `AFTER INSERT ON auth.users`, SECURITY DEFINER pattern
- `/Users/peterzora/Desktop/funun/supabase/migrations/018_collaborators_split_sheets.sql` — collaborators table schema, existing RLS policies, existing indexes
- `/Users/peterzora/Desktop/funun/supabase/migrations/019_collaborator_name_fields.sql` — `ALTER TABLE ADD COLUMN IF NOT EXISTS` migration pattern
- `/Users/peterzora/Desktop/funun/supabase/migrations/020_artist_profile_rights_fields.sql` — rights fields on artist_profiles (overlap with user_profiles)
- `/Users/peterzora/Desktop/funun/middleware.ts` — session check pattern, route group logic
- `/Users/peterzora/Desktop/funun/lib/supabase/server.ts` — `createServiceClient()` factory
- `/Users/peterzora/Desktop/funun/lib/collaborators/index.ts` — `CollaboratorProfile` type, `sanitizeCollaborator`, `COLLABORATOR_EDITABLE_FIELDS`
- `/Users/peterzora/Desktop/funun/app/api/collaborators/route.ts` and `[id]/route.ts` — API route patterns
- `/Users/peterzora/Desktop/funun/components/collaborators/CollaboratorCard.tsx` — card rendering pattern
- `/Users/peterzora/Desktop/funun/components/collaborators/CollaboratorPicker.tsx` — picker component structure
- `/Users/peterzora/Desktop/funun/components/collaborators/CollaboratorRoster.tsx` — roster page structure
- `/Users/peterzora/Desktop/funun/app/(artist)/dashboard/page.tsx` — dashboard server component pattern
- `/Users/peterzora/Desktop/funun/app/(artist)/collaborators/page.tsx` — collaborators page server component
- `/Users/peterzora/Desktop/funun/app/(artist)/settings/page.tsx` — settings page pattern (reads from artist_profiles)
- `/Users/peterzora/Desktop/funun/.planning/phases/04-collaborator-identity-reconciliation/04-CONTEXT.md` — all D-0x decisions
- `/Users/peterzora/Desktop/funun/.planning/ROADMAP.md` — Phase 4 success criteria (5 items)

### Secondary (MEDIUM confidence — npm registry)

- `npm view @supabase/auth-helpers-nextjs deprecated` — confirmed package is deprecated; replacement is `@supabase/ssr` 0.12.0; migration is out of scope for Phase 4 [ASSUMED: behavior of deprecated package is unchanged from project's current usage]
- `npm view @supabase/supabase-js version` — 2.108.2 latest; project uses 2.45.0 [ASSUMED: API surface used in this phase (`.from().update()`, `.rpc()`) is stable across versions]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@supabase/auth-helpers-nextjs` continues to work without behavior changes despite deprecation | Package Legitimacy Audit | If deprecated package stops working, middleware auth breaks; migration to `@supabase/ssr` required urgently |
| A2 | Storing `collaborators_claimed: true` in `auth.users.raw_user_meta_data` is writeable from a SECURITY DEFINER function | Pitfall 2 / Code Examples | If not writeable from a trigger, the metadata approach must be replaced with the `artist_profiles.claimed_at` DB column approach (also documented) |
| A3 | `split_sheet_parties.user_id` is set when a collaborator signs up via the invite flow (Phase 1 D-08) | Credits view query | If `split_sheet_parties.user_id` is never backfilled on signup, the credits query via `collaborators` table is the correct path (not `split_sheet_parties`) |

**If the metadata approach for Pitfall 2 (A2) is not available:** Fall back to the `artist_profiles.claimed_at` sentinel — the DB query latency concern is acceptable for a small app at this scale.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new packages; all existing
- Architecture: HIGH — grounded in codebase grep of 16+ files
- DB trigger pattern: HIGH — existing `handle_new_user()` is the exact template
- Pitfalls: HIGH — derived from actual schema inspection and RLS analysis
- user_metadata write from trigger: LOW — [ASSUMED] based on Supabase documentation knowledge

**Research date:** 2026-06-29
**Valid until:** 2026-07-29 (stable stack; 30-day TTL)
