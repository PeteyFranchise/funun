# Phase 39: Writer's Room — the take as a real review surface - Pattern Map

**Mapped:** 2026-09-12
**Files analyzed:** 11 (new + modified)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `components/catalogue/TimedTrackPlayer.tsx` (modify) | component | request-response + client audio decode | itself (existing structure) + `lib/catalogue/level-match.ts` for decode pattern | in-place refinement |
| `components/catalogue/VersionComparisonPanel.tsx` (modify) | component | request-response + client audio decode | itself + `lib/catalogue/level-match.ts` | in-place refinement |
| `lib/catalogue/waveform.ts` (new) | utility | transform (pure decode-and-extract) | `lib/catalogue/level-match.ts` (decode shape) + `lib/catalogue/record-over-beat.ts`'s `waveformPeaks()` (algorithm, reused not copied) | exact (module shape) |
| `lib/catalogue/waveform.test.ts` (new) | test | unit | `lib/catalogue/record-over-beat.ts` pairs with existing `*.test.ts` convention (pure-function unit tests, no mocks) | role-match |
| `supabase/migrations/NNN_writer_room_range_comments_and_pins.sql` (new, number TBD) | migration | CRUD + RLS | `supabase/migrations/160_writer_room_timed_track_comments.sql` (comment ALTER/trigger half) + `supabase/migrations/015_dsr_imports.sql` (pins RLS half) | exact |
| `__tests__/migration-NNN-writer-room-range-pins.test.ts` (new) | test | content-assertion | `__tests__/migration-218-auth-diagnostics.test.ts` | exact |
| `app/api/works/[workId]/versions/[versionId]/comments/route.ts` (modify) | route | request-response, CRUD | itself (existing GET/POST) | exact (extend in place) |
| `app/api/works/[workId]/versions/complete/route.ts` (modify) | route | request-response, CRUD | itself; bounded-array validation analog is `app/api/works/[workId]/blocks/reorder/route.ts` | role-match + exact (array bounding) |
| `app/api/works/[workId]/versions/[versionId]/route.ts` (modify, peaks PATCH) | route | request-response, CRUD | `app/api/works/[workId]/versions/complete/route.ts` (direct `work_versions` write, no RPC) | role-match |
| `app/api/works/[workId]/versions/[versionId]/pins/route.ts` (new) | route | request-response, CRUD | `app/api/works/[workId]/versions/[versionId]/comments/route.ts` (GET/POST shape, access-gate call) | role-match |
| `lib/catalogue/version-comments.ts` (modify) | utility (presenter) | transform | itself (existing `presentVersionComments`) | exact (extend in place) |

## Pattern Assignments

### `lib/catalogue/waveform.ts` (utility, transform) — NEW

**Analog:** `lib/catalogue/level-match.ts` (decode pattern) + `lib/catalogue/record-over-beat.ts` (the reused `waveformPeaks()`)

**Full analog file** (`lib/catalogue/level-match.ts`, 44 lines) — copy the decode-context lifecycle exactly:
```typescript
async function decodeRms(context: AudioContext, url: string): Promise<number> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Could not load a take for level matching.')
  const buffer = await context.decodeAudioData(await response.arrayBuffer())
  return rmsFromChannels(Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index)))
}

export async function analyzePlaybackLevels(urlA: string, urlB: string): Promise<{ a: number; b: number }> {
  const context = new AudioContext()
  try {
    const [rmsA, rmsB] = await Promise.all([decodeRms(context, urlA), decodeRms(context, urlB)])
    return levelMatchedVolumes(rmsA, rmsB)
  } finally {
    await context.close().catch(() => undefined)
  }
}
```
Follow this shape for the new helper: one `AudioContext`, `try { decode } finally { close().catch(() => undefined) }`. Do not open a context per call site — one helper, reused at creation-time and at D-03 backfill-time.

