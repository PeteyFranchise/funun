---
phase: 09-rich-member-profile
verified: 2026-07-12T10:15:22Z
status: passed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "As profile owner, upload a JPG/PNG/WebP avatar and a banner image via the new upload affordances on /profile"
    expected: "Image uploads to vault-assets, the public URL persists to artist_profiles.avatar_url/banner_url, and the new image renders after router.refresh()/reload; a .txt file and a >10MB image are rejected inline with 'Image must be JPG, PNG, or WebP' / 'Image must be under 10MB'"
    why_human: "Live Supabase Storage upload + DB write-back + browser file picker cannot be exercised by grep/tsc/Jest (no Playwright/Cypress in this project, per 09-VALIDATION.md Manual-Only)"
  - test: "As a signed-out visitor, load /r/[projectId] for a public release"
    expected: "Stream-only now-playing player renders (no Master/Stems toggle, no ISRC/ISWC/BPM table, no split %); overflow menu shows View credits (names+roles only), View lyrics only when lyrics exist, and Copy link; opening lyrics slides up a panel while audio keeps playing"
    why_human: "Real audio playback and slide-up panel timing/behavior cannot be asserted in a Jest/Node environment"
  - test: "Toggle 'Allow others to share my music' off in Settings, then view the profile as a signed-out visitor; toggle it back on"
    expected: "With the toggle off, the visitor's more-options (⋯) menu is absent entirely (not just hidden) from the rendered page; with it on, the menu reappears with the single 'Copy profile link' item"
    why_human: "Confirming the server-side omission actually removes the DOM node for a real logged-out request, and exercising the native OS Web Share sheet vs. clipboard fallback, requires a real browser/device (09-VALIDATION.md Manual-Only)"
  - test: "As owner, edit roles (add a preset, add a custom title, Set-as-lead, remove down to the minimum of 1), toggle Open-to chips, and pin/unpin a Featured release (confirm a private draft never appears in the picker)"
    expected: "All edits persist through PATCH /api/profile and are visible after a reload; the Featured picker lists only public releases; pinning a non-public release is impossible from the UI"
    why_human: "End-to-end persistence-on-reload and the picker's live filtering behavior require a signed-in click-through; this project has no API-route integration test harness"
---

# Phase 9: Rich Member Profile Verification Report

