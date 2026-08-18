---
phase: 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1
plan: 03
subsystem: infra
tags: [react-markdown, remark-gfm, nextjs, output-file-tracing, markdown-rendering]

# Dependency graph
requires:
  - phase: 17-split-sheet-esign
    provides: "lib/vault/pdf/fonts.ts's fail-fast fs + process.cwd() + outputFileTracingIncludes pattern, reused verbatim for docs/observability/*.md"
provides:
  - "readObservabilityDoc(filename) — fail-fast reader for docs/observability/*.md"
  - "markdownComponents — typed react-markdown Components map satisfying the UI-SPEC's Doc-Page Markdown Container Contract"
  - "MarkdownDoc — zero-client-JS RSC wrapper rendering trusted markdown via react-markdown + remark-gfm"
  - "next.config.mjs outputFileTracingIncludes entry for docs/observability/**, build-trace verified"
affects: ["33-06 (IT-room doc pages render through this foundation)"]

# Tech tracking
tech-stack:
  added: ["react-markdown@10.1.0", "remark-gfm@4.0.1"]
  patterns:
    - "Markdown-as-content: fs.readFile via path.join(process.cwd(), ...) + outputFileTracingIncludes, mirroring the PDF-fonts precedent (lib/vault/pdf/fonts.ts)"
    - "react-markdown components-override map for element-level styling instead of dangerouslySetInnerHTML"

key-files:
  created:
    - lib/playbook/read-doc.ts
    - lib/playbook/markdown-components.tsx
    - components/playbook/MarkdownDoc.tsx
    - __tests__/playbook-read-doc.test.ts
  modified:
    - next.config.mjs
    - package.json
    - package-lock.json

key-decisions:
  - "Used the real console-theme.ts token names (--ink-2/--ink-3/--border/--panel/--panel-2/--indigo) instead of the UI-SPEC's mockup-equivalent aliases (--lav/--lavdim/--hair/--card/--card2), which are not declared anywhere in this codebase"
  - "Verified the outputFileTracingIncludes filesystem-path-style key format (mirroring the fonts fix) works on Next.js 15.5.19 using a temporary scratch route, deleted after verification — the real doc-page routes ship in plan 33-06"

patterns-established:
  - "lib/playbook/ domain module for the Playbook feature area (read-doc.ts, markdown-components.tsx)"
  - "components/playbook/ for Playbook-scoped RSCs"

requirements-completed: [PLAYBOOK-05, PLAYBOOK-06]

coverage:
  - id: D1
    description: "readObservabilityDoc() reads docs/observability/*.md via a fail-fast fs wrapper, throwing a descriptive path-naming error for a missing/renamed file"
    requirement: "PLAYBOOK-05"
    verification:
      - kind: unit
        ref: "__tests__/playbook-read-doc.test.ts#readObservabilityDoc"
        status: pass
    human_judgment: false
  - id: D2
    description: "MarkdownDoc renders markdown via react-markdown + remark-gfm through a React-element components map (no raw-HTML injection); stays a Server Component"
    requirement: "PLAYBOOK-05"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (zero errors from markdown-components.tsx/MarkdownDoc.tsx) + grep confirming ReactMarkdown/remarkGfm usage and absence of 'use client'"
        status: pass
    human_judgment: true
    rationale: "Visual conformance to the UI-SPEC's per-element style table (colors, spacing, typography) is not exercised by an automated test in this plan — a rendered doc page ships in 33-06 where visual UAT is appropriate."
  - id: D3
    description: "docs/observability/** is bundled into the deployed Vercel serverless trace via next.config.mjs's outputFileTracingIncludes, closing PLAYBOOK-06's deployment risk"
    requirement: "PLAYBOOK-06"
    verification:
      - kind: other
        ref: "npx next build (via a temporary scratch route under app/(admin)/playbook/**) + grep -rl docs/observability .next/server — returned matches for all 8 docs/observability/*.md files including the 4 in-scope docs"
        status: pass
    human_judgment: false

duration: ~23min
completed: 2026-08-17
status: complete
---

# Phase 33 Plan 03: Markdown rendering + deploy-time file-tracing foundation Summary