**Reused function — do not reimplement** (`lib/catalogue/record-over-beat.ts:46-66`):
```typescript
export function waveformPeaks(
  buffer: Pick<AudioBuffer, 'length' | 'numberOfChannels' | 'getChannelData'>,
  barCount: number
): number[] {
  if (barCount <= 0 || buffer.length <= 0 || buffer.numberOfChannels <= 0) return []
  const bars: number[] = []
  for (let bar = 0; bar < barCount; bar += 1) {
    const from = Math.floor((bar / barCount) * buffer.length)
    const to = Math.max(from + 1, Math.floor(((bar + 1) / barCount) * buffer.length))
    let peak = 0
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const samples = buffer.getChannelData(channel)
      for (let index = from; index < to && index < samples.length; index += 1) {
        peak = Math.max(peak, Math.abs(samples[index] ?? 0))
      }
    }
    bars.push(peak)
  }
  const maximum = Math.max(...bars, 0.001)
  return bars.map(peak => Math.max(0.08, peak / maximum))
}
```
Import this with `import { waveformPeaks } from '@/lib/catalogue/record-over-beat'` — do NOT copy its body into `waveform.ts`. The new file's job is: (1) decode a `Blob` or fetch+decode a URL into an `AudioBuffer` (branching for upload-Blob vs backfill-URL call sites), (2) call `waveformPeaks(buffer, barCount)`, (3) scale to the stored integer range (`Math.round(peak * 100)`, matching `WAVE_BARS`'s existing 0–100 percent-height convention so `TimedTrackPlayer`'s `style={{ height: '${height}%' }}` JSX needs no change).

**Suggested shape (composed from the two analogs above, not verbatim from either):**
```typescript
export async function extractPeaksFromBlob(blob: Blob, barCount = 200): Promise<number[]> {
  const context = new AudioContext()
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer())
    return waveformPeaks(buffer, barCount).map(peak => Math.round(peak * 100))
  } finally {
    await context.close().catch(() => undefined)
  }
}
```

---

### `lib/catalogue/waveform.test.ts` (test, unit) — NEW

**Analog:** the project's pure-function unit-test convention (no dedicated `record-over-beat.test.ts` was located in this pass, but `level-match.ts`'s exported pure functions — `rmsFromChannels`, `levelMatchedVolumes` — are the testable-in-isolation shape to copy: test the math functions directly with hand-built `Float32Array`/array-of-numbers fixtures, not a real `AudioContext`). Structure tests around any pure helper `waveform.ts` exports (e.g. the 0–100 scaling step) rather than trying to mock `AudioContext.decodeAudioData` in jsdom.

---

### Migration (new, number unassigned — refer to as "the range-comments-and-pins migration")

**Two analogs, one for each half:**

**Half A — range comment ALTER + trigger extension.** Analog: `supabase/migrations/160_writer_room_timed_track_comments.sql` (full file, 386 lines, already read in full).

CHECK-constraint style to copy (lines 20-24):
```sql
CHECK (body = btrim(body) AND char_length(body) BETWEEN 1 AND 2000),
CHECK (timestamp_ms BETWEEN 0 AND 86400000),
CHECK (cardinality(mentioned_user_ids) <= 25),
```
→ new constraints follow the exact same paired-CHECK style:
```sql
ALTER TABLE public.work_version_comments
  ADD COLUMN end_timestamp_ms INTEGER,
  ADD CONSTRAINT work_version_comments_end_after_start
    CHECK (end_timestamp_ms IS NULL OR end_timestamp_ms > timestamp_ms),
  ADD CONSTRAINT work_version_comments_end_range
    CHECK (end_timestamp_ms IS NULL OR end_timestamp_ms BETWEEN 1 AND 86400000);
```

REVOKE/column-GRANT pattern to copy (lines 64-69) — every new SELECT-able column must be added to this list:
```sql
REVOKE ALL ON TABLE public.work_version_comments FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, work_id, version_id, parent_comment_id, author_user_id, body,
  timestamp_ms, mentioned_user_ids, resolved_at, resolved_by_user_id,
  carried_from_version_id, carried_from_comment_id, created_at
) ON public.work_version_comments TO authenticated;
```
→ add `end_timestamp_ms` to this GRANT list.

`SECURITY DEFINER` trigger function signature and duration-bound check to copy (lines 80-101, esp. 98-101):
```sql
CREATE OR REPLACE FUNCTION public.validate_work_version_comment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_version public.work_versions%ROWTYPE;
...
  IF v_version.duration_seconds IS NOT NULL
     AND NEW.timestamp_ms > ceil(v_version.duration_seconds * 1000)::INTEGER THEN
    RAISE EXCEPTION 'comment_timestamp_out_of_range' USING ERRCODE = '22023';
  END IF;
```
→ add the twin check research flagged as required (Open Question 2): `end_timestamp_ms` against the same `duration_seconds` bound, using the same `RAISE EXCEPTION ... USING ERRCODE` idiom and a new distinct error string (e.g. `comment_end_timestamp_out_of_range`).

