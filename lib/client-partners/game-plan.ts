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
