---
phase: 14-playback-room-refinement
plan: "03"
subsystem: api-metadata-routes
tags: [api, stems, instrumental, metadata, json-only, owner-auth]
status: complete
dependency_graph:
  requires:
    - "14-01 (track-audio bucket config, readStems/readInstrumental types)"
  provides:
    - "POST /api/vault/[projectId]/tracks/[trackId]/stems — persists { path, size, name } onto tracks.metadata.stems"
    - "DELETE /api/vault/[projectId]/tracks/[trackId]/stems — removes storage object and clears metadata.stems"
    - "POST /api/vault/[projectId]/tracks/[trackId]/instrumental — persists { path, size, ext } onto tracks.metadata.instrumental"
    - "DELETE /api/vault/[projectId]/tracks/[trackId]/instrumental — removes storage object and clears metadata.instrumental"
  affects:
    - "Plan 05 (StemsUpload.tsx) — calls these routes after direct-to-storage upload completes"
tech_stack:
  added: []
  patterns:
    - "JSON-only metadata PATCH pattern (no formData, no byte proxy)"
    - "JSONB sub-object spread-write: { ...metadata, stems/instrumental: { ... } }"
    - "Owner-only gate via .eq('user_id', user.id) on track fetch"
    - "Service client for Storage.remove in DELETE handler"
key_files:
  created:
    - app/api/vault/[projectId]/tracks/[trackId]/stems/route.ts
    - app/api/vault/[projectId]/tracks/[trackId]/instrumental/route.ts
  modified: []
decisions:
  - "Both routes use JSON body (not FormData) — the browser already uploaded bytes directly to Storage before calling these routes (D-07/Pitfall 1 — keeps request well under Vercel's 4.5MB body ceiling)"
  - "DELETE uses createServiceClient() for storage.remove even though POST only needs createApiClient() — the storage object removal requires service-role key (not bound by user session RLS)"
  - "Comment text in route files avoids the literal string 'request.formData(' to prevent false positives in the plan's node verify grep check"
metrics:
  duration: "~2 minutes"
  completed_date: "2026-07-06"
  tasks_completed: 2
  files_changed: 2
---

# Phase 14 Plan 03: Stems & Instrumental Metadata Routes Summary

JSON-only API routes for persisting stems ZIP and instrumental audio references onto the canonical track row after direct-to-Storage browser upload — owner-gated, no file bytes, under Vercel's 4.5MB ceiling.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Stems metadata route (POST persist ref + DELETE) | `11e63b2` | app/api/vault/[projectId]/tracks/[trackId]/stems/route.ts |
| 2 | Instrumental metadata route (POST persist ref + DELETE) | `2b71e1e` | app/api/vault/[projectId]/tracks/[trackId]/instrumental/route.ts |

## API Contract (for Plan 05's StemsUpload.tsx)

### Stems route: `POST /api/vault/[projectId]/tracks/[trackId]/stems`

**Request body:**
```json
{ "path": "userId/projectId/trackId.stems.zip", "size": 12345678, "name": "My Track Stems.zip" }
```
- `path` — required, non-empty string (the Storage object path the browser just uploaded to)
- `size` — optional number (bytes); defaults to `0`
- `name` — optional string (display name); defaults to `'stems.zip'`

**Success response (200):**
```json
{ "data": { /* full updated track row */ } }
```

**Error responses:**
- `400` — DEMO mode, or missing/empty `path`
- `401` — unauthenticated
- `404` — track not owned by caller or not in project
- `500` — Supabase update error (message forwarded)

### Stems route: `DELETE /api/vault/[projectId]/tracks/[trackId]/stems`

No body. Removes the object at `metadata.stems.path` (if present) and clears `metadata.stems`.

**Success response (200):**
```json
{ "data": { "ok": true } }
```

---

### Instrumental route: `POST /api/vault/[projectId]/tracks/[trackId]/instrumental`

**Request body:**
```json
{ "path": "userId/projectId/trackId.instrumental.mp3", "size": 8765432, "ext": "mp3" }
```
- `path` — required, non-empty string
- `size` — optional number (bytes); defaults to `0`
- `ext` — optional string (file extension); defaults to `'mp3'`

**Success response (200):**
```json
{ "data": { /* full updated track row */ } }
```

**Error responses:** same as stems route (400/401/404/500)

### Instrumental route: `DELETE /api/vault/[projectId]/tracks/[trackId]/instrumental`

No body. Removes the object at `metadata.instrumental.path` and clears `metadata.instrumental`.

**Success response (200):**
```json
{ "data": { "ok": true } }
```

## Key Artifacts

### Stems route shape

- Imports: `NextResponse` from `next/server`; `createApiClient`, `createServiceClient` from `@/lib/supabase/server`
- DEMO constant + guard (returns 400 on both methods)
- `BUCKET = 'track-audio'`
- POST: `await request.json()` → validate `path` → auth → owner-scoped track fetch → spread-write `{ ...metadata, stems: { path, size, name } }` → update → return `{ data: updated }`
- DELETE: auth → owner fetch → read `metadata.stems.path` → `createServiceClient().storage.from(BUCKET).remove([path])` if present → `delete nextMeta.stems` → update

### Instrumental route shape

Identical to the stems route except:
- metadata key: `instrumental` (not `stems`)
- persisted shape: `{ path, size, ext }` (ext field, not name)
- DEMO messages say "Instrumental upload is not available in demo mode"

## Deviations from Plan

### Comment text adjusted to avoid node verify false positive

**1. [Rule 1 - Bug] Stems route comment triggered `request\.formData\(` grep check**
- **Found during:** Task 1 automated verify
- **Issue:** The route's explanatory comment used the literal text `request.formData()` to describe what the route does NOT do; the plan's node verify check uses `/request\.formData\(/` and matched the comment text.
- **Fix:** Reworded comment to "no form-data body parsing" — semantically equivalent, grep-safe.
- **Files modified:** `app/api/vault/[projectId]/tracks/[trackId]/stems/route.ts` (comment only)
- **Commit:** `11e63b2` (included in same task commit)

No other deviations — plan executed exactly as written.

## Verification Status

| Check | Status | Notes |
|-------|--------|-------|
| Task 1 node verify (POST+DELETE present, no formData, owner gate, stems key) | PASS | Prints `PASS` |
| Task 2 node verify (POST+DELETE present, no formData, owner gate, instrumental key) | PASS | Prints `PASS` |
| `npx tsc --noEmit` (after Task 1) | PASS | No errors |
| `npx tsc --noEmit` (after Task 2) | PASS | No errors |
| Human: two-session non-owner POST → expect 404 | DEFERRED | Manual two-session check; sandbox has no live Supabase project |

## Known Stubs

None — these are pure API routes with no UI rendering. No placeholder data.

## Threat Flags

No new network endpoints beyond the two routes planned. Both routes follow the existing `audio/route.ts` owner-gate pattern exactly (T-14-04 mitigated). T-14-05 (client-declared storage path) accepted per plan — bucket RLS already constrains original upload to owner's folder.

## Self-Check: PASSED

- [x] `app/api/vault/[projectId]/tracks/[trackId]/stems/route.ts` — found
- [x] `app/api/vault/[projectId]/tracks/[trackId]/instrumental/route.ts` — found
- [x] Commit `11e63b2` — found in git log
- [x] Commit `2b71e1e` — found in git log
