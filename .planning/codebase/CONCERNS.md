# Codebase Concerns

**Analysis Date:** 2026-06-26

## Tech Debt

### MetadataStudio Component — Oversized Monolith

**Issue:** `components/vault/MetadataStudio.tsx` is 906 lines (largest component) and combines release-level form, per-track metadata editing, composers, performers, validation reports, CWR readiness, and export controls in a single render tree.

**Files:** `components/vault/MetadataStudio.tsx`

**Impact:**
- State management is complex with 5+ top-level useState hooks (`release`, `tracks`, `savingRelease`, `savingTrack`, `embedState`, `isrcState`)
- Risk of state desync between subcomponents — example: `embedState` and `isrcState` are global object lookups by track ID instead of tracked per-entity
- Rerender performance: useMemo dependencies are spread across multiple fields; unnecessary rerenders likely when unrelated state updates
- Difficult to test individual sections (validation logic, composer editor, performer editor) in isolation

**Fix approach:**
1. Extract composer/performer editors → `components/vault/ComposerEditor.tsx`, `components/vault/PerformerEditor.tsx`
2. Extract per-track form section → `components/vault/TrackMetadataForm.tsx` (handles language, ISRC, ISWC, lyrics, recording details for a single track)
3. Extract release-level form → `components/vault/ReleaseMetadataForm.tsx`
4. Keep validation/CWR panels in the shell, thread state down via props
5. Use local state in child components for transient UI (busy flags, messages) — lift only committed data to parent

### Insufficient API Error Handling

**Issue:** Fetch requests in `components/vault/MetadataStudio.tsx` (lines 144, 173, 207, 224) don't check response.ok before calling `.json()` in most cases. Only 2 out of 4 handlers check the status.

**Files:**
- `components/vault/MetadataStudio.tsx` (lines 143–164, 170–201)
- `components/vault/ToolSidePanel.tsx` (similar pattern in fetch handlers)

**Impact:**
- If API returns a 400/500, `.json()` may fail silently or throw unpredictable errors
- User sees "Network error" for actual API errors (e.g., validation failures from the backend)
- Difficult to debug — backend rejection vs. network fault look identical to the user

**Fix approach:**
1. After every `fetch()`, check `!res.ok` before parsing JSON
2. For non-ok responses, parse error message and surface it explicitly
3. Example:
   ```typescript
   const res = await fetch(url, opts)
   if (!res.ok) {
     const err = await res.json().catch(() => ({ error: 'Unknown error' }))
     setEmbedState(s => ({ ...s, [t.id]: { busy: false, msg: err.error ?? 'Request failed' } }))
     return
   }
   const data = await res.json()
   ```

### Demo Mode Brittle — Sync Issues with Live DB Schema

**Issue:** `lib/vault/demo-store.ts` maintains a JSON file backup of DEMO_VAULT_PROJECTS in OS temp directory. When schema changes, demo objects drift from the actual production type definitions.

**Files:**
- `lib/vault/demo-store.ts`
- `lib/vault/demo.ts` (DEMO_VAULT_PROJECTS definition)

**Impact:**
- Schema migrations (001–017) may add columns that demo projects don't have
- Types like `VaultProjectRow` evolve, but demo seed data is manually maintained
- Risk: a dev runs demo mode after checking out a branch with new migrations, data structure doesn't match expectations
- Example: migration 016 added `distributor` column; demo projects must have been updated to include it

**Fix approach:**
1. Treat demo projects as a minimal set — only include fields absolutely required for the feature being tested
2. After each schema migration, audit `lib/vault/demo.ts` and update field initializations
3. Consider generating demo data more dynamically: `createDemoProject()` factory function that reads `VaultProjectRow` defaults from a schema definition rather than hardcoding
4. Add a test that validates demo objects against `VaultProjectRow` type (could be a simple `satisfies VaultProjectRow[]` assertion)

## Known Bugs

### Contract PDF Verification — Brittle JSON Extraction