RPC signature/validation style to copy (lines 158-209, `create_work_version_comment`):
```sql
CREATE OR REPLACE FUNCTION public.create_work_version_comment(
  p_work_id UUID,
  p_version_id UUID,
  p_body TEXT,
  p_timestamp_ms INTEGER,
  p_parent_comment_id UUID DEFAULT NULL,
  p_mentioned_user_ids UUID[] DEFAULT '{}'::UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
...
  IF p_timestamp_ms IS NULL OR p_timestamp_ms NOT BETWEEN 0 AND 86400000 THEN
    RAISE EXCEPTION 'invalid_comment_timestamp' USING ERRCODE = '22023';
  END IF;
```
→ add `p_end_timestamp_ms INTEGER DEFAULT NULL` parameter with the identical `IS NULL OR ... NOT BETWEEN` guard style, plus `end_timestamp_ms IS NULL OR end_timestamp_ms > p_timestamp_ms`.

`REVOKE EXECUTE`/`GRANT EXECUTE` footer pattern (lines 371-384) — every RPC signature change requires re-stating both lines with the new full parameter list:
```sql
REVOKE EXECUTE ON FUNCTION public.create_work_version_comment(uuid, uuid, text, integer, uuid, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_work_version_comment(uuid, uuid, text, integer, uuid, uuid[])
  TO authenticated;
```

Pitfall 5 (carry-forward clamp) touches this RPC too — `review_work_version_comment_carry()` lines 333-357's `LEAST()` clamp on `timestamp_ms` must be extended so a span's `end_timestamp_ms` is clamped together with `timestamp_ms`, never independently (see RESEARCH.md Pitfall 5 for the exact failure mode).

**Half B — `work_version_pins` table, author-only RLS.** Analog: `supabase/migrations/015_dsr_imports.sql` (full file, 28 lines) — the only table in this codebase with a strict single-owner RLS shape (no room/workspace-membership OR-branch):
```sql
CREATE TABLE IF NOT EXISTS dsr_imports (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  ...
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dsr_imports_user_idx ON dsr_imports (user_id, created_at DESC);

ALTER TABLE dsr_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dsr_imports_select_own" ON dsr_imports FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "dsr_imports_insert_own" ON dsr_imports FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "dsr_imports_delete_own" ON dsr_imports FOR DELETE TO authenticated USING (user_id = auth.uid());
```
Copy this policy shape verbatim (rename `user_id` → `author_user_id`, add `work_id`/`version_id` FKs per RESEARCH.md's Pattern 3 table DDL). Critically: **do not add any `is_work_owner(...)` OR `work_member_tier(...)` branch to any pins policy** — that is precisely the "any room member reads any row" shape this table must NOT have. RESEARCH.md's own Pattern 3 SQL sketch is the fuller DDL to start from; this migration-015 analog is what proves the *policy* shape already has precedent elsewhere in the repo, so it is not a novel design.

---

### `__tests__/migration-NNN-writer-room-range-pins.test.ts` (test, content-assertion) — NEW

**Analog:** `__tests__/migration-218-auth-diagnostics.test.ts` (full file, 37 lines) — read the raw SQL text with `readFileSync`, assert on literal substrings; no DB connection.
```typescript
import { readFileSync } from 'fs'
import path from 'path'

const sql = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/218_auth_diagnostic_events.sql'),
  'utf8'
)

describe('migration 218 auth diagnostics', () => {
  it('is human-gated and creates a constrained RLS table', () => {
    expect(sql).toContain('CREATE TABLE public.auth_diagnostic_events')
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain("CHECK (correlation_id ~ '^AUTH-[A-F0-9]{12}$')")
  })
  ...
```
Apply the identical pattern to the new migration file: assert `CREATE TABLE public.work_version_pins`, `ENABLE ROW LEVEL SECURITY`, the exact CHECK/constraint text, the exact `REVOKE`/`GRANT` lines, and — per the anti-pattern warning — assert the pins table's policy text does NOT contain `work_member_tier` or `is_work_owner` (mirroring 218's `it.each` "does not define a sensitive column" negative-assertion style, lines 30-36, adapted to "does not grant a membership-based read").

---

### `app/api/works/[workId]/versions/[versionId]/pins/route.ts` (route, CRUD) — NEW

