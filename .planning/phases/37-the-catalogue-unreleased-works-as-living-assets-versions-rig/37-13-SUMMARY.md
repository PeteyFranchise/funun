---
phase: 37-the-catalogue-unreleased-works-as-living-assets-versions-rig
plan: 13
subsystem: ui
tags: [nextjs, react, supabase, catalogue, vault, information-architecture, jest, mediarecorder]

# Dependency graph
requires:
  - phase: 37-05
    provides: "POST /api/works — the 🎵 door this plan's two-door picker posts to and redirects from"
  - phase: 37-12
    provides: "app/(artist)/vault/works/[workId]/page.tsx — the composer room every WorkCard/song-door redirect lands in, mounted verbatim, never edited by this plan"
  - phase: 37-01
    provides: "migrations 135-138's works/work_versions/lyric_blocks/work_members/split_sheets.work_id — the live tables this plan's new vault-page queries read"
provides:
  - "components/catalogue/WorkCard.tsx — the catalogue's card, deliberately lighter than the release card"
  - "components/catalogue/CatalogueShelf.tsx — the My Catalogue section, its grid and its hum-pitch empty state"
  - "app/(artist)/vault/page.tsx — two shelves under one roof: My Catalogue above an untouched Releases grid"
  - "app/(artist)/vault/new/page.tsx — the two-door picker replacing the five-type form"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Service-role read for exactly one field (split_sheets.status/party-count) scoped to a page's own already-authorized work-id set, mirroring plan 05/12's own loadWorkSplits() RLS-avoidance precedent (migration 137's own header: it changed NO row-level security on split_sheets/split_sheet_parties, still initiator/party-only) — used here instead of adding a fourth policy to the most recursion-sensitive table pair in the codebase"
    - "A single shared viewerId captured once from the auth call and threaded into a card-building helper, instead of re-derived from array data (`ownedWorks[0]?.user_id`) — the array-derived version was written first, caught in self-review as a real bug (a viewer who owns nothing but is a member of someone else's work would have had that OTHER person's id treated as their own for the first member row processed), and replaced before commit"
    - "One-screen-at-a-time door state (`'choose' | 'song' | 'release'`) instead of a modal, so the plan's one-gradient-per-page budget is satisfied by construction — only one of the three screens is ever mounted, so only one bg-grad element can ever be on screen regardless of which door is open"

key-files:
  created:
    - components/catalogue/WorkCard.tsx
    - components/catalogue/WorkCard.test.tsx
    - components/catalogue/CatalogueShelf.tsx
    - components/catalogue/CatalogueShelf.test.tsx
  modified:
    - app/(artist)/vault/page.tsx
    - app/(artist)/vault/new/page.tsx

key-decisions:
  - "Contributor avatars on a MEMBER work's card (a work the viewer belongs to but does not own) show only the viewer's own dot, never the full roster — this is migration 136's work_members_select RLS policy working exactly as designed ('a contributor sees their own row; the owner sees the whole roster'), not a bug in this plan's query. Documented inline at the shared WORKS_EMBED constant rather than worked around, since working around it would mean a second, service-role roster read this plan was not asked to add."
  - "Splits state (`splitsStatus`/`writerCount`) is read via a small, targeted service-role query against split_sheets, not embedded in the session-client works query. Migration 137's own header states it changed no RLS on split_sheets/split_sheet_parties — that pair is still initiator/party-only (migration 064's fix). Embedding it in the session-client query would have silently returned nothing for every work the viewer doesn't own, making every member-work card read 'No sheet yet' regardless of the truth. The alternative (a session-client-visible RLS widening) was out of scope and, per migration 137's own comment, deliberately not touched by this phase."
  - "Last activity time is computed as the max of work.updated_at, every version's created_at, and every lyric block's updated_at — not a dedicated work_diary_events read. work.updated_at alone would miss activity from adding a version or editing a lyric block (the works row itself doesn't change), and a diary read would have been a second per-work-batch query for a fact three already-fetched timestamp sets already answer well enough for a card's relative-time line."
  - "The Releases shelf gets no new heading. The plan's own wording ('leave everything below it exactly as it is') is read literally — CatalogueShelf.tsx supplies the only new heading on the page ('My Catalogue'); the existing Releases block (error branch, empty state, VaultBrowser, shared-with-me) renders with zero new JSX around it, not even a label, so there is no ambiguity about what 'unchanged' means here."
  - "vault_projects.type === 'unreleased' rows are excluded from BOTH the owned Releases grid and the shared-with-me Releases grid (`releaseProjects`/`releaseSharedProjects`), and merged into the catalogue shelf from both `projects` and `sharedProjects`. The plan's must-haves describe only an owned legacy row ('the (at most one) existing prod project'), but nothing in the plan scopes the exclusion to owned-only, and leaving a shared unreleased project inside two different shelves at once (Releases AND, if one ever exists, the catalogue's own future shared-works view) would silently reintroduce the exact double-counting the shared/owned split above it already goes out of its way to prevent."

patterns-established:
  - "A card-building helper takes a small typed context object (viewerId, name-resolution maps, a sheet-state map) built once by the page and passed unchanged into every row — same shape as WorkPage.tsx's own resolved-names-before-render convention (plan 12), applied here at list-scale rather than single-work scale"

requirements-completed: [S-03, S-01, S-02, S-04]

coverage:
  - id: D1
    description: "The vault page renders My Catalogue above an unchanged Releases grid; the shelf lists owned works, member works and legacy unreleased projects merged in application code; WorkCard omits release-only fields and the readiness ring; demo mode renders without erroring"
    requirement: S-03
    verification:
      - kind: unit
        ref: "components/catalogue/WorkCard.test.tsx (10 tests) + components/catalogue/CatalogueShelf.test.tsx (5 tests)"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit (0 errors) + npm run lint --max-warnings=0 (clean) + npx jest full suite (318 suites / 3572 tests, up from the session's 316/3557 baseline — no regression)"
        status: pass
      - kind: other
        ref: "grep -c 'CatalogueShelf' / 'VaultBrowser' against app/(artist)/vault/page.tsx — 2 and 3 respectively, both nonzero (this plan's own verification gates)"
        status: pass
    human_judgment: true
    rationale: "The two new works queries (owned + member, each embedding work_versions/lyric_blocks/work_members) and the service-role split_sheets read have not been exercised against a live Supabase instance by this executor agent — no database connection is available. This is the same posture every prior route/page-touching plan in this phase (05, 06, 11, 12) has already flagged for its own deliverables. A human should load the real vault page at least once — as an owner with works, as a member of someone else's work, and with the one existing legacy `unreleased` project — before this surface reaches users."
  - id: D2
    description: "The create page asks one question and offers two doors; the song door creates a work and lands in the composer; the release door keeps the existing four-type form and endpoint; the unreleased option no longer renders anywhere in the picker and no schema change was made"
    requirement: S-03
    verification:
      - kind: unit
        ref: "npx tsc --noEmit + npm run lint + full npx jest (no regression — this page has no dedicated test file, matching the pre-existing page's own posture)"
        status: pass
      - kind: other
        ref: "grep -c \"'/api/works'\" / \"'/api/vault'\" against app/(artist)/vault/new/page.tsx — 1 and 1, both nonzero; grep -n 'unreleased' shows it appears only inside a comment, never in RELEASE_TYPES or the rendered picker"
        status: pass
    human_judgment: true
    rationale: "Neither door's actual POST (to /api/works or /api/vault) has been exercised against a live database by this executor agent — the routes themselves are unchanged (POST /api/vault) or already covered by plan 05's own human_judgment-flagged D1/D2 (POST /api/works). A human should click both doors at least once before this surface reaches users."
  - id: D3
    description: "The owner's device matrix — hum record-and-playback in both directions on Chrome desktop and iPhone Safari, mic release on every exit path, and the permission-denied degrade — verified on real hardware"
    requirement: S-01
    verification: []
    human_judgment: true
    rationale: "This is the plan's own blocking checkpoint (Task 3, gate=\"blocking-human\"). No environment available to an executor agent can answer whether a take recorded in one browser plays back in another — RESEARCH.md's own Open Question 3, unresolved by documentation. NOT PERFORMED by this executor run. See 'What the Owner Must Do' below."

# Metrics
duration: ~55min
completed: 2026-08-30
status: awaiting-human-checkpoint
---

# Phase 37 Plan 13: The Catalogue's Home — Two Shelves, Two Doors, One Device Test Summary

**My Catalogue gets its real home above an untouched Releases grid, the five-type picker becomes two doors, and the phase now sits on the owner's own devices for the one question no amount of documentation could answer.**

## What Shipped

Tasks 1–2 are complete and committed. Task 3 is a blocking human checkpoint and has
**not** been performed: no cross-browser hum playback has been verified.

| Task | What | Commit |
|---|---|---|
| 1 | `WorkCard.tsx` + `CatalogueShelf.tsx` + the vault page's two-shelf assembly | `06f9d9d` |
| 2 | The two-door create picker replacing the five-type form | `2f87d2c` |
| 3 | **BLOCKING — owner records/plays back a hum on Chrome desktop and iPhone Safari** | not started |

### The shape, in one pass

`WorkCard` shows only what a work actually has — version progress with the latest
take's numeral, section count, contributor dots, the splits state in a word ("Drafting",
"No writers yet", "Executed"…), and a relative last-activity time — and nothing a work
doesn't have: no artwork, no readiness ring, no release date. A legacy pre-37 project
typed `unreleased` renders the same card shape with a small "Legacy project" marker and
links to its existing project room, not the composer. `CatalogueShelf` wraps the grid in
a heading, a possessive-voice subtitle, and an empty state that repeats the hum pitch
with the 🎵 door as its only action — spending no gradient, since the page's Topbar
"New project" button already spent the page's one. The vault page adds two queries
(owned works, member works) mirroring its own existing owned/shared split, plus one
small service-role read for split-sheet state, and merges any legacy `unreleased`
project into the shelf in application code — never SQL, never a migration.

The create page now asks "What are you starting?" and shows exactly two doors. 🎵 Start
a song posts an optional title to `POST /api/works` and lands the artist directly in the
composer room. 🚀 Start a release is the unchanged single/snippet/EP/album form, still
posting to `/api/vault` — only the five-button grid lost one button. `vault_projects.type`'s
CHECK constraint is untouched; the one existing production row typed `unreleased` keeps
validating exactly as it did before this plan.

## Task Commits

Each task was committed atomically:

1. **Task 1: `WorkCard.tsx` + `CatalogueShelf.tsx` + the vault page** — `06f9d9d` (feat)
2. **Task 2: the two-door create picker** — `2f87d2c` (feat)
3. **Task 3: the owner's device test** — **not started** (blocking checkpoint)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `components/catalogue/WorkCard.tsx` — the catalogue's card, work and legacy-project variants
- `components/catalogue/WorkCard.test.tsx` — 10 tests: title/version/splits, no score ring, block-count zero-suppression, empty-work labels, the legacy row's marker and link, no raw hex, no bg-grad
- `components/catalogue/CatalogueShelf.tsx` — the My Catalogue section, grid + empty state
- `components/catalogue/CatalogueShelf.test.tsx` — 5 tests: heading/subtitle, populated grid including a legacy row, the empty-state hum pitch, no raw hex, no bg-grad
- `app/(artist)/vault/page.tsx` — two new queries (owned/member works), a service-role splits read, the application-code legacy merge, `CatalogueShelf` mounted above the untouched Releases block
- `app/(artist)/vault/new/page.tsx` — the two-door picker (`'choose' | 'song' | 'release'` local state) replacing the five-type form

## Decisions Made

See `key-decisions` in the frontmatter for the full list. The two worth calling out here:

- **Splits state is read service-role, not embedded in the session-client works query.** Migration 137's own header states it changed no RLS on `split_sheets`/`split_sheet_parties` — a contribute-tier member's session client cannot see another owner's sheet row at all (still initiator/party-only, migration 064's fix). Embedding it in the main query would have silently mislabeled every member-work card as having no sheet, regardless of the truth. This plan's read is a small, targeted addition scoped to exactly the work ids the page already decided the viewer may see — the same RLS-avoidance shape plan 05/12 already established for `loadWorkSplits()`, not a new pattern.
- **The array-derived `viewerId` bug, caught before commit.** The first draft resolved the viewer's own id from `ownedWorks[0]?.user_id`, falling back to `memberWorks[0]?.user_id` when the viewer owns nothing. That fallback is wrong: `memberWorks[0]?.user_id` is the OTHER person's id (the work's actual owner), and for a viewer who is a member of two works owned by the same person, the first work processed would have incorrectly matched `work.user_id === viewerId`, mislabeling that stranger's contributor dot as the viewer's own. Fixed by capturing `viewerId` once, directly from the `auth.getUser()` call, and threading it unchanged into every card build.

## Deviations from Plan

None — plan executed as written for Tasks 1–2. The five items above are documented as
decisions rather than deviations because each fills in something the plan's task text
left to implementation judgment (the exact query shape for "works owned/works
memberships," the exact fields the card needs for "the splits state as a word" and "a
relative last-activity time," and how strictly to read "leave everything below it
exactly as it is").

## Known Stubs

None introduced by this plan. `WorkCard`'s readiness-ring slot is deliberately empty —
commented in the file as the doctrine's rights-readiness scorecard, scope item 1, and
explicitly NOT in 37.1 — which is the plan's own instruction, not a gap this plan left
behind.

## Threat Flags

None beyond this plan's own `<threat_model>`, all implemented as specified:

| Threat | Where it landed | How |
|---|---|---|
| T-37-78 (Info disclosure — shelf lists a work the viewer isn't on) | The shelf's two queries run under the viewer's session client, mirroring the page's existing owned/shared split | Migration 136's `works_select_owner_or_member`/`work_members_select` policies are the enforcement; nothing in this plan's queries bypasses RLS for the works/versions/blocks reads |
| T-37-79 (Tampering — Releases changes as collateral) | The Releases block gets zero new JSX; only its input array is filtered (`releaseProjects`/`releaseSharedProjects`) | `grep -c 'VaultBrowser'` verification gate (3, unchanged usage) + the file diff itself — same query, same card component, same counts, same empty state |
| T-37-80 (Tampering — retiring `unreleased` breaks existing rows) | The retirement is `RELEASE_TYPES` in the picker only; no migration in this plan | `grep -n 'unreleased'` on the new-project page shows it only inside a comment |
| T-37-81 (DoS — unplayable hum format) | Task 3, this plan's own blocking checkpoint | **Not yet controlled — awaiting the owner** |
| T-37-82 (Info disclosure — mic left live) | Enforced in plan 09's `HumCaptureButton`; verified on hardware in Task 3 | **Not yet controlled — awaiting the owner** |
| T-37-SC (accept — npm/pip/cargo installs) | No package-manager install task exists in this plan | n/a |

## Gate Results

| Gate | Result |
|---|---|
| `npx jest components/catalogue/WorkCard.test.tsx components/catalogue/CatalogueShelf.test.tsx` | 15/15 passing |
| `npx tsc --noEmit` | 0 errors |
| `npm run lint -- --max-warnings=0` | clean |
| `npx jest` (full suite) | 318 suites / 3572 tests, up from the session's 316/3557 baseline — no regression |
| `grep -c 'CatalogueShelf' app/(artist)/vault/page.tsx` | 2 |
| `grep -c 'VaultBrowser' app/(artist)/vault/page.tsx` | 3 |
| `grep -c "'/api/works'" app/(artist)/vault/new/page.tsx` | 1 |
| `grep -c "'/api/vault'" app/(artist)/vault/new/page.tsx` | 1 |
| `npm run build` | **not run** — the owner's dev server holds `.next` (hard rule) |

## What the Owner Must Do (Task 3, blocking)

This is the phase's shippability gate. Nothing in the code can pre-empt it — the
recording side already asks the browser at runtime rather than sniffing it; only a real
device test can answer whether a take recorded in one browser plays back in another.

1. On Chrome desktop, open a song, record a short hum, and confirm it appears in the
   diary with a play control that plays back in place.
2. On iPhone Safari, open the SAME song and play that Chrome-recorded take. This is the
   assertion that matters most.
3. On iPhone Safari, record a hum on that song and confirm it plays back on the phone.
4. Back on Chrome desktop, play the Safari-recorded take.
5. Confirm the microphone indicator goes off on both devices as soon as each take ends,
   and again after cancelling a take mid-recording.
6. Decline the microphone permission once on each device and confirm you get an inline
   message with a way forward rather than a dead button.
7. Walk the slice end to end once on each device: start a song from the 🎵 door, write
   two sections in the pad, drag one above the other and confirm the numbers swap, copy
   the full lyric in both flavors, add an audio file, answer the AI question, and read
   the receipt. Confirm the diary recorded every one of those without you asking it to.
8. Record which browser produced which format and whether any playback failed — that
   observation is the deliverable, whatever it says.

**Resume signal:** type "device test passed" if both directions play back, or describe
exactly which direction failed and on which browser and OS version. If a gap is found,
the fix is a follow-up (candidate reordering, a per-browser preferred type, or a
server-side transcode step), not a blocker on the rest of the phase.

## User Setup Required

The device test above. No package-manager install, no environment variable, no external
service configuration — `MediaRecorder`/`getUserMedia` are native browser APIs already
wired by plan 09, and this plan added zero new packages (T-37-SC, accepted).

## Next Phase Readiness

- Tasks 1–2 are shippable independently of Task 3 in the sense that nothing in them is
  gated on the device test — the two-shelf vault and the two-door picker work regardless
  of what the owner finds on real hardware.
- **This phase (37.1, "The Songwriter") is not shippable until Task 3 completes.** The
  success criteria are explicit: "Hum record-and-playback is verified in both directions
  on the owner's own devices, or the exact gap is recorded" — neither has happened yet.
- If the device test finds a playback gap, the fix belongs to a follow-up plan (37.2 or
  a dedicated hotfix), not a reopening of this one — `pickSupportedMimeType()`'s
  candidate order (plan 09) is the only thing a fix would touch, and it is already
  isolated in `lib/catalogue/hum-capture.ts`.

---
*Phase: 37-the-catalogue-unreleased-works-as-living-assets-versions-rig*
*Completed: 2026-08-30*

## Self-Check: PASSED

All 6 files (4 created, 2 modified) verified present on disk. Both task commits
(`06f9d9d`, `2f87d2c`) verified present in `git log --oneline` on
`feat/phase-37-songwriter`, each confirmed via `git show --stat HEAD` at commit time to
contain only its own intended file(s). `npx tsc --noEmit`, `npm run lint
--max-warnings=0`, and the full `npx jest` suite (318/3572) all re-verified green
immediately before this SUMMARY was written.
