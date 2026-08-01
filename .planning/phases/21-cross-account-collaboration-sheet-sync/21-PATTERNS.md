# Phase 21: Cross-Account Collaboration & Split-Sheet ↔ Project Sync - Pattern Map

**Mapped:** 2026-08-01
**Files analyzed:** 12 (new/modified, per RESEARCH.md's Recommended Project Structure + CONTEXT.md's code touchpoints)
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/078_project_members.sql` | migration | CRUD (RLS) | `supabase/migrations/064_fix_split_sheet_rls_recursion.sql` | exact — same shape of problem (two-table RLS cycle) |
| `supabase/migrations/078_project_members.sql` (child-table rewrite section) | migration | CRUD (RLS) | `supabase/migrations/001_initial_schema.sql` (tracks/vault_assets/vault_documents/tool_outputs policies) | exact — literal before-state being rewritten |
| `supabase/migrations/078_project_members.sql` (readiness trigger hardening) | migration | event-driven (trigger) | `supabase/migrations/070_readiness_definer_privilege_sweep.sql` | exact — same DEFINER-hardening precedent, same function |
| `supabase/migrations/078_project_members.sql` (auto-membership trigger) | migration | event-driven (trigger) | `supabase/migrations/072_repoint_claim_functions.sql` (`claim_collaborators()`) | role-match — plpgsql function reading `collaborators.claimed_by` |
| `lib/vault/membership.ts` | utility | transform (pure) | `lib/vault/readiness.ts` (readinessLabel/readinessItemsForProject) | role-match — pure, no-I/O helpers over vault domain types |
| `lib/dashboard/next-moves.ts` | service | transform (pure) | `lib/contracts/locker-attention.ts` (`buildAttentionSections()`) | exact — same author-stated pattern to mirror |
| `app/api/vault/[projectId]/members/route.ts` | route | CRUD (request-response) | `app/api/capabilities/approve/[grantId]/route.ts` + migration 042 (`capability_grants`) | role-match — service-role write-elevation shape |
| `components/vault/VaultProjectCard.tsx` (extend) | component | request-response | itself (existing file) | exact — extend, don't replace |
| `components/vault/SharedProjectBadge.tsx` | component | request-response | `components/vault/VaultProjectCard.tsx` (CHIP status-badge sub-pattern) | role-match — same badge-rendering idiom |
| `app/(artist)/vault/page.tsx` (add shared lane) | route (SSR page) | CRUD (read) | itself (existing file) | exact — extend, don't replace |
| `app/(artist)/dashboard/page.tsx` (rework stats + feed) | route (SSR page) | CRUD (read) | itself (existing file) | exact — extend, don't replace |
| `lib/split-sheets/lifecycle.ts` (extend for sync predicate) | utility | transform (pure) | itself (existing file) | exact — reuse existing exported vocabulary |

## Pattern Assignments

### `supabase/migrations/078_project_members.sql` — table + SECURITY DEFINER helper pair

**Analog:** `supabase/migrations/064_fix_split_sheet_rls_recursion.sql` (full file read)

**The exact bug this migration must not reintroduce** (064 lines 24–41): two tables whose RLS
policies each subquery the other via a plain `EXISTS (SELECT 1 FROM other_table ...)` cause
Postgres to abort at REWRITE time with `42P17 infinite recursion detected in policy`, breaking
every authenticated read AND any trigger that transitively reads either table (this is exactly
how `project_members` ↔ `vault_projects` will behave with a naive implementation — same shape,
new pair of tables).

**Helper-pair pattern to copy verbatim in shape** (064 lines 99–154):
```sql
CREATE OR REPLACE FUNCTION public.is_split_sheet_initiator(sheet_id UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.split_sheets
    WHERE id = sheet_id AND initiator_user_id = uid
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_split_sheet_initiator(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_split_sheet_initiator(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.is_split_sheet_initiator(uuid, uuid) IS
  'True when uid is the initiator ... SECURITY DEFINER so it can be called from the OTHER
   table''s RLS policy without re-entering this table''s own policies (would recurse — see
   migration 064). Intended for RLS policy USING clauses wrapped as (SELECT ...), not as a
   client-invoked RPC.';
```
Map directly to `is_project_owner(project_id, uid)` (reads `vault_projects`) and
`project_member_role(project_id, uid)` (reads `project_members`) — RESEARCH.md's Pattern 1
already gives the concrete SQL for these two functions and the four per-operation
`vault_projects` policies (SELECT/UPDATE/INSERT/DELETE split, replacing the single combined
`USING/WITH CHECK` policy style from migration 001).

**Rewrite-the-recursive-policies pattern** (064 lines 156–178):
```sql
DROP POLICY IF EXISTS "Initiator sees all parties" ON split_sheet_parties;
CREATE POLICY "Initiator sees all parties" ON split_sheet_parties
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_split_sheet_initiator(split_sheet_parties.split_sheet_id, auth.uid()))
  );
```
Same shape for `vault_projects`' SELECT policy reading `project_member_role()`, and
`project_members`' own SELECT policy reading `is_project_owner()` — each side of the cycle
goes through the OTHER table's DEFINER helper, never a raw subquery.

**Migration header/governance conventions to copy** (064 lines 1–22):
- Human-gated push warning: "An executor agent must NEVER run `supabase db push`... this file
  is authored and tested (string-assertion test in `__tests__/migration-064.test.ts`) but must
  not be applied automatically."
- Explicit numbering-collision note.
- `NOTIFY pgrst` schema-cache reload requirement (CONTEXT.md ②) — not shown in 064 itself but
  is this repo's standard closing statement for schema-affecting migrations; add at the end.

---

### `supabase/migrations/078_project_members.sql` — child-table RLS rewrite (tracks/vault_assets/vault_documents/tool_outputs)

**Analog:** `supabase/migrations/001_initial_schema.sql` lines 81–206 (the exact policies being replaced)

**BEFORE (verbatim, from this repo, lines 109–110 and 142–143):**
```sql
CREATE POLICY "Artists manage own vault projects" ON vault_projects
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
...
CREATE POLICY "Artists manage own tracks" ON tracks
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```
Same single-policy shape repeats verbatim for `vault_assets` (lines 161–163),
`vault_documents` (lines 183–185), and `tool_outputs` (lines 204–206) — all four key off the
ROW's own `user_id`, not the project's owner. **This is the critical rewrite target**
(RESEARCH.md Pitfall 1): today `row.user_id === vault_projects.user_id` always, because only
the owner has ever written these rows; the instant a second writer exists this conflation
breaks visibility both directions.

**AFTER — RESEARCH.md's exact recommended shape (Pattern 2):**
```sql
DROP POLICY IF EXISTS "Artists manage own tracks" ON tracks;

CREATE POLICY "tracks_select_project_owner_or_member" ON tracks
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IS NOT NULL
  );