**Analog:** `app/api/works/[workId]/versions/[versionId]/comments/route.ts` (full file, 238 lines, already read in full) for the GET/POST scaffolding shape — auth check, rate limit, access gate, Zod body schema, try/catch with a generic user-facing error message:
```typescript
export async function GET(_request: Request, { params }: RouteContext) {
  const { workId, versionId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })
  ...
```
**Key deviation from the comments-route analog:** the pins GET must rely on RLS to return only the caller's own rows (per RESEARCH.md's Pattern 3 flow) — do not add an application-layer `.eq('author_user_id', user.id)` filter as the sole safeguard; RLS is the enforcement point, the query filter (if present at all) is redundant-but-harmless, never a substitute.

Body-schema style to copy (comments route, lines 31-35):
```typescript
const CommentBodySchema = z.object({
  body: z.string().trim().min(1).max(2000),
  timestampMs: z.number().int().min(0).max(86400000),
  parentCommentId: z.string().uuid().nullable().optional(),
}).strict()
```
→ pins need only `timestampMs` (no body — D-10 wordless):
```typescript
const PinBodySchema = z.object({
  timestampMs: z.number().int().min(0).max(86400000),
}).strict()
```

Promotion (pin → comment, D-12) composes this route's DELETE with the existing comments route's POST — call `create_work_version_comment` RPC first, then delete the pin row on success, inside the route handler (no new combined RPC needed unless atomicity across two tables becomes a real race concern; note this as a planner decision point, not locked here).

---

### `app/api/works/[workId]/versions/complete/route.ts` and the peaks-PATCH route (route, CRUD) — MODIFY / NEW

**Analog for direct `work_versions` write (no RPC, RLS-gated only):** the existing `complete/route.ts` (full file, 122 lines, already read in full) — the `.insert()` call at lines 99-113 shows the exact shape: build a plain object of columns, `.insert(...).select().single()`, check `insertError`. The new PATCH-peaks route follows the same "no RPC" shape research recommends (`work_versions` has no REVOKE/column-grant lockdown, unlike `work_version_comments`):
```typescript
const { data: inserted, error: insertError } = await supabase
  .from('work_versions')
  .insert({
    id: versionId,
    work_id: workId,
    user_id: user.id,
    source,
    audio_path: path,
    audio_ext: pathType.ext,
    audio_size: storedSize,
    duration_seconds: duration,
    label,
    performers,
  })
  .select()
  .single()

if (insertError || !inserted) {
  await service.storage.from(BUCKET).remove([path])
  return NextResponse.json({ error: 'Could not save the version' }, { status: 500 })
}
```
Add `peaks` to the insert object on the `complete` path (optional field, defaulting to `null` when the client didn't compute it — e.g. decode failure — so D-03's backfill can pick it up later). For the separate hum/record-over/backfill PATCH path, use `.update({ peaks }).eq('id', versionId).eq('work_id', workId)` after `resolveWorkAccess(..., 'contribute')`, matching this same "plain object, no RPC" style.

