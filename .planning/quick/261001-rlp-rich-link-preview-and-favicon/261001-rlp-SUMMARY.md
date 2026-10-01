---
phase: quick/261001-rlp
plan: 01
subsystem: marketing-pipeline
tags: [seo, og-meta, favicon, link-preview, build-script]

requires: []
provides:
  - "17-entry buildHeadMetadata() carrying og:image/width/height/alt, twitter:image, favicon <link>, apple-touch-icon <link>, and a large-image twitter:card"
  - "absoluteSiteUrl() helper joining root-relative paths onto PRODUCTION_CANONICAL_URL via new URL() (no doubled-slash risk)"
  - "scripts/brand/generate-icons.mjs — dependency-free, deterministic generator for the favicon + three PNG icons"
  - "public/favicon.ico, public/marketing/og.jpg, public/marketing/icon-{180,192,512}.png — committed brand assets"
  - "On-disk resolution test suite asserting every head image/icon URL maps to a real file under public/"
affects: [marketing-page, seo, brand-assets]

tech-stack:
  added: []
  patterns:
    - "Head metadata constants exported from build-marketing-artifact.ts so tests import canonical values instead of retyping predicates"
    - "Absolute URLs for scraper-facing meta tags (og:image/twitter:image), root-relative hrefs for browser-resolved <link> tags"

key-files:
  created:
    - scripts/brand/generate-icons.mjs
    - public/favicon.ico
    - public/marketing/og.jpg
    - public/marketing/icon-180.png
    - public/marketing/icon-192.png
    - public/marketing/icon-512.png
  modified:
    - scripts/build-marketing-artifact.ts
    - scripts/marketing-artifact.test.ts
    - assets/marketing/landing.html

key-decisions:
  - "twitter:card is summary_large_image, not summary (D-01)"
  - "og:image / twitter:image carry an absolute URL built via new URL(path, PRODUCTION_CANONICAL_URL) so the host is written once (D-02, D-03)"
  - "Icon hrefs stay root-relative; the browser resolves them against the served document (D-04)"
  - "Exactly seven additions to the head block, no og:image:type, no twitter:image:alt, no web app manifest (D-05)"
  - "og:image:alt is the owner's two copy lines verbatim, no em dash, no double quote inside the attribute (D-06)"
  - "The stale 'no icon/no OG image exists' comment was rewritten, not deleted, to explain the absolute-vs-relative URL choice (D-07)"
  - "buildHeadMetadata is now exported so tests exercise it directly without regenerating the full artifact (D-08)"

requirements-completed: [RLP-01, RLP-02, RLP-03, RLP-04, RLP-05, RLP-06]

coverage:
  - id: D1
    description: "buildHeadMetadata() emits 17 entries (was 10): favicon <link>, apple-touch-icon <link>, og:image/width/height/alt, twitter:image, large-image twitter:card, all built from exported constants"
    requirement: "RLP-01"
    verification:
      - kind: unit
        ref: "scripts/marketing-artifact.test.ts#head metadata — rich link preview and icons"
        status: pass
    human_judgment: false
  - id: D2
    description: "absoluteSiteUrl() joins a root-relative path onto PRODUCTION_CANONICAL_URL via new URL(), proven to produce no doubled slash and to start with the canonical host"
    requirement: "RLP-02"
    verification:
      - kind: unit
        ref: "scripts/marketing-artifact.test.ts#head metadata — rich link preview and icons > absoluteSiteUrl"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every head image/icon URL in the GENERATED artifact (assets/marketing/landing.html) resolves to a file that exists under public/, proven by extraction + existsSync over the real build output, not the constants read back to themselves"
    requirement: "RLP-03"
    verification:
      - kind: unit
        ref: "scripts/marketing-artifact.test.ts#the real generated artifact > resolves every head image/icon URL to a file that exists under public/"
        status: pass
    human_judgment: false
  - id: D4
    description: "scripts/brand/generate-icons.mjs reproduces the four committed icon files byte-for-byte on re-run"
    requirement: "RLP-05"
    verification:
      - kind: other
        ref: "shasum -a 256 before/after node scripts/brand/generate-icons.mjs — all four files byte-identical; og.jpg untouched"
        status: pass
    human_judgment: false
  - id: D5
    description: "The bench source (private/bench/marketing.html) is not re-frozen — FROZEN_SHA256/FROZEN_LINE_COUNT unchanged, re-proven by hashing at the start and end of the session"
    requirement: "RLP-06"
    verification:
      - kind: other
        ref: "shasum -a 256 private/bench/marketing.html — 47e284e999ec494924e3859beaaeff626ea18981d4a89e7f1046a328dd0ab527 / 2167 lines, both before Task 1 and after Task 2"
        status: pass
    human_judgment: false
  - id: D6
    description: "A link to www.funun.studio renders a large-image card with the owner's two copy lines and a working favicon at 16/32/48px, once deployed"
    requirement: "RLP-04"
    verification: []
    human_judgment: true
    rationale: "Requires visiting the deployed URL in iMessage/Slack/X/LinkedIn after merge and deploy; cannot be proven from source alone, and link-preview caches mean the first real check after deploy is the one that matters."

