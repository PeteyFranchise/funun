// ─── My Catalogue — row vocabulary (Phase 37.1 "The Songwriter") ────────
// This file mirrors the database: every nullable column here is nullable
// there, and every literal-string union here is byte-identical to the SQL
// CHECK constraint it types. It is the shared language every wave-2+
// route and every wave-3+ component in this phase speaks — do not
// redeclare any of these shapes locally in a route or component.
//
// Source of truth (once pushed): supabase/migrations/135_works_core.sql,
// 136_work_members.sql, 137_split_sheets_work_link.sql,
// 138_work_diary_events.sql. 37-01 authors those files; this module is a
// considered proposal built from RESEARCH.md's DDL sketch and 37-01's own
// plan text (same 2026-08-30 research pass) — read, do not edit, 37-01's
// migration files once they land, and reconcile this file's shapes against
// them rather than the other way around if the two ever disagree.
//
// TWO COLUMNS DELIBERATELY DO NOT EXIST HERE, ON PURPOSE, NOT BY OVERSIGHT:
//   1. No stored numeral on a `WorkVersion` or a `LyricBlock`. A version's
//      "vN" and a block's "Verse 2" are both DERIVED at read time — the
//      former by created_at ordering within a work, the latter by
//      `position` ordering among same-type siblings — never stored
//      (RENUMBERING RULE; RESEARCH Pitfall 5; 37-01 prohibitions).
//   2. No reverse `split_sheet_id` pointer on `Work`. The FK points from
//      `split_sheets.work_id` to `works`, matching migration 067's
//      existing track/project attachment direction; a work's living draft
//      is resolved by selecting the sheet whose `work_id` matches and
//      whose status is `draft`, never by a stored pointer on `works`
//      (37-01 Open Question 1, resolved; do not add `works.split_sheet_id`).

import type { WorkTier } from '@/lib/catalogue/membership'

// ─── Shared JSONB shapes ──────────────────────────────────────────────

/**
 * The performer-reference shape carried by `works.primary_performer`,
 * `work_versions.performers[]` and `lyric_blocks.performers[]`. `kind`
 * distinguishes a User Account (`self`/`collaborator`) from a guest with
 * no account (`name` only) — see docs/architecture/ACCOUNT-TYPES.md.
 */
export type PerformerRef = {
  kind: 'self' | 'collaborator' | 'guest'
  collaboratorId?: string | null
  userId?: string | null
  name?: string | null
}

// ─── works ─────────────────────────────────────────────────────────────

/**
 * Three vocal states (DEFAULT-PERFORMER RULE). `instrumental` is not
 * cosmetic: every who-sings prompt disappears, the Crate vocal check
 * passes by construction, and DDEX exports omit vocal performer roles.
 */
export type WorkVocalState = 'primary' | 'varies' | 'instrumental'

export type Work = {
  id: string
  user_id: string // creator and default owner
  title: string
  vocal_state: WorkVocalState
  primary_performer: PerformerRef | null // null when vocal_state !== 'primary'
  graduated_project_id: string | null // 37.2 graduation seam — unwritten by anything in 37.1
  created_at: string
  updated_at: string
}

// ─── work_versions — the "recording" side (hum / upload / re-record) ──

export type WorkVersionSource = 'hum' | 'upload'

export type WorkVersion = {
  id: string
  work_id: string
  user_id: string // whoever created THIS version — may be a collaborator, not the work owner
  source: WorkVersionSource
  audio_path: string // `{work_id}/{version_id}.{ext}` in the track-audio bucket — no owner-id prefix (RESEARCH Pitfall 2)
  audio_ext: string
  audio_size: number | null
  duration_seconds: number | null
  label: string | null // optional artist free text, e.g. "acoustic take" — never the vN numeral
  performers: PerformerRef[] // declared per-recording credits (PERFORMER RULE) — feeds DDEX + the human-take registry
  created_at: string
  // NO numeral column — see file header note 1.
}

// ─── lyric_blocks — structure blocks (sketch 006) ──────────────────────

export type LyricBlockType =
  | 'verse'
  | 'pre_chorus'
  | 'chorus'
  | 'bridge'
  | 'intro'
  | 'outro'
  | 'hook'
  | 'custom'

export type LyricBlockAuthorKind = 'human' | 'ai'

export type LyricBlock = {
  id: string
  work_id: string
  block_type: LyricBlockType
  custom_label: string | null // meaningful only when block_type === 'custom'
  position: number // absolute drag order — the ONLY ordering fact stored (RENUMBERING RULE)
  text: string
  author_kind: LyricBlockAuthorKind
  author_user_id: string | null // ✍ badge — the automatic writer credit; required when author_kind === 'human'
  performers: PerformerRef[] // 🎤 badges — declared singer cluster; moves credits, never splits
  repeat_of_block_id: string | null // linked repeat (REPEAT RULE) — detach (copy-on-write) clears this
  created_at: string
  updated_at: string
  // NO numeral column — see file header note 1.
}

