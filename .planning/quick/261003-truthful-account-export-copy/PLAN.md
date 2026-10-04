# Quick Task 261003: Truthful Account-Export Marketing Copy

## Objective

Replace the public homepage's full-account-export promise with copy that describes the narrow
project and metadata exports available today, while preserving Phase 49 as the planned secure
full-account export capability.

## Scope

- Update the frozen marketing source FAQ answer.
- Advance the frozen-source hash without changing the line-count invariant.
- Regenerate and verify the tracked marketing artifact and manifest.
- Update Phase 49's roadmap status and sequencing so it reflects the truthful interim copy.
- Do not implement Phase 49, alter export routes, or change unrelated marketing copy.

## Files Expected to Change

- `private/bench/marketing.html` (gitignored source of truth)
- `private/bench/baseline/FROZEN.sha256` (gitignored local baseline)
- `scripts/marketing-assets.ts`
- `assets/marketing/landing.html`
- `assets/marketing/manifest.json`
- `.planning/ROADMAP.md`
- `.planning/quick/261003-truthful-account-export-copy/SUMMARY.md`

## Validation Plan

- Confirm the old full-account promise is absent from source and artifact.
- Confirm the new narrow-export and planned-full-export sentences each occur once in both.
- Run `npm run marketing:assets`, `npm run marketing:build`, and `npm run marketing:verify`.
- Run targeted marketing artifact and root-route tests.
- Run strict TypeScript and lint if the generated artifact pipeline changes executable output.
- Confirm Phase 49 remains present with its full requirements intact.

## Risks and Coordination Notes

- The marketing source is deliberately frozen; update its hash and generated artifact together.
- The source and local baseline are gitignored, so the tracked generated artifact and freeze
  constant must remain sufficient to reproduce and verify the shipped page in this workspace.
- Existing untracked review and todo files belong to prior work and must not be modified.
- Phase 49 is security-sensitive and remains future work; this task changes only the claim.
