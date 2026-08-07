---
phase: 17-split-sheet-esign
plan: 09
subsystem: pdf
tags: [react-pdf, esign, split-sheet, legal-document, docuseal, migration, counsel-gate]

# Dependency graph
requires:
  - phase: 17-split-sheet-esign
    provides: "partyRoleTag() DocuSeal role-tag helper, Unicode-safe Noto Sans font registration (17-08)"
provides:
  - "Migration 063 (additive) — split_sheet_parties.legal_name/.publishing_designee/.administrator, split_sheets.artist_name/.album_project_title/.record_label, artist_profiles.administrator, collaborators.administrator"
  - "lib/split-sheets/agreement.ts — verbatim AGREEMENT_CLAUSES, verbatim GUIDANCE_NOTES, PRE_SIGNATURE_REVIEW_PROMPT, composeLegalNameFromProfile(), displayValue()/displayLegalName(), and assertCounselReviewedForProduction() (P17-09a counsel gate)"
  - "Rebuilt lib/vault/pdf/split-sheet.tsx — the approved 7-section agreement document (title/subtitle, Work Details, 5-column Split Breakdown, verbatim Agreement, per-party Writer Signature Details with Signature+Date DocuSeal tags, Guidance Notes callout), with full backwards-compatible degradation for pre-063 rows"
  - "SplitSheetBuilder capture UI for legal name / professional name / publishing designee / administrator per party, standalone Work Details, collaborator-record prefill, and 'Use my info' self-prefill"
  - "Administrator field in ProfileForm/settings, EDITABLE_FIELDS, and CollaboratorProfile — the one decision-3a prefill source with no prior home"
