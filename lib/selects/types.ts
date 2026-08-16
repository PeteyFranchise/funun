// ─── Selects — shared schema (mirrors migration 111's selects/selects_tracks) ─
// Types describing the Selects domain (a co-edited, shareable set of Crate
// tracks an AE sends to a client). This module is pure — no Supabase client,
// no I/O — so both the API layer (writers) and any client component can
// import it safely.

// ─── Status pipeline ──────────────────────────────────────────────────────
// draft -> sent -> approved | changes_requested; changes_requested -> sent
// (re-send after a revision). Legality of any transition is owned solely by
// lib/selects/stage-machine.ts's isLegalSelectsTransition — this union is
// just the vocabulary.
export const SELECTS_STATUS_VALUES = [
  'draft',
  'sent',
  'approved',
  'changes_requested',
] as const

export type SelectsStatus = (typeof SELECTS_STATUS_VALUES)[number]

// ─── Selects — mirrors migration 111's selects columns ───────────────────
export type Selects = {
  id: string
  buyer_org_id: string
  created_by: string
  brief_id: string | null
  name: string
  cover_note: string | null
  share_token: string
  status: SelectsStatus
  download_enabled: boolean
  download_max_seconds: number | null
  created_at: string
  updated_at: string
  sent_at: string | null
  /** 31-13/migration 113 — best-effort, may be absent before the migration lands. */
  changes_requested_reason?: string | null
}

// ─── SelectsTrack — mirrors migration 111's selects_tracks columns ───────
export const SELECTS_TRACK_SOURCE_VALUES = ['crate', 'suggested'] as const
export type SelectsTrackSource = (typeof SELECTS_TRACK_SOURCE_VALUES)[number]

// ─── selects_reactions.reaction — mirrors migration 111's CHECK (31-13) ──
export const SELECTS_REACTION_VALUES = ['love', 'pass', 'more_like_this'] as const
export type SelectsReaction = (typeof SELECTS_REACTION_VALUES)[number]

export type SelectsTrack = {
  id: string
  selects_id: string
  track_id: string
  note: string | null
  position: number
  added_by: string | null
  source: SelectsTrackSource
  removed_at: string | null
  removed_by: string | null
  created_at: string
}