**Issue:** `lib/contracts/verify.ts` line 32–42 uses regex-based JSON extraction from Claude's response. The pattern assumes Claude responds with markdown-fenced JSON; if Claude returns raw JSON or slightly malformed JSON (common edge case), `extractJson()` returns null silently.

**Files:** `lib/contracts/verify.ts` (lines 32–43, 94–109)

**Trigger:** 
1. Upload a contract PDF to Contract Locker
2. Claude's response doesn't match the exact markdown fencing pattern expected
3. Verification result defaults to all checks as "pending" with no detail

**Workaround:** Retry the upload; usually succeeds on second attempt

**Fix approach:**
1. Use Claude's structured output mode (if available in the SDK version) instead of regex extraction
2. If not available, improve the regex to handle:
   - No fencing (raw JSON)
   - Triple-backticks with or without `json` language tag
   - Whitespace before/after the JSON block
3. Log/report when extraction fails (currently silent failure):
   ```typescript
   function extractJson(text: string): Record<string, unknown> | null {
     // ... attempt markdown
     if (!result) {
       try {
         return JSON.parse(text) // fallback: try raw
       } catch (e) {
         console.warn('Failed to extract JSON from response:', text.slice(0, 200))
         return null
       }
     }
     return result
   }
   ```

### ISRC Generation State Not Validated

**Issue:** In `MetadataStudio.tsx` (lines 221–238), the `generateIsrc()` function updates local state with `setTrack()` but never persists to the database. If the user generates an ISRC, closes the component, and reopens it, the generated ISRC is lost.

**Files:** `components/vault/MetadataStudio.tsx` (lines 221–238)

**Trigger:**
1. Open Metadata Studio
2. Click "Generate" for a track's ISRC
3. See the ISRC value appear in the input
4. Refresh the page or navigate away
5. ISRC is gone (never saved)

**Impact:** User work is lost without explicit "Save track" click, which is not obvious after generation

**Fix approach:**
1. Auto-save the track after successful ISRC generation (call `saveTrack(t)` after `setTrack()`)
2. Or disable the "Save track" button and auto-save all changes (broader refactor)

## Security Considerations

### Anthropic API Key — Unvalidated in Multiple Places

**Issue:** The `ANTHROPIC_API_KEY` is used in three different API route files without consistent error handling or fallback strategy.

**Files:**
- `app/api/tools/pitchplug/route.ts` (line 97)
- `app/api/tools/[slug]/route.ts` (line 87)
- `app/api/vault/[projectId]/documents/generate/route.ts` (line 109)
- `lib/contracts/verify.ts` (lines 84–91, has graceful fallback)
- `lib/anthropic/index.ts` (line 2, throws on startup if missing)

**Risk:** Inconsistent behavior. Some endpoints check for the key explicitly; others assume it exists and will fail at runtime. `lib/anthropic/index.ts` throws during module load, so any code that imports it crashes the entire app if the key is missing (including server startup).

**Recommendation:**
1. Make the Anthropic client optional or lazy-loaded — don't throw at module load time
2. Consistent error responses across all endpoints that use Anthropic:
   ```typescript
   if (!process.env.ANTHROPIC_API_KEY) {
     return NextResponse.json(
       { error: 'AI feature not available' },
       { status: 503 }
     )
   }
   ```
3. Document in README that the key is optional for local UI testing (read-only mode)

### Database RLS Policies — Overly Permissive on Public Tables

**Issue:** `supabase/migrations/001_initial_schema.sql` (lines 29–31, 57–58) makes artist and industry profiles visible to the public with `USING (true)` for SELECT.

**Files:** `supabase/migrations/001_initial_schema.sql`

**Risk:** Moderate. The policy is intentional (profiles are meant to be discoverable), but it exposes all columns including bio, bio, social handles, and any PII captured in those fields to anyone with DB access.

**Recommendation:**
1. This is likely intentional (public discovery), but document the policy clearly in the migration
2. Ensure no PII beyond public social media handles is stored in those tables
3. Create a separate `public_artist_profiles` view that explicitly lists which columns are safe to expose