// ─── work_members — collaborator access + tier (S-02) ─────────────────

export type WorkMember = {
  id: string
  work_id: string
  user_id: string | null // set immediately for the owner; NULL until an invitee claims (claim bridge, migration 079's pattern)
  collaborator_id: string | null // NULL only for the owner's own row
  tier: WorkTier
  added_by: string | null
  created_at: string
}

// ─── ai_entries — DDEX-component AI contributions (CAT-Q3) ────────────

export type AiEntryLevel = 'work' | 'version'
export type AiEntryComponent = 'vocal' | 'instrument' | 'lyric' | 'melody' | 'full'
/** `performance` = a tool singing/playing something a human wrote (ownership untouched). `generate` = the tool inventing material (owned by no one). */
export type AiEntryMode = 'performance' | 'generate'

export type AiEntry = {
  id: string
  work_id: string
  level: AiEntryLevel
  version_id: string | null // required when level === 'version', null when level === 'work'
  block_id: string | null
  component: AiEntryComponent
  mode: AiEntryMode
  citation: string // the plain-words receipt line, e.g. "AI reference vocal — demo only"
  human_source_version_id: string | null // the diary-anchored human take this citation points to, when it exists
  created_by: string
  created_at: string
}

// ─── work_diary_events — the auto-captured timeline (CAT-Q1) ──────────
//
// Nine kinds, each with its own typed payload. Eight arrive from database
// triggers and can never be skipped by a route that forgets to call them;
// `note` is the deliberate ninth exception — a free-standing annotation
// with no underlying row to trigger from, written directly by a
// service-role route. See lib/catalogue/diary.ts's `isTriggerSourced()`
// for the enforced contract and RESEARCH Pitfall 1 for why this table is
// not, and must never become, `activity_events`.
//
// Payload field names below are this plan's considered proposal for what
// migration 138's SECURITY DEFINER trigger functions write — coordinate
// against 138 once it lands rather than editing it to match a stale guess
// here.

export type DiaryEventPayloadMap = {
  /** AFTER INSERT ON work_versions. */
  version: {
    versionId: string
    source: WorkVersionSource
  }
  /** AFTER INSERT / AFTER UPDATE OF text,block_type,custom_label / AFTER DELETE ON lyric_blocks. Fires per saved edit, never per keystroke — the pad debounces before it PATCHes. */
  lyric_edit: {
    blockId: string
    blockType: LyricBlockType
    customLabel: string | null
    operation: 'added' | 'edited' | 'removed'
  }
  /** AFTER INSERT ON work_members. */
  roster: {
    memberId: string
    tier: WorkTier
    collaboratorId: string | null
  }
  /** AFTER INSERT ON split_sheet_parties, only when the parent sheet's work_id is non-null (strict no-op otherwise). */
  sheet: {
    partyId: string
    sheetId: string
    name: string // split_sheet_parties.name is denormalized at row creation — no join needed
    splitPercentage: number
  }
  /** AFTER INSERT ON ai_entries. */
  ai_entry: {
    entryId: string
    level: AiEntryLevel
    component: AiEntryComponent
    mode: AiEntryMode
    citation: string
  }
  /** AFTER UPDATE OF title ON works, fired only when the title actually changed. */
  rename: {
    oldTitle: string
    newTitle: string
  }
  /** Emitted once per drag from inside reorder_lyric_blocks(), never per row — a set-based update of N rows must not become N diary entries. */
  reorder: {
    blockCount: number
  }
  /** AFTER UPDATE OF repeat_of_block_id ON lyric_blocks, fired only when the old value was non-null and the new value is null. */
  detach: {
    blockId: string
    blockType: LyricBlockType
    customLabel: string | null
  }
  /** App-authored — the one exception to trigger-sourced capture. Written directly by a service-role route, never a trigger. */
  note: {
    text: string
  }
}

export type DiaryEventKind = keyof DiaryEventPayloadMap
export type DiaryEventPayload = DiaryEventPayloadMap[DiaryEventKind]

/** A discriminated union on `kind` — narrowing `kind` narrows `payload` to that kind's shape. */
export type WorkDiaryEvent = {
  [K in DiaryEventKind]: {
    id: string
    work_id: string
    kind: K
    actor_user_id: string | null // NULL only for system-fired events with no human actor (none expected in 37.1)
    payload: DiaryEventPayloadMap[K]
    created_at: string
  }
}[DiaryEventKind]
