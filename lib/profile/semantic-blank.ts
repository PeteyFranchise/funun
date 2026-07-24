// ─── Semantic-blank rescue twin (R1) ──────────────────────────────────
// Pure-TypeScript parity twin for migration 071's semantic-blank rescue.
// Jest cannot execute PL/pgSQL, so this module is the machine-checked
// contract migration 071's SQL mirrors exactly (19-RESEARCH.md Pattern 1
// + Pitfall 6): what "blank" means (NULL, trimmed-empty text, or
// empty-JSON `{}`), which value wins when rescuing a stranded value from
// the (now-dropped, migration 073) duplicate rights table into the
// canonical artist_profiles column (canonical-wins — a meaningful
// canonical value always beats a stranded one), and the exact source ->
// target column mapping. No I/O, no
// Supabase import — this module's only consumers are its own test and,
// by mirroring, migration 071.
//
// Do NOT extend this into a generic isEmpty() utility (19-RESEARCH.md
// "Don't Hand-Roll") — the SPEC's blank definition is specific to text
// vs. JSONB and must not drift toward a broader falsy check.

/** True for null/undefined and for a value whose trimmed string is empty. */
export function isSemanticBlankText(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true
  return value.trim() === ''
}

/**
 * True for null/undefined and for a value deep-equal to `{}`. Matches
 * Pitfall 6: artist_profiles.mailing_address defaults to '{}'::jsonb, not
 * NULL — an IS NULL-only check would miss a freshly-created, still-blank
 * canonical row.
 */
export function isSemanticBlankJson(
  value: Record<string, unknown> | null | undefined
): boolean {
  if (value === null || value === undefined) return true
  return Object.keys(value).length === 0
}

export type RescueKind = 'text' | 'json'

/**
 * Canonical-wins: returns the stranded value only when the canonical
 * value is semantic-blank by the predicate matching `kind`; otherwise
 * the canonical value always wins, even if it differs from stranded.
 */
export function rescueValue<T>(canonical: T, stranded: T, kind: RescueKind): T {
  const isBlank =
    kind === 'text'
      ? isSemanticBlankText(canonical as unknown as string | null | undefined)
      : isSemanticBlankJson(canonical as unknown as Record<string, unknown> | null | undefined)
  return isBlank ? stranded : canonical
}

export type RescueFieldMapping = {
  /** source column name on the (now-dropped) duplicate rights table */
  source: string
  /** artist_profiles target column name */
  target: string
  kind: RescueKind
}

/**
 * The source -> target column mapping migration 071's rescue UPDATE
 * implements. `phone` renames to `contact_phone`; `display_name` maps to
 * the semantically-equivalent `artist_name` (Pitfall 2 — both are
 * TEXT, both mean "what shows on the profile"); everything else is a
 * same-name copy.
 */
export const RESCUE_FIELD_MAP: readonly RescueFieldMapping[] = [
  { source: 'pro', target: 'pro', kind: 'text' },
  { source: 'ipi', target: 'ipi', kind: 'text' },
  { source: 'publisher', target: 'publisher', kind: 'text' },
  { source: 'phone', target: 'contact_phone', kind: 'text' },
  { source: 'mailing_address', target: 'mailing_address', kind: 'json' },
  { source: 'display_name', target: 'artist_name', kind: 'text' },
  { source: 'bio', target: 'bio', kind: 'text' },
] as const
