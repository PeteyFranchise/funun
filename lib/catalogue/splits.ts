// ─── The living-draft split redraft (CAT-Q1a) ──────────────────────────
// Pure module in the style of lib/split-sheets/approval.ts: no Supabase
// client, no framework import, no I/O.
//
// THE LOCKED RULE, IN THE OWNER'S OWN TERMS: splits default to EQUAL
// shares — fifty-fifty for two writers, even N-way for more — unless the
// writers decide otherwise. The system NEVER proposes contribution-based
// percentages. The diary is evidence the writers MAY consult when
// deciding their own split; it is never an input this product converts
// into a percentage. Deciding that is theirs, not ours.
//
// There is deliberately NO function in this module that accepts a
// contribution signal (word count, block count, edit history, anything).
// Adding one would be a doctrine violation, not a feature request — if a
// future task asks for "suggest a split based on who wrote what," the
// answer is no, and this comment is why.
//
// PITFALL 3 (doctrine, verbatim): being ON THE WORK and being ON THE
// SPLITS are different facts. Membership grants access; the sheet grants
// ownership. Nothing in this module may be called from a code path that
// merely adds a work member — plan 05's route calls planWriterPromotion()
// only on an explicit, separate writer-promotion action.
//
// REUSE, NOT REWRITE:
//   - evenSplit()            (lib/split-sheets/approval.ts) — already
//     handles the three-decimal rounding a naive 100/n gets wrong.
//   - validateApprovalTotal() (same file) — the exact 100.000% check the
//     server enforces on every split-sheet write; used here as a runtime
//     invariant so a bug in the redraft math fails LOUD, not silently.
//   - LIVING_DRAFT_STATUSES + assertEditable() (lib/split-sheets/
//     lifecycle.ts) — the existing freeze-boundary rule, including the
//     consensus-reset and executed-immutability edge cases a hand-rolled
//     `status === 'draft'` check would drop on the floor.

import { evenSplit, validateApprovalTotal } from '@/lib/split-sheets/approval'
import { assertEditable, LIVING_DRAFT_STATUSES, type SplitSheetStatus } from '@/lib/split-sheets/lifecycle'

// ─── Types ──────────────────────────────────────────────────────────

/** A person identified by collaborator id, user id, or (for a not-yet-connected guest) name only. */
export type PartyIdentity = {
  collaboratorId?: string | null
  userId?: string | null
  name: string
}

/** A living-draft split-sheet party — identity plus the current share. No other field belongs here. */
export type LivingDraftParty = PartyIdentity & {
  splitPercentage: number
}

/** A work member as seen by the catalogue's hygiene layer — note there is no percentage field on this type, ever. */
export type WorkMember = PartyIdentity & {
  /** Has this person actually written on this work (per the diary)? A member who only listens/administers is not a writer. */
  hasContributed: boolean
}

export type SplitRedraftResult =
  | { ok: true; parties: LivingDraftParty[]; changed: boolean }
  | { ok: false; reason: string }

// ─── Identity matching ────────────────────────────────────────────────

/**
 * Two identities match ONLY by a shared, stable id (collaborator id or
 * user id) — never by name alone. A display name can collide between two
 * different humans; matching on it would silently merge them into one
 * party, which is worse than failing to dedupe a genuine re-promotion.
 */
function sameIdentity(a: PartyIdentity, b: PartyIdentity): boolean {
  if (a.collaboratorId && b.collaboratorId) return a.collaboratorId === b.collaboratorId
  if (a.userId && b.userId) return a.userId === b.userId
  return false
}

/**
 * A stable string key for an identity — same shape a caller (plan 09/12)
 * would use to key the splits-nudge "already fired for" set, and reused
 * by lib/catalogue/guiding-line.ts so both modules agree on one identity
 * scheme.
 */
export function identityKey(person: PartyIdentity): string {
  if (person.collaboratorId) return `collaborator:${person.collaboratorId}`
  if (person.userId) return `user:${person.userId}`
  return `name:${person.name}`
}

// ─── The living-draft gate ─────────────────────────────────────────────

/**
 * Refuses a redraft when `status` is outside the living-draft states
 * (draft, countered). Reuses assertEditable() for the two hard blocks it
 * already carries the right words for (executed / esign_pending); for a
 * sheet that assertEditable() would otherwise ALLOW with a consensus
 * reset (pending_approval, approved), this module still refuses — a
 * writer promotion inside My Catalogue only ever touches a sheet that
 * hasn't been sent anywhere yet, per this plan's own behavior contract.
 */
