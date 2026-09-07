import { z } from 'zod'

// ─── Strict ISO date and datetime validation (R-14 / WSR-22, finding F19) ──
// Pure, zero-I/O module — no Supabase client, no side effects, nothing here
// reads a request or a row. It exists because the workspace surface stores
// caller-supplied date strings in `effective_from`, `terminates_on`,
// `expires_at` and `release_date` behind bare `z.string().optional()`
// fields, and then compares those stored strings with a date constructor at
// read time.
//
// That combination is the defect. A malformed value parses to NaN; every
// numeric comparison against NaN evaluates false; so a corrupt bound reads
// as "no constraint" rather than as an error — an authority window that
// never starts late and never expires. `lib/workspaces/evidence.ts` now
// treats a NaN parse as not-live at read time (plan 04), which fails closed
// on data already stored; this module is the other half, refusing the value
// at the API boundary so it is never stored in the first place.
//
// THE CALENDAR CHECK MATTERS AS MUCH AS THE FORMAT CHECK. `2026-02-30` and
// `2026-04-31` both satisfy a `YYYY-MM-DD` regex, and a date constructor
// does not reject them — it silently rolls them forward into the next
// month. A shape-only validator would therefore accept an impossible day
// and store a bound the user never meant. Every schema below round-trips
// through a date constructor and compares the normalised result back to the
// input, so a rollover is caught as a mismatch.
//
// This module is the ONE place ISO date/datetime validation lives for the
// workspace surface. A later plan wires the remaining call sites
// (`app/api/workspaces/[workspaceId]/roster/route.ts`,
// `app/api/workspaces/[workspaceId]/projects/route.ts`) to these exports;
// nothing should re-derive a date regex of its own.

// ─── Shapes ──────────────────────────────────────────────────────────────
// `effective_from` / `terminates_on` are DATE columns (migration 183) and
// `expires_at` is a TIMESTAMPTZ, so the two schemas below are deliberately
// different rather than one permissive schema serving both.
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// An explicit `Z` or `±HH:MM` designator is REQUIRED, not optional. An
// offset-less datetime is interpreted as the host's local time by both a
// JavaScript date constructor and a TIMESTAMPTZ column, so accepting one
// would silently shift an authority window by whatever the deployment
// region's offset happens to be — the same class of "reads as something
// the user never declared" failure the NaN case above describes.
const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/

const ISO_DATE_MESSAGE = 'Enter a real calendar date in YYYY-MM-DD form.'
const ISO_DATE_TIME_MESSAGE =
  'Enter a full ISO 8601 datetime with an explicit time zone, for example 2026-09-06T12:00:00.000Z.'

/**
 * True only for a `YYYY-MM-DD` string naming a day that actually exists.
 * The round-trip comparison is what rejects `2026-02-30`: the constructor
 * normalises it to `2026-03-02`, whose formatted form no longer equals the
 * input. Never throws.
 */
function isRealCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false

  const parsed = new Date(`${value}T00:00:00.000Z`)
  const time = parsed.getTime()
  if (Number.isNaN(time)) return false

  return parsed.toISOString().slice(0, 10) === value
}

/**
 * True only for a full ISO 8601 datetime with an explicit time zone whose
 * date part names a real day and whose clock part is in range. An
 * out-of-range clock component (`T25:00:00Z`) produces an unparseable date,
 * which is caught by the NaN check rather than normalised. Never throws.
 */
function isRealIsoDateTime(value: string): boolean {
  if (!ISO_DATE_TIME_PATTERN.test(value)) return false
  if (!isRealCalendarDate(value.slice(0, 10))) return false

  return !Number.isNaN(new Date(value).getTime())
}

// ─── Exported schemas ────────────────────────────────────────────────────
/** A DATE column's value: `YYYY-MM-DD`, calendar-valid, no time part. */
export const isoDateSchema = z.string().refine(isRealCalendarDate, { message: ISO_DATE_MESSAGE })

/** A TIMESTAMPTZ column's value: a full ISO 8601 datetime with an explicit
 * time zone. A bare `YYYY-MM-DD` fails the shape check and is refused. */
export const isoDateTimeSchema = z
  .string()
  .refine(isRealIsoDateTime, { message: ISO_DATE_TIME_MESSAGE })

// The wrappers routes actually use. Exported so no call site has to compose
// `.optional().nullable()` by hand and get the order wrong — a field that
// accepts `undefined` but not `null` (or the reverse) is the kind of
// mismatch that pushes a caller back toward a bare `z.string()`.
export const optionalIsoDate = isoDateSchema.nullish()
export const optionalIsoDateTime = isoDateTimeSchema.nullish()

// ─── Ordering ────────────────────────────────────────────────────────────
export type DateOrderingResult = { ok: true } | { ok: false; error: string }

/**
 * Mirrors, at the API layer, the CHECK migration 183 already enforces on
 * `workspace_roster_relationships` (`terminates_on > effective_from`), so a
 * caller gets a readable message naming the two fields instead of a raw
 * constraint-violation string.
 *
 * Returns ok when either side is absent — an open-ended window is legal.
 * Refuses when the end is at or before the start. Refuses when either value
 * is unparseable, rather than treating NaN as absent: silently ignoring a
 * corrupt bound is precisely the R-14 failure this module exists to close.
 * Pure and never throws.
 */
export function assertDateOrdering(args: {
  start: string | null | undefined
  end: string | null | undefined
  startLabel: string
  endLabel: string
}): DateOrderingResult {
  const { start, end, startLabel, endLabel } = args

  if (start === null || start === undefined) return { ok: true }
  if (end === null || end === undefined) return { ok: true }

  const startMs = new Date(start).getTime()
  if (Number.isNaN(startMs)) {
    return { ok: false, error: `${startLabel} is not a date Funūn can read.` }
  }

  const endMs = new Date(end).getTime()
  if (Number.isNaN(endMs)) {
    return { ok: false, error: `${endLabel} is not a date Funūn can read.` }
  }

  if (endMs <= startMs) {
    return { ok: false, error: `${endLabel} must be after ${startLabel}.` }
  }

  return { ok: true }
}