## Performance Bottlenecks

### Large Metadata Validation on Every Keystroke

**Issue:** `MetadataStudio.tsx` (lines 96–126) runs `validateRelease()` and `assessCwrReadiness()` via useMemo on every state change (triggered by form inputs). The validation is O(n tracks) and runs frequently.

**Files:** `components/vault/MetadataStudio.tsx`

**Cause:** useMemo dependencies include `release` and `tracks` individually; any field change in the release state causes recalculation

**Impact:** Noticeable UI lag on larger projects (5+ tracks) when editing metadata

**Fix approach:**
1. Debounce the validation — compute on blur/change, not on keystroke
2. Or split the dependencies more granularly — only recompute when non-transient fields change (title, type, etc.)
3. Move validation to a separate hook or effect to isolate performance impact
4. Consider server-side validation — let the API validate and only run client-side checks for UX hints

### JSONB Metadata Serialization — No Index

**Issue:** `vault_projects.sound_identity` and per-track `metadata` columns (JSONB) are queried directly but have no database indices.

**Files:** Database schema (migrations 001, 006, 008)

**Impact:** Full table scans when filtering by benchmarking data, performance degrades as the artist base scales

**Fix approach:**
1. Add GIN indices on JSONB columns:
   ```sql
   CREATE INDEX idx_vault_projects_sound_identity ON vault_projects USING GIN (sound_identity);
   ```
2. Profile queries — check if the filtering actually hits the DB or is done in-app

## Fragile Areas

### Composer/Performer Editors — Index-Based Keys

**Issue:** `MetadataStudio.tsx` (lines 609–707, 710–778) uses array index as the React key in the `.map()` loop for composers and performers. This is a known anti-pattern.

**Files:** `components/vault/MetadataStudio.tsx`

**Why fragile:** If a user adds a composer, edits the second one, then deletes the first one, React will reuse the DOM element for the first position, causing the second composer's data to appear in the wrong place or validation to run on stale data.

**Safe modification:** Use a unique identifier (e.g., `id` field on each composer object), or if the order is the only identity, regenerate keys after mutations:
```typescript
// In composer type
type Composer = {
  id?: string  // Add optional unique id
  name: string
  role: ComposerRole
  ...
}

// In editor
{composers.map((c, i) => (
  <div key={c.id || `composer-${i}`} ...>
```

**Test coverage:** No existing tests validate that adding/removing/reordering items preserves data integrity

### Track Updates — Partial State Sync

**Issue:** The `saveTrack()` function in `MetadataStudio.tsx` (lines 170–202) sends a PATCH to `/api/vault/[projectId]/tracks/[trackId]`. If the request succeeds but `router.refresh()` fails or is slow, the UI shows the saved data (via local state) but the server hasn't confirmed the update yet. If the component unmounts during `router.refresh()`, the update may be orphaned.

**Files:** `components/vault/MetadataStudio.tsx`

**Safe modification:** Wait for `router.refresh()` to complete before clearing the `savingTrack` flag, or use Optimistic UI with rollback on failure:
```typescript
async function saveTrack(t: StudioTrack) {
  setSavingTrack(t.id)
  try {
    const res = await fetch(...)
    if (!res.ok) throw new Error(await res.text())
    await router.refresh()  // Don't return early
    // refresh is done
  } catch (e) {
    setError(e.message)
    // Rollback local state if needed
  } finally {
    setSavingTrack(null)
  }
}
```

## Scaling Limits

### In-Memory Embed Processing — 60MB Ceiling

**Issue:** `app/api/vault/[projectId]/tracks/[trackId]/metadata/embed/route.ts` (line 14) allows up to 60MB MP3 files for ID3 tagging. The entire file is loaded into memory for processing.

**Files:** `app/api/vault/[projectId]/tracks/[trackId]/metadata/embed/route.ts`

**Current capacity:** Single file, synchronous processing. If multiple users embed simultaneously, the server memory usage multiplies.