**Phase Goal:** A member's `/u/[handle]` profile renders the locked hi-fi hero screen and behaves differently for the owner versus a visitor — proving the unified-identity model end-to-end in the browser.
**Verified:** 2026-07-12T10:15:22Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria + PLAN must_haves merged)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Rich profile header — banner, avatar w/ presence dot, name, pronouns, verified badge, multi-role badges (lead highlighted), standard-or-custom title | ✓ VERIFIED | `components/profile/ProfileView.tsx` L180-219: `bannerUrl`/`avatarUrl` backgrounds, verified-badge SVG gated on `data.verified`, `pronouns` span, `data.roles.map` with `i===0` gradient-highlight lead styling, `roleLabel()` resolves preset-vs-custom labels |
| 2 | Location, tenure ("On Funūn since [year]"), Open-to chips, stats sidebar (followers, monthly listeners, placements, avg. readiness), releases grid with readiness rings | ✓ VERIFIED | ProfileView.tsx L221-235 (location/since/open-to chip), L347-355 (Stats card: Followers → Monthly listeners → **Placements landed** → Total streams → Releases → Avg. readiness, `mtext`/`gtext` classes), `ReleaseCard` L93-114 renders a conic-gradient readiness ring per release |
| 3 | User can pin one release as a "Featured" spotlight | ✓ VERIFIED | `components/profile/FeaturedPicker.tsx` filters to `isPublic` releases only, PATCHes `featured_project_id` via `/api/profile`; `app/api/profile/route.ts` L117-140 pre-checks ownership+public via `isFeaturableProjectRow()` before writing; mounted owner-only in ProfileView.tsx L302-304 |
| 4 | Profile owner sees Edit profile / Share / View analytics actions and can upload/edit banner+avatar; visitor sees Follow / Message / more-options instead | ✓ VERIFIED | ProfileView.tsx L240-277: owner branch renders `Link` (Edit profile), `ShareButton`, disabled Analytics stub (documented Out-of-Scope); visitor branch renders `FollowButton`/stub, `DmWidget`/stub, and `ProfileMoreMenu` gated by `allowResharing` (see note below) |
| 5 (PROFILE-02) | Owner can add a custom title alongside preset roles | ✓ VERIFIED | `lib/profile/validate.ts` `ProfileRoleSchema`/`sanitizeProfileRoles` (Zod discriminated union, custom label 1-40 chars, max 6); `components/profile/ProfileForm.tsx` roles editor (preset multi-select + "+Add role" custom input, Set-as-lead via array index 0, min-1 guard) |
| 6 (PROFILE-04) | Owner can set "Open to" chips | ✓ VERIFIED | `filterOpenTo()` in `lib/profile/validate.ts`; `ProfileForm.tsx` open-to chip editor; `OPEN_TO_VALUES` exported from `types/index.ts` as single source |
| 7 (PROFILE-09) | Owner can upload/edit avatar and banner images | ✓ VERIFIED | `POST /api/profile/avatar` (bucket `vault-assets`, `${user.id}/profile/...` path, 10MB cap, JPG/PNG/WebP-only, exact copywriting-contract error strings); `AvatarBannerUpload.tsx` mounted on both banner (L188) and avatar (L198) in owner mode only |
| 8 | 09-01a's four RED tests exist and (post 09-01b) are GREEN; `npm test` runs Jest | ✓ VERIFIED | `npx jest` → 58/58 tests, 8/8 suites pass; `package.json` L10 `"test": "jest"`; `npx tsc --noEmit` clean |
| 9 | Migration 043 (`allow_resharing`) is live on the remote database | ✓ VERIFIED | `supabase/migrations/043_profile_allow_resharing.sql` adds the column + public `GRANT SELECT`; independently re-ran `npx supabase migration list` during this verification — migration `043` is populated in both the LOCAL and REMOTE columns, matching migrations 001-042's format |

**Score:** 9/9 truths verified (0 present-but-behavior-unverified)

