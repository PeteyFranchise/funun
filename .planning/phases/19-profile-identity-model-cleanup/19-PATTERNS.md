# Phase 19: Profile & Identity Model Cleanup - Pattern Map

**Mapped:** 2026-07-24
**Files analyzed:** 15
**Analogs found:** 15 / 15

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/071_user_profiles_data_rescue.sql` | migration | batch (data rescue) | `supabase/migrations/026_collaborator_identity_reconciliation.sql` (table/column shape) + rescue pattern is novel SQL, no direct twin | role-match |
| `supabase/migrations/072_repoint_claim_functions.sql` | migration | CRUD (function re-point + new column) | `supabase/migrations/051_recreate_claim_collaborators_rpc.sql` | exact |
| `supabase/migrations/073_drop_user_profiles.sql` | migration | batch (destructive drop) | `supabase/migrations/066_split_sheet_identity_foundation.sql` (human-gated migration header/discipline) | role-match |
| `supabase/migrations/07X_split_sheet_identity_flags.sql` | migration | CRUD (new table + RLS) | `supabase/migrations/026_collaborator_identity_reconciliation.sql` (table + RLS + index shape) | exact |
| `app/(artist)/settings/page.tsx` | route (server component) | request-response | itself (existing file, remove `UserProfile` type + fetch) | exact |
| `components/profile/ProfileForm.tsx` | component | request-response (form) | itself — legal-name confirm-and-lock block (lines ~591-633) is the direct template for R2's per-field confirm UI | exact |
| `app/api/profile/route.ts` | route (API) | request-response (CRUD, PATCH) | itself — `lock_legal_name` signal-flag pattern (lines ~196-215) is the direct template for R2's `confirm_prefill_fields` | exact |
| `app/api/user-profiles/route.ts` | route (API) | request-response (CRUD) | **DELETE** — no analog needed, being removed | n/a |
| `app/api/claim-collaborators/route.ts` | route (API) | event-driven (RPC trigger) | unchanged — calls `claim_collaborators()` RPC by name | exact (no code change) |
| `app/api/split-sheets/[id]/correction-flag/route.ts` | route (API) | request-response (structured write + notify) | `app/api/profile/route.ts` (auth/allowlist pattern) + `lib/social/notifications.ts` builders (notify pattern) | role-match |
| `components/contracts/ContractLocker.tsx` | component | request-response (UI action) | itself — existing per-party/attention sections are the template for the new "this is wrong" affordance | exact |
| `lib/social/notifications.ts` | utility (pure builders) | event-driven | itself — `buildSplitSheetCounteredNotification()` (lines ~305-318) is the direct template for a new `buildIdentityCorrectionFlagNotification()` | exact |
| `lib/split-sheets/agreement.ts` | utility (constants/pure fns) | transform | itself — `GUIDANCE_NOTES` (lines 40-45) is the direct template for `NOTE_TO_LICENSEES` | exact |
| `lib/vault/pdf/split-sheet.tsx` | utility (PDF renderer) | file-I/O (PDF generation) | itself — existing `guidanceBox`/`guidanceNote` styles + render block are the direct template for R5's boxed callout | exact |
| `app/approve/[token]/page.tsx` | route (server component, read-only share view) | request-response | `lib/vault/pdf/split-sheet.tsx` guidance-note render logic (same string, different surface) | role-match |
| `lib/split-sheets/live-identity.ts` | utility (pure resolver) | transform | itself — unchanged by R3, add regression test only | exact (no code change) |
| `__tests__/claim-collaborators-rpc.test.ts` | test | file-I/O (migration-content assertion) | itself — extend with 072/073 assertions | exact |

## Pattern Assignments

### `components/profile/ProfileForm.tsx` (component, request-response) — R2 per-field confirm UI

**Analog:** itself, legal-name confirm-and-lock block

**Confirm-and-lock pattern** (`components/profile/ProfileForm.tsx` lines ~591-633):
```tsx
{profile.legal_name_locked_at ? (
  <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-xs">
    <p className="font-semibold text-emerald-300">
      Legal name confirmed on {new Date(profile.legal_name_locked_at).toLocaleDateString()}
    </p>
    <p className="mt-1 text-white/50">
      This locked name is what appears read-only as party 1 on your split sheets.
      You can still edit and save corrections above at any time.
    </p>
  </div>
) : (
  <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
    <p className="text-xs font-semibold text-white/80">Confirm &amp; lock your legal name</p>
    <p className="text-xs text-white/40">
      Locking your legal name lets it appear automatically, read-only, on every
      split sheet you create — no manual re-entry, no &quot;Use my info&quot; click.
    </p>
    {composedLegalNamePreview ? (
      <p className="text-sm text-white/70">
        Preview: <span className="font-medium text-white">{composedLegalNamePreview}</span>
      </p>
    ) : (
      <p className="text-xs text-white/30 italic">
        Enter your legal name above, then confirm and lock it.
      </p>
    )}
    {lockError && <p className="text-xs text-rose-300">{lockError}</p>}
    <button
      type="button"
      disabled={!composedLegalNamePreview || lockSubmitting}
      onClick={handleLockLegalName}
      className="rounded-lg bg-grad px-3 py-1.5 text-xs font-semibold text-white shadow-cta disabled:opacity-40"
    >
      {lockSubmitting ? 'Locking…' : 'Confirm & lock your legal name'}
    </button>
  </div>
)}
```

**R2 application:** parametrize this exact two-state block (confirmed / unconfirmed) **per field** in the "Rights & Royalties" section (`pro`, `ipi`, `publisher`, `contact_phone`, `mailing_address`, `administrator`). Read `profile.claim_prefill[field]` instead of `profile.legal_name_locked_at`; the "confirmed" badge shows the provenance sentence (D-03) instead of a lock date; the button posts `{ confirm_prefill_fields: [field] }` to `PATCH /api/profile` instead of `{ lock_legal_name: true }`. Add D-12's one help line ("Used on your split sheets, metadata, and registrations.") as a plain `<p>` under the "Rights & Royalties" `<h2>`, matching the existing section-header comment style (`// ─── Public Profile ─────`).

