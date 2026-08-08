# Phase 26: Sync-Library Inclusion & Artist Submission - Pattern Map

**Mapped:** 2026-08-07
**Files analyzed:** 24 (new/modified)
**Analogs found:** 22 / 24

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/096_sync_library.sql` (proposed, human-gated) | migration | CRUD | `supabase/migrations/042_capability_grants.sql` | exact (small dedicated table + status CHECK + audit cols) |
| `lib/sync-library/eligibility.ts` (`hasSyncLibraryCapability`) | utility | CRUD (read) | `lib/capabilities/*` `hasCapability()` pattern (via `capability_grants`) / `lib/deals/catalog.ts` | role-match |
| `lib/sync-library/submission.ts` (status-transition validators) | utility | transform | `lib/deals/catalog.ts` (pure predicate/filter functions, no I/O) | exact (pure, unit-testable transform style) |
| `lib/sync-library/admission.ts` (`admitSubmission`/`rejectSubmission`) | service | CRUD | `app/api/capabilities/approve/[grantId]/route.ts` (approve/deny state-machine logic, currently inline in the route — extract to a service module) | role-match |
| `lib/deals/catalog.ts` (`isRightsReady` — MODIFIED) | utility | transform | itself (existing file, extend in place) | exact |
| `lib/deals/catalog-query.ts` (`loadCatalogPage` — MODIFIED) | service | request-response | itself (existing file, extend in place) | exact |
| `lib/deals/request-target.ts` (`authorizeRequestTarget` — MODIFIED) | service | request-response | itself (existing file, extend in place) | exact |
| `app/api/webhooks/docuseal/route.ts` (EXTENDED — dispatch by doc kind) | route | event-driven | itself (existing file, extend in place) | exact |
| `app/api/sync-library/invite/route.ts` | route | request-response | `app/api/capabilities/approve/[grantId]/route.ts` (staff-only decision route) | exact (staff decision + capability_grants write) |
| `app/api/sync-library/[projectId]/submit/route.ts` | route | request-response | `app/api/split-sheets/[id]/mint-envelope/route.ts` (ownership-gated session-client read → service-client write, pre-flight gates before spend) | role-match |
| `app/api/sync-library/[projectId]/mint-agreement/route.ts` | route | request-response | `app/api/split-sheets/[id]/mint-envelope/route.ts` (PDF render → `docusealProvider.createRequest()` → persist) | exact |
| `app/api/sync-library/admin/[submissionId]/route.ts` (admit/reject/withdraw) | route | request-response | `app/api/capabilities/approve/[grantId]/route.ts` | exact |
| `app/api/sync-library/admin/[submissionId]/remove/route.ts` (leadership-only takedown) | route | request-response | `app/api/capabilities/approve/[grantId]/route.ts` + `requireStaff(['leadership'])` pattern from Phase 25 admin routes | role-match |
| `lib/vault/pdf/blanket-agreement.tsx` | utility (PDF render) | transform | `lib/vault/pdf/split-sheet.tsx` (sibling renderer, reuse `lib/vault/pdf/fonts.ts`'s `registerFunuunPdfFonts()`) | exact |
| `components/sync-library/BlanketAgreementSigningEmbed.tsx` | component | request-response (client embed) | `components/.../SplitSheetSigningEmbed.tsx` | exact |
| `components/nav/ArtistNav.tsx` (MODIFIED — reorder + new item + gating + "New" dot) | component | request-response | itself (existing file, extend `ITEMS` array + add `hasSyncLibraryAccess` prop) | exact |
| `components/nav/icons.tsx` (MODIFIED — new `SyncLibraryIcon`) | component | transform (render) | `DealsIcon`/`LockerIcon` in same file | exact |
| `app/(artist)/layout.tsx` (MODIFIED — server-side `hasSyncLibraryAccess` check) | provider (server) | request-response | itself (existing file — already resolves `capabilities` server-side and passes to `ArtistNav`) | exact |
| `app/(artist)/dashboard/page.tsx` (MODIFIED — invited spotlight card) | component (server) | request-response | itself (existing pinned-card family, "Your next moves") | exact |
| `components/vault/TrackList.tsx` (MODIFIED — "+ Sync Library" row action + status chip) | component | request-response | itself (existing `AudioSlot` ghost-pill idiom in same file) | exact |
| `components/vault/VaultProjectCard.tsx` (reference for `CHIP` idiom, not directly modified) | component | transform (render) | itself | exact (chip pattern source) |
| `components/vault/DocumentCard.tsx` (reference for `STATUS_META` chip idiom) | component | transform (render) | itself | exact (chip pattern source) |
| `app/(artist)/sync-library/page.tsx` (new hub) | route (page, server) | request-response | `app/(artist)/dashboard/page.tsx` / `app/(artist)/vault/page.tsx` (server fetch + section layout) | role-match |
| `components/admin/SyncLibraryAdmin.tsx` (invite panel + curation queue) | component | request-response | `components/admin/CapabilityRequestsAdmin.tsx` (list state machine: optimistic removal, `pendingId`, error banner) + `components/admin/DealsQueue.tsx` (filter chips, relative time) + `components/admin/BuyerOrgsAdmin.tsx` (collapsed toggle-form) | exact (composite of 3 admin analogs) |
| `app/(admin)/admin/sync-library/page.tsx` | route (page, server) | request-response | admin pages backing `BuyerOrgsAdmin`/`CapabilityRequestsAdmin`/`DealsQueue` | exact |
| `lib/notifications/*` (new "sync library admitted" + "new-feature highlight" calls) | utility | event-driven | `lib/social/notifications.ts` `buildSplitSheetExecutedNotification()` + `lib/notifications/index.ts` `createNotification()` | exact |

## Pattern Assignments

### `lib/sync-library/eligibility.ts` (utility, CRUD-read)

**Analog:** `capability_grants` read pattern (migration 042) + `lib/deals/catalog.ts`'s pure-predicate style.

**Core pattern** — a pure boolean check reading an already-fetched grant row, following `isRightsReady`'s "accept already-fetched shape, no I/O inside" convention (`lib/deals/catalog.ts:28-38`):
```typescript
export function isRightsReady(project: CatalogProjectLike, stage3: Stage3Result): boolean {
  if (project.is_public !== true) return false
  if (project.vault_readiness_score == null) return false
  if (project.vault_readiness_score < CATALOG_READINESS_THRESHOLD) return false
  return stage3.canContinue
}
```
Mirror this exact shape for `hasSyncLibraryCapability(grant: { capability: string; status: string } | null): boolean`.

---

### `lib/sync-library/submission.ts` (utility, transform — status-transition validators)

**Analog:** `lib/deals/catalog.ts`'s `buildCatalogFilter`/`projectMatchesKeyBpm` — pure functions, allowlist validation, no I/O, unit-testable without a DB (lines 111-154, 168-190). Apply the same "reject invalid input early, never throw on bad input, return typed result" doctrine to the `applied → under_review → agreement_pending → admitted/rejected/withdrawn/removed` state machine.

---

### `app/api/sync-library/[projectId]/submit/route.ts` and `mint-agreement/route.ts` (route, request-response)

**Analog:** `app/api/split-sheets/[id]/mint-envelope/route.ts`

**Auth + ownership pattern** (lines 108-131):
```typescript
const apiClient = await createApiClient()
const { data: { user } } = await apiClient.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

const { id } = await params
const { data: sheet, error: sheetError } = await apiClient
  .from('split_sheets')
  .select('*, split_sheet_parties(*)')
  .eq('id', id)
  .eq('initiator_user_id', user.id)   // ownership check on SESSION client
  .maybeSingle()
if (sheetError || !sheet) {
  return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 })
}
```
Apply the identical shape to the submit route: session client verifies `vault_projects.user_id = user.id`, THEN switch to `createServiceClient()` for the insert into the new sync-library submission table.

**Pre-flight gate ordering pattern** (lines 179-198, "Counsel gate"): every gate that can block a legally-binding mint runs BEFORE the first DocuSeal call — mirror for the blanket-agreement mint route (temporary-draft-agreement gate note in CONTEXT.md is explicitly NOT a build blocker per owner, but the STRUCTURAL pattern — gates-before-spend — still applies).

**Mint call + persist pattern** (lines 291-348): `docusealProvider.createRequest()` called once, after all gates pass, followed by a persisted row. For the blanket agreement, persist via `vault_documents` insert with `type = 'blanket_agreement'` and `document_data.esign` JSONB (per RESEARCH's recommended lightweight path), NOT a new `esign_envelopes` row — do not mirror lines 319-374 (the `esign_envelopes`/`esign_envelope_signers` insert) verbatim; that schema is split-sheet-specific.

---

### `app/api/webhooks/docuseal/route.ts` (EXTENDED — dispatch by doc kind)

**Analog:** itself, existing structure (full file read, 484 lines).

**Non-negotiable ordering to preserve** (lines 18-46 comment block + lines 197-235):
```typescript
// 1. RAW BODY FIRST — read text before any parsing (line 199)
const rawBody = await request.text()
const signature = request.headers.get(SIGNATURE_HEADER)
// 2. THE GATE — verify BEFORE any DB touch (line 213)
if (!verifyDocusealSignature(rawBody, signature, secret)) {
  return NextResponse.json({ error: 'Webhook verification failed' }, { status: 401 })
}
// 3. Only now safe to parse (line 220)
payload = JSON.parse(rawBody)
```

**Dispatch fix required** (lines 239-263): today the FIRST lookup after signature verification is unconditionally against `esign_envelopes`. Extend with a fallback lookup (e.g. by `vault_documents.document_data->>'esign'->>'requestId'` or a small indexed mapping column) when no `esign_envelopes` row matches `event.requestId`, and run blanket-agreement-specific completion logic (mark `vault_documents.status = 'signed'`, advance the sync-library submission's status) instead of the split-sheet fanout/certificate logic that follows for lines 264-483. Do NOT let a blanket-agreement submission fall through into `renderAndStoreCertificate`/`buildFanoutRows` — those are split-sheet-only.

**Idempotency guard pattern to replicate** (lines 265-269):
```typescript
if (envelope.status === 'completed') {
  return NextResponse.json({ ok: true, idempotent: true })
}
```
Apply the same idempotent-on-status guard to the blanket-agreement branch (check `vault_documents.status !== 'signed'` before writing).

---

### `app/api/sync-library/invite/route.ts` and `app/api/sync-library/admin/[submissionId]/route.ts` (route, request-response — staff-only)

**Analog:** `app/api/capabilities/approve/[grantId]/route.ts` (full file read)

**Staff-gate-first doctrine** (lines 27-30):
```typescript
export async function POST(request: Request, { params }: { params: Promise<{ grantId: string }> }) {
  const auth = await verifyAdmin()   // T-05-02: first statement, precedes any DB read
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  ...
```
For the leadership-only removal route, swap `verifyAdmin()` for `requireStaff(['leadership'])` per RESEARCH's Pattern/`Don't Hand-Roll` table and CONTEXT's "LEADERSHIP-ONLY for now" decision.

**Input validation allowlist pattern** (lines 38-46):
```typescript
const VALID_DECISIONS = ['approve', 'deny'] as const
const decision = body.decision
if (decision !== 'approve' && decision !== 'deny') {
  return NextResponse.json({ error: 'decision must be "approve" or "deny".' }, { status: 400 })
}
```
Apply identically for `admit`/`reject`/`withdraw`/`remove` transitions — never trust the raw client value.

**Double-decide / target-from-DB doctrine** (lines 53-71): target id loaded from the DB row (never trusted from the request body); `409` returned if the row isn't in an actionable status. Mirror exactly for admit/reject (submission must be `agreement_signed`/pending-admit) and for remove (song must be `admitted`).

**Audit + notify after mutation** — this route does NOT call `logStaffAction`; use `lib/staff/audit.ts` instead (see Shared Patterns below) for every admit/reject/remove.

---

### `components/admin/SyncLibraryAdmin.tsx` (component, request-response)

**Analog 1 — list state machine:** `components/admin/CapabilityRequestsAdmin.tsx` (full file, 128 lines)

**Optimistic decision handler pattern** (lines 41-60):
```typescript
const handleDecision = async (grantId: string, decision: 'approve' | 'deny') => {
  setPendingId(grantId)
  setActionError(null)
  try {
    const res = await fetch(`/api/capabilities/approve/${grantId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error((json as { error?: string }).error ?? 'Something went wrong — please try again.')
    }
    setRequests(prev => prev.filter(r => r.grantId !== grantId))
  } catch (err) {
    setActionError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
  } finally {
    setPendingId(null)
  }
}
```
Copy this exact shape for the admit/reject curation-queue actions (row action buttons, lines 103-121, using `bg-white text-black`/`border-white/10 text-white/60` classes — matches UI-SPEC's declared Accent rule for "Admit"/"Reject").

**Analog 2 — filter chips + relative time:** `components/admin/DealsQueue.tsx` (`CHIP_BASE`/`CHIP_ON`/`CHIP_OFF`, `formatTimeSince`-style relative time) — reuse verbatim per UI-SPEC Screen F.

**Analog 3 — collapsed invite toggle form:** `components/admin/BuyerOrgsAdmin.tsx:285`'s exact toggle-button class (`mb-4 rounded-lg bg-grad px-4 py-2.5 text-[13px] font-bold text-white shadow`) for "+ Invite artist".

---

### `components/nav/ArtistNav.tsx` (MODIFIED)

**Analog:** itself (full file, 337 lines)

**Items array + capability-gate pattern** (lines 25-55, 89-93):
```typescript
type Item = {
  href: string
  label: string
  match: string
  Icon: (p: { gradient?: boolean; className?: string }) => React.ReactNode
  requiresCapability?: 'artist' | 'industry'
}
const ITEMS: Item[] = [
  { href: '/vault', label: 'Sound Vault', match: '/vault', Icon: VaultIcon, requiresCapability: 'artist' },
  { href: '/contracts', label: 'Contract Locker', match: '/contracts', Icon: LockerIcon, requiresCapability: 'artist' },
  { href: '/deals', label: 'Deals', match: '/deals', Icon: DealsIcon, requiresCapability: 'artist' },
  { href: '/split-sheets', label: 'Split Sheets', match: '/split-sheets', Icon: LockerIcon },
  ...
]
const visibleItems = ITEMS.filter(
  item => !item.requiresCapability || capabilities.includes(item.requiresCapability)
)
```
Two changes needed here: (1) reorder — move the Split Sheets entry to sit directly after Contract Locker in the array (currently after Deals); (2) insert a new `{ href: '/sync-library', label: 'Sync Library', match: '/sync-library', Icon: SyncLibraryIcon }` entry directly after Deals, but this gate is DATA-DRIVEN (≥1 admitted song), not a static `requiresCapability` string — extend the filter with a second boolean prop `hasSyncLibraryAccess?: boolean` passed down from `app/(artist)/layout.tsx`, following the exact precedent of how `capabilities` itself is already resolved server-side and passed as a prop (line 66-76: `capabilities = ['artist']` prop, sourced from a server-side `capability_grants` read, "never fetched client-side").

**Active-item + "New" dot render pattern** (lines 244-280): add a small `bg-brandfuchsia` dot on the icon's top-right corner (matches `NotificationBell`'s unread-dot treatment per UI-SPEC) conditional on an unseen-highlight flag, cleared on first `/sync-library` visit.

---

### `components/vault/TrackList.tsx` (MODIFIED — "+ Sync Library" row action)

**Analog:** itself, `AudioSlot` ghost-pill idiom (lines 60-65, 273-286)

The existing `AudioSlot` renders a `+ {label}` ghost pill when a slot is empty and a filled state otherwise. Mirror this exact idiom for the new "+ Sync Library" pill: `border-white/10 text-white/60 hover:border-white/30 hover:text-white` (matches UI-SPEC Screen C), replaced in place by the Status Chip (from `DocumentCard.tsx`'s `STATUS_META`/`VaultProjectCard.tsx`'s `CHIP` idiom — colored dot + pill border + label, never solid fill, per `components/vault/DocumentCard.tsx:7-15`) once a submission exists. Scope to project OWNER only (same ownership check every other write-affordance in this file already applies — do not gate on `canManage` per UI-SPEC's explicit correction, but DO scope to the project owner, matching this file's existing convention).

---

### `lib/vault/pdf/blanket-agreement.tsx` (utility, transform)

**Analog:** `lib/vault/pdf/split-sheet.tsx` (sibling renderer — not read in full this pass, but RESEARCH/CLAUDE.md both flag its font-registration requirement as load-bearing)

**Must-import pattern:** `registerFunuunPdfFonts()` from `lib/vault/pdf/fonts.ts` — RESEARCH Pitfall/Security section flags this as a previously-shipped Unicode-mangling bug (P17-08) on the near-identical split-sheet renderer; any new renderer that skips this import reintroduces it.

---

### `lib/notifications` calls (new-feature highlight, admission, rejection)

**Analog:** `lib/notifications/index.ts` `createNotification()` (full file read, first 60 lines) + `lib/social/notifications.ts` `buildSplitSheetExecutedNotification()` (referenced, not read this pass — same module, called at `app/api/webhooks/docuseal/route.ts:456-467`)

**Call pattern** (webhook route, lines 448-467):
```typescript
const notified = new Set<string>()
for (const party of sheet.split_sheet_parties) {
  if (!party.user_id || notified.has(party.user_id)) continue
  notified.add(party.user_id)
  const payload = buildSplitSheetExecutedNotification({
    recipientId: party.user_id,
    splitSheetId: sheet.id,
    songName: sheet.song_name,
    partyId: party.id,
    partyName: party.name,
  })
  await createNotification(service, { ...payload, data: { ...payload.data, reconcileOffered } })
}
```
Mirror for: (1) admission-triggered "new-feature highlight" notification — build a `buildSyncLibraryAdmittedNotification()` sibling function returning the exact title string from UI-SPEC ("'[Song]' is now live in the Sync Library — manage your catalogue here", no body, title-only per `lib/social/notifications.ts`'s dominant pattern); (2) rejection notification with the optional staff reason surfaced in `data`.

**Signature (top of file, lines 10-25):**
```typescript
export async function createNotification(
  service: SupabaseClient,
  args: {
    userId: string
    type: string
    title: string
    body?: string | null
    link?: string | null
    data?: Record<string, unknown>
    ...
  }
): Promise<{ ok: boolean; error?: string }>
```
Non-throwing `{ ok, error }` return — never `await` and ignore, but never let a notification failure abort the primary write (same doctrine `logStaffAction` documents, see below).

---

## Shared Patterns

### Server-owned write doctrine (session client for ownership, service client for mutation)
**Source:** `app/api/split-sheets/[id]/mint-envelope/route.ts:108-134`
**Apply to:** every new sync-library route (`submit`, `mint-agreement`, `invite`, `admin/[submissionId]`, `admin/[submissionId]/remove`)
```typescript
const apiClient = await createApiClient()
const { data: { user } } = await apiClient.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const { data: project } = await apiClient.from('vault_projects').select('*').eq('id', projectId).eq('user_id', user.id).maybeSingle()
if (!project) return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 })
const service = createServiceClient()
// writes below use `service`, never `apiClient`
```

### Staff authorization gate — first statement, DB-loaded target
**Source:** `app/api/capabilities/approve/[grantId]/route.ts:27-30` (staff gate) + `lib/staff/audit.ts` (audit)
**Apply to:** all `/api/sync-library/admin/*` and `/api/sync-library/invite` routes
```typescript
const auth = await verifyAdmin()   // or requireStaff(['leadership']) for the removal route
if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
```
Every staff mutation MUST call `logStaffAction(service, { actorId, action, targetType, targetId, changes })` unconditionally after the write (`lib/staff/audit.ts:20-39`) — never fails the primary write on a log error (`{ ok, error }` non-throwing return, mirrors `createNotification`).

### Single-implementation catalogue gate (avoid drift)
**Source:** `lib/deals/catalog.ts:33-38` (`isRightsReady`) and `lib/deals/request-target.ts:65-120` (`authorizeRequestTarget`)
**Apply to:** both files MUST call the same new admission-status helper — today `authorizeRequestTarget` inline-duplicates `project.is_public !== true` (line 85) rather than delegating to `isRightsReady`. Phase 26 fixes this by having BOTH call one new `isAdmittedToSyncLibrary()` (or similar) helper, not adding a third independent copy.
```typescript
// lib/deals/catalog.ts — REPLACE this line:
if (project.is_public !== true) return false
// lib/deals/request-target.ts — REPLACE this line (85):
if (project.is_public !== true) return false
// BOTH → call the same new admission-status check against the sync-library submission table
```

### E-sign state round-trip (blanket agreement, lightweight path)
**Source:** `lib/esign/provider.ts:111-146` (unmodified, reused as-is)
```typescript
import { readEsignState, allSigned } from '@/lib/esign/provider'
const state = readEsignState(vaultDocument.document_data)
if (state && allSigned(state)) { /* blanket agreement fully executed */ }
```
Apply to: `mint-agreement/route.ts` (writing `document_data.esign`), the webhook dispatch fallback branch, and the Sync Library hub's "Your agreement" section (reading signed date / `signedFileUrl`).

### Status-chip idiom (colored dot + pill border, never solid fill)
**Source:** `components/vault/DocumentCard.tsx:7-15` (`STATUS_META`) and `components/vault/VaultProjectCard.tsx`'s `CHIP`
**Apply to:** `TrackList.tsx` row status, admin curation-queue stage chip, Sync Library hub "In progress" section — exact color/class values are specified in `26-UI-SPEC.md`'s Status Chip Semantics tables (amber/emerald/rose/gradient/muted).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `components/nav/icons.tsx` new `SyncLibraryIcon` glyph | component (icon) | transform | No existing "shelf/catalogue" motif in the icon set; construction convention (24×24, `stroke="currentColor"`, `gradient?` prop) is fully specified by sibling icons (`DealsIcon`/`LockerIcon`), but the glyph itself is new-drawn per UI-SPEC Screen A |
| One-time coach-mark component (nav-anchored tooltip, "Got it") | component | event-driven | RESEARCH/UI-SPEC both note this should become a small reusable "newly-unlocked feature" primitive; no existing coach-mark/tooltip-on-first-visit component was found in this codebase to point to as an analog — recommend building fresh, generalized for reuse per CONTEXT's explicit ask |

## Metadata

**Analog search scope:** `lib/deals/`, `lib/esign/`, `lib/staff/`, `lib/notifications/`, `lib/social/`, `lib/vault/pdf/`, `app/api/split-sheets/`, `app/api/webhooks/docuseal/`, `app/api/capabilities/`, `components/nav/`, `components/admin/`, `components/vault/`, `app/(artist)/`, `supabase/migrations/042_capability_grants.sql`, `supabase/migrations/062_split_sheet_esign_envelopes.sql`
**Files scanned (read in full or targeted):** `lib/esign/provider.ts`, `lib/deals/catalog.ts`, `lib/deals/catalog-query.ts` (referenced via RESEARCH), `lib/deals/request-target.ts`, `app/api/split-sheets/[id]/mint-envelope/route.ts`, `app/api/webhooks/docuseal/route.ts`, `components/nav/ArtistNav.tsx`, `components/admin/CapabilityRequestsAdmin.tsx`, `lib/staff/audit.ts`, `app/api/capabilities/approve/[grantId]/route.ts`, `supabase/migrations/042_capability_grants.sql`, `lib/notifications/index.ts`, `components/vault/TrackList.tsx` (targeted grep), `components/vault/DocumentCard.tsx` (targeted grep)
**Pattern extraction date:** 2026-08-07