**Installed react-markdown+remark-gfm, built a fail-fast docs/observability/*.md reader mirroring the PDF-fonts precedent, a zero-client-JS MarkdownDoc RSC wrapper, and a build-trace-verified next.config.mjs entry that closes RESEARCH's #1 deployment risk before any doc page exists.**

## Performance

- **Duration:** ~23 min
- **Started:** 2026-08-17T21:10:00-04:00 (approx, first tool call)
- **Completed:** 2026-08-17T21:33:49-04:00
- **Tasks:** 3
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments
- `react-markdown@10.1.0` + `remark-gfm@4.0.1` installed (both RESEARCH-approved, no legitimacy checkpoint needed)
- `lib/playbook/read-doc.ts`: `readObservabilityDoc()` reads `docs/observability/*.md` via `path.join(process.cwd(), ...)`, fails loud with a path-naming error on a missing file (mirrors `lib/vault/pdf/fonts.ts`'s `assertFontFileExists` rationale)
- `lib/playbook/markdown-components.tsx` + `components/playbook/MarkdownDoc.tsx`: a typed `Components` map satisfying the UI-SPEC's "Doc-Page Markdown Container Contract" table (h1/h2/h3/p/strong/a/blockquote/table/thead/th/td/code/pre/ul/ol/hr), wrapped by a zero-client-JS Server Component rendering via `ReactMarkdown`+`remarkGfm` — no `dangerouslySetInnerHTML`
- `next.config.mjs`: added a second `outputFileTracingIncludes` key (`'app/(admin)/playbook/**/*': ['./docs/observability/**']`) mirroring the fonts fix, **build-trace verified** — resolves RESEARCH's Open Question 1 (filesystem-path-style key format works correctly on this Next.js 15.5.19 install)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install react-markdown + remark-gfm; add readObservabilityDoc() fail-fast reader** - `3d7e3a8` (feat, TDD: RED confirmed before implementation)
2. **Task 2: markdownComponents element map + MarkdownDoc RSC wrapper** - `7ddf3c6` (feat)
3. **Task 3: Add docs/observability tracing entry to next.config.mjs + BUILD-TRACE verification** - `74efc8b` (feat)

**Plan metadata:** (this SUMMARY commit, worktree mode — orchestrator handles STATE.md/ROADMAP.md centrally)

## Files Created/Modified
- `lib/playbook/read-doc.ts` - `readObservabilityDoc()` fail-fast fs reader
- `lib/playbook/markdown-components.tsx` - typed `Components` map for the UI-SPEC element contract
- `components/playbook/MarkdownDoc.tsx` - zero-client-JS RSC wrapping ReactMarkdown+remarkGfm+markdownComponents
- `__tests__/playbook-read-doc.test.ts` - RED-then-GREEN coverage for the 4 real docs + a bogus-filename error path
- `next.config.mjs` - `outputFileTracingIncludes` gains a `docs/observability/**` entry
- `package.json` / `package-lock.json` - `react-markdown` + `remark-gfm` dependencies

## Decisions Made
- **Token-name correction (Rule 1 — bug):** the UI-SPEC's own drafted code (and this plan's task text) used mockup-equivalent CSS custom-property names (`var(--lav)`, `var(--hair)`, `var(--card2)`) that are **not declared anywhere in this codebase** — `components/admin/console-theme.ts`'s `.fncon` block defines `--ink-2`, `--ink-3`, `--border`, `--panel`, `--panel-2` instead (per the UI-SPEC's own "Design System" token-mapping table, which explicitly lists these as the "mockup equivalent" of the real tokens). Using the literal mockup-alias names would resolve to nothing and render text with no visible color. `markdown-components.tsx` uses the real token names throughout, with an inline comment documenting the mapping for the next reader.
- **Build-trace verification via a temporary scratch route:** the plan's Task 3 mandates a hard gate — `npx next build` + `grep -rl docs/observability .next/server` must return a match — but no route under `app/(admin)/playbook/**/*` exists yet in this wave (the real doc pages ship in plan 33-06). Created a minimal `app/(admin)/playbook/it/trace-verify/page.tsx` scratch page that imports `readObservabilityDoc` + `MarkdownDoc`, ran the build, confirmed the `.nft.json` trace manifest listed all `docs/observability/*.md` files (including the 4 in-scope docs), then deleted the scratch page — it was never staged or committed, keeping this plan's file scope exactly as declared (`next.config.mjs` only). This resolves RESEARCH's Open Question 1: the filesystem-path-style key (mirroring the fonts fix) works correctly on Next.js 15.5.19, no route-path-style fallback needed.
- **Build required dummy Supabase env vars:** the first local `next build` attempt failed prerendering an unrelated existing page (`/update-password`) due to missing `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` in this worktree (no `.env.local` present — expected, secrets are gitignored and not worktree-copied). Re-ran the build with placeholder values (`https://placeholder-build-verify.supabase.co` / `placeholder-build-verify-anon-key`) passed inline as environment variables for that one build invocation only — never written to any file, never committed. This is out-of-scope pre-existing worktree configuration, not a code defect; the placeholder values only needed to satisfy the Supabase client constructor's non-empty-string check during static prerendering, not to actually connect.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected nonexistent CSS custom-property names in markdownComponents**
- **Found during:** Task 2 (markdownComponents element map)
- **Issue:** The plan's action text and the UI-SPEC's own drafted Pattern 4 code sample both instruct using `var(--lav)`, `var(--hair)`, `var(--card2)` as "existing console tokens" — but `components/admin/console-theme.ts` (the actual token source) does not declare any of these names; it declares `--ink-2`, `--ink-3`, `--border`, `--panel`, `--panel-2`. Using the literal mockup-alias names would silently fail to resolve any color (broken/invisible text), a rendering bug.
- **Fix:** Used the real token names throughout `lib/playbook/markdown-components.tsx`, per the UI-SPEC's own "Design System" section, which explicitly maps mockup-token names to these real ones.
- **Files modified:** `lib/playbook/markdown-components.tsx`
- **Verification:** `npx tsc --noEmit` clean; `npx eslint` clean; manually cross-referenced every color usage against `components/admin/console-theme.ts`'s declared property list.
- **Committed in:** `7ddf3c6` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary for correct rendering. No scope creep — same visual intent as specified, correct implementation.

## Issues Encountered
- Local `next build` requires Supabase env vars for an unrelated existing page's prerender; worked around with build-scoped placeholder values (see Decisions Made above). Not a defect in this plan's changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The markdown-render + file-tracing foundation is complete and deploy-verified: `docs/observability/*.md` reads fail loud when missing, render through `react-markdown`'s React-element path (no raw-HTML injection), and are proven bundled into the Vercel serverless trace.
- Plan 33-06 (IT-room doc pages) can now import `readObservabilityDoc()` and `MarkdownDoc` directly with no further deploy-risk work needed — routes it creates under `app/(admin)/playbook/**/*` automatically inherit the `outputFileTracingIncludes` entry verified here.
- No blockers.

---
*Phase: 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1*
*Completed: 2026-08-17*
