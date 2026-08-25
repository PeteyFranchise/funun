import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

// ─── Game Plan — per-account call prep doc (R14/D-31.1-06, migration 128) ──
// One saved game_plans row per buyer_org (enforced by the DB's
// game_plans_one_per_org unique index). A "topic" is a theme carrying
// open-ended questions, checked off ("done") on the call, plus a free-text
// note captured during the call. In 31.1, suggested topics are seeded
// defaults + custom (AE-typed) + Selects context — dynamic sourcing from The
// Playbook/Plays is explicitly deferred to 31.2 (do not add a "from The
// Playbook" source label here).
//
// coveredSummary/buildGamePlanLogBody are pure — no I/O — so both the route
// (app/api/admin/client-partners/[orgId]/game-plan/route.ts) and the client
// panel can share the exact same "X of N covered" text.

export type GamePlanTopic = {
  id: string
  title: string
  /** null = a custom AE-typed topic. 'seeded' = one of the 31.1 defaults. Anything else (e.g. 'selects:<name>') = Selects context (D-31.1-06). */
  source: string | null
  questions: string[]
  done: boolean
  note: string
}

// ─── The 31.1 seeded default topics ────────────────────────────────────────
// A plain data constant, not yet leadership-configurable (mirrors
// onboarding.ts's SEEDED_ONBOARDING_CHECKLIST convention). Dynamic sourcing
// from an authored Playbook is 31.2 — these are static seed defaults only.
export const SEEDED_GAME_PLAN_TOPICS: ReadonlyArray<Pick<GamePlanTopic, 'id' | 'title' | 'questions'>> = [
  {
    id: 'confirm_brief',
    title: 'Confirm the brief',
    questions: ['Confirm the brief + timeline.', 'Anything changed since we scoped it?'],
  },
  {
    id: 'budget_scope',
    title: 'Budget & scope',
    questions: ["What's the budget range for this?", 'Any usage beyond what we scoped — cutdowns, extensions?'],
  },
  {
    id: 'decision_makers',
    title: 'Decision-makers',
    questions: ['Who else signs off on the picks?', 'Who owns the final yes?'],
  },
  {
    id: 'pipeline_ahead',
    title: 'Pipeline ahead',
    questions: ['Any other campaigns this quarter?', "What's coming we should pre-build for?"],
  },
  {
    id: 'lock_license',
    title: 'Lock the license',
    questions: ["What's your timeline to lock the license?", 'Any blockers to signing?'],
  },
] as const

/** A fresh, unchecked topic list from the seeded defaults — used whenever no game_plans row exists yet for an org. */
export function buildDefaultGamePlanTopics(): GamePlanTopic[] {
  return SEEDED_GAME_PLAN_TOPICS.map(t => ({
    id: t.id,
    title: t.title,
    source: 'seeded',
    questions: [...t.questions],
    done: false,
    note: '',
  }))
}

// ─── buildPickerTopics — 31.2-08 read-time merge (D-31.2-07, Pitfall 4) ────
// Authored Playbook Topics AUGMENT the seeded starters in the Game-Plan
// picker's option menu — neither list replaces the other. This is a pure
// concatenation helper; it does NOT touch SEEDED_GAME_PLAN_TOPICS or
// buildDefaultGamePlanTopics(), and it is called only by the caller that
// builds the picker's option set (the game-plan GET route), never by the
// "no game_plans row exists yet" seeding path above.
export type PickerTopic = {
  id: string
  title: string
  source: string
  questions: string[]
}

export type AuthoredPickerTopic = { id: string; title: string; questions: string[] }

export function buildPickerTopics(
  seededTopics: ReadonlyArray<Pick<GamePlanTopic, 'id' | 'title' | 'questions'>>,
  authoredTopics: ReadonlyArray<AuthoredPickerTopic>
): PickerTopic[] {
  const seeded: PickerTopic[] = seededTopics.map(t => ({
    id: t.id,
    title: t.title,
    source: 'seeded',
    questions: [...t.questions],
  }))
  const authored: PickerTopic[] = authoredTopics.map(t => ({
    id: t.id,
    title: t.title,
    source: `playbook:${t.id}`,
    questions: [...t.questions],
  }))
  return [...seeded, ...authored]
}

