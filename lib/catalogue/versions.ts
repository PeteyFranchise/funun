// ─── Work version logic — derived vN and version presentation ────────
// Pure module in the style of lib/split-sheets/approval.ts: no Supabase
// client, no framework import, no I/O. Operates over a structural row
// shape declared locally (plan 04's types/catalogue.ts will be the DB
// row type, structurally compatible with this one).
//
// No numeral column exists in `work_versions` and none may be added
// (37-01's prohibition, RESEARCH Pitfall 5) — a stored numeral would need
// a renumbering write cascade on every delete, the same failure mode the
// RENUMBERING RULE forbids for lyric blocks. vN is always derived at read
// time from creation order.

// ─── Types ──────────────────────────────────────────────────────────

export type VersionSource = 'hum' | 'upload'

/**
 * A version-shaped input record. Declared locally so this module has no
 * wave-1 sibling dependency. Carries only the facts needed to order and
 * present a version — id, source, an optional artist label, created_at,
 * and the audio facts the UI needs (path, ext, duration).
 */
export type WorkVersionRecord = {
  id: string
  source: VersionSource
  label: string | null
  created_at: string
  audio_path: string
  audio_ext: string
  duration_seconds: number | null
}

// ─── Ordering ───────────────────────────────────────────────────────

/**
 * Orders by `created_at` ascending, with `id` as a deterministic
 * tiebreak. Two versions created within the same second (or the same
 * millisecond, under concurrent writes) still sort the same way on every
 * render — the numbering must never depend on array-arrival order or a
 * non-deterministic timestamp tie.
 */
function compareVersions(a: WorkVersionRecord, b: WorkVersionRecord): number {
  const aTime = new Date(a.created_at).getTime()
  const bTime = new Date(b.created_at).getTime()
  if (aTime !== bTime) return aTime - bTime
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

// ─── Numeral derivation ─────────────────────────────────────────────

export type VersionWithNumeral<T extends WorkVersionRecord = WorkVersionRecord> = T & {
  /** One-based ordinal by creation order — never stored, always recomputed. */
  numeral: number
  /** The "vN" display string. */
  display: string
}

/**
 * Returns every version, ordered by creation order, alongside its
 * derived numeral and "vN" display string. Order-insensitive to the
 * input array — passing versions in any order produces the same result,
 * because the sort is by `created_at`/`id`, never by array position.
 * Deleting a version and re-deriving renumbers everything after it
 * (v3 becomes v2) rather than leaving a hole, because the numeral was
 * never stored to begin with.
 */
export function deriveVersionNumerals<T extends WorkVersionRecord>(
  versions: T[]
): VersionWithNumeral<T>[] {
  const ordered = [...versions].sort(compareVersions)
  return ordered.map((version, index) => {
    const numeral = index + 1
    return { ...version, numeral, display: `v${numeral}` }
  })
}

/** Returns the newest version by the same ordering, or null for an empty array. */
export function latestVersion<T extends WorkVersionRecord>(
  versions: T[]
): VersionWithNumeral<T> | null {
  if (versions.length === 0) return null
  const derived = deriveVersionNumerals(versions)
  return derived[derived.length - 1]
}

// ─── Presentation ───────────────────────────────────────────────────

const SOURCE_DESCRIPTIONS: Record<VersionSource, string> = {
  hum: 'Hummed take',
  upload: 'Uploaded file',
}

export type VersionPresentation = {
  numeral: number
  display: string
  /** The artist's own label when present; otherwise a source-derived description. */
  description: string
}

/**
 * The presentation helper plan 10's DiaryFeed and plan 12's versions
 * column both use: given an already-numbered version (from
 * `deriveVersionNumerals`), returns its numeral alongside either the
 * artist's own free-text label or — when there is none — a
 * source-derived description that distinguishes a hum-in-place capture
 * from an uploaded file. The numeral and the description are always
 * returned together, never one instead of the other. Kept short and
 * neutral on purpose: the sketch's decorative chips (evidence, master
 * candidate, demo only) are the diary's job, not this module's.
 */
export function presentVersion<T extends WorkVersionRecord>(
  version: VersionWithNumeral<T>
): VersionPresentation {
  const trimmedLabel = version.label?.trim()
  const description = trimmedLabel ? trimmedLabel : SOURCE_DESCRIPTIONS[version.source]

  return {
    numeral: version.numeral,
    display: version.display,
    description,
  }
}
