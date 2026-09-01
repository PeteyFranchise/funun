# Funūn Repository Audit Skill

## Objective

Add a shared, repository-local Codex skill for evidence-based Funūn security and architecture audits, document its trigger and usage, and make the project instructions route audit requests to it.

## Scope

- Create `.agents/skills/funun-repo-audit/` with a concise `SKILL.md`, UI metadata, an audit checklist, and a report template.
- Add the skill to the `AGENTS.md` project-skills section with a read-only audit trigger.
- Update `docs/funun-skills-inventory.md` with purpose, scope, usage guidance, outputs, and copy/paste prompts.
- Do not audit or remediate application code as part of this task.

## Files Expected To Change

- `.agents/skills/funun-repo-audit/SKILL.md`
- `.agents/skills/funun-repo-audit/agents/openai.yaml`
- `.agents/skills/funun-repo-audit/references/audit-checklist.md`
- `.agents/skills/funun-repo-audit/references/report-template.md`
- `AGENTS.md`
- `docs/funun-skills-inventory.md`
- `.planning/quick/260830-funun-repo-audit-skill/SUMMARY.md`

## Validation

- Run the skill-creator `quick_validate.py` validator.
- Inspect the generated UI metadata and references.
- Confirm the inventory and `AGENTS.md` point to the repo-owned skill.
- Run Markdown/repository checks that are relevant and available without starting a server or build.
- Confirm unrelated dirty and untracked files remain untouched.

## Risks And Coordination

- `AGENTS.md` contains generated GSD sections; keep the addition within the existing project-skills block so the instruction remains discoverable.
- Preserve existing untracked phase work and `app/email-preview/`.
- Keep audit execution read-only by default and separate findings from remediation authorization.