// ─── loadAuthoredGamePlanTopics — published playbook_entries(topic) ────────
// A thin loader for the authored side of the buildPickerTopics merge above.
// Service-role only, mirrors loadGamePlan's access pattern. A Topic entry's
// content shape is `{ questions: string[] }` (D-31.2-05: "Topics — coaching
// bundles: heading + open-ended questions"); malformed/missing questions
// degrade to an empty array rather than throwing.
export async function loadAuthoredGamePlanTopics(service: SupabaseClient): Promise<AuthoredPickerTopic[]> {
  const { data, error } = await service
    .from('playbook_entries')
    .select('id, title, content')
    .eq('entry_type', 'topic')
    .eq('status', 'published')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to load authored game plan topics: ${error.message}`)

  return ((data ?? []) as { id: string; title: string; content: Record<string, unknown> }[]).map(row => {
    const rawQuestions = row.content?.questions
    const questions = Array.isArray(rawQuestions) ? rawQuestions.filter((q): q is string => typeof q === 'string') : []
    return { id: row.id, title: row.title, questions }
  })
}

// ─── coveredSummary — the shared "X of N covered" text ─────────────────────
// 0 covered is a valid, non-blank summary ("0 of N covered") — SPEC R14
// boundary edge. An empty topic list reads "0 of 0 covered" rather than
// throwing, so a caller that logs with no topics at all still gets text.
export function coveredSummary(topics: GamePlanTopic[]): { covered: number; total: number; text: string } {
  const total = topics.length
  const covered = topics.filter(t => t.done).length
  return { covered, total, text: `${covered} of ${total} covered` }
}

// ─── The relationship-log body written by "Log conversation" ───────────────
// Always starts with the covered-summary line (never a silent blank), then
// appends one line per topic that carries a note.
export function buildGamePlanLogBody(topics: GamePlanTopic[]): string {
  const { text } = coveredSummary(topics)
  const notedLines = topics
    .filter(t => t.note.trim().length > 0)
    .map(t => `${t.title} — ${t.note.trim()}`)
  return notedLines.length > 0 ? `${text}\n${notedLines.join('\n')}` : text
}

// ─── loadGamePlan — the shared GET read (route + RSC page) ─────────────────
// Both the game-plan route's GET handler and the person-workspace RSC page
// (which needs the initial topics prop, data + string action paths only —
// Pitfall 1) read via this ONE function, so the "seed when no row exists"
// rule lives in exactly one place. Service-role only — game_plans is
// zero-RLS-policy + REVOKE'd from authenticated/anon (migration 128).
export async function loadGamePlan(
  service: SupabaseClient,
  orgId: string
): Promise<{ topics: GamePlanTopic[]; seeded: boolean }> {
  const { data, error } = await service
    .from('game_plans')
    .select('topics')
    .eq('buyer_org_id', orgId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load game plan: ${error.message}`)
  const row = data as { topics: GamePlanTopic[] } | null
  return { topics: row?.topics ?? buildDefaultGamePlanTopics(), seeded: !row }
}

// ─── zod validation (PUT/POST body) ────────────────────────────────────────
// Mirrors lib/client-partners/contacts.ts's ContactCreateSchema convention:
// .strict() so an unrecognized key is rejected, not silently dropped
// (T-31.1-mass-assign). `source`/`note` are optional on input —
// normalizeGamePlanTopics below fills the DB-shape defaults.
export const GamePlanTopicSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    title: z.string().trim().min(1).max(200),
    source: z.union([z.string().trim().max(200), z.null()]).optional(),
    questions: z.array(z.string().trim().min(1).max(500)).max(20),
    done: z.boolean(),
    note: z.string().max(2000).optional(),
  })
  .strict()

export const GamePlanTopicsSchema = z.array(GamePlanTopicSchema).max(50)

export type GamePlanTopicInput = z.infer<typeof GamePlanTopicSchema>

/** Fills the optional `source`/`note` input fields to the DB-shape GamePlanTopic — pure, no I/O. */
export function normalizeGamePlanTopics(topics: GamePlanTopicInput[]): GamePlanTopic[] {
  return topics.map(t => ({
    id: t.id,
    title: t.title,
    source: t.source ?? null,
    questions: t.questions,
    done: t.done,
    note: t.note ?? '',
  }))
}