**Delete:** the entire "Rights Identity" section/state/handler that posts to `/api/user-profiles` (R1) — grep the file for `user-profiles` / `UserProfile` to find its exact bounds.

---

### `app/api/profile/route.ts` (route, request-response) — R2 confirm-signal write + R1 sole rights path

**Analog:** itself, `lock_legal_name` server-owned-timestamp signal

**Imports pattern** (lines 1-9):
```typescript
import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ArtistProfile } from '@/types'
import { normalizeCountry, normalizeRegistrant } from '@/lib/metadata/identifiers'
import { ALL_INDUSTRY_ROLE_SLUGS } from '@/lib/industry-roles'
import { ALL_GENRE_SLUGS } from '@/lib/genres'
import { sanitizeProfileRoles, filterOpenTo, isFeaturableProjectRow } from '@/lib/profile/validate'
import { composeLegalNameFromProfile } from '@/lib/split-sheets/agreement'
```

**Explicit field allowlist pattern** (lines 12-33, `EDITABLE_FIELDS`) — the project convention every write endpoint follows; `claim_prefill` must NOT be added here (private, server-owned-only column, same posture as `legal_name_locked_at`):
```typescript
const EDITABLE_FIELDS = [
  'artist_name', 'genre', 'location', 'bio',
  'instagram_handle', 'threads_handle', 'tiktok_handle', 'spotify_url',
  'career_stage', 'monthly_listeners',
  'isrc_country_code', 'isrc_registrant_code',
  'pro', 'ipi', 'publisher', 'administrator', 'mlc_id', 'soundexchange_id',
  'legal_first_name', 'legal_middle_name', 'legal_last_name', 'legal_name_suffix',
  // ... (contact_phone, mailing_address already present per RESEARCH)
]
```

