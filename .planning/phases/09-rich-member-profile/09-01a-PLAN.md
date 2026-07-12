---
phase: 09-rich-member-profile
plan: 01a
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/metadata/schema.ts
  - types/index.ts
  - package.json
  - __tests__/profile-roles-validation.test.ts
  - __tests__/featured-project-validation.test.ts
  - __tests__/profile-load.test.ts
  - __tests__/schema-lyrics.test.ts
autonomous: true
requirements: [PROFILE-02, PROFILE-04, PROFILE-05, PROFILE-06]
must_haves:
  truths:
    - "The four Wave 0 Jest test files exist, import their subjects by real name from the modules 09-01b will extend, and FAIL at RED (unimplemented) — proving they exercise not-yet-built code"
    - "npm `test` script runs Jest (`\"test\": \"jest\"` present in package.json)"
    - "readLyrics() still parses legacy plain-text lyrics unchanged after the additive `synced` field is added to TrackLyrics"
    - "OPEN_TO_VALUES is exported as the single source of the OpenTo union members, ready for 09-01b's filterOpenTo and the tests"
  artifacts:
    - __tests__/profile-roles-validation.test.ts
    - __tests__/featured-project-validation.test.ts
    - __tests__/profile-load.test.ts
    - __tests__/schema-lyrics.test.ts
  key_links:
    - "TrackLyrics.synced is additive JSONB inside tracks.metadata — no migration, readLyrics() defensive parse tolerates it"
    - "OPEN_TO_VALUES is the shared enum source consumed by 09-01b's filterOpenTo() and the open_to test assertions"
    - "The four RED tests define the contract 09-01b's validators/query must satisfy (GREEN)"
---

<objective>
Lay the test + additive-type foundation Wave 0 requires, with NO DB/API/migration work: scaffold the four RED Jest test files the validation strategy mandates, add the `"test": "jest"` npm script, add the additive timestamped-lyrics shape (`TrackLyrics.synced`, D-13), and export `OPEN_TO_VALUES` as the single source of the OpenTo enum. This plan is fully self-contained and autonomous — it touches no migration, no route, no live DB.

