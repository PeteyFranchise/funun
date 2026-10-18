# Coding Conventions

**Analysis Date:** 2026-10-18

Measured across the tracked source tree: 1,186 TypeScript/TSX source files in `lib/`, `app/`, and `components/` (test files excluded), plus `scripts/` where noted. Counts are from `git ls-files` at analysis time and are included so later changes can be compared.

## Naming Patterns

**Files:**
- `lib/` modules use kebab-case: `lib/accounts/account-context.ts`, `lib/security/rate-limit.ts`, `lib/green-room/repost.ts` (356 of 377 non-test `lib/` files).
- Some older `lib/` modules use camelCase instead. Do not copy this for new files: `lib/invites/completeSignupClaim.ts`, `lib/buyers/createBuyerAccount.ts`, `lib/buyers/addClientPartnerMember.ts` (21 files total).
- React components use PascalCase filenames that match the default-exported or named component: `components/vault/MetadataStudio.tsx`, `components/vault/ToolSidePanel.tsx`, `components/admin/ArtistInvitesAdmin.tsx` (289 of 291 component files).
- Next.js route files follow framework names: `app/api/<domain>/route.ts`, `app/api/vault/[projectId]/...`, `app/(artist)/dashboard/page.tsx`, `app/(artist)/layout.tsx`.
- Test files: `<name>.test.ts` or `<name>.test.tsx`. Use `.test.` (not `.spec.`). No `.spec.` files exist.

**Functions:**
- camelCase for all functions: `uploadTrackAudio()`, `validateRelease()`, `formatIsrc()`.
- Predicates start with `is`, `can`, or `has`: `isValidIsrc()`, `canEmbed()`, `hasAccess()`.
- Named guards start with `require` and throw or return a failure result: `requireStaff()` in `lib/admin/gate.ts`, `requireWorkspaceRole()`, `requireWorkspaceProjectAccess()`.
- Exported functions use `export function`, not `export const fn = () =>`. 358 `lib/` files use `export function`; 2 use the arrow form.
- Next.js route handlers are named exports `GET`, `POST`, `PATCH`, `DELETE`.

