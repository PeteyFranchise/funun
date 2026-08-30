// ─── work_diary_events → the three-part entry the feed renders ───────
// Pure module. Maps a stored diary row to sketch 001's entry shape: a
// bold headline (what happened), a right-aligned date, and one dim
// consequence line. No I/O — `context` (display names, derived version
// numerals) is resolved and passed in by plan 12's data loader, never
// fetched here.
//
// RESEARCH PITFALL 1, READ THIS BEFORE TOUCHING THIS FILE: this module
// deliberately does NOT import from lib/social/activity-emit.ts and does
// NOT read activity_events. That feed is PUBLIC (`FOR SELECT USING
// (true)`), its ActivityKind enum is closed at four values, and its
// emitter is explicitly best-effort — allowed to swallow errors. None of
// that matches work_diary_events: private (member-scoped RLS, 37-01),
// nine typed kinds, and never-skipped (trigger-sourced, not
// discipline-sourced). What IS reused is the RENDER STRUCTURE of
// components/profile/ActivityFeed.tsx (icon badge, body, timestamp) — and
// that reuse happens in plan 10's DiaryFeed component, not here.
//
// CAT-Q1: eight of the nine kinds arrive from database triggers
// (migration 138) and therefore cannot be skipped by a route that
// forgets to call them. The ninth, `note`, is the deliberate exception —
// a free-standing annotation with no underlying row to trigger from, so a
// service-role route inserts it directly. `isTriggerSourced()` encodes
// this contract. Adding a second app-authored kind would weaken the
// guarantee and must not be done casually.

import type {
  DiaryEventKind,
  DiaryEventPayloadMap,
  LyricBlockType,
  WorkVersionSource,
} from '@/types/catalogue'
import { WORK_TIER_LABELS, type WorkTier } from '@/lib/catalogue/membership'

// ─── Context — resolved elsewhere, never fetched here ──────────────────

/**
 * Everything `describeDiaryEvent` needs beyond the row itself. Every id a
 * payload carries (a collaborator id, an actor id) is resolved to a
 * display name by the caller before this function ever runs — this
 * module performs no lookups.
 */
export type DiaryEventContext = {
  /** Any id (user id or collaborator id) this diary needs a display name for, resolved by the caller. */
  names: Record<string, string>
  /** work_versions.id -> the derived vN numeral (RENUMBERING RULE — never stored, always derived by the caller from created_at ordering). */
  versionNumerals: Record<string, number>
}

function displayName(context: DiaryEventContext, id: string | null | undefined, fallback: string): string {
  if (!id) return fallback
  return context.names[id] ?? fallback
}

// ─── The row shape this function accepts ───────────────────────────────
//
// Deliberately loose rather than the strict `WorkDiaryEvent` union from
// types/catalogue.ts: `kind` is typed as `string`, not `DiaryEventKind`,
// and `payload` as `unknown`, not the mapped shape. A `WorkDiaryEvent` is
// structurally assignable to this type, so the normal typed path costs
// nothing — but this is also what lets `describeDiaryEvent` accept a raw
// row for a kind this module doesn't know about yet (a future migration
// adding a tenth kind before this file is updated) and degrade instead of
// crashing the feed.

export type DiaryEventRowLike = {
  id: string
  work_id: string
  kind: string
  actor_user_id: string | null
  payload: unknown
  created_at: string
}

// ─── The render shape ───────────────────────────────────────────────────

export type DiaryAccent = 'brandindigo' | 'money' | 'emerald-400' | 'blue-400' | 'lavdim'

export type DiaryEntryView = {
  kind: string
  headline: string
  /** Rendered dim, one line. Null only for `note` — the artist's own words carry no added commentary. */
  consequence: string | null
  /** ISO 8601, `created_at` verbatim — formatting (relative time, etc.) is the render component's job, matching ActivityFeed.tsx's timeAgo(). */
  date: string
  accent: DiaryAccent
}