CREATE POLICY "tracks_write_project_owner_or_editor" ON tracks
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
  )
  WITH CHECK ( ... same ... );
-- vault_documents/tool_outputs: project_id is NULLABLE — add
-- `OR (project_id IS NULL AND user_id = auth.uid())` to preserve standalone-row access.
```
Note: `tool_outputs.project_id` uses `ON DELETE SET NULL` (001 line 191) and
`vault_documents.project_id` has no NOT NULL constraint (001 line 168) — both genuinely
nullable, confirming RESEARCH's nullable-fallback clause is required, not optional, for these
two tables specifically.

**Corresponding API-route ownership-check pattern that ALSO keys on row `user_id`** (verified
in `app/api/vault/[projectId]/tracks/route.ts` lines 33–44):
```typescript
// Confirm the project belongs to this user (RLS also enforces this).
const { data: project } = await supabase
  .from('vault_projects')
  .select('id')
  .eq('id', projectId)
  .eq('user_id', user.id)
  .maybeSingle()
if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
```
Per RESEARCH.md Pitfall 4 / Open Question 1, do NOT audit/rewrite this ownership check across
every `app/api/vault/**` mutation route in this phase unless discuss-phase confirms full
editor-write-enablement is in scope — default is RLS-permits-it, API-route wiring deferred.

---

### `supabase/migrations/078_project_members.sql` — readiness trigger hardening

**Analog:** `supabase/migrations/070_readiness_definer_privilege_sweep.sql` (full file read)

`calculate_vault_readiness()` fires `AFTER INSERT/UPDATE/DELETE` on the four child tables and
does `UPDATE vault_projects SET vault_readiness_score = ...` (070 lines 16–26). It is already
`SECURITY DEFINER SET search_path = ''` as of migration 070 (verified — lines 59–64), so this
specific pitfall (RESEARCH Pitfall 3) is **already mitigated** for the score-recompute step
itself; confirm at 078-authoring time that the widened `vault_projects` UPDATE policy (Pattern
1) still lands regardless, since 070's DEFINER fix only protects the trigger's own internal
UPDATE, not an editor's original `tracks` INSERT succeeding under the child-table policy above.

**EXECUTE-lockdown pattern to copy for any new DEFINER helper** (070 lines 201–206):
```sql
-- With SECURITY DEFINER above, an unrestricted EXECUTE would let any
-- anon/authenticated caller RPC this with any project_uuid and read the
-- true, RLS-bypassed score for a project they don't own. No app code calls
-- it directly (every use is trigger-internal). Revoke, no re-grant.
REVOKE EXECUTE ON FUNCTION public.calculate_vault_readiness(uuid) FROM PUBLIC, anon, authenticated;
```
Apply the SAME no-re-grant pattern to `is_project_owner`/`project_member_role` for any
internal-only helper that doesn't need direct client RPC (the two RLS helpers in Pattern 1 DO
need `GRANT ... TO authenticated` since RLS policies invoke them as the querying role — follow
064's grant, not 070's revoke-only, for those two specifically).

---

### `supabase/migrations/078_project_members.sql` — auto-membership trigger (writer claim → viewer membership)

**Analog:** `supabase/migrations/072_repoint_claim_functions.sql`, `claim_collaborators()` (lines 52–95+)

**The live verified-identity signal to key off** (072 lines 68–72):
```sql
-- Claim all matching collaborator rows (idempotent guard: claimed_by IS NULL)
UPDATE public.collaborators
  SET claimed_by = p_user_id
WHERE LOWER(email) = LOWER(p_email)
  AND claimed_by IS NULL;
```
`claimed_by` is set EXCLUSIVELY here, via case-insensitive verified-signup email match — this
is what "VERIFIED identity" already operationally means in this codebase (RESEARCH.md,
verified by exhaustive grep). Do NOT key auto-membership off `split_sheet_parties.user_id` —
that column is written nowhere in the codebase (dead signal, RESEARCH Pitfall 2).

**Trigger-site resolution path to implement** (per RESEARCH's architecture diagram, resolve
through the join, not a flat column):
```
split_sheet_parties.collaborator_id → collaborators.claimed_by → INSERT project_members(viewer)
```
Fires on three orderings (party added after claim / claim after party added / sheet leaves
`draft`) — mirrors migration 066's `collaborators_claimed_implies_confirmed()` precedent
(trigger-tier, not app-layer, per RESEARCH's Architectural Responsibility Map) for handling
multiple event orderings in one place.

**Idempotent-guard convention to copy** (072 line 72, `AND claimed_by IS NULL`): use an
equivalent `ON CONFLICT DO NOTHING` (or existence check) on `project_members` insert so the
trigger firing from any of the three orderings never double-inserts or errors on repeat.

---

### `lib/dashboard/next-moves.ts` — `buildNextMoves()`

**Analog:** `lib/contracts/locker-attention.ts`, `buildAttentionSections()` (full file, 314 lines)

**Module-header framing to copy (adapted)** (locker-attention.ts lines 1–16):
```typescript
// ─── buildAttentionSections() — the Contract Locker's attention-first landing ──
// ...the Locker's highest-value version is pure structured queries, not an AI
// reading of the same data — Funūn generated every row this module looks at, so
// inferring what is already known would be slower and less correct than just
// asking the database. This module is that "just ask" layer: a pure, no-I/O
// derivation ... that turns plain row arrays (already fetched by the caller)
// into ... sections ... The caller does no bucketing of its own.
```

**Input/output shape pattern** (lines 179–186, 209–216):
```typescript
export type BuildAttentionSectionsInput = {
  viewerUserId: string
  sheets: AttentionSheetInput[]
  documents: AttentionDocumentInput[]
  projects: AttentionProjectInput[]
  hiddenDocumentIds: string[]
}

export function buildAttentionSections({
  viewerUserId, sheets, documents, projects, hiddenDocumentIds,
}: BuildAttentionSectionsInput): AttentionSections {
  // pure filter/map/reduce over already-fetched arrays, no DB call inside
}
```
`buildNextMoves()` should mirror this signature shape exactly: plain input arrays in
(sheets/documents reachable through BOTH owned and shared — the caller-side query change
RESEARCH flags as the one gap), a structured output object out.

**Sourcing status buckets from the SAME shared vocabulary module, not fresh literals**
(lines 187–199 — directly reusable, not just a pattern to imitate):
```typescript
import { CONSENSUS_RESET_STATUSES, type SplitSheetStatus } from '@/lib/split-sheets/lifecycle'

const AWAITING_SIGNATURE_STATUSES: SplitSheetStatus[] = [
  ...CONSENSUS_RESET_STATUSES,
  'countered',
  'esign_pending',
]
```
This bucket already answers two of the four launch action-set items ("review/approve a split
sheet", "respond to a counter-proposal"); `draftsInProgress` (lines 227–230) already answers
"complete a split-sheet draft". The ONE new requirement is money/signature items PINNED always
on top (CONTEXT.md ④) — `buildAttentionSections()` has no such pinning tier today; `next-moves`
must add a `pinned` vs `flexible` split the source module doesn't have, e.g.:
```typescript
export type NextMoveSections = {
  pinned: NextMoveRow[]   // money & signature items — never reordered
  flexible: NextMoveRow[] // softer items — future per-user prefs bolt on here
}
```

**Degrade-gracefully-not-throw convention** (lines 267–268):
```typescript
// Unrecognized status: degrade to the archive rather than throw.
settledArchiveSheetIds.push(sheet.id)
```
Apply the same posture for any next-moves status this module doesn't recognize.

---

### `lib/vault/membership.ts` — role helpers (`canEditProject`, `canManageGuests`, ROLE labels)

**Analog:** `lib/vault/readiness.ts` (pure, no-I/O helper module over vault domain types — read
for style/shape, not literal reuse) — plain exported functions, typed inputs, no Supabase
client, matching this repo's `lib/[domain]/` "pure functions preferred in lib/" convention
(CLAUDE.md Function Design). Also follow the `_LABELS`/`_VALUES` naming convention
(CLAUDE.md Naming Patterns) for the four roles: `PROJECT_ROLE_LABELS`, `PROJECT_ROLE_VALUES`.

---

### `app/api/vault/[projectId]/members/route.ts` — guest-list write-elevation

**Analog:** `app/api/capabilities/approve/[grantId]/route.ts` + `capability_grants` doctrine
(migration 042, cited in RESEARCH.md "Don't Hand-Roll" table)

**Auth-first + target-from-DB-not-body pattern to copy** (approve/[grantId]/route.ts lines
26–65):
```typescript
export async function POST(
  request: Request,
  { params }: { params: Promise<{ grantId: string }> }
) {
  // T-05-02: verifyAdmin() is the first statement — must precede any DB read.
  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { grantId } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const decision = body.decision
  if (decision !== 'approve' && decision !== 'deny') {
    return NextResponse.json({ error: 'decision must be "approve" or "deny".' }, { status: 400 })
  }

  const service = createServiceClient()

  // Load the grant row — target profile_id comes from DB, never the caller.
  const { data: grant, error: loadError } = await service
    .from('capability_grants')
    .select('id, profile_id, capability, status, role_slugs')
    .eq('id', grantId)
    .maybeSingle()
  if (!grant) return NextResponse.json({ error: 'Grant not found.' }, { status: 404 })
  if (grant.status !== 'pending') {
    return NextResponse.json({ error: 'This request was already decided.' }, { status: 409 })
  }
  // ... service-role write, decision recorded server-side ...
}
```
For `project_members` writes: swap `verifyAdmin()` for an owner/co-owner-of-THIS-project check
(resolve via `is_project_owner`/`project_member_role`, not a client-supplied role — RESEARCH's
"Known Threat Patterns" table flags exactly this Elevation-of-Privilege risk), use
`createServiceClient()` (never authenticated PostgREST insert), and validate the `role` literal
against the four allowed values the same way `decision` is validated against
`VALID_DECISIONS` above.

**Table-level write-elevation doctrine to mirror** (RESEARCH.md, migration 042 citation):
```sql
REVOKE INSERT, UPDATE, DELETE ON capability_grants FROM authenticated, anon;
-- All writes route through service-role API routes after an ownership check.
```
Apply the identical REVOKE to `project_members` in migration 078 — no direct authenticated
PostgREST write path, ever.

---

### `components/vault/VaultProjectCard.tsx` / `SharedProjectBadge.tsx` — shared-badge variant

**Analog:** `components/vault/VaultProjectCard.tsx` itself (132 lines, read in full) — extend
the existing `VaultCard` type and status-chip idiom rather than building a parallel component.

**Existing status-chip pattern to extend** (lines 32–39):
```typescript
const CHIP: Record<VaultProjectStatus, { cls: string; text: string }> = {
  released: { cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30', text: 'Live' },
  submitted: { cls: 'text-money2 bg-money/10 border-money/30', text: 'In review' },
  vault_ready: { cls: 'text-brandindigo bg-brandindigo/10 border-brandindigo/30', text: 'Scheduled' },
  in_progress: { cls: 'text-rose-400 bg-rose-500/10 border-rose-500/30', text: 'Draft' },
  shelved: { cls: 'text-rose-400 bg-rose-500/10 border-rose-500/30', text: 'Shelved' },
  archived: { cls: 'text-lavdim bg-white/5 border-hairstrong', text: 'Archived' },
}
```
**Card rendering shape to extend** — `VaultCard` type (lines 10–23) needs new OPTIONAL fields
(`sharedBy?: { ownerName: string | null }`, `viewerRole?: ProjectRole`) so existing owned-card
callers keep compiling unchanged; the badge itself follows the SAME absolute-positioned status
chip idiom already used for the readiness ring (lines 92–110):
```typescript
<span className={`absolute left-[14px] top-[14px] z-[2] inline-flex items-center gap-[7px] rounded-full border px-[11px] py-[5px] text-[12.5px] font-bold ${chip.cls}`}>
  <span className="h-[7px] w-[7px] rounded-full bg-current" />
  {chip.text}
</span>
```
Text per CONTEXT.md ③: "Shared · Maya's project · You're a viewer".

---

### `app/(artist)/vault/page.tsx` — "Shared with me" lane

**Analog:** itself (124 lines, read in full) — the existing owned-projects query is the
literal template for the new shared query, run in parallel.

**Existing owned query to mirror (add a second, parallel query alongside it)** (lines 35–50):
```typescript
const [{ data: profile }, res] = await Promise.all([
  supabase.from('user_profiles').select('artist_name').eq('id', user?.id ?? '').maybeSingle(),
  supabase
    .from('vault_projects')
    .select(`
      *,
      tracks (id, isrc, iswc, metadata),
      vault_assets (id, type),
      vault_documents (id, type, status),
      tool_outputs (id, tool_slug)
    `)
    .eq('user_id', user?.id ?? '')
    .order('created_at', { ascending: false }),
])
```
NEW query joins `project_members WHERE user_id = me` (RESEARCH's diagram, `app/(artist)/vault/
page.tsx` annotation) — this existing `.eq('user_id', user.id)` query is UNAFFECTED by the RLS
widening (app-layer filter already excludes shared rows by construction), so it stays exactly
as-is; the shared lane is a wholly separate query + separate render section, not a filter
change on this one (CONTEXT.md ③: "not mixed into the owned grid").

**Card-mapping pattern to reuse verbatim for the shared lane** (lines 57–80): same
`readinessItemsForProject()` → `VaultCard` shape, with `artist` resolved to the OWNER's name
(not the viewer's) and the new `viewerRole`/`sharedBy` fields populated.

---

### `app/(artist)/dashboard/page.tsx` — stat-strip rework + "Your next moves"

**Analog:** itself (284 lines, read in full)

**Stat to REMOVE** (lines 84–87, 137):
```typescript
const avgScore =
  total > 0
    ? Math.round(projects.reduce((sum, p) => sum + p.vault_readiness_score, 0) / total)
    : 0
...
<StatCard label="Avg readiness" value={`${avgScore}`} sub="out of 100" />
```

**`StatCard` component to reuse for the new "Closest to ready" stat** (lines 29–37):
```typescript
function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-white/40">{sub}</p>}
    </div>
  )
}
```
"Closest to ready" derives from `readinessItemsForProject()` over OWNED projects only
(RESEARCH's diagram annotation) — same gate-count math already computed per-card in
`VaultProjectCard.tsx`'s `rightLabel()` (`gatesLeft = totalItems - completeItems`), just
picking the max-score non-ready project instead of rendering every card.

**Existing owner-scoped query pattern that stays UNCHANGED for scoreboard math (③'s exclusion
rule is satisfied "for free")** (lines 52–64):
```typescript
const { data } = await supabase
  .from('vault_projects')
  .select(`*, tracks (...), vault_assets (...), vault_documents (...), tool_outputs (...)`)
  .eq('user_id', user?.id ?? '')
  .order('created_at', { ascending: false })
```
Do not widen this query for the stat strip — shared projects must stay out of `total`,
`readyCount`, and the new "Closest to ready" pick.

**"Your next moves" section insertion point**: model on the existing "My Credits preview"
conditional section (lines 155–194) — same `<section>` + header-with-"view all" link idiom,
conditionally rendered only when the feed is non-empty, feeding from `buildNextMoves()`
(new `lib/dashboard/next-moves.ts`).

---

### `lib/split-sheets/lifecycle.ts` — sync-active predicate

**Analog:** itself (existing exports: `LIVING_DRAFT_STATUSES`, `CONSENSUS_RESET_STATUSES`) —
per RESEARCH Pitfall 5, do NOT write a fresh `status === 'draft'` literal check in the new
sync code. Key the "still safe to auto-sync" predicate off this module's OWN existing
vocabulary, e.g. `status NOT IN ('esign_pending', 'executed')`, and hook sync into the SAME
`PATCH /api/split-sheets/[id]` choke point that already computes `partiesActuallyChanged` and
gates on `assertEditable` (RESEARCH's "Don't Hand-Roll" table) — do not build a second,
parallel sync mechanism.

## Shared Patterns

### SECURITY DEFINER helper pair for cross-table RLS
**Source:** `supabase/migrations/064_fix_split_sheet_rls_recursion.sql` (full pattern), reused
by `supabase/migrations/070_readiness_definer_privilege_sweep.sql`'s DEFINER-hardening
follow-up
**Apply to:** the entire `078_project_members.sql` migration — table creation, both RLS helper
functions, `vault_projects` policy split, all four child-table policy rewrites
**Convention:** `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''`, fully-qualified
`public.` table references, `REVOKE ... FROM PUBLIC, anon, authenticated` then
`GRANT ... TO authenticated` only, `COMMENT ON FUNCTION` explaining the recursion-avoidance
purpose.

### Service-role-only writes for elevated/shared resources
**Source:** `supabase/migrations/042_capability_grants.sql` (`REVOKE INSERT, UPDATE, DELETE
... FROM authenticated, anon`) + `app/api/capabilities/approve/[grantId]/route.ts`
**Apply to:** `app/api/vault/[projectId]/members/route.ts` — no client ever writes
`project_members` directly via PostgREST; every add/promote/remove routes through a service-
role API handler that resolves the caller's OWN role server-side first.

### Pure structured-query derivation (no AI, no notifications table)
**Source:** `lib/contracts/locker-attention.ts`'s `buildAttentionSections()`
**Apply to:** `lib/dashboard/next-moves.ts`'s `buildNextMoves()` — same no-I/O, plain-array-in/
structured-object-out shape; reuse `lib/split-sheets/lifecycle.ts`'s exported status buckets
rather than re-declaring status literals.

### Allowlist input validation, never a raw body spread
**Source:** `app/api/profile/route.ts`'s `EDITABLE_FIELDS` convention (cited by RESEARCH.md
V5), demonstrated concretely in `approve/[grantId]/route.ts`'s `VALID_DECISIONS` literal check
**Apply to:** `app/api/vault/[projectId]/members/route.ts`'s role-value validation on POST.

## No Analog Found

None — every file in this phase's build slate has a strong, verified same-repo analog; this
phase is explicitly "internal precedent reuse," not new-pattern territory (RESEARCH.md
Summary and Sources sections).

## Metadata

**Analog search scope:** `supabase/migrations/`, `lib/vault/`, `lib/contracts/`,
`lib/split-sheets/`, `lib/collaborators/`, `app/api/vault/`, `app/api/capabilities/`,
`app/(artist)/dashboard/`, `app/(artist)/vault/`, `components/vault/`
**Files scanned (full reads this session):** `supabase/migrations/064_fix_split_sheet_rls_recursion.sql`,
`supabase/migrations/070_readiness_definer_privilege_sweep.sql`,
`supabase/migrations/001_initial_schema.sql` (relevant range),
`supabase/migrations/072_repoint_claim_functions.sql` (relevant range),
`lib/contracts/locker-attention.ts`, `app/(artist)/dashboard/page.tsx`,
`app/(artist)/vault/page.tsx`, `components/vault/VaultProjectCard.tsx`,
`app/api/vault/[projectId]/tracks/route.ts` (relevant range),
`app/api/capabilities/approve/[grantId]/route.ts` (relevant range)
**Pattern extraction date:** 2026-08-01
