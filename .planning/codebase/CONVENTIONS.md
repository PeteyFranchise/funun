# Coding Conventions

**Analysis Date:** 2026-06-26

## Naming Patterns

**Files:**
- Descriptive, lowercase with hyphens for multi-word: `metadata-studio.tsx`, `identifiers.ts`, `activity-emit.ts`
- API routes match endpoints: `app/api/profile/route.ts`, `app/api/releases/route.ts`
- Utility/helper modules grouped by domain: `lib/metadata/schema.ts`, `lib/storage/index.ts`, `lib/supabase/client.ts`

**Functions:**
- camelCase for all functions: `uploadTrackAudio()`, `validateRelease()`, `formatIsrc()`, `isValidUpc()`
- Predicate functions prefixed with `is`, `can`, or `has`: `isValidIsrc()`, `canEmbed()`, `hasAccess()`
- Helper/transformation functions descriptive: `artistCredit()`, `composerCredit()`, `normalizeCountry()`
- Single-purpose utility functions kept short and pure: see `lib/metadata/identifiers.ts` for example of 30-80 line validators and formatters

**Variables & Constants:**
- camelCase for variables: `release`, `embedState`, `tracks`, `savingRelease`
- SCREAMING_SNAKE_CASE for constants: `MAX_AUDIO_SIZE`, `ALLOWED_AUDIO_TYPES`, `AUDIO_BUCKET`, `LYRICS_MAX`
- Record/enum labels suffix with `_LABELS`: `PRO_LABELS`, `COMPOSER_ROLE_LABELS`, `PERFORMER_ROLE_LABELS`, `VAULT_PROJECT_TYPE_LABELS`
- Enum/option values list suffix with `_VALUES`: `PRO_VALUES`, `COMPOSER_ROLE_VALUES`, `PERFORMER_ROLES`, `ORIGINAL_PURPOSES`

**Types:**
- PascalCase for all types: `Composer`, `TrackMetadata`, `ValidationReport`, `VaultProject`, `ReadinessItem`
- Explicit type suffixes for complex structures: `type VaultProjectType` (discriminated union), `type Check` (validation report item)
- Types exported from schema modules alongside label/value pairs: `lib/metadata/schema.ts` exports `PRO` type + `PRO_LABELS` + `PRO_VALUES`

**React Components:**
- PascalCase component names: `MetadataStudio`, `TrackList`, `ProfileView`, `MetadataStudio`
- Client components marked with `'use client'` at top of file
- Component function parameters destructured with prop types inlined

## Code Style

**Formatting:**
- Prettier (used via `next lint`)
- 2-space indentation
- No semicolons at end of statements

**Linting:**
- ESLint with Next.js config: `eslint-config-next` (installed, no custom `.eslintrc`)
- TypeScript strict mode enabled: `tsconfig.json` has `"strict": true`
- Resolved modules via path alias `@/*` pointing to root

**TypeScript:**
- Target: ES2017
- Module resolution: bundler (Next.js default)
- `skipLibCheck: true` to avoid type-checking dependencies
- Strict null checks: null/undefined must be handled explicitly
- `noEmit: true` (TypeScript for type-checking only, build via Next.js)

## Import Organization

**Order:**
1. React/Next.js framework imports
2. Internal absolute imports via `@/` alias
3. Type-only imports marked with `import type { ... }`

**Examples:**
```typescript
// Correct order (from components/vault/MetadataStudio.tsx)
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { COMPOSER_ROLE_LABELS, ... } from '@/lib/metadata/schema'
import type { ValidationReport } from '@/lib/metadata/validate'

// Type-only imports separated (from lib/matching/run.ts)
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Opportunity, VaultProjectType } from '@/types'
```

**Path Aliases:**
- `@/*` maps to root (see `tsconfig.json` paths)
- All absolute imports use `@/` prefix: `@/lib`, `@/components`, `@/types`
- Never use relative imports like `../` in shared code

## Error Handling

**Patterns:**
- Throw descriptive Error instances with user-friendly messages: `throw new Error('Audio must be WAV, FLAC, MP3, or AAC format')`
- Check error objects from SDK responses before throwing: `if (error) throw new Error(...)`
- Best-effort error recovery (functions marked as "never throws") wrapped in try/catch at call site: see `lib/social/activity-emit.ts`
- No silent failures — functions either complete successfully or throw

**Error Message Guidelines:**
- State the problem clearly: "Audio must be WAV, FLAC, MP3, or AAC format" (not "invalid audio")
- Include actionable context: "Audio file must be under 250MB" (shows the limit)
- Server-side: include operation context: "Upload failed: {error.message}"

**Supabase Error Handling:**
- Destructure `{ error, data }` from responses: `const { error } = await supabase.auth.getSession()`
- Check error before using data: `if (error) throw new Error(...)`
- Type-cast results safely when needed: `((existing ?? []) as { id: string; project_id: string }[])`

## Logging

**Framework:** console (standard Node.js/browser)