/**
 * The four accents sketch 001 assigns (source/001-work-page-diary,
 * variant-a.html: `.c-ai` blue chip on AI-tagged versions and AI entries,
 * `.c-sheet` amber/money chip on § sheet events). `roster` and `version`
 * are this plan's considered extension of the same four-accent system —
 * the sketch shows `version` chips uncolored by default and colors a
 * roster-adjacent moment via the sheet accent, but this module needs one
 * stable accent per KIND, not per row content, so `version` takes the
 * brand indigo (the sketch's own default gradient start) and `roster`
 * takes emerald (the "good"/people-joining family the sketch uses
 * elsewhere for `c-good` chips). The remaining five kinds share the
 * neutral `lavdim` token — token NAMES only, never raw hex, per plan.
 */
export const DIARY_KIND_ACCENT: Record<DiaryEventKind, DiaryAccent> = {
  version: 'brandindigo',
  sheet: 'money',
  roster: 'emerald-400',
  ai_entry: 'blue-400',
  lyric_edit: 'lavdim',
  rename: 'lavdim',
  reorder: 'lavdim',
  detach: 'lavdim',
  note: 'lavdim',
}

const NEUTRAL_ACCENT: DiaryAccent = 'lavdim'

// ─── Block-type labels (matches the pad's add-section chip row) ────────

const BLOCK_TYPE_LABELS: Record<LyricBlockType, string> = {
  verse: 'Verse',
  pre_chorus: 'Pre-Chorus',
  chorus: 'Chorus',
  bridge: 'Bridge',
  intro: 'Intro',
  outro: 'Outro',
  hook: 'Hook',
  custom: 'section',
}

function blockLabel(blockType: LyricBlockType, customLabel: string | null): string {
  if (blockType === 'custom' && customLabel) return customLabel
  return BLOCK_TYPE_LABELS[blockType] ?? 'section'
}

const AI_COMPONENT_LABELS: Record<DiaryEventPayloadMap['ai_entry']['component'], string> = {
  vocal: 'vocal',
  instrument: 'instrument',
  lyric: 'lyrics',
  melody: 'melody',
  full: 'full track',
}

const LYRIC_EDIT_VERB: Record<DiaryEventPayloadMap['lyric_edit']['operation'], string> = {
  added: 'added',
  edited: 'edited',
  removed: 'removed',
}

const LYRIC_EDIT_CONSEQUENCE: Record<DiaryEventPayloadMap['lyric_edit']['operation'], string> = {
  added: 'Added to the pad, timestamped.',
  edited: 'Edited in the pad, timestamped.',
  removed: 'Removed from the pad, timestamped.',
}

// ─── isTriggerSourced (CAT-Q1 contract) ─────────────────────────────────

/** True for all nine kinds except `note` — the one app-authored exception. See file header. */
export function isTriggerSourced(kind: DiaryEventKind): boolean {
  return kind !== 'note'
}

// ─── describeDiaryEvent ─────────────────────────────────────────────────

/**
 * Maps a stored diary row to the three-part entry sketch 001 specifies.
 * Never throws: an unrecognized `kind` degrades to a neutral entry
 * instead of crashing the feed.
 */
