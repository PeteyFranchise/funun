# Funūn Phase Review Skill

## Objective

Create a reusable, repository-owned Codex skill that performs an evidence-based post-execution review of any Funūn phase and returns a single copy/paste-ready report for Claude.

## Scope

- Add `.agents/skills/funun-phase-review/` with the skill instructions, UI metadata, and report template.
- Keep every review read-only by default.
- Require comparison against the selected phase's plans, context, requirements, implementation, migrations, security boundaries, accessibility expectations, and verification evidence.
- Produce explicit go/no-go decisions for merge, migration, deployment, and phase closeout.
- Update the Funūn skills inventory with usage guidance and example prompts.

## Files Expected To Change

- `.agents/skills/funun-phase-review/SKILL.md`
- `.agents/skills/funun-phase-review/agents/openai.yaml`
- `.agents/skills/funun-phase-review/references/report-template.md`
- `docs/funun-skills-inventory.md`
- `.planning/quick/260913-funun-phase-review-skill/PLAN.md`
- `.planning/quick/260913-funun-phase-review-skill/SUMMARY.md`

## Validation Plan

- Run the skill-creator `quick_validate.py` validator.
- Inspect the generated file set and metadata.
- Run `git diff --check` on only this task's paths.
- Confirm unrelated worktree changes remain untouched.

## Risks And Coordination Notes

- `.planning/ROADMAP.md` already contains unrelated user or collaborator changes and must not be edited.
- The skill must not run migrations, deploy, commit, push, or modify reviewed code unless the user gives a separate implementation instruction.
- Production state and human UAT must be reported as unverified unless directly observed through separately authorized checks.
