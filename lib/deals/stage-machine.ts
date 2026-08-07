import { DEAL_STAGE_VALUES, type DealStage } from './schema'

// ─── D-16a deal-stage state machine ───────────────────────────────────────
// Pure functions only — no Supabase client, no I/O — over the
// DEAL_STAGE_VALUES tuple from lib/deals/schema.ts, so this is the single
// source of truth for legal stage moves. app/api/admin/deals/[id]/route.ts
// (Task 2) calls isLegalTransition before every stage write, and
// DealDetailPanel (Task 3) renders its advance-stage buttons from
// getLegalNextStages — a stale open tab or a crafted PATCH cannot jump a
// deal straight to closed because the SAME check gates both surfaces.

// Forward order of the pipeline. Index position is the only thing that
// determines a legal forward move: exactly one step ahead, never a skip,
// never backward.
const FORWARD_PIPELINE: DealStage[] = [
  'submitted',
  'in_negotiation',
  'terms_agreed',
  'contract',
  'closed_won',
]

const TERMINAL_STAGES: ReadonlySet<DealStage> = new Set(['closed_won', 'closed_lost'])

const KNOWN_STAGES: ReadonlySet<string> = new Set(DEAL_STAGE_VALUES)

function isKnownStage(value: string): value is DealStage {
  return KNOWN_STAGES.has(value)
}

/**
 * True only when moving from `from` to `to` is a legal D-16a pipeline
 * transition:
 *   - forward moves along FORWARD_PIPELINE are legal (one step at a time).
 *   - any non-terminal stage may move to the closed_lost terminal stage.
 *   - a terminal stage (closed_won or closed_lost) moves to nothing.
 *   - a same-stage self-transition is illegal (a no-op write must not
 *     pass the gate).
 *   - an unknown stage value on either side fails closed (false).
 */
export function isLegalTransition(from: DealStage, to: DealStage): boolean {
  if (!isKnownStage(from) || !isKnownStage(to)) return false
  if (from === to) return false
  if (TERMINAL_STAGES.has(from)) return false

  // Any non-terminal stage may decline straight to closed_lost.
  if (to === 'closed_lost') return true

  const fromIndex = FORWARD_PIPELINE.indexOf(from)
  const toIndex = FORWARD_PIPELINE.indexOf(to)
  // from is guaranteed non-terminal here, so it must be in FORWARD_PIPELINE;
  // `to` may still be closed_lost (handled above) — anything else must be
  // exactly one forward step.
  if (fromIndex === -1 || toIndex === -1) return false
  return toIndex === fromIndex + 1
}

/**
 * Field names that must be present (non-null) on the deal row before a
 * transition INTO `stage` is allowed:
 *   - contract requires a gross fee and a commission percentage (a deal
 *     cannot reach paper without economics).
 *   - closed_won requires a linked contract document.
 *   - every other stage requires nothing beyond the stage move itself.
 */
export function requiredFieldsForStage(
  stage: DealStage
): ('gross_fee_cents' | 'commission_pct' | 'contract_document_id')[] {
  if (stage === 'contract') return ['gross_fee_cents', 'commission_pct']
  if (stage === 'closed_won') return ['contract_document_id']
  return []
}

/**
 * The full set of stages `from` may legally move to, derived by filtering
 * DEAL_STAGE_VALUES through isLegalTransition — the UI's button set and the
 * server's gate always agree because both read from this one function.
 */
export function getLegalNextStages(from: DealStage): DealStage[] {
  return DEAL_STAGE_VALUES.filter(to => isLegalTransition(from, to))
}