export function describeDiaryEvent(row: DiaryEventRowLike, context: DiaryEventContext): DiaryEntryView {
  const actor = displayName(context, row.actor_user_id, 'Someone')

  switch (row.kind as DiaryEventKind) {
    case 'version': {
      const payload = row.payload as DiaryEventPayloadMap['version']
      const numeral = context.versionNumerals[payload.versionId]
      const vLabel = numeral ? `v${numeral}` : 'A version'
      const isHum: boolean = (payload.source as WorkVersionSource) === 'hum'
      return {
        kind: 'version',
        headline: isHum ? `${vLabel} — hum recorded` : `${vLabel} — audio uploaded`,
        consequence: isHum
          ? "A hum's timestamp is the authorship evidence."
          : 'Uploaded audio, timestamped as authorship evidence.',
        date: row.created_at,
        accent: DIARY_KIND_ACCENT.version,
      }
    }

    case 'lyric_edit': {
      const payload = row.payload as DiaryEventPayloadMap['lyric_edit']
      const section = blockLabel(payload.blockType, payload.customLabel)
      const verb = LYRIC_EDIT_VERB[payload.operation] ?? 'changed'
      return {
        kind: 'lyric_edit',
        headline: `${actor} ${verb} ${section}`,
        consequence: LYRIC_EDIT_CONSEQUENCE[payload.operation] ?? 'Saved to the pad, timestamped.',
        date: row.created_at,
        accent: DIARY_KIND_ACCENT.lyric_edit,
      }
    }

    case 'roster': {
      const payload = row.payload as DiaryEventPayloadMap['roster']
      const name = displayName(context, payload.collaboratorId, 'A collaborator')
      const tierLabel = WORK_TIER_LABELS[payload.tier as WorkTier] ?? payload.tier
      return {
        kind: 'roster',
        headline: `${name} joined as ${tierLabel}`,
        consequence: 'Membership is not a split — the sheet decides ownership.',
        date: row.created_at,
        accent: DIARY_KIND_ACCENT.roster,
      }
    }

    case 'sheet': {
      const payload = row.payload as DiaryEventPayloadMap['sheet']
      return {
        kind: 'sheet',
        headline: `${payload.name} joined the split sheet`,
        consequence: 'Living draft — executes when money or release is on the table.',
        date: row.created_at,
        accent: DIARY_KIND_ACCENT.sheet,
      }
    }

    case 'ai_entry': {
      const payload = row.payload as DiaryEventPayloadMap['ai_entry']
      const componentLabel = AI_COMPONENT_LABELS[payload.component] ?? 'contribution'
      return {
        kind: 'ai_entry',
        headline: `AI ${componentLabel} added`,
        // Verbatim, never recomposed (T-37-24) — this IS the stored citation.
        consequence: payload.citation,
        date: row.created_at,
        accent: DIARY_KIND_ACCENT.ai_entry,
      }
    }

    case 'rename': {
      const payload = row.payload as DiaryEventPayloadMap['rename']
      return {
        kind: 'rename',
        headline: `Renamed "${payload.previousTitle}" → "${payload.title}"`,
        consequence: 'Former titles stay searchable.',
        date: row.created_at,
        accent: DIARY_KIND_ACCENT.rename,
      }
    }

    case 'reorder': {
      const payload = row.payload as DiaryEventPayloadMap['reorder']
      return {
        kind: 'reorder',
        headline: `${actor} reordered ${payload.blockCount} sections`,
        consequence: 'Numbers update automatically — authorship stays with each block.',
        date: row.created_at,
        accent: DIARY_KIND_ACCENT.reorder,
      }
    }

    case 'detach': {
      const payload = row.payload as DiaryEventPayloadMap['detach']
      // No customLabel on this payload (138 does not carry it for a detach
      // event) — a custom section's display heading falls back to the
      // generic label here, unlike lyric_edit's headline.
      const section = blockLabel(payload.blockType, null)
      return {
        kind: 'detach',
        headline: `${actor} detached ${section}`,
        consequence: 'Now carries its own authorship.',
        date: row.created_at,
        accent: DIARY_KIND_ACCENT.detach,
      }
    }

    case 'note': {
      const payload = row.payload as DiaryEventPayloadMap['note']
      return {
        kind: 'note',
        headline: payload.text,
        consequence: null,
        date: row.created_at,
        accent: DIARY_KIND_ACCENT.note,
      }
    }

    default:
      // Unknown or future kind — degrade rather than throw.
      return {
        kind: row.kind,
        headline: 'Something changed on this song.',
        consequence: null,
        date: row.created_at,
        accent: NEUTRAL_ACCENT,
      }
  }
}
