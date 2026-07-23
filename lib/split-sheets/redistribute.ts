// ─── Split percentage redistribution ─────────────────────────────────
// P18-07 (add-and-redistribute): adding a fourth writer to a 50/30/20
// sheet must never force retyping the first three, and removing a party
// must never leave the artist to manually re-balance what's left. This
// module is the single, pure (no I/O) place that math happens.
//
// THE HARD CONTRACT: validateApprovalTotal() (lib/split-sheets/approval.ts)
// accepts every output of redistribute() — the server's 100.000% gate in
// both POST and PATCH /api/split-sheets* rejects anything else, so a
// redistribution helper that produces 99.999 turns the feature into a bug
// generator. Every branch below rounds to three decimal places and applies
// any leftover residue to the single largest share so the sum is always
// exactly 100.000.
//
// A zero-valued entry is read as "a party with no prior weight" — the
// party just being added. This lets callers express BOTH "add a party"
// (append a 0 placeholder to the existing splits, call in 'proportional'
// or 'even' mode) and "remove a party" (drop the removed party's entry,
// call redistribute on what's left) through the SAME function, rather
// than two separate ones.

import { evenSplit } from './approval'

export type RedistributeMode = 'even' | 'proportional'

/** Rounds to three decimal places (the project's established split precision). */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/**
 * Builds an array of `n` equal shares (evenSplit(n) each) that sums to
 * exactly 100.000, applying any rounding residue to the first entry
 * (all entries are equal, so "the largest" is a tie — first is the
 * deterministic choice).
 */
function evenDistribution(n: number): number[] {
  if (n <= 0) return []
  const each = evenSplit(n)
  const arr = new Array(n).fill(each)
  return applyResidue(arr)
}

/**
 * Corrects rounding drift so `arr` sums to exactly 100.000: computes the
 * residue between 100.000 and the rounded sum, then applies it to the
 * single largest share (first occurrence on a tie).
 */
function applyResidue(arr: number[]): number[] {
  if (arr.length === 0) return arr
  const rounded = arr.map(round3)
  const sum = round3(rounded.reduce((acc, v) => acc + v, 0))
  const residue = round3(100 - sum)
  if (residue === 0) return rounded

  let largestIndex = 0
  for (let i = 1; i < rounded.length; i++) {
    if (rounded[i] > rounded[largestIndex]) largestIndex = i
  }
  rounded[largestIndex] = round3(rounded[largestIndex] + residue)
  return rounded
}

/**
 * Redistributes `splits` (one entry per party, in party order) so the
 * result totals exactly 100.000, per `mode`:
 *
 * - 'even': every party (existing or new) receives an equal evenSplit(n)
 *   share — prior weights are ignored entirely.
 * - 'proportional': a zero-valued entry (a party with no prior weight —
 *   the one just added) receives an even 1/n share of the total; every
 *   nonzero entry keeps its relative weight against the other nonzero
 *   entries, scaled to fill whatever remains after the new parties' even
 *   shares are set aside. A 50/30/20 set gaining a fourth (zero-valued)
 *   party scales the first three down while preserving their 5:3:2 ratio
 *   and gives the fourth an even 25% share. Removing a party is the same
 *   operation in reverse: pass the remaining (all-nonzero) splits and the
 *   freed percentage is redistributed among them, ratio preserved.
 * - A zero-total input (every entry zero, or empty) returns an even
 *   distribution rather than dividing by zero.
 */
export function redistribute(splits: number[], mode: RedistributeMode): number[] {
  const n = splits.length
  if (n === 0) return []

  if (mode === 'even') {
    return evenDistribution(n)
  }

  // mode === 'proportional'
  const weightedTotal = splits.reduce((acc, v) => acc + (v > 0 ? v : 0), 0)
  if (weightedTotal <= 0) {
    // No existing weight to preserve — nothing to scale against.
    return evenDistribution(n)
  }

  const unweightedCount = splits.filter(v => v <= 0).length
  const unweightedShare = unweightedCount > 0 ? evenSplit(n) : 0
  const remaining = 100 - unweightedShare * unweightedCount

  const result = splits.map(v => {
    if (v <= 0) return unweightedShare
    return (v / weightedTotal) * remaining
  })

  return applyResidue(result)
}
