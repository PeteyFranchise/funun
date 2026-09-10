// ─── hireCreditsOf — the ONE definition of "a hired collaborator" ────────
// Extracted from computeStage3()'s section 3 (lib/vault/stage3.ts) on
// 2026-09-10 so the
// readiness engine can reuse it rather than grow a second, drifting copy.
// It lives in its OWN module, not in stage3.ts, so the readiness engine does
// not have to depend on the Stage 3 requirement builder (and so a test that
// mocks stage3.ts does not accidentally blank out the readiness engine's
// hire derivation).
// EXTRACTION ONLY — the rule, the trimming, the skip-on-blank and the
// role wording are byte-identical to what section 3 has always done, and
// section 3 now calls this instead of inlining it.
//
// Why lib/vault/readiness.ts needs it: the `hire_right` readiness item read
// 'missing' whenever a project had ZERO producer agreements, which is the
// correct state for a project that HIRED someone and never papered it — and
// the wrong state for a self-produced recording that hired nobody, where no
// agreement is required at all. Telling those two apart needs exactly this
// derivation, and there must not be two answers to "who was hired on this
// song" in one codebase.
export type HireCreditSource = {
  producers?: string[] | null
  mixing_engineer?: string | null
  mastering_engineer?: string | null
}

export type HireCredit = { name: string; role: string }

/**
 * The hired collaborators credited on ONE track — producers, then the mixing
 * engineer, then the mastering engineer. Blank/whitespace names are skipped
 * (never a hire). Order is significant: computeStage3() groups by name and
 * keeps the FIRST role it sees for a person credited in several places.
 */
export function hireCreditsOf(track: HireCreditSource): HireCredit[] {
  const credits: HireCredit[] = []
  for (const p of track.producers ?? []) {
    const n = (p ?? '').trim()
    if (n) credits.push({ name: n, role: 'Producer' })
  }
  const mix = (track.mixing_engineer ?? '').trim()
  if (mix) credits.push({ name: mix, role: 'Mixing engineer' })
  const master = (track.mastering_engineer ?? '').trim()
  if (master) credits.push({ name: master, role: 'Mastering engineer' })
  return credits
}