**Note on Truth 4:** `ProfileMoreMenu` (visitor more-options) is rendered only when the owner's `allow_resharing` is `true` (D-07, an explicit, documented design decision in 09-05-PLAN.md, not a deviation). The DB default for `allow_resharing` is `true` (migration 043), so out-of-the-box a visitor does see the more-options menu; it is server-side omitted only when the owner has explicitly opted out. This matches the phase's own design intent and is not treated as a gap.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `__tests__/profile-roles-validation.test.ts` | Roles/open_to validator RED→GREEN contract | ✓ VERIFIED | Exists, non-trivial assertions, passes |
| `__tests__/featured-project-validation.test.ts` | Featured pre-check contract | ✓ VERIFIED | Exists, passes |
| `__tests__/profile-load.test.ts` | `buildProfileData()` placementsCount/avgReadiness contract | ✓ VERIFIED | Exists, passes |
| `__tests__/schema-lyrics.test.ts` | `readLyrics()` backward-compat regression | ✓ VERIFIED | Exists, passes |
| `lib/profile/validate.ts` | `ProfileRoleSchema`, `sanitizeProfileRoles`, `filterOpenTo`, `isFeaturableProjectRow` | ✓ VERIFIED | All four exports present, wired into `app/api/profile/route.ts` |
| `supabase/migrations/043_profile_allow_resharing.sql` | `allow_resharing boolean NOT NULL DEFAULT true` + public GRANT SELECT, no REVOKE | ✓ VERIFIED | Matches contract exactly; confirmed live via `supabase migration list` |
| `app/api/profile/avatar/route.ts` | POST handler, vault-assets bucket, MIME/size validation | ✓ VERIFIED | Bucket correct (0 `release-assets` matches), copywriting-contract strings present verbatim |
| `components/profile/AvatarBannerUpload.tsx` | `variant: avatar\|banner`, client+server validation | ✓ VERIFIED | Both variants render distinct affordances, amber (not rose) error styling |
| `components/vault/PublicPlaybackView.tsx` | Stream-only player, no owner-only detail | ✓ VERIFIED | No Master/Stems toggle, ISRC/ISWC/BPM, waveform, or split % in JSX; does not import private `PlaybackView` |
| `components/vault/LyricsPanel.tsx` | Static lyrics slide-up, reduced-motion aware | ✓ VERIFIED | `prefers-reduced-motion`/`motion-reduce` present (2 matches); three dismiss paths wired to `onClose` |
| `app/r/[projectId]/page.tsx` | Renders `PublicPlaybackView`, reads `allow_resharing` | ✓ VERIFIED | 0 `<PlaybackView` matches; imports `PublicTrackView`, not the private `TrackView`; `PlaybackView.tsx` and `/vault/[projectId]/play` untouched (confirmed via `git log`) |
| `components/profile/ShareButton.tsx` | Web-Share-first, clipboard fallback | ✓ VERIFIED | `navigator.share()` called synchronously as first statement of `shareOrCopy()`; no `window.location.origin` |
| `components/profile/ProfileMoreMenu.tsx` | Exactly one item, Phase 13 insertion comment | ✓ VERIFIED | Single "Copy profile link" button; Phase 13 comment present |
| `components/profile/FeaturedPicker.tsx` | Owner-only, public-releases-only picker | ✓ VERIFIED | Filters `releases.filter(r => r.isPublic)`; PATCHes `featured_project_id` |
| `components/profile/ProfileView.tsx` | Full integration of all Phase 9 surfaces | ✓ VERIFIED | Mounts `ShareButton`, `AvatarBannerUpload` (both variants), `FeaturedPicker`, `ProfileMoreMenu`, `PresenceDot`, Placements stat row |
| `app/u/[handle]/page.tsx` | Reads `allow_resharing`, builds `profileUrl`/`ownerReleases` | ✓ VERIFIED | `allow_resharing` in SELECT list, absolute `profileUrl` from `NEXT_PUBLIC_APP_URL` (throws loudly if missing), `placementsCount` query added to `Promise.all` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `ProfileForm.tsx` roles/open_to/allow_resharing editors | `PATCH /api/profile` | fetch + `EDITABLE_FIELDS` allowlist | ✓ WIRED | `roles`, `open_to`, `allow_resharing` all present in `EDITABLE_FIELDS` (route.ts L37-42) with per-field sanitize branches |
| `FeaturedPicker` | `PATCH /api/profile featured_project_id` | fetch | ✓ WIRED | Pre-check via `isFeaturableProjectRow` returns friendly 404 ("Release not found")/400 ("Only public releases can be featured — publish it first.") — no raw trigger string leaks (`grep -c "featured_project_id must reference"` → 0) |
| `AvatarBannerUpload` | `POST /api/profile/avatar` | FormData(file,type) | ✓ WIRED | Component posts to `/api/profile/avatar`; route writes `avatar_url`/`banner_url` back to `artist_profiles` |
| `app/r/[projectId]/page.tsx` | `PublicPlaybackView` | render swap | ✓ WIRED | `toTrackViews()` strips `split`/`splitTotal`/ISRC/ISWC/BPM, adds `lyrics` via `readLyrics()`; `allow_resharing` read and passed as `allowResharing` |
| `app/u/[handle]/page.tsx` / `app/profile/page.tsx` | `ProfileView` | props | ✓ WIRED | Both pages pass `profileUrl`, `allowResharing`, `ownerReleases`, `currentFeaturedId`; `npx tsc --noEmit` and `npm run build` both clean/succeed across the whole app |
| `EDITABLE_FIELDS` allowlist | mass-assignment boundary | grep | ✓ WIRED | `verified` and `member_type` are NOT present in `EDITABLE_FIELDS` (checked directly — only the unrelated word "verified" appears in a comment) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full Jest suite passes | `npx jest` | 8 suites, 58 tests, all pass | ✓ PASS |
| Whole-app type-check | `npx tsc --noEmit` | No output (clean) | ✓ PASS |
| Whole-app build (incl. `/r/[projectId]`, `/u/[handle]`, `/profile`, `/api/profile`, `/api/profile/avatar`) | `npm run build` | Succeeded, all routes compiled | ✓ PASS |
| Migration 043 live on remote | `npx supabase migration list` | `043` row populated in both LOCAL and REMOTE columns | ✓ PASS |
| No debt markers in phase-touched files | `grep -nE "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` across 22 phase-touched files | 2 matches, both legitimate input `placeholder="MLC-XXXXXXXX"`/`"SE-XXXXXXXX"` attributes (not code stubs) | ✓ PASS |
| Private playback room untouched | `git log --oneline -- components/vault/PlaybackView.tsx "app/(artist)/vault/[projectId]/play/page.tsx"` | Most recent commits are from Phase 14, none from Phase 9 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PROFILE-01 | 09-05 | Rich profile header w/ presence dot | ✓ SATISFIED | Header renders banner/avatar/name/pronouns/verified/roles; `PresenceDot` honest-inert slot |
| PROFILE-02 | 09-01a/01b/04 | Custom title alongside preset roles | ✓ SATISFIED | `ProfileRoleSchema`, roles editor in `ProfileForm.tsx` |
| PROFILE-03 | 09-05 (confirms pre-existing) | Location + tenure | ✓ SATISFIED | `data.location`/`data.since` render unchanged (pre-existing, confirmed intact) |
| PROFILE-04 | 09-01a/01b/04 | Open-to chips | ✓ SATISFIED | `filterOpenTo()`, open-to editor, chip rendering |
| PROFILE-05 | 09-01a/01b/04 | Pin Featured release | ✓ SATISFIED | `FeaturedPicker`, `isFeaturableProjectRow` pre-check |
| PROFILE-06 | 09-01a/01b/05 | Stats sidebar incl. placements | ✓ SATISFIED | `placementsCount` COUNT query, Stats card row |
| PROFILE-07 | 09-03 (mapping) | Releases grid with readiness rings | ✓ SATISFIED | `ReleaseCard` conic-gradient ring (pre-existing UI, confirmed intact and linking to the new `/r/[projectId]` public player) |
| PROFILE-08 | 09-03/04/05 | Owner vs. visitor actions | ✓ SATISFIED | Owner: Edit/Share/Analytics-stub; Visitor: Follow/Message/more-options (gated by allow_resharing) |
| PROFILE-09 | 09-02/05 | Avatar/banner upload | ✓ SATISFIED | `POST /api/profile/avatar`, `AvatarBannerUpload` mounted owner-only |