**Server-owned signal-flag pattern** (lines ~185-215) — the exact model for R2's `confirm_prefill_fields`:
```typescript
// lock_legal_name is a one-time SIGNAL, never a mass-assignable field —
// legal_name_locked_at itself is deliberately absent from EDITABLE_FIELDS
// above, so it can never be set to an arbitrary client-supplied value.
if (body.lock_legal_name === true) {
  const { data: current } = await service
    .from('artist_profiles')
    .select('legal_first_name, legal_middle_name, legal_last_name, legal_name_suffix, legal_name_locked_at')
    .eq('id', user.id)
    .maybeSingle()

  const alreadyLocked = Boolean(current?.legal_name_locked_at)
  if (!alreadyLocked) {
    const composedName = composeLegalNameFromProfile({ /* ... */ })
    if (composedName.trim() !== '') {
      update.legal_name_locked_at = new Date().toISOString()
    }
  }
}

if (Object.keys(update).length === 0) {
  return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
}

const { data, error } = await service
  .from('artist_profiles')
  .update(update)
  .eq('id', user.id)
  .select()
```

**R2 application** (matches RESEARCH's own Code Example almost verbatim):
```typescript
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
Note: filter `confirm_prefill_fields` against `Object.keys(current.claim_prefill)` — never trust a client-supplied field name blindly (RESEARCH V5 Input Validation).

---

### `supabase/migrations/072_repoint_claim_functions.sql` (migration, CRUD) — R1 function re-point

**Analog:** `supabase/migrations/051_recreate_claim_collaborators_rpc.sql` (exact `CREATE OR REPLACE` shape) + `supabase/migrations/026_collaborator_identity_reconciliation.sql` (original function bodies, both `claim_collaborators()` and `backfill_claimed_collaborators()`)

**Full re-point pattern** (both functions must change in the SAME file — Pitfall 1):
```sql
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
  -- Column rename: phone -> contact_phone.
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

-- Same transform for backfill_claimed_collaborators(p_user_id UUID) — see
-- migration 026 lines ~119-146 for its original body to re-point identically.

NOTIFY pgrst, 'reload schema';
```

**Add R2's `claim_prefill` column in the same migration** (Pattern 3, JSONB-for-structured-per-field-state, following `mailing_address`/`sound_identity` convention):
```sql
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS claim_prefill JSONB DEFAULT '{}';
-- PRIVATE column (migration 040 doctrine) — do NOT add to any GRANT
-- SELECT list; read/written server-side only, same posture as
-- legal_name_locked_at/administrator.
```

**Human-gated migration header discipline** (copy this comment-block convention exactly, adapting from `supabase/migrations/066_split_sheet_identity_foundation.sql` lines 1-30):
```sql
-- ============================================================
-- Funūn — Wave 2: Rights & Registration Rails
-- Migration 072: re-point claim_collaborators()/backfill_claimed_
-- collaborators() to artist_profiles + add claim_prefill column
--
-- An executor agent must NEVER run `supabase db push` for this migration.
-- The live push against the remote database is this plan's blocking
-- human checkpoint, mirroring migrations 058/062/063/065/066's
-- "do not push from an executor agent" convention.
-- ============================================================
```

---

### `supabase/migrations/071_user_profiles_data_rescue.sql` (migration, batch) — R1 semantic-blank rescue

**Analog:** novel SQL pattern (no direct twin in repo), but structural conventions borrowed from `supabase/migrations/026` (table/column names) and `066` (header/idempotency discipline). Full illustrative SQL is in RESEARCH.md Pattern 1 — copy that block, using `COALESCE(TRIM(x), '') = ''` for text blanks and `x IS NULL OR x = '{}'::jsonb` for the `mailing_address` JSONB blank-check (Pitfall 6), and `RAISE NOTICE` for the pre/post + stranded-value audit log (Security Domain "Repudiation" mitigation).

---

### `supabase/migrations/07X_split_sheet_identity_flags.sql` (migration, CRUD) — R4 flag table

**Analog:** `supabase/migrations/026_collaborator_identity_reconciliation.sql` — table + RLS + index shape

**Table + RLS pattern** (lines 12-30, adapt table/columns per Pattern 4):
```sql
CREATE TABLE IF NOT EXISTS split_sheet_identity_flags (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  split_sheet_party_id  UUID NOT NULL REFERENCES split_sheet_parties(id) ON DELETE CASCADE,
  flagged_by            UUID NOT NULL REFERENCES auth.users(id),
  field                 TEXT NOT NULL CHECK (field IN ('pro','ipi','publisher','administrator','legal_name')),
  suggested_value       TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'open',
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE split_sheet_identity_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Flagger can insert own flag" ON split_sheet_identity_flags
  FOR INSERT WITH CHECK (auth.uid() = flagged_by);
-- Additional SELECT policy scoped to the sheet owner + flagger only —
-- mirror the "Claimed users see own credits" additive-policy style
-- (migration 026 lines 67-73), never a table-wide grant.
```
`field` uses a CHECK-constraint allowlist matching `EDITABLE_FIELDS`'s discipline (V5 Input Validation) — never free text.

---

### `app/api/split-sheets/[id]/correction-flag/route.ts` (route, request-response) — R4 flag submission

**Analog:** `app/api/profile/route.ts` (auth + service-client + allowlist pattern) + `app/api/split-sheets/[id]/void/route.ts` (referenced in RESEARCH for the sibling lifecycle-route auth shape)

**Pattern to follow:**
```typescript
import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { buildIdentityCorrectionFlagNotification } from '@/lib/social/notifications'

const FLAGGABLE_FIELDS = ['pro', 'ipi', 'publisher', 'administrator', 'legal_name']

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!FLAGGABLE_FIELDS.includes(body.field)) {
    return NextResponse.json({ error: 'Invalid field' }, { status: 400 })
  }

  const service = createServiceClient()
  // server-derived flagged_by = user.id — never client-supplied (V4 Access Control)
  const { error } = await service.from('split_sheet_identity_flags').insert({
    split_sheet_party_id: body.partyId,
    flagged_by: user.id,
    field: body.field,
    suggested_value: String(body.suggestedValue).slice(0, 500),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // dual notification (D-06) — see lib/social/notifications.ts + lib/notifications/index.ts below
  await createNotification(service, { /* ... */ sendEmailCopy: true })

  return NextResponse.json({ ok: true })
}
```

---

### `lib/social/notifications.ts` + `lib/notifications/index.ts` (utility, event-driven) — R4 dual notification

**Analog:** `buildSplitSheetCounteredNotification()` (`lib/social/notifications.ts` lines ~305-318)

**Builder pattern (pure function, no I/O):**
```typescript
export function buildSplitSheetCounteredNotification(
  args: SplitSheetNotificationArgs
): NotificationPayload {
  return {
    userId: args.recipientId,
    type: 'split_sheet_countered',
    title: `${args.partyName} countered the split sheet for "${args.songName}" — action needed`,
    link: `/split-sheets/${args.splitSheetId}`,
    data: { splitSheetId: args.splitSheetId, partyId: args.partyId, urgency: 'high' },
    actorId: args.partyId,
    actorName: args.partyName,
    actorAvatarUrl: null,
  }
}
```

**R4 application:** add `split_sheet_identity_flagged: { icon: 'flag', inlineAction: 'split_sheet_review' }` to `NOTIFICATION_TYPES` (line ~40), then `buildIdentityCorrectionFlagNotification()` mirroring the shape above — `title` names the flagger and field, `link` deep-links to `/split-sheets/${splitSheetId}?stagedFlag=${flagId}` (D-08's guided apply staging), `data` carries `{ splitSheetId, partyId, field, suggestedValue }`.

**Dual-channel write (bell + Resend email in one call):**
```typescript
// lib/notifications/index.ts lines 11-28
export async function createNotification(
  service: SupabaseClient,
  args: {
    userId: string
    type: string
    title: string
    body?: string | null
    link?: string | null
    data?: Record<string, unknown>
    email?: string | null
    sendEmailCopy?: boolean
    actorId?: string | null
    actorName?: string | null
    actorAvatarUrl?: string | null
  }
): Promise<{ ok: boolean; error?: string }> {
  let emailed = false
  if (args.sendEmailCopy && args.email) {
    // ... builds appUrl, escapes user-controlled content, calls sendEmail()
  }
  // ... inserts the notification row (bell)
}
```
Call with `sendEmailCopy: true` and the owner's email to satisfy D-06 (both bell AND Resend). Wrap the whole call in try/catch at the call site per this repo's best-effort side-effect convention (`lib/social/activity-emit.ts`) — never let a notification failure block the flag write itself.

---

### `lib/split-sheets/agreement.ts` + `lib/vault/pdf/split-sheet.tsx` + `app/approve/[token]/page.tsx` (utility + PDF renderer, transform / file-I/O) — R5 licensee note

**Analog:** `GUIDANCE_NOTES` constant + its render block (existing, both in this repo already)

**Constant pattern** (`lib/split-sheets/agreement.ts` lines 40-45):
```typescript
export const GUIDANCE_NOTES: readonly string[] = [
  'Use your full legal name exactly as registered with your PRO. ...',
  'Where a detail is not yet known, it is shown as —. ...',
  'This split sheet confirms songwriting and publishing shares only. ...',
]
```
**R5 application:** add a new export in the same file, same style:
```typescript
export const NOTE_TO_LICENSEES =
  "Ownership shares in this split sheet are fixed as of the date signed. A songwriter's PRO, publisher, or administrator may change over time — before licensing this work or remitting payment, confirm each writer's current affiliation and payee details with the writer or via their PRO / the MLC. Funūn provides this record but does not warrant the current accuracy of contact or payment information."
```

**PDF callout box style pattern** (`lib/vault/pdf/split-sheet.tsx` lines 243-253, existing `guidanceBox`/`guidanceNote` styles — reuse directly or clone as `licenseeNoteBox`):
```typescript
guidanceBox: {
  marginTop: 8,
  borderLeft: '2pt solid #818CF8',
  paddingLeft: 10,
  paddingVertical: 2,
},
guidanceNote: {
  fontSize: 8,
  color: '#555555',
  lineHeight: 1.4,
  marginBottom: 8,
},
```
D-09 places this "beside the parties/rights block" — render a `<View style={styles.guidanceBox}><Text style={styles.guidanceNote}>{NOTE_TO_LICENSEES}</Text></View>` immediately after the parties table (near line ~338 where `colAdmin`/party rows render), not at the document foot with the other `GUIDANCE_NOTES`.

**Read-only share/export surface (D-11):** `app/approve/[token]/page.tsx` is a React server component — render the same `NOTE_TO_LICENSEES` string as a plain styled block (not `@react-pdf/renderer` `View`/`Text` — this surface is HTML/JSX) in the equivalent position beside the parties/rights display.

---

### `lib/split-sheets/live-identity.ts` (utility, transform) — R3, no code change

**Analog:** itself — read for regression-test extraction only

**Resolver signature** (existing, unchanged):
```typescript
export type LivePartyIdentitySource = {
  pro: string | null
  ipi: string | null
  publishing_designee: string | null
  administrator: string | null
  legal_name: string | null
}
// resolvePartyIdentity(frozen, claimedProfile, status) —
// live for draft/pending_approval/approved/countered,
// returns frozen snapshot for esign_pending/executed
```
**R3 application:** add `lib/split-sheets/live-identity.test.ts` (new file, no existing test) asserting the freeze boundary per RESEARCH's Code Example:
```typescript
test('esign_pending and executed never live-resolve, even with a non-null claimedProfile', () => {
  const frozen = { pro: 'ASCAP', ipi: '1', publishing_designee: null, administrator: null, legal_name: 'A' }
  const claimed = { pro: 'BMI', ipi: '2', publishing_designee: null, administrator: null, legal_name: 'B' }
  expect(resolvePartyIdentity(frozen, claimed, 'esign_pending')).toEqual(frozen)
  expect(resolvePartyIdentity(frozen, claimed, 'executed')).toEqual(frozen)
})
```
The `app/(artist)/split-sheets/[id]/page.tsx` batch loader (lines ~137-197) that feeds this resolver needs NO code change — only its `FROM artist_profiles` read target is affected, and it already reads `artist_profiles` (not `user_profiles`), so R1's drop is cosmetically neutral to this file.

---

## Shared Patterns

### Explicit field allowlist (server-owned mutation surface)
**Source:** `app/api/profile/route.ts` lines 12-33 (`EDITABLE_FIELDS`)
**Apply to:** `app/api/profile/route.ts` (R1/R2 writes), `app/api/split-sheets/[id]/correction-flag/route.ts` (R4's `FLAGGABLE_FIELDS`)
```typescript
const EDITABLE_FIELDS = [ /* explicit list, never a spread of req.body */ ]
```

### Server-owned timestamp/flag signal (never client-supplied)
**Source:** `app/api/profile/route.ts` lines ~196-215 (`lock_legal_name` → `legal_name_locked_at`)
**Apply to:** R2's `confirm_prefill_fields` → `claim_prefill[field].confirmed`. Client sends intent (`true`/field name); server computes and writes the actual timestamp/state.

### Human-gated migration discipline
**Source:** `supabase/migrations/066_split_sheet_identity_foundation.sql` lines 1-30 (header comment convention), `051_recreate_claim_collaborators_rpc.sql` (`NOTIFY pgrst, 'reload schema'`)
**Apply to:** all three new R1 migrations (071/072/073) and the R4 flags migration — every file gets the "An executor agent must NEVER run `supabase db push`" header, `CREATE OR REPLACE`/`ADD COLUMN IF NOT EXISTS`/idempotent guards, and a `NOTIFY pgrst, 'reload schema'` when a function signature changes.

### Dual-channel notification (bell + Resend)
**Source:** `lib/notifications/index.ts` `createNotification()` + `lib/social/notifications.ts` builder catalog
**Apply to:** R4's owner notification — call `createNotification(service, { ..., sendEmailCopy: true, email: ownerEmail })`.

### Best-effort side-effect wrapping
**Source:** `lib/social/activity-emit.ts` (referenced pattern, "never throws" convention)
**Apply to:** R4's notification call at the correction-flag route call site — wrap in try/catch so a notification failure never blocks the flag write.

### Semantic-blank detection
**Source:** RESEARCH.md Pattern 1 + Pitfall 6 (`COALESCE(TRIM(x), '') = ''` for text; `x IS NULL OR x = '{}'::jsonb` for JSONB)
**Apply to:** migration 071's rescue logic exclusively — do not reuse a generic isEmpty() utility (RESEARCH "Don't Hand-Roll").

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `supabase/migrations/071_user_profiles_data_rescue.sql` (the rescue UPDATE/RAISE NOTICE logic itself) | migration | batch | No prior migration in this repo performs a cross-table semantic-blank rescue; RESEARCH.md Pattern 1 is the only precedent (illustrative, not copied from existing code) |
| R4 "start amendment" deep-link target for `executed` sheets | route/component | request-response | RESEARCH Pitfall 4 confirms no amendment route/mechanism exists anywhere in the codebase today — this is a genuine build item, not an imitation; default to a guided pointer per D-08/A3, not a new lineage-tracked route |

## Metadata

**Analog search scope:** `components/profile/`, `app/api/profile/`, `app/api/user-profiles/`, `supabase/migrations/`, `lib/split-sheets/`, `lib/social/`, `lib/notifications/`, `lib/vault/pdf/`, `components/contracts/`, `app/(artist)/split-sheets/[id]/`, `app/approve/[token]/`
**Files scanned:** ~20 (ProfileForm.tsx, api/profile/route.ts, api/user-profiles/route.ts, migrations 026/051/053/066, live-identity.ts, split-sheets/[id]/page.tsx, ContractLocker.tsx, lib/social/notifications.ts, lib/notifications/index.ts, lib/email/index.ts, lib/split-sheets/agreement.ts, lib/vault/pdf/split-sheet.tsx)
**Pattern extraction date:** 2026-07-24