function livingDraftGate(status: SplitSheetStatus): { ok: true } | { ok: false; reason: string } {
  if (LIVING_DRAFT_STATUSES.includes(status)) return { ok: true }

  const edit = assertEditable(status, true)
  if (!edit.ok) return { ok: false, reason: edit.error }

  return {
    ok: false,
    reason:
      'This split sheet is already out for approval — a new writer redrafts it, but only while the sheet is still a living draft. Reset it to draft first.',
  }
}

// ─── Equal-share math ──────────────────────────────────────────────────

/**
 * Builds `n` equal shares that sum to exactly 100.000, per evenSplit()'s
 * own three-decimal rounding. evenSplit(n) alone is not enough when n
 * doesn't divide 100 evenly — evenSplit(3) is 33.333, and three of those
 * total 99.999, not 100 — so any leftover residue is applied to the first
 * share (every share started identical, so "the largest" is a tie; first
 * is the deterministic choice). validateApprovalTotal() below is the
 * proof this always lands exactly on 100.000.
 */
function equalShares(n: number): number[] {
  if (n <= 0) return []
  const each = evenSplit(n)
  const shares = new Array(n).fill(each)
  const sum = Math.round(shares.reduce((acc: number, v: number) => acc + v, 0) * 1000) / 1000
  const residue = Math.round((100 - sum) * 1000) / 1000
  if (residue !== 0) shares[0] = Math.round((shares[0] + residue) * 1000) / 1000
  return shares
}

/** Redrafts `identities` to equal shares, asserting the CAT-Q1a invariant before returning. */
function equalRedraft(identities: PartyIdentity[]): LivingDraftParty[] {
  if (identities.length === 0) return []
  const shares = equalShares(identities.length)
  const parties = identities.map((identity, i) => ({ ...identity, splitPercentage: shares[i] }))

  // Not a business rule — a bug detector. If this ever throws, the math
  // above has drifted from validateApprovalTotal()'s own contract, which
  // is a bug in this module, never in the caller's input.
  if (!validateApprovalTotal(parties.map((p) => p.splitPercentage))) {
    throw new Error('Equal-split redraft did not total 100% — this is a bug in lib/catalogue/splits.ts.')
  }

  return parties
}

// ─── Promotion / removal ───────────────────────────────────────────────

export type PlanWriterPromotionInput = {
  parties: LivingDraftParty[]
  writer: PartyIdentity
  status: SplitSheetStatus
}

/**
 * Promotes `writer` onto the living sheet and redrafts EVERY party
 * (existing and new) to an equal share — the only default this codebase
 * has. Promoting someone already on the sheet is a no-op: no duplicate
 * party, no percentage change, because a re-promotion carries no new
 * information.
 */
export function planWriterPromotion(input: PlanWriterPromotionInput): SplitRedraftResult {
  const gate = livingDraftGate(input.status)
  if (!gate.ok) return { ok: false, reason: gate.reason }

  if (input.parties.some((p) => sameIdentity(p, input.writer))) {
    return { ok: true, parties: input.parties, changed: false }
  }

  const withNewWriter: PartyIdentity[] = [...input.parties, input.writer]
  return { ok: true, parties: equalRedraft(withNewWriter), changed: true }
}

export type PlanWriterRemovalInput = {
  parties: LivingDraftParty[]
  writer: PartyIdentity
  status: SplitSheetStatus
}

/** Removes `writer` from the living sheet and redrafts the remainder to equal shares. */
export function planWriterRemoval(input: PlanWriterRemovalInput): SplitRedraftResult {
  const gate = livingDraftGate(input.status)
  if (!gate.ok) return { ok: false, reason: gate.reason }

  if (!input.parties.some((p) => sameIdentity(p, input.writer))) {
    return { ok: true, parties: input.parties, changed: false }
  }

  const remaining = input.parties.filter((p) => !sameIdentity(p, input.writer))
  return { ok: true, parties: equalRedraft(remaining), changed: true }
}

// ─── Missing writers — people, never numbers ──────────────────────────

/**
 * Returns the work members who have actually contributed (written
 * something, per the diary) and are absent from the split sheet — as
 * PEOPLE, with no percentage field anywhere on the return type. This is
 * what makes the guiding-line nudge (lib/catalogue/guiding-line.ts)
 * structurally incapable of naming a number: it can only ever receive a
 * name to point at, never a split to suggest.
 *
 * A member with `hasContributed: false` (an administrator, a listener, a
 * collaborator who joined but hasn't written anything yet) never appears
 * here — being on the work is not being a writer (Pitfall 3).
 */
export function writersMissingFromSheet(
  members: WorkMember[],
  parties: PartyIdentity[]
): PartyIdentity[] {
  return members
    .filter((m) => m.hasContributed)
    .filter((m) => !parties.some((p) => sameIdentity(p, m)))
    .map(({ collaboratorId, userId, name }) => ({ collaboratorId, userId, name }))
}