affects: [17-06, 17-07, 17-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verbatim legal text lives in one exported constant (AGREEMENT_CLAUSES/GUIDANCE_NOTES) that the renderer prints directly — no paraphrasing at the render site, so what a future counsel review reads is byte-identical to what ships"
    - "Production-only runtime gate (assertCounselReviewedForProduction) — no-op outside production, throws in production while a single exported status constant remains 'unreviewed'; flipping it is a one-line, reviewable, dated change"
    - "React-pdf test tree-walk: primitive elements (Document/Page/View/Text) are STRING-tagged ('DOCUMENT'/'VIEW'/'TEXT'), not function components — confirmed via typeof inspection — so structural assertions (style values, wrap prop) can target them directly without a real layout engine"

key-files:
  created:
    - supabase/migrations/063_split_sheet_legal_grade.sql
    - __tests__/migration-063.test.ts
    - lib/split-sheets/agreement.ts
    - lib/split-sheets/agreement.test.ts
  modified:
    - lib/vault/pdf/split-sheet.tsx
    - lib/vault/pdf/split-sheet.test.ts
    - lib/split-sheets/approval.ts
    - components/split-sheets/SplitSheetBuilder.tsx
    - app/(artist)/split-sheets/page.tsx
    - app/api/split-sheets/route.ts
    - app/api/split-sheets/[id]/route.ts
    - components/profile/ProfileForm.tsx
    - app/api/profile/route.ts
    - app/(artist)/settings/page.tsx
    - lib/profile/load.ts
    - lib/collaborators/index.ts
    - types/index.ts

key-decisions:
  - "Followed 17-SPLIT-SHEET-TEMPLATE-SPEC.md and the approved PDF preview as authoritative over the plan body's original (broader) Task 1/2 behavior blocks — no rights_scope column, no writer/publisher/master share split, no samples_disclosed toggle, no ISWC/ISRC columns. The approved document is songwriting/publishing-only by fixed design, with a verbatim master-ownership clarification Guidance Note replacing a master-split section entirely."
  - "Migration 063 adds exactly six columns across four tables, all nullable/additive: split_sheet_parties.legal_name/.publishing_designee/.administrator, split_sheets.artist_name/.album_project_title/.record_label, artist_profiles.administrator, collaborators.administrator"
  - "artist_profiles.administrator inherits migration 040's private-by-default column-privilege posture with no new REVOKE/GRANT — it is simply absent from 040's explicit GRANT SELECT/UPDATE column lists, the same mechanism that already protects publisher/pro/ipi"
  - "Legal name display: 'Legal Name (p/k/a Professional Name)' when they differ, legal name alone when they match, falls back to the professional name when no legal_name is captured (pre-063 row) — never fabricates a legal name, never renders blank"
  - "'Use my info' self-prefill (decision 3a's first chain link) reads ONLY the current session user's own artist_profiles row, fetched server-side in app/(artist)/split-sheets/page.tsx and passed down as a prop — the builder has no path to another Funūn user's private profile data, by design"
  - "CollaboratorPicker prefill extended to publishing_designee/administrator but deliberately NOT legal_name — collaborators has no legal-name column (spec decision 3a), so a picked party's legal name is always typed by the initiator"
  - "Snapshot semantics (decision 3a) are structural, not enforced by a separate mechanism: every prefill copies a value into local React state once, and the POST payload writes it once to split_sheet_parties — nothing in the write path re-reads the profile live, so an executed document cannot silently change if the profile is edited afterward"

patterns-established:
  - "Migration-string-assertion tests for additive-only schema changes: assert every ADD COLUMN uses IF NOT EXISTS, assert no ALTER COLUMN/DROP COLUMN/DROP CONSTRAINT appears anywhere in the file, assert the pre-existing CHECK constraint text is untouched"
  - "PDF renderer tree-walk test helper (expand/collectText/findAll) that fully resolves composite (function) elements while preserving type/props/children on primitive react-pdf nodes, enabling direct assertions on computed style values (lineHeight, borderLeft) and structural props (wrap={false}) without a real layout/rendering pass"

requirements-completed: []

# Both ESIGN-16 and ESIGN-17 are intentionally left un-marked-complete in
# REQUIREMENTS.md by this summary — see "Requirement completion note"
# under Deviations below. The delivered document and gate are believed
# complete against the APPROVED SPEC, but ESIGN-16's requirement TEXT
# predates that spec (references scope/sample-disclosure/ISWC-ISRC
# elements the spec deliberately excludes), and ESIGN-17's requirement
# text describes attorney review having occurred, which it has not.

coverage:
  - id: D1
    description: "Migration 063 adds exactly the six columns the approved spec calls for, all nullable/additive, no existing column or constraint altered"
    requirement: "ESIGN-16"
    verification:
      - kind: unit
        ref: "__tests__/migration-063.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "lib/split-sheets/agreement.ts carries both operative sentences and all three guidance notes verbatim, plus the counsel gate and display helpers"
    requirement: "ESIGN-16"
    verification:
      - kind: unit
        ref: "lib/split-sheets/agreement.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "The rebuilt split-sheet renderer produces the approved 7-section agreement document (title/subtitle with the lineHeight overlap fix, Work Details, 5-column Split Breakdown, verbatim Agreement, per-party Writer Signature Details with Signature+Date tags in wrap={false} blocks, Guidance Notes callout) and degrades every unstated field to an explicit marker for a pre-063 legacy row"
    requirement: "ESIGN-16"
    verification:
      - kind: unit
        ref: "lib/vault/pdf/split-sheet.test.ts"
        status: pass
      - kind: unit
        ref: "__tests__/pdf-unicode.test.ts#split sheet — Unicode regression"
        status: pass
    human_judgment: false
  - id: D4
    description: "assertCounselReviewedForProduction() throws in production while COUNSEL_REVIEW_STATUS is unreviewed, and is a no-op in every non-production environment"
    requirement: "ESIGN-17"
    verification:
      - kind: unit
        ref: "lib/split-sheets/agreement.test.ts#counsel gate (P17-09a)"
        status: pass
    human_judgment: false
  - id: D5
    description: "An initiator can capture legal name, professional name, publishing designee, administrator per party, and standalone Work Details, with collaborator-record and self-profile prefill; captured values are persisted via the API allowlists (fixed in the same task set — see Deviations) and reach the rendered agreement"
    verification: []
    human_judgment: true
    rationale: "Requires a live Supabase session and an actual party round-trip through the builder UI and API — cannot be exercised by a unit test in this execution context (no DB in the jest environment). tsc/lint/full-suite are clean; see the corrected human-check steps in Deviations."
  - id: D6
    description: "Migration 063 pushed to the live database, verified LOCAL=REMOTE, existing split_sheets/split_sheet_parties rows intact, and a direct client UPDATE of a new party column still fails under RLS"
    verification: []
    human_judgment: true
    rationale: "Blocking checkpoint — executor agents never run supabase db push. Requires a human with Supabase CLI/dashboard access."
  - id: D7
    description: "AGREEMENT_CLAUSES and the scope/guidance wording reviewed by a licensed attorney competent in music publishing; COUNSEL_REVIEW_STATUS flipped to 'reviewed' only after that review"
    verification: []
    human_judgment: true
    rationale: "Blocking checkpoint (P17-09a) — not satisfiable by any agent; the roadmap guardrail is explicit that Funūn organizes documents and does not substitute for counsel."

# Metrics
duration: ~55min
completed: 2026-07-20
status: blocked
---

# Phase 17 Plan 09: Legal-Grade Split-Sheet Document Summary

**Rebuilt the split sheet from a bare collaborator table into the approved 7-section agreement (legal name, publishing designee/administrator, verbatim operative language, per-signature dates) and wired a production-only counsel-review gate that currently blocks live minting — all 3 automatable tasks shipped; the migration-push and attorney-review checkpoints remain open, both requiring genuine out-of-band human action.**

## Performance

- **Duration:** ~55 min
- **Started:** ~2026-07-20T09:45Z (approx.)
- **Completed:** 2026-07-20T10:32Z
- **Tasks:** 3 of 5 (the remaining 2 are blocking-human checkpoints, not executor work)
- **Files modified:** 17 (4 created, 13 modified)

## Accomplishments

- **Migration 063** (`supabase/migrations/063_split_sheet_legal_grade.sql`, NOT pushed — see checkpoint below): adds exactly the six columns the approved template spec calls for — `split_sheet_parties.legal_name/.publishing_designee/.administrator`, `split_sheets.artist_name/.album_project_title/.record_label`, `artist_profiles.administrator`, `collaborators.administrator`. All nullable/additive; string-assertion tests confirm no `ALTER COLUMN`/`DROP COLUMN`/`DROP CONSTRAINT` anywhere in the file and that `split_percentage`'s existing CHECK is untouched.
- **`lib/split-sheets/agreement.ts`**: `AGREEMENT_CLAUSES` (both operative sentences, verbatim), `GUIDANCE_NOTES` (all three approved notes, verbatim), `PRE_SIGNATURE_REVIEW_PROMPT` (decision 3b, points at decline/object, never inline editing), `composeLegalNameFromProfile()`, `displayValue()`/`displayLegalName()`, and `assertCounselReviewedForProduction()` — production-only, throws while `COUNSEL_REVIEW_STATUS` is `'unreviewed'`, no-op everywhere else.
- **Rebuilt `lib/vault/pdf/split-sheet.tsx`**: renders the approved 7 sections in order (Title/Subtitle → Work Details → Split Breakdown [Writer Legal Name · Split % · PRO/Society · Publishing Designee · Administrator, + Total] → Agreement → Writer Signature Details [per party: numbered legal name+p/k/a, PRO/Society, Publishing Designee, Administrator, then Signature+Date DocuSeal tags side by side in a `wrap={false}` block] → Guidance Notes callout with the `#818CF8` accent border). Role and IPI are retained on the party record but never render. Every unstated field renders an explicit em-dash rather than being blank or omitted; a pre-063 legacy row (only `name`/`pro`/`ipi`/`role`/`split_percentage`) still renders a complete document.
- **Fixed the title/subtitle overlap bug**: the page's inherited line-height collapses a 19pt title's line box short of its glyph height; `title` now has an explicit `lineHeight: 1.2` and `subtitle` its own `marginTop: 6, lineHeight: 1.3` — covered by a dedicated regression test that asserts the computed style values directly.
- **`SplitSheetBuilder.tsx`** now captures every new field: per party — Legal Name (required), optional Professional/Stage Name (p/k/a), Publishing Designee, Administrator, alongside the existing PRO/IPI/Role/Split; sheet level — optional standalone Work Details (Artist Name, Album/Project Title, Record Label). CollaboratorPicker prefill extended to Publishing Designee/Administrator (never Legal Name — collaborators has no legal-name column). New "Use my info" button prefills from the signed-in user's own `artist_profiles` snapshot, fetched server-side in `app/(artist)/split-sheets/page.tsx`.
- **Administrator settings field**: `ProfileForm.tsx` (Rights & Royalties, right after Publisher, with the approved helper text), `app/api/profile/route.ts`'s `EDITABLE_FIELDS` allowlist, `types/index.ts`'s `ArtistProfile`, and both `DEMO_PROFILE` literals.
- **[Rule 2] Fixed a mass-assignment allowlist gap in both split-sheet API routes** — `app/api/split-sheets/route.ts` (create) and `app/api/split-sheets/[id]/route.ts` (edit) had no allowlist entries for the new columns; without this fix everything the builder captures would be silently dropped on write, and the edit route's delete-and-reinsert pattern would have actively *wiped* the new fields off existing rows on every edit.

## Task Commits

Each task was committed atomically (TDD tasks show test → feat pairs):

1. **Task 1: Additive migration 063 + agreement module** — `5e98e94` (test, RED) → `bbc2ce2` (feat, GREEN)
2. **Task 2: Rebuild the split-sheet renderer as an agreement** — `9021b68` (test, RED) → `97cd5db` (feat, GREEN)
3. **Task 3: Capture the new fields in SplitSheetBuilder** — `7e72152` (feat: settings/collaborator plumbing) → `dffc8a2` (fix: API allowlist gap) → `f42e021` (feat: builder UI + page wiring)

**Plan metadata:** (this commit, pending)

## Files Created/Modified

- `supabase/migrations/063_split_sheet_legal_grade.sql` — the six additive columns
- `__tests__/migration-063.test.ts` — additive-only string-assertion suite
- `lib/split-sheets/agreement.ts` — verbatim legal text, counsel gate, display helpers
- `lib/split-sheets/agreement.test.ts` — full coverage of the above
- `lib/split-sheets/approval.ts` — additively extends `SplitSheetParty` with `legal_name`/`publishing_designee`/`administrator`
- `lib/vault/pdf/split-sheet.tsx` — the rebuilt 7-section renderer
- `lib/vault/pdf/split-sheet.test.ts` — full section coverage + legacy-degradation + overlap regression
- `components/split-sheets/SplitSheetBuilder.tsx` — capture UI for all new fields + prefill
- `app/(artist)/split-sheets/page.tsx` — fetches and passes `myProfile` prefill
- `app/api/split-sheets/route.ts` / `app/api/split-sheets/[id]/route.ts` — allowlist fix
- `components/profile/ProfileForm.tsx`, `app/api/profile/route.ts`, `app/(artist)/settings/page.tsx`, `lib/profile/load.ts`, `types/index.ts` — Administrator settings field
- `lib/collaborators/index.ts` — `administrator` on `CollaboratorProfile`

## Decisions Made

See `key-decisions` in frontmatter above — all trace back to the authoritative template spec (`.planning/phases/17-split-sheet-esign/17-SPLIT-SHEET-TEMPLATE-SPEC.md`) and the assignment's explicit override of the plan body's original, broader Task 1/2 design.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Split-sheet API routes did not allowlist the new columns**
- **Found during:** Task 3
- **Issue:** `app/api/split-sheets/route.ts`'s `PARTY_FIELDS`/insert and `app/api/split-sheets/[id]/route.ts`'s equivalents had no entries for `legal_name`/`publishing_designee`/`administrator` or the sheet-level Work Details fields — an unlisted field is silently dropped, not rejected (the exact trap `app/api/profile/route.ts`'s `EDITABLE_FIELDS` comment already documents for that route). Worse, the `[id]` PATCH route does a delete-and-reinsert of every party row on any `parties[]` edit, so leaving the fields unlisted would have *wiped* previously-captured values on every edit, not merely failed to save new ones.
- **Fix:** Extended both allowlists and the insert/update payloads.
- **Files modified:** `app/api/split-sheets/route.ts`, `app/api/split-sheets/[id]/route.ts`
- **Verification:** `npx tsc --noEmit` / `npm run lint` clean; consistent with the existing sanitize pattern in both files.
- **Committed in:** `dffc8a2`

**2. [Rule 1 - Bug, self-caught in test authoring] Two of my own new test assertions were wrong, not the implementation**
- **Found during:** Task 2 (`split-sheet.test.ts` first run)
- **Issue:** The `wraps each signature block in wrap={false}` and the Guidance Notes callout-border tests both matched on `VIEW` nodes whose *aggregated descendant text* contained the target string — since the tree-walk helper pushes every ancestor `VIEW`, not just the innermost one, the tests were finding outer wrapper views (with no `wrap`/`borderLeft` prop) instead of the actual signature-block/callout-box view.
- **Fix:** Filtered directly on the distinguishing prop (`wrap === false`, `style.borderLeft` present) rather than on aggregated text content.
- **Files modified:** `lib/vault/pdf/split-sheet.test.ts`
- **Verification:** Both tests pass against the actual renderer output.

### Superseded plan-body content (not deviations — explicit assignment instruction)

- The plan body's original Task 1/2 `<behavior>` blocks describe a broader design (`rights_scope` column + callout, `writer_share`/`publisher_share`/`master_share` columns, `samples_disclosed`/`sample_details`, `track_id`/`iswc`/`isrc` columns and Work Identification section) that the authoritative template spec explicitly rejects in favor of a fixed, songwriting/publishing-only document with a verbatim master-ownership clarification Guidance Note. None of that was built, per the assignment's explicit instruction to follow the spec. The plan's own `<template_spec_authority>` block already flags this supersession.
- **Corrected human-check** for Task 3 (the plan's original text describes rights-scope toggling, separate writer/publisher/master share dimensions, and a sample-disclosure toggle — all superseded): create a split sheet in the builder with two parties, enter distinct Legal Name and Professional/Stage Name for at least one party, a Publishing Designee and Administrator for at least one party, confirm the 100% split gate still behaves, then confirm the generated document shows the Split Breakdown with the p/k/a notation, the locked Writer Signature Details block per party, and the Guidance Notes callout.
- **Requirement completion note:** `ESIGN-16`/`ESIGN-17` are deliberately left **not** marked complete in `REQUIREMENTS.md` by this run. `ESIGN-16`'s requirement text (composition-vs-master scope, sample disclosure, ISWC/ISRC linkage) predates the approved spec and no longer matches what was deliberately built; recommend updating the requirement text to match the approved spec, or explicitly noting the excluded sub-items as a scope decision. `ESIGN-17`'s requirement text describes attorney review having occurred — the gate mechanism is complete and tested, but the review itself has not happened (`COUNSEL_REVIEW_STATUS` is `'unreviewed'`), so marking it complete would overclaim.

## Verification

- `npx jest __tests__/migration-063.test.ts lib/split-sheets/agreement.test.ts lib/vault/pdf/split-sheet.test.ts` — **47/47 passing**.
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean (0 errors, 0 warnings, `--max-warnings=0`).
- **Full suite: 63 suites / 665 tests passing** (baseline before this plan: 61 suites / 629 tests — 2 new suites, 36 new tests, zero regressions).
- `__tests__/pdf-unicode.test.ts` (the 17-08 Unicode regression suite) still passes unmodified against the rebuilt renderer — `Nikola Jokić` and the `Funūn` brand string both extract byte-for-byte intact from the real rendered PDF bytes, and the renderer embeds a Noto Sans subset base-font rather than `Helvetica`. This directly satisfies the assignment's explicit check that a rendered PDF contains `Funūn` (not `Funkn`) and a `ć` name survives.

## Issues Encountered

None beyond the two self-caught test-authoring bugs documented above (Deviation 2).

## User Setup Required

None from this session — no external service configuration. Both remaining checkpoints require a human (and, for the second, a licensed attorney) to act; see below.

## Next Phase Readiness

- This plan does **not** modify the mint route (17-06, still incomplete). 17-06's own plan text is amended (per this plan's `<verification>` "Coordination with 17-06" section) to call `assertCounselReviewedForProduction()` before any DocuSeal call and to build the full `SplitSheetAgreementInput` — both of which this plan's renderer and agreement module now support.
- **Blocking checkpoint 1 — migration 063 push (pending):** a human must run `supabase migration list` to confirm 062 is the current remote head, review 063 for strict additivity, run `supabase db push`, confirm `LOCAL=REMOTE`, confirm existing `split_sheets`/`split_sheet_parties` rows survived intact, and confirm a direct client `UPDATE` of a new party column on a sheet they do not own fails. See the full checklist in `17-09-PLAN.md`'s first checkpoint task.
- **Blocking checkpoint 2 — attorney review (P17-09a, pending):** an actual licensed attorney competent in music publishing must review `AGREEMENT_CLAUSES` and the scope/guidance wording (sample PDFs generated from both a solo and multi-party sheet, at least one with a Publishing Designee and one without), per the questions listed in `17-09-PLAN.md`'s second checkpoint task. Only after that review may `COUNSEL_REVIEW_STATUS` in `lib/split-sheets/agreement.ts` be flipped to `'reviewed'`, recording the attorney's name/firm/date in the constant's comment. Until then, `assertCounselReviewedForProduction()` blocks any production mint — this is by design, not a bug to route around.
- Neither checkpoint blocks continued code-level work on 17-06/17-07/17-10 (mirrors the existing 17-02 migration-push checkpoint's precedent, which has not blocked 17-03 through 17-08 from executing) — but no live envelope can mint against real legal language until both close.

---
*Phase: 17-split-sheet-esign*
*Completed: 2026-07-20 (code-complete; 2 blocking-human checkpoints open)*

## Self-Check: PASSED

All 18 created/modified files (including this SUMMARY) confirmed present on disk; all 7 task commits (`5e98e94`, `bbc2ce2`, `9021b68`, `97cd5db`, `7e72152`, `dffc8a2`, `f42e021`) confirmed in git log.
