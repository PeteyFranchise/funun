# Testing Patterns

**Analysis Date:** 2026-06-26

## Test Framework

**Status:** Not detected

**Observations:**
- No Jest, Vitest, or other test runner found in project
- No test files (`.test.ts`, `.spec.ts`, etc.) exist in the codebase
- `package.json` does not include testing dependencies
- No `jest.config.*` or `vitest.config.*` files

**Development Scripts:**
```bash
npm run dev              # Start Next.js dev server
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint via Next.js
npm run db:types        # Generate Supabase types
npm run db:push         # Push schema to local Supabase
```

## Current Test Coverage

**Unit Testing:** Not implemented

**Integration Testing:** Not implemented

**E2E Testing:** Not implemented

## Validation Approach (Current)

In the absence of automated tests, the codebase uses **validation functions** as the primary integrity checks:

**Server-side Input Validation:**
- Explicit allowlist pattern: `app/api/profile/route.ts` defines `EDITABLE_FIELDS` as const
- Field-by-field type coercion and range checking before database updates
- Example:
```typescript
if (key === 'monthly_listeners') {
  if (value === null || value === '') {
    update[key] = null
  } else {
    const n = Number(value)
    if (Number.isFinite(n) && n >= 0) update[key] = Math.round(n)
  }
  continue
}
```

**Format Validators (Pure Functions):**
- `lib/metadata/validate.ts` — ISRC, UPC, ISWC format validators
  - `isValidIsrc(raw)` — Validates ISRC format: CC-XXX-YY-NNNNN
  - `isValidUpc(raw)` — Validates UPC-A (12) or EAN-13 (13)
  - `isValidIswc(raw)` — Validates ISWC with check digit
  - `canEmbed(url)` — Checks if audio format supports embedded tags
- `lib/metadata/identifiers.ts` — ISRC/ISWC format generation and normalization
  - `formatIsrc(country, registrant, year, designation)` — Builds display ISRC
  - `formatIswc(body)` — Builds display ISWC with computed check digit
  - `iswcCheckDigit(body)` — Computes ISO 15707 check digit
  - Normalization: `normalizeCountry()`, `normalizeRegistrant()`, `normalizeIswc()`

**Release-Level Validation Report:**
- `validateRelease(release)` — Comprehensive pre-flight check
  - Returns `ValidationReport` with array of `Check` objects
  - Each check has `level` ('error', 'warn', 'ok'), field name, and message
  - Aggregates errors and warnings into `{ checks, errors, warnings, ready: boolean }`
  - Used in `MetadataStudio.tsx` for live validation UI

**Data Normalization (Defensive):**
- Loose-to-strict pattern for JSONB fields in database: `lib/metadata/schema.ts`
  - `readComposers()` — Reads untyped JSONB, returns validated Composer[]
  - `sanitizeComposers()` — Accepts untrusted input, returns clean Composer[]
  - `readLyrics()`, `sanitizeLyrics()` — Lyrics JSONB handling with max length check
  - `readPerformers()`, `sanitizePerformers()` — Performer array validation
  - Pattern: filter falsy values, coerce types, trim strings
  ```typescript
  export function sanitizeComposers(input: unknown): Composer[] {
    if (!Array.isArray(input)) return []
    const out: Composer[] = []
    for (const r of input) {
      const o = (r ?? {}) as Record<string, unknown>
      const name = String(o.name ?? '').trim()
      if (!name) continue  // skip empty names
      const role = COMPOSER_ROLE_VALUES.includes(o.role as ComposerRole)
        ? (o.role as ComposerRole)
        : 'composer_lyricist'  // default safe value
      // ... normalize remaining fields
      out.push({ name, role, pro, ipi: ipi || undefined, ... })
    }
    return out
  }
  ```

## Testing Recommendations

### Phase 1: Unit Tests (Validators & Pure Functions)

**Priority:** High — These are the core integrity checks.

**Files to test:**
- `lib/metadata/validate.ts` — Format validators (ISRC, UPC, ISWC, audio embedding)
- `lib/metadata/identifiers.ts` — ISRC/ISWC generation, normalization, check digits
- `lib/metadata/schema.ts` — Data normalization (`sanitizeComposers`, `readLyrics`, etc.)

**Test framework:** Vitest (lightweight, ESM-native, plays well with Next.js)

**Example test structure:**
```typescript
import { describe, it, expect } from 'vitest'
import { isValidIsrc, isValidUpc, isValidIswc } from '@/lib/metadata/validate'

describe('ISRC validation', () => {
  it('accepts valid ISRC format', () => {
    expect(isValidIsrc('US-S1Z-26-00014')).toBe(true)
    expect(isValidIsrc('USC0326000014')).toBe(true)  // spaces stripped
  })
  
  it('rejects invalid country code', () => {
    expect(isValidIsrc('11-S1Z-26-00014')).toBe(false)
  })
  
  it('handles null/undefined safely', () => {
    expect(isValidIsrc(null)).toBe(false)
    expect(isValidIsrc(undefined)).toBe(false)
  })
})
```

### Phase 2: Integration Tests (API Routes + Database)

**Priority:** High — Auth, profile updates, release CRUD.

**Test framework:** Vitest + MSW (Mock Service Worker) or Supabase testing library

**Focus areas:**
- `app/api/profile/route.ts` — Field allowlist, coercion, validation
- `app/api/releases/route.ts` — Release creation, metadata update
- Auth middleware (`middleware.ts`) — Protected routes, redirects

**Example setup:**
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
```

### Phase 3: E2E Tests (Critical User Flows)

**Priority:** Medium — Once unit/integration tests are solid.

**Test framework:** Playwright or Cypress

**Critical flows:**
- Metadata Studio: upload audio → enter release info → validate → export
- Profile setup: auth → sign in → edit profile → save
- Release submission: create project → add tracks → submit to opportunity

## Setup Instructions

**Install testing dependencies:**
```bash
npm install --save-dev vitest @vitest/ui jsdom
```

**Create test directory structure:**
```
lib/metadata/
  __tests__/
    validate.test.ts
    identifiers.test.ts
    schema.test.ts
```

**Run tests:**
```bash
vitest                          # Watch mode
vitest --run                    # Single run
vitest --coverage               # Coverage report
```

**Example package.json scripts to add:**
```json
{
  "test": "vitest",
  "test:ui": "vitest --ui",
  "test:coverage": "vitest --coverage"
}
```

## Testing Gaps

**Currently Untested:**
- Metadata validation report generation (live in UI, no unit tests)
- Opportunity matching logic (`lib/matching/antenna.ts`, `lib/matching/run.ts`)
- Email notifications and webhook integrations
- Image resizing and tag embedding (`lib/metadata/export.ts`)
- Stripe payment flow (`lib/stripe/`)
- Contract e-signature workflow (`lib/contracts/`, `lib/esign/`)
- File uploads to Supabase storage

**High-Risk Areas (Should Test First):**
1. Composer split validation and normalization — impacts royalty accounting
2. ISRC/ISWC format generation — required for DSP delivery
3. Metadata export for DDEX/RDR compliance — regulatory requirement
4. Release readiness scoring — blocks submission workflow

## Validation Checklist for Code Review

When adding new code:
- [ ] Input validation: allowlist fields, type-check, coerce safely
- [ ] Null/undefined handling: use `??` and `?.` safely
- [ ] Error messages: describe problem and actionable fix
- [ ] Format validators: test with valid + invalid + edge cases (whitespace, case)
- [ ] Type safety: avoid `any`, use `unknown` and narrow with type guards
- [ ] JSONB fields: use read + sanitize pattern, don't trust database content

---

*Testing analysis: 2026-06-26*