**Scaling path:**
1. Use streaming MP3 processing or a worker queue (e.g., Supabase Edge Functions / Lambdas) instead of in-process
2. Set a lower in-memory ceiling (e.g., 20MB) and offload larger files
3. Add a queue for embed jobs to smooth load spikes

### Demo Store — No Cleanup

**Issue:** `lib/vault/demo-store.ts` writes projects to the OS temp directory and never cleans them up. On a dev machine running demo mode frequently, the file persists and grows.

**Files:** `lib/vault/demo-store.ts`

**Impact:** Negligible for individual dev, but the file is never cleared and becomes out of sync with the codebase if migrations are added

**Scaling path:**
1. Add a cleanup/reset command: `npm run demo:reset` that deletes the temp file
2. Or auto-cleanup on app startup if the schema version changes

## Dependencies at Risk

### node-id3 — Unmaintained

**Issue:** `node-id3` (v0.2.9) is used in `app/api/vault/[projectId]/tracks/[trackId]/metadata/embed/route.ts` for MP3 ID3 tagging. The package is no longer actively maintained (last update 2016).

**Files:** `package.json` (dependency)

**Risk:** High. If a security issue is found in the ID3 parsing logic, there's no upstream patch. Also, newer Node versions may introduce breaking changes.

**Migration plan:**
1. Evaluate alternatives: `jsmediatags` (more recent, 2023+), `easyid3` (Python wrapper, not suitable here)
2. Consider moving embed logic to a dedicated service (ffmpeg-based, cloud function)
3. Test the current behavior thoroughly before migrating — ID3 parsing is sensitive to format variations

### Stripe API Version — Hardcoded

**Issue:** No explicit API version specified when creating Stripe client instances. The client uses whatever version was set at package publish time.

**Files:** All files that use Stripe (e.g., `lib/stripe/index.ts`, `app/api/stripe/...`)

**Risk:** Low-to-moderate. Stripe occasionally makes breaking changes to API responses. If the app upgrades Stripe SDK, it may break if using a newer API version without code updates.

**Recommendation:** Explicitly set the API version in Stripe client initialization (or document the assumed version in README)

## Test Coverage Gaps

### No Unit or Integration Tests

**Issue:** Zero test files in `app/`, `components/`, or `lib/` directories. Only dependencies (zod, tsconfig-paths, etc.) have tests in node_modules.

**Files:** Entire codebase

**Risk:** High. Critical business logic has no automated verification:
- Metadata validation (`lib/metadata/validate.ts`) — untested
- Readiness scoring (`lib/vault/readiness.ts`) — untested
- API error handling — untested
- Contract PDF verification — untested
- Benchmarking gates (`lib/benchmarks/opportunity-map.ts`) — untested

**Priority:** High

**Approach:**
1. Start with core utilities: `lib/metadata/validate.ts`, `lib/vault/readiness.ts`
2. Set up Jest or Vitest (recommended: Vitest for Next.js)
3. Aim for 80%+ coverage on business logic, 50%+ overall

## Missing Critical Features

### No End-to-End Tests

**Issue:** No way to verify the full flow (upload → validate → export → distribute) automatically.

**Blocks:** Confidence in releases; manual testing on every PR

### Collaborator Profile Persistence (Roadmap Item)

**Issue:** Per-collaborator data (name, PRO, IPI/CAE #, email, phone, address) is not persisted. Each release requires re-entering collaborator details.

**Files:** Not yet implemented (listed in `docs/STATUS.md` as "Before launch" to-do)

**Blocks:** Efficient split-sheet generation, contract pre-filling, royalty registration

### Real Benchmarking Data Source

**Issue:** Benchmarking metrics are manually entered. No real connection to Spotify / Chartmetric / SoundCharts.

**Files:** `lib/benchmarks/engine.ts` (hardcoded stage calculation)

**Blocks:** Accurate opportunity matching, real-time insights

---

*Concerns audit: 2026-06-26*