**No orphaned requirements** — all 9 PROFILE-* requirement IDs declared across the 6 plans' frontmatter are accounted for and traced to REQUIREMENTS.md's Phase 9 mapping (which also independently marks all nine `[x]` complete).

### Anti-Patterns Found

None. No unreferenced `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` debt markers in any of the 22 phase-touched files (the only matches are legitimate input-field `placeholder` attribute values). No hardcoded-empty stub returns found in the data-flow paths reviewed (avatar upload, PATCH allowlist, placements query, public playback projection).

### Human Verification Required

See frontmatter `human_verification` — 4 items, all live-browser/device interactions that this project has no E2E harness for (per `09-VALIDATION.md` Manual-Only section, consistent across all five plan SUMMARYs' own `human_judgment: true` coverage entries):

1. Avatar/banner upload persistence (Storage round-trip + reload)
2. Public player audio playback + lyrics slide-up (real `/r/[projectId]` browsing)
3. Resharing-toggle-off visitor-affordance disappearance + native Web Share sheet vs. clipboard fallback
4. Settings roles/open-to/resharing persistence-on-reload + Featured picker live filtering

### Gaps Summary

No gaps found. All 9 ROADMAP+PLAN observable truths are VERIFIED against the actual codebase: every claimed artifact exists, is substantive (no stubs), and is wired end-to-end (route swaps confirmed via `git log`/`grep`, PATCH allowlist confirmed via direct read, migration 043 independently re-confirmed live via `supabase migration list` rather than trusting SUMMARY.md's claim). The full Jest suite (58/58), `tsc --noEmit`, and `npm run build` all pass cleanly. The only reason this report is not `passed` is that four behaviors are irreducibly browser/device-only (file upload persistence, native Web Share sheet, live audio playback, and multi-step form persistence-on-reload) and require a human click-through per this phase's own documented Manual-Only validation strategy — none of these represent an unresolved code gap.

---

*Verified: 2026-07-12T10:15:22Z*
*Verifier: Claude (gsd-verifier)*