**Variables and constants:**
- camelCase for variables: `release`, `embedState`, `collaboratorNames`.
- SCREAMING_SNAKE_CASE for constants: `MAX_AUDIO_SIZE`, `ALLOWED_AUDIO_TYPES`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_ATTEMPTS` (317 exported UPPER_SNAKE constants in source).
- Enumerations are modeled as a value array plus a label record, both exported from the schema module that owns them:
  ```typescript
  // Illustrative shape; the real instances live in lib/metadata/schema.ts
  export const PRO_VALUES = ['value_a', 'value_b'] as const
  export type PRO = (typeof PRO_VALUES)[number]
  export const PRO_LABELS: Record<PRO, string> = { value_a: '...', value_b: '...' }
  ```
  Suffixes: `_VALUES` for arrays and `_LABELS` for label maps (65 exported pairs). Match the existing list values exactly when adding an option.
- Zod schemas are named `<thing>Schema` (74 declarations).

**Types:**
- Use `type` aliases. There are 1,594 `type` declarations and 10 `interface` declarations in source. Use `interface` only if a declaration merge is needed.
- Discriminated unions for states and results: `export type VerificationActionResult = ...` in `lib/trust-safety/verification.ts`.
- Name result types `<Operation>Result`: `MintAgreementResult` (`lib/sync-library/mint-agreement.ts`), `ContentActionResult` (`lib/trust-safety/admin-reports.ts`).
- Import types with `import type` or an inline `type` modifier: `import type { UserProfile } from '@/types'`, `import { buildCalendarPrompt, type ToolProjectContext } from '@/lib/tools/registry'`.

**React components:**
- Function components with destructured props and inline prop types.
- Components that use hooks or browser APIs start with `'use client'` on the first line. This appears in 267 source files. Server components have no directive.

## Code Style

**Semicolons:** Never. No TypeScript or TSX statement ends with `;`. The only `;` characters in source are inside CSS-in-JS template strings. Do not add them.

**Quotes:**
- Single quotes for JavaScript and TypeScript strings and import paths. Zero imports use double quotes.
- JSX attributes use double quotes: `className="..."`. Single-quoted JSX attributes are rare (34 occurrences against 12,903 double-quoted).
- Template literals for interpolation: `` `Processing ${name}` ``.

**Indentation and line length:** 2 spaces. Lines are not hard-wrapped at a fixed width. About 5% of source lines exceed 100 characters. Keep new code under 100 where practical, and break long call chains and object literals across lines.

**Trailing commas:** Used in most multi-line object, array, and argument lists, but not enforced. Match the surrounding file.

**Formatter and linter:**
- No Prettier config and no Prettier dependency. Formatting is not enforced by tooling; the style above is the convention.
- ESLint is configured in `.eslintrc.json` as `extends: ["next/core-web-vitals"]` with `react/no-unescaped-entities` turned off. `.eslintignore` excludes `.next/`, `node_modules/`, `out/`, `coverage/`, and `*.tsbuildinfo`.
- `npm run lint` runs `ESLINT_USE_FLAT_CONFIG=false eslint . --ext .js,.jsx,.ts,.tsx --max-warnings=0`. Any warning fails CI.

**TypeScript:**
- `strict: true` (`tsconfig.json`). Path alias `@/*` maps to the repo root.
- Type checking is part of CI through `npm run typecheck:strict` (`tsc --noEmit --noUnusedLocals --noUnusedParameters`). Unused locals and parameters fail the build. Remove unused locals and parameters rather than suppressing the check.
- `@ts-ignore` and `@ts-expect-error` do not appear in source. Ten `any` annotations or casts exist. Do not add new ones; use a narrow type or a type guard instead.

**Eslint suppressions:** Only line-level, with a reason in the surrounding code. Observed uses:
- `// eslint-disable-next-line react-hooks/exhaustive-deps` (about 14 sites; effect dependency lists that are intentionally partial).
- `// eslint-disable-next-line @next/next/no-img-element` (about 6 sites; raw `<img>` for blob or data URLs).

## Import Organization

**Order (observed in route and component files):**
1. Framework and runtime packages: `next/server`, `next/navigation`, `react`, `next/link`
2. Third-party SDKs and utilities: `@anthropic-ai/sdk`, `zod`, `@supabase/supabase-js`, `@sentry/nextjs`
3. Project modules through the `@/` alias: `@/lib/supabase/server`, `@/types`, `@/lib/...`
4. Sibling relative modules, only inside the same directory: `./account-context`

Separate groups with a blank line. There is no automated import sorter.

**Path aliases:**
- Use `@/` for every cross-directory import. There are 2,246 `@/` imports in source.
- Parent-directory imports (`../`) do not appear in source. Do not add them. Sibling imports with `./` appear in 73 files and are acceptable for colocated helpers.

**Barrel files:** Rare. `lib/storage/index.ts` re-exports when needed. Most code imports the specific module, for example `@/lib/admin/gate`.

## Section Headers and Comments

**Section headers:** Long files are divided with a fixed banner. This form is used across 1,196 lines:
```typescript
// ─── Section Name ─────────────────────────────────────────────────
```
Use the `─` (U+2500) character. Examples: `lib/metadata/schema.ts`, `components/vault/MetadataStudio.tsx`.

**Comment style:**
- Comments explain why the code is shaped the way it is: a constraint, a prior bug, a security rule, or a spec reference. Do not restate what the next line does.
- Reference the decision or plan that produced the rule when one exists. Examples in source: `D-01 (Phase 25)` in `lib/admin/gate.ts`, `RESEARCH.md Pitfall 1` in `app/api/launchpad/[projectId]/campaigns/route.ts`.
- File header comments often describe the test or plan that drove the module. Keep these current; they are read as specification.
- Comments must match the code they describe. Update the comment in the same edit that changes a value or behavior.

**JSDoc/TSDoc:** Not systematically used. Exported functions with a non-obvious contract (ordering, idempotency, failure modes, concurrency) get a block comment directly above them. Simple helpers do not.

**Console output:**
- Application code does not use `console.log`. Source contains 2 `console.log` calls, both in scripts or serialization helpers. Do not add more.
- `console.error` appears in 2 places, prefixed with the module name: `console.error('marketing-document: failed to load artifact/manifest:', err)`. Follow that prefix form if logging is required.

## Error Handling

**Route handlers (`app/api/**/route.ts`):**
- Return JSON on every path. `NextResponse.json({ error: '...' }, { status: NNN })`. Never return an HTML error page from an API route.
- Auth check first, then body validation, then ownership-scoped queries. Canonical opening of a POST handler, from `app/api/launchpad/[projectId]/campaigns/route.ts`:
  ```typescript
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  ```
- Next.js 15 params are a Promise. Await them: `const { projectId } = await params`.
- Ownership is enforced in the query as well as by RLS: `.eq('user_id', user.id)`, then `.maybeSingle()`, then `if (!project) return ... 404`.
- Status codes in use: 400 (invalid input), 401 (no session), 403 (authenticated but not allowed), 404 (missing or not visible), 409 (conflict), 429 (rate limited), 500 (unexpected), 502 and 503 (upstream or capacity).
- Error bodies are `{ error: string }`. Messages for user-caused errors are specific and state the rule: `'At least one valid platform is required'`.
- For unexpected server failures, return the generic message `'Request could not be completed.'` (370 uses in routes, and in `lib/workspaces/room-data.ts` and `lib/green-room/repost.ts`). Log or capture the real error to Sentry instead of echoing it.

**Library functions (`lib/**`):**
- Expected failures return a discriminated result rather than throwing:
  ```typescript
  // lib/green-room/repost.ts
  Promise<{ ok: true; repost: GreenRoomRepost } | { ok: false; error: string; status: number }>
  ```
  85 `lib/` files use `ok: true | false` results. Use this shape for new library entry points that API routes will map to HTTP status codes.
- Programmer errors and unrecoverable states throw `new Error('...')` with a message that states the rule and the limit: `throw new Error('Audio file must be under 250MB')`.
- Check the `error` field of every Supabase response before using `data`: `if (error) throw new Error(...)` or return the failure result.
- Destructure responses: `const { data, error } = await supabase.from('...')...`.

**Catch blocks:**
- No empty catch blocks in source.
- Use optional catch binding when the error is not needed: `try { ... } catch { return null }`.
- Sentry capture is tagged with the feature and operation so alerts can be filtered:
  ```typescript
  Sentry.captureException(error, { tags: { feature: 'song-passport', operation: 'artifact-generation' } })
  ```
  Six call sites use this pattern. Add the same `feature` and `operation` tags for new captures.

**Client-side:** Error boundaries are Next.js `error.tsx` files per route group (`app/(artist)/error.tsx`, `app/(admin)/error.tsx`) and a root `app/global-error.tsx`. Use them instead of ad-hoc try/catch around rendering.

## Auth, Authorization, and Data Access

- `createApiClient()` and `createServerClient()` (in `lib/supabase/server.ts`) use the caller's cookie session and respect RLS.
- `createServiceClient()` uses the service role and bypasses RLS. Call it only after the caller has been authorized in code, and filter every query by the authorized identifier.
- Staff routes call `requireStaff()` from `lib/admin/gate.ts`. Its comment states that it is the single authority for staff routes. Do not write a separate role check.
- Rate limiting: `checkRateLimit()` in `lib/security/rate-limit.ts`, with limits exported as constants (`RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_ATTEMPTS`). Used at 58 import sites.
- Paid AI calls must claim budget first: `claimAiUsage()`, then `aiProviderSignal()`, then `finishAiUsage()` from `lib/ai/admission.ts`. A test in `__tests__/ai-route-admission.test.ts` enforces this by reading the route source.

## Input Validation

- API request bodies are typed as `unknown` or a loose shape, then narrowed. Do not trust `request.json()` results directly.
- Narrow with type guards and predicates:
  ```typescript
  const rawPlatforms = Array.isArray(body.platforms) ? body.platforms : []
  const platforms = rawPlatforms.filter((p): p is Platform =>
    PLATFORM_VALUES.includes(p as Platform)
  )
  ```
- Normalize strings: `String(o.name ?? '').trim()`. Coerce numbers with `Number.isFinite`.
- Zod is the schema library for structured input (140 import sites of `zod`). Use it for multi-field request bodies and for model output shapes.
- Updates use an explicit allowlist: `EDITABLE_FIELDS` in `app/api/profile/route.ts`. Never assign the request body directly into an update payload.
- Readers for JSON-stored structures follow the `readX()` pattern in `lib/metadata/schema.ts` (`readComposers()`, `readLyrics()`, `readPerformers()`). Each returns a typed value or `null`, and tolerates malformed input.

## React and Next.js Conventions

- Server components by default. Add `'use client'` only when the component needs state, effects, or browser APIs. 13 of 160 `app/**/page.tsx` and `layout.tsx` files are client components.
- Pages and layouts use default exports, as Next.js requires (all 155 page and layout files). Components in `components/` use named exports (`export function X`, 286 of 334 component files).
- Props are destructured in the signature with an inline or adjacent `type` declaration.
- Client components validate input shape before calling an API route.
- Server components fetch data with the server Supabase client and pass plain props down. Do not add global state libraries; the app uses local hooks and server-fetched props.
- Drag-and-drop uses `@dnd-kit/*` (8 files). Markdown rendering uses `react-markdown` with `remark-gfm` (2 files). `dompurify` is listed in `package.json` but has no call sites in source, so do not assume HTML is sanitized before rendering. Sanitize explicitly if you render untrusted HTML.

## Module Design

- One domain per `lib/<domain>/` directory: `lib/vault/`, `lib/playbook/`, `lib/workspaces/`, `lib/social/`, `lib/split-sheets/`, and 50-plus others (59 distinct directories under `lib/`).
- `lib/` modules are leaves. They do not import from `app/` or `components/`. Pages and API routes depend on `lib/`, not the reverse.
- Prefer pure functions in `lib/` for calculations and validation: `lib/metadata/identifiers.ts` contains short pure validators and formatters. Keep side effects (Supabase, network) in functions that take a client as an argument, as `mustBlockActionBetween(service, a, b)` does in `lib/trust-safety/block-check.ts`. This also makes them testable with a stub client.
- Fixtures for tests can live beside production code: `lib/invites/invite-fixtures.ts`, `lib/vault/coverage-fixtures.ts`.

## Function Design

- Small, focused functions, roughly 50 to 100 lines for utilities.
- Large UI state machines are allowed (300 to 900 lines in components such as `components/vault/MetadataStudio.tsx`), organized with section headers.
- Multiple related arguments are passed as an options object, especially for React components and builders.
- Optional parameters use `?`: `email?: string`.
- Nullable return types are explicit in the signature: `MasterAudio | null`.
- Early returns to reduce nesting.

## Dates

Dates in config and data files are ISO `YYYY-MM-DD` strings, validated with a regex before use (see `expires` in `scripts/audit-gate.ts`).

## Known Inconsistencies

Avoid these when writing new code, and do not treat them as precedent:
- camelCase `lib/` filenames (21 files) next to kebab-case (356 files).
- A small number of `as any` casts (10) and `as never` casts in tests.
- Trailing commas and line length vary between older and newer files.

---

*Convention analysis: 2026-10-18*