**Analog for bounding a client-supplied array (the peaks payload's security requirement):** `app/api/works/[workId]/blocks/reorder/route.ts` (lines 1-31, already read in full) — this is the closest existing "accept and bound a client array" route in the repo:
```typescript
const ORDER_ENTRY_LIMIT = 200

const ReorderEntrySchema = z
  .object({
    id: z.string().uuid(),
    position: z.number().int().min(0).max(ORDER_ENTRY_LIMIT - 1),
  })
  .strict()

const ReorderSchema = z
  .object({
    order: z.array(ReorderEntrySchema).min(1).max(ORDER_ENTRY_LIMIT),
  })
  .strict()
```
→ apply the identical `z.array(...).min(N).max(N)` fixed-cardinality bounding to the peaks payload — per RESEARCH.md's Security Domain section, the array must be rejected unless its length equals the agreed `barCount` (e.g. 200) and every value is an integer in `[0, 100]`:
```typescript
const PEAKS_BAR_COUNT = 200

const PeaksSchema = z.array(z.number().int().min(0).max(100)).length(PEAKS_BAR_COUNT)
```

---

### `components/catalogue/TimedTrackPlayer.tsx` and `components/catalogue/VersionComparisonPanel.tsx` (component, request-response + client decode) — MODIFY

**Analog:** each other (near-identical `WAVE_BARS` shape) plus themselves as the in-place refinement target. Both currently define the hardcoded array and reference it identically:
```typescript
// TimedTrackPlayer.tsx:44-49
const WAVE_BARS = [
  35, 52, 74, 43, 88, 61, 38, 79, 55, 91, 66, 47,
  ...
]
```
```jsx
// TimedTrackPlayer.tsx:369-373
{WAVE_BARS.map((height, index) => (
  <div
    key={index}
    className={`min-w-px flex-1 rounded-full ${index / WAVE_BARS.length <= positionMs / effectiveDurationMs ? 'bg-brandindigo' : 'bg-lavdim/35'}`}
```
Delete the `WAVE_BARS` constant in both files; replace the `.map` data source with `work_versions.peaks` (raw, for `TimedTrackPlayer`; level-matched via `analyzePlaybackLevels`, for `VersionComparisonPanel` per D-02). The `className` height-threshold expression (`index / peaks.length <= positionMs / effectiveDurationMs`) needs no change — it already works against any array, not just the constant.

**Local-persistence pattern reference** (`lib/catalogue/local-drafts.ts`, already imported in `TimedTrackPlayer.tsx:5` via `clearTextDraft`/`readTextDraft`/`writeTextDraft`) — cited in RESEARCH.md as "prior art for per-viewer state," relevant if the planner needs any client-only pin-staging cache before the POST succeeds. Key format already visible in the file (`TimedTrackPlayer.tsx:120`):
```typescript
const commentDraftKey = `funun:user:${draftOwnerId}:work:${workId}:version:${versionId}:comment-draft`
```

**Section-header comment convention** to follow for new UI regions (Mark-span mode, pin layer, speed control, keyboard binding) — see the `blocks/reorder/route.ts` analog above for the `// ─── Name ───` style already used project-wide.

## Shared Patterns

### Direct table writes stay REVOKED; validated server functions perform mutations
**Source:** `supabase/migrations/160_writer_room_timed_track_comments.sql` lines 64, 371-384
**Apply to:** the range-comment ALTER (extend `create_work_version_comment` RPC, never allow a raw INSERT/UPDATE from the API layer against `work_version_comments`)

### Author-only RLS, no membership OR-branch
**Source:** `supabase/migrations/015_dsr_imports.sql` (whole file)
**Apply to:** `work_version_pins` table only — this is the one deliberate exception to "any room member reads any row" that governs every other Writer's Room table

### Bounded client-supplied array via Zod fixed-length/max
**Source:** `app/api/works/[workId]/blocks/reorder/route.ts` lines 18-31
**Apply to:** the peaks-accepting route(s) (`complete/route.ts`, the peaks PATCH route) — fixed `barCount` length, `[0,100]` integer range per value

### Client-side Web Audio decode with try/finally context cleanup
**Source:** `lib/catalogue/level-match.ts` lines 29-44
**Apply to:** `lib/catalogue/waveform.ts` (new) — one `AudioContext` per call, always `close().catch(() => undefined)` in `finally`

### Migration content-assertion tests (no live DB)
**Source:** `__tests__/migration-218-auth-diagnostics.test.ts` (whole file)
**Apply to:** the new range-comments/pins migration's test file — `readFileSync` + `toContain`/`not.toContain` on the raw SQL text, including negative assertions proving the pins policy has no membership branch

### Migration numbers are unassigned
**Source:** N/A — sequencing gate in `39-CONTEXT.md` Canonical References
**Apply to:** every migration/test-file reference above; do not hardcode a number until implementation planning re-checks `supabase/migrations/` (highest was 218 at context-gather time, a parallel Phase 38.1 session is also claiming numbers)

## No Analog Found

None — every file in the known change surface had a usable analog in the existing tree (see table above). `lib/catalogue/waveform.test.ts` has no single exact-match test-file analog (no dedicated `record-over-beat.test.ts` was found in this pass); use `level-match.ts`'s exported-pure-function testability as the structural guide instead, as noted in its Pattern Assignment section.

## Metadata

**Analog search scope:** `supabase/migrations/`, `__tests__/`, `lib/catalogue/`, `components/catalogue/`, `app/api/works/`
**Files scanned:** ~30 (migrations grepped for RLS shape, `__tests__` listed for migration-test convention, `lib/catalogue` and `components/catalogue` read in full for the touched files, `app/api/works` grepped for bounded-array precedent)
**Pattern extraction date:** 2026-09-12

## PATTERN MAPPING COMPLETE
