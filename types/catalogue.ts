// ─── My Catalogue — row vocabulary (Phase 37.1 "The Songwriter") ────────
// This file mirrors the database: every nullable column here is nullable
// there, and every literal-string union here is byte-identical to the SQL
// CHECK constraint it types. It is the shared language every wave-2+
// route and every wave-3+ component in this phase speaks — do not
// redeclare any of these shapes locally in a route or component.
//
// Source of truth: supabase/migrations/135_works_core.sql,
// 136_work_members.sql, 137_split_sheets_work_link.sql,
// 138_work_diary_events.sql — authored and landed by 37-01 in this same
// wave. This file's row and JSONB-payload shapes are verified against
// those migrations' actual columns, CHECK constraints and
// `jsonb_build_object(...)` calls, not against RESEARCH.md's earlier
// sketch. Read, do not edit, 37-01's migration files; reconcile this file
// against them, never the other way around, if the two ever disagree.
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
  vocal_direction?: string | null // uncast creative intent — never a person, credit, membership, or split fact
  repeat_of_block_id: string | null // linked repeat (REPEAT RULE) — detach (copy-on-write) clears this
  created_at: string
  updated_at: string
  // NO numeral column — see file header note 1.
}

export type LyricSnapshotReason = 'edit_session_start' | 'before_restore'

/**
 * An immutable section-level recovery point. `capture_key` deduplicates
 * ordinary autosaves into one baseline per editing session; it is an
 * implementation capability, not an authorship, rights, or consent fact.
 */
export type LyricBlockSnapshot = {
  id: string
  work_id: string
  block_id: string
  capture_key: string
  reason: LyricSnapshotReason
  text: string
  captured_by_user_id: string | null
  created_at: string
}

/** The API's member-safe presentation; internal capture keys and user ids stay server-side. */
export type LyricBlockSnapshotView = Pick<
  LyricBlockSnapshot,
  'id' | 'block_id' | 'reason' | 'text' | 'created_at'
> & {
  actorName: string
}

// ─── lyric-section comments — private creative discussion ────────────

export type LyricBlockComment = {
  id: string
  work_id: string
  block_id: string
  parent_comment_id: string | null
  author_user_id: string | null
  body: string
  mentioned_user_ids: string[]
  resolved_at: string | null
  resolved_by_user_id: string | null
  created_at: string
}

export type LyricCommentParticipant = {
  userId: string
  name: string
  handle: string | null
  avatarUrl: string | null
}

/** Member-safe comment presentation. Resolution authority is decided server-side. */
export type LyricBlockCommentView = {
  id: string
  blockId: string
  parentCommentId: string | null
  body: string
  author: LyricCommentParticipant | null
  mentioned: LyricCommentParticipant[]
  resolvedAt: string | null
  resolvedByName: string | null
  createdAt: string
  canResolve: boolean
}

// ─── recording-version comments — timestamped mix discussion ────────

export type WorkVersionComment = {
  id: string
  work_id: string
  version_id: string
  parent_comment_id: string | null
  author_user_id: string | null
  body: string
  timestamp_ms: number
  mentioned_user_ids: string[]
  resolved_at: string | null
  resolved_by_user_id: string | null
  carried_from_version_id: string | null
  carried_from_comment_id: string | null
  created_at: string
}

export type WorkVersionCommentView = {
  id: string
  versionId: string
  parentCommentId: string | null
  body: string
  timestampMs: number
  author: LyricCommentParticipant | null
  mentioned: LyricCommentParticipant[]
  resolvedAt: string | null
  resolvedByName: string | null
  carriedFromVersionId: string | null
  carriedFromVersionDisplay: string | null
  createdAt: string
  canResolve: boolean
}

export type WorkVersionCommentCarryOffer = {
  sourceVersionId: string
  sourceVersionDisplay: string
  comments: WorkVersionCommentView[]
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
// Payload field names below are verified against migration 138's actual
// `jsonb_build_object(...)` calls (supabase/migrations/138_work_diary_events.sql,
// landed by 37-01 during this same wave) — not a guess. Field names are
// camelCase in the payload even though the columns they read from are
// snake_case, matching 138's own jsonb_build_object key choices.

export type DiaryEventPayloadMap = {
  /** capture_work_version_event() — AFTER INSERT ON work_versions. */
  version: {
    versionId: string
    source: WorkVersionSource
    label: string | null
  }
  /**
   * capture_lyric_block_added/edited/removed() — AFTER INSERT / AFTER UPDATE
   * OF text,block_type,custom_label (guarded to fire only when one of those
   * three actually changed) / AFTER DELETE ON lyric_blocks. Fires per saved
   * edit, never per keystroke — the pad debounces before it PATCHes.
   */
  lyric_edit: {
    blockId: string
    blockType: LyricBlockType
    customLabel: string | null
    operation: 'added' | 'edited' | 'removed' | 'restored'
    snapshotId?: string
  }
  /**
   * capture_work_member_event() — AFTER INSERT ON work_members. `memberUserId`
   * is the person who joined; the diary's actor_user_id column is `added_by`
   * (who did the inviting) — the diary records actions, and an invitee has
   * not acted yet.
   */
  roster: {
    memberId: string
    tier: WorkTier
    collaboratorId: string | null
    memberUserId: string | null
  }
  /**
   * capture_split_sheet_party_event() — AFTER INSERT ON split_sheet_parties,
   * only when the parent sheet's work_id is non-null (strict no-op
   * otherwise — the trigger is attached to a table the existing split-sheet
   * builder already writes on every save). `name` is
   * split_sheet_parties.name, denormalized at row creation — no join
   * needed. `operation` is a string, not yet a closed union, because 138
   * only ever writes 'party_added' today; a future sheet-status trigger may
   * add values here.
   */
  sheet: {
    partyId: string
    sheetId: string
    name: string
    collaboratorId: string | null
    operation: string
  }
  /** capture_ai_entry_event() — AFTER INSERT ON ai_entries. `citation` is rendered verbatim by describeDiaryEvent (T-37-24) — never recomposed. */
  ai_entry: {
    entryId: string
    level: AiEntryLevel
    component: AiEntryComponent
    mode: AiEntryMode
    citation: string
    humanSourceVersionId: string | null
  }
  /** capture_work_rename_event() — AFTER UPDATE OF title ON works, fired only when the title actually changed. */
  rename: {
    previousTitle: string
    title: string
  }
  /** Emitted once per drag from inside reorder_lyric_blocks(), never per row — a set-based update of N rows must not become N diary entries. */
  reorder: {
    blockCount: number
  }
  /**
   * capture_lyric_block_detached() — AFTER UPDATE OF repeat_of_block_id ON
   * lyric_blocks, fired only when the old value was non-null and the new
   * value is null (the detach transition; re-pointing a repeat at a
   * different source is not one). No `customLabel` here — a detach payload
   * carries the block that now stands alone, not its display heading.
   */
  detach: {
    blockId: string
    blockType: LyricBlockType
    detachedFromBlockId: string | null
  }
  /** Trigger-sourced root-thread lifecycle; replies stay inside the thread instead of flooding the diary. */
  comment: {
    commentId: string
    blockId: string
    blockType: LyricBlockType
    customLabel: string | null
    operation: 'opened' | 'resolved' | 'reopened'
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