Purpose: This is the Wave 0 RED half — the failing tests define the behavioral contract that 09-01b (allowlist extension, validators, placements query, migration 043) must satisfy (GREEN). Splitting the pure test/type scaffolding away from the DB-touching, checkpoint-gated work keeps this plan autonomous and inside context budget.
Output: Four new RED test files, a `test` npm script, one additive type extension, and one exported enum constant.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/09-rich-member-profile/09-RESEARCH.md
@.planning/phases/09-rich-member-profile/09-PATTERNS.md
@.planning/phases/09-rich-member-profile/09-VALIDATION.md
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Wave 0 — four RED test scaffolds + npm test script</name>
  <files>__tests__/profile-roles-validation.test.ts, __tests__/featured-project-validation.test.ts, __tests__/profile-load.test.ts, __tests__/schema-lyrics.test.ts, package.json</files>
  <read_first>
    - .planning/phases/09-rich-member-profile/09-VALIDATION.md (Wave 0 Requirements + Per-Task Verification Map — the exact test files + behaviors)
    - .planning/phases/09-rich-member-profile/09-RESEARCH.md (Validation Architecture → Phase Requirements → Test Map; Code Examples → ProfileRoleSchema, placements query, TrackLyrics synced shape)
    - __tests__/schema-stems-instrumental.test.ts (existing test file — copy its ts-jest import/structure convention)
    - lib/metadata/schema.ts (readLyrics + TrackLyrics current shape, lines ~76-85 and readLyrics/sanitizeLyrics)
    - lib/profile/load.ts (buildProfileData signature + return shape)
    - jest.config.js (testEnvironment node, @/* path mapping)
  </read_first>
  <behavior>
    - profile-roles-validation.test.ts: a roles validator accepts `{kind:'preset',slug:'artist'}` and `{kind:'custom',label:'Mixing engineer'}`; rejects an unknown preset slug, a custom entry with empty/40+ char label, and a non-array payload; the open_to filter keeps only strings in OPEN_TO_VALUES and drops unknown enum strings.
    - featured-project-validation.test.ts: the featured-project pre-check predicate returns not-found for a project the caller does not own and rejected-not-public for an owned-but-private project, and accepts an owned public project (test the extracted pure predicate against fixture rows, not the live DB).
    - profile-load.test.ts: buildProfileData() derives placementsCount from the passed option and avgReadiness from fixture release scores.
    - schema-lyrics.test.ts: readLyrics() returns the same `{text}` for a legacy plain-text lyrics object after the `synced` field is added to the type; readLyrics() on an object that also carries a well-formed `synced` block preserves `text` and does not throw.
  </behavior>
  <action>Create the four `__tests__/*.test.ts` files listed in 09-VALIDATION.md Wave 0 Requirements. Import the validators/functions by their real names from the modules 09-01b will create/extend: `sanitizeProfileRoles`, `filterOpenTo`, and `isFeaturableProjectRow` from a dedicated `@/lib/profile/validate` module (decided here — a pure-logic module is cleaner to unit-test than importing from the route file; 09-01b MUST create `lib/profile/validate.ts` with exactly these export names), `readLyrics` from `@/lib/metadata/schema`, and `buildProfileData` from `@/lib/profile/load`. Also import `OPEN_TO_VALUES` from wherever `OpenTo` lives (Task 2 exports it from `types/index.ts`). Write assertions matching the four behaviors above. These MUST fail initially (RED) because the validators do not exist yet (the `@/lib/profile/validate` module is created in 09-01b). Add `"test": "jest"` to the `scripts` block in package.json (currently absent per 09-VALIDATION.md). Do NOT weaken assertions, do NOT use `.skip`/`it.todo`, do NOT stub the missing module — 09-01b makes them green.</action>
  <verify>
    <automated>npx jest __tests__/profile-roles-validation.test.ts __tests__/featured-project-validation.test.ts __tests__/profile-load.test.ts __tests__/schema-lyrics.test.ts 2>&1 | grep -E "fail|Cannot find|is not a function" | head</automated>
  </verify>
  <acceptance_criteria>
    - Running the four test files fails at RED (missing `@/lib/profile/validate` exports / unimplemented behavior), proving the tests exercise not-yet-built code.
    - `package.json` scripts block contains `"test": "jest"` (grep -c '"test": "jest"' package.json returns 1).
    - Each test file imports its subject from a real module path (no `.skip`, no `it.todo` placeholders).
  </acceptance_criteria>
  <done>Four Wave 0 test files exist and fail for the right reason (unimplemented subjects in 09-01b); npm `test` script added.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Additive TrackLyrics.synced extension + OPEN_TO_VALUES export</name>
  <files>lib/metadata/schema.ts, types/index.ts</files>
  <read_first>
    - lib/metadata/schema.ts (TrackLyrics type lines ~78-83, readLyrics/sanitizeLyrics — the existing defensive parse)
    - types/index.ts (OpenTo union line ~264, PROFILE_ROLES line ~239 — where OPEN_TO_VALUES belongs alongside its union)
    - .planning/phases/09-rich-member-profile/09-RESEARCH.md (Code Examples → TrackLyrics synced shape D-13; OPEN_TO_VALUES source-of-truth note)
    - .planning/phases/09-rich-member-profile/09-PATTERNS.md (lib/metadata/schema.ts section — where the synced field is added)
  </read_first>
  <action>
    In `lib/metadata/schema.ts`: extend the `TrackLyrics` type additively with an optional `synced` field of shape `{ lines: { atMs: number; text: string }[]; method: 'manual' | 'forced_alignment'; updated_at: string }` (D-13). Do NOT modify `readLyrics()` / `sanitizeLyrics()` logic — the existing defensive parse already tolerates unknown optional keys, and the `schema-lyrics.test.ts` RED test asserts legacy `{text}` still parses unchanged.
    In `types/index.ts`: export a `OPEN_TO_VALUES` array containing all `OpenTo` union members (placed next to the `OpenTo` union definition, mirroring the `PROFILE_ROLES`/`PROFILE_ROLE_LABELS` convention already in this file), typed `readonly OpenTo[]` (e.g. `as const` cast). This is the single shared source consumed by 09-01b's `filterOpenTo()` and the open_to test.
  </action>
  <verify>
    <automated>npx jest __tests__/schema-lyrics.test.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `npx jest __tests__/schema-lyrics.test.ts` passes (GREEN) — legacy lyrics parse unchanged, synced-carrying object preserves `text`.
    - `TrackLyrics` has an optional `synced` field; `readLyrics()` body is byte-identical to before except the type extension (`grep -n "readLyrics" lib/metadata/schema.ts` shows the function unchanged in logic).
    - `OPEN_TO_VALUES` is exported from `types/index.ts` and lists every OpenTo union member: `grep -c "OPEN_TO_VALUES" types/index.ts` returns >=1.
    - `npx tsc --noEmit` clean.
  </acceptance_criteria>
  <done>TrackLyrics extended additively (legacy lyrics parse unchanged); OPEN_TO_VALUES exported as the single enum source ready for 09-01b.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| tracks.metadata JSONB → readLyrics() parse | The additive `synced` key must not break the defensive parse of legacy lyrics; no new untrusted-input surface is introduced (type-only + tests) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-09-01a | Tampering | readLyrics() parse regression from the additive TrackLyrics.synced field | low | mitigate | `readLyrics()`/`sanitizeLyrics()` logic is left byte-identical (type-only extension); `schema-lyrics.test.ts` asserts legacy `{text}` still parses and a synced-carrying object does not throw |
| T-09-01a-2 | Tampering | OPEN_TO_VALUES drifting from the OpenTo union (validator accepts stale slugs) | low | mitigate | `OPEN_TO_VALUES` is declared next to the `OpenTo` union in the same file and typed as `readonly OpenTo[]` so a union change surfaces as a compile error; it is the single source consumed by 09-01b's filterOpenTo |
</threat_model>

<verification>
- The four RED tests fail for the right reason: `npx jest __tests__/profile-roles-validation.test.ts __tests__/featured-project-validation.test.ts __tests__/profile-load.test.ts __tests__/schema-lyrics.test.ts` reports failures from the missing `@/lib/profile/validate` module (not from a broken test).
- `schema-lyrics.test.ts` is GREEN after Task 2 (legacy lyrics parse unchanged).
- Type-check clean: `npx tsc --noEmit`.
- npm test script present: `grep -c '"test": "jest"' package.json` returns 1.
</verification>

<success_criteria>
- Four Wave 0 test files exist and fail at RED against the not-yet-built `@/lib/profile/validate` module.
- `"test": "jest"` npm script added.
- TrackLyrics.synced exists additively; legacy lyrics parse unchanged (schema-lyrics.test.ts green).
- OPEN_TO_VALUES exported as the single enum source for 09-01b.
</success_criteria>

## Artifacts this phase produces

New symbols/files created by this plan (exclude from downstream drift "unexplained new symbol" flags):

- Type extension: `TrackLyrics.synced?: { lines: { atMs: number; text: string }[]; method: 'manual' | 'forced_alignment'; updated_at: string }` (in `lib/metadata/schema.ts`)
- Constant: `OPEN_TO_VALUES` (all OpenTo union members) exported from `types/index.ts`
- npm script: `"test": "jest"` in `package.json`
- Test files: `__tests__/profile-roles-validation.test.ts`, `__tests__/featured-project-validation.test.ts`, `__tests__/profile-load.test.ts`, `__tests__/schema-lyrics.test.ts`

<output>
Create `.planning/phases/09-rich-member-profile/09-01a-SUMMARY.md` when done.
</output>
</content>
</invoke>
