// ─── Provenance-preserving tag merge ─────────────────────────────────────
// Three write paths over the SAME lib/metadata/schema.ts TrackDescriptors
// shape: AI suggests (never overwrites confirmed), staff refines (writes
// confirmed + a provenance marker), and an AE proposes (writes `pending`,
// requiring a leadership/A&R approve action before it becomes confirmed —
// see 30-CONTEXT.md's "Tag curation + approval" decision and T-30-14).
// Pure, vocab-safe (routes every input through schema.ts's shared coercion
// helpers), and never mutates its inputs.
import {
  coerceMoods,
  coerceEnergy,
  coerceVocal,
  coerceInstruments,
  type TrackDescriptors,
  type AiSuggestedTags,
  type PendingTagProposal,
} from '@/lib/metadata/schema'

// The leadership+A&R approver set the 30-06 approve route gates on. 'anr' is
// added to funun_staff.staff_role's CHECK + lib/admin/staff-role.ts's
// StaffRole union by the OWNER-RUN migration in 30-03; callers here pass
// their server-resolved role string (widened StaffRole, once 30-03 lands).
export const TAG_APPROVER_ROLES = ['leadership', 'anr'] as const

/** True for leadership/A&R — the roles whose tag proposals auto-confirm and who may approve/reject a pending one. */
export function isTagApprover(role: string): boolean {
  return (TAG_APPROVER_ROLES as readonly string[]).includes(role)
}

/** Loose refinement input — each field optional; routed through schema.ts's vocab coercion before it ever reaches a descriptor. */
export type TagRefinementInput = {
  moods?: unknown
  energy?: unknown
  vocal?: unknown
  instruments?: unknown
}

function coerceFull(refined: TagRefinementInput) {
  return {
    moods: coerceMoods(refined.moods),
    energy: coerceEnergy(refined.energy),
    vocal: coerceVocal(refined.vocal),
    instruments: coerceInstruments(refined.instruments),
  }
}

/**
 * AI suggestion never overwrites the confirmed moods/energy/vocal/instruments
 * — the artist still owns the confirmed values. Sets ai_suggested only.
 */
export function mergeAiSuggestion(current: TrackDescriptors, suggestion: AiSuggestedTags): TrackDescriptors {
  return {
    ...current,
    ai_suggested: {
      moods: [...suggestion.moods],
      energy: suggestion.energy,
      vocal: suggestion.vocal,
      instruments: [...suggestion.instruments],
      suggested_at: suggestion.suggested_at,
      model: suggestion.model,
    },
  }
}

/**
 * The confirmed-write primitive both the auto-confirm path (leadership/A&R
 * proposeStaffRefinement) and the approve path (approvePendingTags) reuse.
 * Only overwrites a field when the caller explicitly supplied it (partial
 * update); preserves ai_suggested; stamps staff_refined_by; clears pending.
 */
export function applyStaffRefinement(
  current: TrackDescriptors,
  refined: TagRefinementInput,
  staffUserId: string
): TrackDescriptors {
  const next: TrackDescriptors = { ...current }
  if (refined.moods !== undefined) next.moods = coerceMoods(refined.moods)
  if (refined.energy !== undefined) next.energy = coerceEnergy(refined.energy)
  if (refined.vocal !== undefined) next.vocal = coerceVocal(refined.vocal)
  if (refined.instruments !== undefined) {
    const instruments = coerceInstruments(refined.instruments)
    if (instruments.length > 0) next.instruments = instruments
    else delete next.instruments
  }
  delete next.pending
  next.staff_refined_by = staffUserId
  next.updated_at = new Date().toISOString()
  return next
}

/**
 * Branches on the caller's resolved role. Leadership/A&R (isTagApprover) auto-
 * confirms via applyStaffRefinement. An AE's proposal is written to `pending`
 * (proposed_by/proposed_at) and NEVER auto-confirms — the confirmed tags stay
 * untouched until an explicit approvePendingTags call (T-30-14 mitigation).
 */
export function proposeStaffRefinement(
  current: TrackDescriptors,
  refined: TagRefinementInput,
  staffUserId: string,
  role: string
): TrackDescriptors {
  if (isTagApprover(role)) {
    return applyStaffRefinement(current, refined, staffUserId)
  }
  const coerced = coerceFull(refined)
  const pending: PendingTagProposal = {
    moods: coerced.moods,
    energy: coerced.energy,
    vocal: coerced.vocal,
    instruments: coerced.instruments,
    proposed_by: staffUserId,
    proposed_at: new Date().toISOString(),
  }
  return { ...current, pending }
}

/** Promotes a pending proposal to confirmed (via applyStaffRefinement) and clears pending. No-op (shallow copy) if nothing is pending. */
export function approvePendingTags(current: TrackDescriptors, approverUserId: string): TrackDescriptors {
  if (!current.pending) return { ...current }
  const { pending } = current
  return applyStaffRefinement(
    current,
    { moods: pending.moods, energy: pending.energy, vocal: pending.vocal, instruments: pending.instruments },
    approverUserId
  )
}

/** Clears a pending proposal without touching the confirmed tags. */
export function rejectPendingTags(current: TrackDescriptors): TrackDescriptors {
  const { pending: _pending, ...rest } = current
  return { ...rest }
}