**Patterns:**
- Minimal logging in libraries — errors preferred
- For debuggable operations, use Supabase admin functions within guarded contexts
- No console.log statements in committed code (clean output expected)
- Errors logged contextually in middleware/API routes (Next.js handles output)

**Example (middleware.ts):**
- No explicit logging; session checks return redirects
- Errors from auth handlers bubble to Next.js error boundary

## Comments

**When to Comment:**
- Domain-specific logic explaining "why" the code exists, not "what" it does
- Complex regex patterns with intent: ISRC format explanation above `isValidIsrc()`
- Section headers with dashes dividing major subsections within files

**JSDoc/TSDoc:**
- Used for public functions and exported types
- Describes parameters, return values, and exceptional behavior

**Example (from lib/metadata/schema.ts):**
```typescript
/** "Artist feat. X, Y" — the display/track artist string for tags. */
export function artistCredit(primaryArtist: string | null | undefined, ...): string

/** Validate + normalize composer input coming from the client. */
export function sanitizeComposers(input: unknown): Composer[]

/** Read the master-audio rendition out of a track's metadata JSONB (null if none). */
export function readMasterAudio(metadata: Record<string, unknown> | null | undefined): MasterAudio | null
```

**Section Headers:**
- Format: `// ─── Section Name ─────────────────────────────────────────────────`
- Used to group related logic in longer files: see `lib/metadata/schema.ts` or `components/vault/MetadataStudio.tsx`

## Function Design

**Size:** 
- Small, focused functions preferred; ~50–100 lines max for most utilities
- Larger components (300–900 lines) used for complex UI state machines but kept organized with section headers
- Example: `MetadataStudio` (906 lines) organized with comments marking track list, release state, and validation sections

**Parameters:**
- Destructured objects for functions with multiple related args (especially React components)
- Explicit `?` for optional parameters: `email?: string`, `ipi?: string`
- Null coalescing and optional chaining used defensively: `(primaryArtist ?? '').trim()`

**Return Values:**
- Pure functions preferred in lib/ (no side effects)
- Async functions return Result objects: `{ matched: number }`, `{ url: string; path: string; size: number }`
- Nullable returns marked in signature: `MasterAudio | null`, `ValidationReport`
- Early returns used to reduce nesting

**Example (lib/metadata/identifiers.ts):**
```typescript
/** Build a display-formatted ISRC: "US-S1Z-26-00014". */
export function formatIsrc(
  country: string,
  registrant: string,
  year: string,
  designation: number
): string {
  const cc = normalizeCountry(country)     // normalize inputs
  const reg = normalizeRegistrant(registrant)
  const yy = String(year).padStart(2, '0').slice(-2)
  const nnnnn = String(designation).padStart(5, '0')
  return `${cc}-${reg}-${yy}-${nnnnn}`     // single return
}
```

## Module Design

**Exports:**
- Prefer named exports: `export function validateRelease(...)`
- Type exports use `export type`: `export type ValidationReport = { ... }`
- Organize exports logically: types first, then helpers, then main functions

**Barrel Files:**
- Not heavily used; imports are direct to specific modules
- `index.ts` files in lib/ act as re-export facades only when needed: `lib/storage/index.ts`, `lib/supabase/index.ts`

**API Routes:**
- Export async handler: `export async function POST(req: NextRequest) { ... }`
- Use `NextResponse` for all responses: `NextResponse.json(data)`, `NextResponse.redirect(url)`
- Sanitize input before use (see `app/api/profile/route.ts` — explicit allowlist of editable fields)

**Example (lib/metadata/schema.ts organization):**
```typescript
// 1. Type definitions (export type)
export type PRO = 'ASCAP' | 'BMI' | ...
export type Composer = { name: string; role: ComposerRole; ... }

// 2. Label/value pairs (export const)
export const PRO_LABELS: Record<PRO, string> = { ... }
export const PRO_VALUES = Object.keys(PRO_LABELS) as PRO[]

// 3. Helper functions (export function)
export function artistCredit(...): string { ... }

// 4. Validators/sanitizers (export function)
export function readComposers(...): Composer[] { ... }
export function sanitizeComposers(...): Composer[] { ... }
```

## Data Validation

**Input Validation (Client):**
- Client components validate shape and type before sending to API
- Reject invalid input early: `if (!Array.isArray(input)) return []`
- Trim and normalize strings: `String(o.name ?? '').trim()`

**Input Sanitization (Server):**
- Explicit allowlist of fields to update: `app/api/profile/route.ts` defines `EDITABLE_FIELDS`
- Type-cast parsed values after validation: `const n = Number(value); if (n >= 1 && n <= 4) update[key] = n`
- No direct assignment from request body

**Metadata JSONB Pattern (Supabase):**
- Read loosely with type guards: `typeof raw.text === 'string'`
- Normalize/coerce values: `Number.isFinite(split) ? split : 0`
- Return typed result or null: `TrackLyrics | null`
- See `lib/metadata/schema.ts` for pattern examples: `readComposers()`, `readLyrics()`, `readPerformers()`, `readRecordingInfo()`

---

*Convention analysis: 2026-06-26*