duration: 10min
completed: 2026-10-01
status: complete
---

# Quick Task 261001-rlp: Rich Link Preview and Favicon Summary

**Added 7 head-metadata entries (og:image/width/height/alt, twitter:image, favicon link, apple-touch-icon link) to `buildHeadMetadata()`, backed by a new dependency-free icon generator and five committed brand files — all proven against the regenerated artifact, not just the source constants.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-10-01T20:06:55Z
- **Completed:** 2026-10-01T20:16:30Z
- **Tasks:** 3 (planned 3, executed 3; Task 3's push/PR step intentionally deferred to the orchestrator per explicit instruction)
- **Files modified:** 9 (3 edited across Task 1/2, 6 new files committed in Task 3)

## Accomplishments

- `buildHeadMetadata()` grew from 10 to 17 entries: `<link rel="icon">`, `<link rel="apple-touch-icon">`, `og:image`, `og:image:width`, `og:image:height`, `og:image:alt`, `twitter:image`, plus `twitter:card` changed from `summary` to `summary_large_image`.
- New exported constants (`OG_IMAGE_PATH`, `OG_IMAGE_WIDTH`, `OG_IMAGE_HEIGHT`, `OG_IMAGE_ALT`, `FAVICON_PATH`, `APPLE_TOUCH_ICON_PATH`, `TWITTER_CARD_TYPE`, `OG_IMAGE_URL`, `HEAD_LOCAL_ASSET_PATHS`) and a new `absoluteSiteUrl()` helper that joins a root-relative path onto `PRODUCTION_CANONICAL_URL` via `new URL()`, so the host is written exactly once in the repo.
- Regenerated `assets/marketing/landing.html`: 1890 → 1897 lines, 8 insertions / 1 deletion, every hunk confined above the first `<style` tag.
- Extended `scripts/marketing-artifact.test.ts` with 13 new tests: constant-level unit tests for `absoluteSiteUrl`/`buildHeadMetadata`, and artifact-level tests that extract every og:image/twitter:image/icon URL from the GENERATED head block and assert `existsSync` against `public/`, with a non-empty-set guard so the loop cannot pass vacuously.
- Committed the five final brand files (`public/favicon.ico`, `public/marketing/og.jpg`, `public/marketing/icon-{180,192,512}.png`) and the new dependency-free generator (`scripts/brand/generate-icons.mjs`) that reproduces the four icon files byte-for-byte.
- Ran every step of CI's `validate` job locally: all six passed (migrations, strict typecheck, lint at `--max-warnings=0`, full Jest suite, both `npm audit` levels).

## Task Commits

Each task was committed atomically:

1. **Task 1: Prove the preconditions, then add the image and icon tags to buildHeadMetadata()** - `5325dfc6` (feat)
2. **Task 2: Regenerate the artifact and prove every head URL resolves to a real file** - `02dac9dc` (test)
3. **Task 3 (partial — staging/commit only): add brand icon generator and committed card/icon assets** - `2e4fe48a` (feat)

**Plan metadata:** not committed by this agent — SUMMARY.md, STATE.md, and ROADMAP.md updates are the orchestrator's responsibility per this task's explicit instructions.

_Note: push and PR creation (Task 3 Step 3) were explicitly withheld — the branch note and constraints direct the orchestrator to do those._

## Files Created/Modified

- `scripts/build-marketing-artifact.ts` - new head-metadata constants, `absoluteSiteUrl()`, rewritten 17-entry `buildHeadMetadata()`, corrected comment
- `scripts/marketing-artifact.test.ts` - 13 new tests covering the constants and the on-disk resolution of the generated artifact
- `assets/marketing/landing.html` - regenerated (1897 lines)
- `scripts/brand/generate-icons.mjs` - new, dependency-free icon generator (favicon + 3 PNGs)
- `public/favicon.ico` - new, 3-entry ICO (16/32/48px)
- `public/marketing/icon-180.png`, `icon-192.png`, `icon-512.png` - new
- `public/marketing/og.jpg` - new, 1200x630, hand-authored, owner-approved final (not touched by this task)

## Decisions Made

- `twitter:card` → `summary_large_image` (D-01); the small square card is the wrong frame for a 1200x630 image.
- `og:image`/`twitter:image` are absolute URLs via `absoluteSiteUrl()` because remote scrapers do not reliably resolve a relative image URL against the page URL (D-02, D-03).
- Icon `href`s stay root-relative — the browser resolves them against the served document, so an absolute URL would add a second place for the host to drift (D-04).
- Exactly seven additions, no more: no `og:image:type`, no `twitter:image:alt`, no web app manifest (D-05) — confirmed absent in the final artifact.
- `og:image:alt` carries the owner's exact two-line copy, no em dash, no double quote (D-06).
- The stale "nothing to point at" comment was rewritten (not deleted) to explain why the card URL is absolute and the icon hrefs are not (D-07).
- `buildHeadMetadata` is now exported for direct unit testing (D-08).

## Deviations from Plan

None - plan executed exactly as written. All measurements in `<verified_findings>` were re-proven rather than assumed, and every one matched its prediction exactly (bench hash/lines, unchanged-build control, icon determinism, ICO directory entries, the 1897-line/8-insertion diff, the empty manifest diff, and the 17-literal zero-violation verify).

One intentional scope exclusion, per this task's explicit instructions rather than a plan deviation: Task 3 Step 3 (push the branch, open the PR) was not executed — the orchestrator owns that step.

## Issues Encountered

None. One pre-existing fact worth flagging for the report: the Task 3 `<verify><automated>` line in the PLAN hardcodes `test "$(git status --short -- .planning/ | grep -c '^??')" = "5"`, but the pathspec `.planning/` also counts the quick task's own directory (`.planning/quick/261001-rlp-rich-link-preview-and-favicon/`), which was already untracked before this session started and must stay untracked per this task's constraints (no SUMMARY/PLAN/STATE commits by this agent). The real count is 6, not 5. The 5 *named* files under `.planning/reviews/` and `.planning/todos/pending/` are unaffected and confirmed still untracked — this is a minor inaccuracy in the plan's hardcoded verify literal, not a defect in the work.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Branch `rich-link-preview-and-favicon` has three task commits ready for the orchestrator to push and open as a PR against `main`.
- The PR body content specified in Task 3 Step 3 (owner's verbatim quotes, card/icon contents, pixel-snapping rationale, verified-live `public/` serving note, absolute-URL rationale, corrected-comment note, OG-cache warning, pointer to quick task 261001-cmt) is documented in the PLAN.md and ready for the orchestrator to compose into the actual PR description.
- D6 (the real-world rendered card + favicon) remains owner-UAT after deploy, flagged as `human_judgment: true` above — OG images are cached hard by every platform, so this is worth checking immediately after deploy and before the link is shared widely.

## Self-Check: PASSED

All created/modified files verified present on disk; all three task commit hashes (5325dfc6, 02dac9dc, 2e4fe48a) verified present in git log.
