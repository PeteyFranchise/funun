---
phase: 09-rich-member-profile
plan: 02
subsystem: api
tags: [nextjs, supabase-storage, react, file-upload, profile]

# Dependency graph
requires:
  - phase: 09-01b
    provides: artist_profiles.avatar_url/banner_url columns already in EDITABLE_FIELDS; sanitizeProfileRoles/filterOpenTo validation helpers
provides:
  - "POST /api/profile/avatar route handling both avatar and banner uploads to the live vault-assets bucket"
  - "AvatarBannerUpload reusable client component (variant: 'avatar' | 'banner') ready to mount"
affects: [09-05-mount-profile-edit-affordances]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Profile-level Storage upload: path is the ownership boundary (${user.id}/profile/${type}-${Date.now()}.${ext}), no separate ownership-row SELECT needed unlike project-scoped uploads"
    - "Overlay-only upload component: renders just the affordance (pill/scrim + hidden input + inline error), expects parent to wrap the existing image in a relative container"

key-files:
  created:
    - app/api/profile/avatar/route.ts
    - components/profile/AvatarBannerUpload.tsx
  modified: []

key-decisions:
  - "AvatarBannerUpload renders only the upload affordance overlay (not the image itself) — Plan 05 will wrap the existing ProfileView banner/avatar divs in relative containers and mount this on top, avoiding any re-render of the already-correct image display logic"
  - "Client-side MIME/size pre-check added ahead of the POST for instant feedback, using the exact same copywriting-contract error strings as the server, per PATTERNS.md guidance"

patterns-established:
  - "Profile image upload: vault-assets bucket, ${user.id}/profile/ path prefix, no vault_projects ownership check (profile-level, not project-level)"

requirements-completed: [PROFILE-09]

coverage:
  - id: D1
    description: "POST /api/profile/avatar uploads avatar or banner to vault-assets bucket at ${user.id}/profile/... path and writes the public URL back to artist_profiles.avatar_url or banner_url"
    requirement: "PROFILE-09"
    verification:
      - kind: unit
        ref: "grep -c 'vault-assets' app/api/profile/avatar/route.ts >=1 && grep -c 'release-assets' app/api/profile/avatar/route.ts == 0"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Live Storage upload + DB write-back requires a real authenticated session and browser file picker to confirm end-to-end (per 09-VALIDATION.md Manual-Only) — grep/tsc prove the route shape but not that the roundtrip actually persists and re-renders"
  - id: D2
    description: "AvatarBannerUpload client component rejects non-image/oversized files with exact copywriting-contract error strings and never uses rose/destructive styling"
    requirement: "PROFILE-09"
    verification:
      - kind: unit
        ref: "grep -c 'image/jpeg,image/png,image/webp' components/profile/AvatarBannerUpload.tsx >=1; grep -c '/api/profile/avatar' >=1; grep -ic 'rose|#F43F5E|destructive' == 0"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Visual affordances (edit-cover pill, avatar hover scrim/fade timing) and the reject-with-error interaction require visual/manual confirmation once mounted in Plan 05 — not yet observable in a browser since this component isn't wired into any page in this plan"

# Metrics
duration: 12min
completed: 2026-07-12
status: complete
---

# Phase 9 Plan 2: Avatar/Banner Upload Summary

**POST /api/profile/avatar route (vault-assets bucket, JPG/PNG/WebP only) plus a reusable AvatarBannerUpload overlay component for avatar and banner variants**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-12T09:25:00Z
- **Completed:** 2026-07-12T09:37:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `POST /api/profile/avatar` handles both `type: 'avatar' | 'banner'` in one route, cloned from the live `vault-assets`/`app/api/vault/[projectId]/assets/route.ts` pattern (explicitly not the dead `release-assets`/`lib/storage/index.ts` code path)
- Path `${user.id}/profile/${type}-${Date.now()}.${ext}` uses the storage path itself as the ownership boundary — no extra ownership-row SELECT needed since this is profile-level, not project-level
- `AvatarBannerUpload` client component ships both variants in one file (`variant: 'avatar' | 'banner'`), with client-side pre-validation, warn-toned (amber) inline errors, and `router.refresh()` on success — ready for Plan 05 to mount into `ProfileView`

## Task Commits

Each task was committed atomically:

1. **Task 1: POST /api/profile/avatar route (avatar + banner)** - `3acab49` (feat)
2. **Task 2: AvatarBannerUpload client component (avatar + banner variants)** - `cf8195f` (feat)

_Note: no TDD tasks in this plan; both are single-commit `type="auto"` tasks._

## Files Created/Modified
- `app/api/profile/avatar/route.ts` - POST handler for avatar/banner upload; MIME/size validation with exact copywriting-contract error strings; uploads to `vault-assets` at `${user.id}/profile/${type}-${Date.now()}.${ext}`; writes public URL to `artist_profiles.avatar_url`/`banner_url`
- `components/profile/AvatarBannerUpload.tsx` - `'use client'` overlay component, `variant: 'avatar' | 'banner'` prop; banner renders the `.edit-cover` frosted pill (18px inset top-right); avatar renders a hover/focus scrim with camera icon + "Edit photo" label (160ms fade); posts FormData to `/api/profile/avatar`

## Decisions Made
- The component renders only the upload affordance overlay, not the image itself — Plan 05 will wrap the existing `ProfileView` banner/avatar `<div>`s in `relative` containers and mount `<AvatarBannerUpload>` on top, so the already-correct image-display logic in `ProfileView.tsx` is untouched by this plan
- Client-side MIME/size pre-check added before the POST for instant feedback, reusing the identical copywriting-contract strings the server returns on 400

## Deviations from Plan

None — plan executed exactly as written. `EXT_BY_MIME` was trimmed to png/jpeg/webp only (no gif) per the plan's explicit instruction, matching the narrower avatar/banner contract vs. the vault-assets route's broader list.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Uses the existing `vault-assets` Supabase Storage bucket and RLS policy already live from prior phases.

## Next Phase Readiness
- `POST /api/profile/avatar` and `AvatarBannerUpload` are both ready for Plan 05 to mount into `ProfileView`'s banner/avatar sections (owner-only visibility gating happens at the mount site, not in this component)
- Manual verification (owner uploads an avatar/banner and confirms persistence/re-render; a .txt and >10MB image are rejected with the contract strings) is deferred to Plan 05's mounted, browser-observable context per 09-VALIDATION.md Manual-Only — this plan's component is not yet reachable from any page

---
*Phase: 09-rich-member-profile*
*Completed: 2026-07-12*

## Self-Check: PASSED

- FOUND: app/api/profile/avatar/route.ts
- FOUND: components/profile/AvatarBannerUpload.tsx
- FOUND: 3acab49 (Task 1 commit)
- FOUND: cf8195f (Task 2 commit)
