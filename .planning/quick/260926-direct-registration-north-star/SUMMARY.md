# Summary — Direct registration, publishing and distribution north star

**Completed:** 2026-09-26

## Outcome

Recorded the owner's approved long-term direction that Funūn should minimize avoidable middlemen
and develop three separate operating capabilities:

1. publisher/publishing administrator for works it represents;
2. authorized registration service for works it does not publish; and
3. music distributor for authorized masters and releases.

The documentation consistently treats these as planned roles rather than shipped capabilities and
keeps publishing, administration, registration, master/distribution, collection and payout
authority legally and technically separate.

## Changes

- Added the canonical doctrine at
  `.planning/deliberations/direct-rights-registration-publishing-distribution-doctrine.md`.
- Added the north star, sequencing, gates and mandatory future data-design rules to
  `.planning/ROADMAP.md` and `.planning/PROJECT.md`.
- Added Song Passport doctrine SP-26 so the canonical record supports direct rails without
  inventing authority.
- Expanded the Path B todo into an actionable business/legal/product/engineering/pilot track,
  including MusicMark as the first direct North American candidate to evaluate—not a chosen or
  active integration.
- Reconciled `docs/cwr-plan.md` with the approved destination: registration-only is the intended
  first user-facing service, while publishing administration remains a later approved capability.
- Corrected the adjacent PRO-identity todo's imprecise “CISAC-affiliated publisher” shortcut.
- Reclassified the Funūn-owned distributor todo from a strategic option to an owner-approved,
  evidence-gated direction and linked the partner-evaluation track to the new doctrine.
- Added concise doctrine pointers outside managed blocks in `AGENTS.md` and
  `.claude/CLAUDE.md`, giving Codex and Claude the same instruction for future relevant work.

## Important decisions preserved

- Direct-first does not mean vendor-free: a partner is acceptable when it provides necessary
  access, reliability or a responsible transition.
- Canonical data, authority, snapshots, acknowledgements and history stay in Funūn; partner IDs
  remain mappings.
- No PRO, distributor or banking credentials are collected for portal automation.
- “One click” is not claimed until prepared, submitted, received, accepted/changed, registered,
  conflict/rejection and correction/revocation states are actually supported.
- The long-term goal does not justify collecting every rights field at signup; collection remains
  progressive, purpose-explained and least-privilege.
- Owner approval does not authorize an agent to contact recipients, apply for programs, accept
  terms or submit member data.

## Verification

- Re-checked current official MusicMark, CISAC and DDEX materials before recording external-path
  assumptions; references and a re-verification warning are in the doctrine and Path B todo.
- `git diff --check` passed.
- Trailing-whitespace scan passed across every changed/new planning document.
- All internal file references introduced by this change resolve.
- Both `AGENTS.md` and `.claude/CLAUDE.md` contain the doctrine pointer while retaining their
  unrelated existing instructions.
- No application code, schema, migration, configuration, production data or external service was
  changed.
- No application tests were run because this was a documentation-only task.

## Workflow note

Used the manual `/gsd-quick` fallback because this Codex surface does not expose a native GSD quick
command. The plan was created before repository documentation edits and this summary closes the
task.
