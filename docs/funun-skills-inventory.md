# Funūn Skills Inventory

This file tracks the Codex skills currently relevant to Funūn work so future team members can reuse them consistently.

Use this as an SOP reference for Codex workflows, not as a legal or engineering source of truth by itself. The skills help structure work; they do not replace human review.

## How To Use This File

- Use the `Purpose` line to understand what the skill is for.
- Use the `When to use it` line to decide whether the skill fits the task.
- Copy one of the example prompts and adapt it to the specific document or feature you are working on.
- Keep this file updated whenever a new Funūn-specific Codex skill is added or a workflow changes materially.
- Treat this as a Codex skill inventory. Do not mix in Claude-only skills unless they are being referenced only as adjacent tooling context.

## Skill Index

### `$funun-contract-template-intake`

- Purpose: Review blank music contract templates for Funūn, separate legal substance from brandable presentation, recommend user-facing helper text, and prepare a Claude DocuSeal handoff prompt only after the structure is approved.
- Scope: Funūn only. This skill should not be reused as a generic contract formatter for other brands or projects.
- Best for:
  - split sheets
  - work-for-hire templates
  - producer agreements
  - future contract-locker templates
- Skill path: `/Users/peterzora/Desktop/funun/.agents/skills/funun-contract-template-intake`
- Key outputs:
  - contract audit
  - keep-neutral vs can-be-branded breakdown
  - field guidance
  - Funūn formatting brief
  - Claude DocuSeal handoff prompt after approval
- Example prompts:
  - `Use $funun-contract-template-intake to review this blank split sheet for Funūn, tell me what should stay legally neutral, what can be branded, and what helper text artists will need.`
  - `Use $funun-contract-template-intake to turn this work-for-hire contract into a Funūn-ready formatting brief, but do not create the DocuSeal handoff prompt until I approve the structure.`
  - `Use $funun-contract-template-intake to review this producer agreement for the future contract locker and recommend fallback field guidance for unsigned or self-releasing artists.`

### `funun-skills-inventory-updater`

- Purpose: Keep this inventory file current whenever a Funūn-specific Codex skill is added, renamed, relocated, or materially changed.
- Scope: Funūn only. This is a Codex SOP-maintenance skill for `docs/funun-skills-inventory.md`.
- Best for:
  - adding new Funūn-specific Codex skills to the inventory
  - updating purpose/scope/prompt examples when a Codex skill changes
  - keeping future employee training material current
- Skill path: `/Users/peterzora/Desktop/funun/.agents/skills/funun-skills-inventory-updater`
- Key outputs:
  - updated inventory entries
  - refreshed copy/paste prompts
  - corrected scope and usage guidance
- Example prompts:
  - `Use funun-skills-inventory-updater to add this new Funūn-specific skill to the skills inventory with purpose, scope, and example prompts.`
  - `Use funun-skills-inventory-updater to update the inventory entry for this skill because its workflow and prompt guidance changed.`

### `funun-codex-skill-publisher`

- Purpose: Push shared Funūn Codex skills into the Funūn repo under `.agents/skills` so collaborators use the same project-owned copy.
- Scope: Funūn only. This is for Codex skill collaboration and repo ownership, not for Claude skill publishing.
- Best for:
  - moving a personal Funūn skill into the repo
  - publishing updates to a shared repo-local Funūn skill
  - ensuring the inventory points at the collaborative repo copy
- Skill path: `/Users/peterzora/Desktop/funun/.agents/skills/funun-codex-skill-publisher`
- Key outputs:
  - repo-local shared skill copy
  - updated skill inventory entry
  - clearer collaboration path for future teammates
- Example prompts:
  - `Use funun-codex-skill-publisher to publish this new Funūn Codex skill into the repo and update the inventory to the repo-owned path.`
  - `Use funun-codex-skill-publisher to mirror this personal Funūn skill into .agents/skills so the team can collaborate on it.`

### `spike-findings-funun`

- Purpose: Provide implementation guidance from the verified Buffer integration spikes already completed for Funūn.
- Scope: Project-specific implementation skill for Buffer/social publishing work in Funūn.
- Best for:
  - Buffer BYOK auth
  - calendar-to-post mapping
  - connect/push UX decisions
  - status sync behavior
- Skill path: `/Users/peterzora/Desktop/funun/.agents/skills/spike-findings-funun`
- Example prompts:
  - `Use the spike-findings-funun skill to implement the next Buffer connection step for Funūn without redoing the research from scratch.`
  - `Use spike-findings-funun to check whether this Buffer posting flow matches the verified Funūn spike conclusions before we build it.`

## Supporting Skills Commonly Used In Funūn Work

These are not Funūn-exclusive, but they are frequently useful in Funūn Codex tasks and are worth teaching in SOPs.

### `gsd-codex`

- Purpose: Keep Codex work aligned with Funūn's GSD planning workflow.
- When to use it:
  - before repo edits
  - when deciding whether to use phase plans or quick-plan fallback
  - when coordinating with Claude work already in progress
- Example prompts:
  - `Use gsd-codex to determine the correct planning path before editing this Funūn feature.`
  - `Use gsd-codex to prepare a quick-plan fallback for this small Funūn doc update.`

### `docuseal-code`

- Purpose: Reference DocuSeal embed, REST API, webhook, and integration details while building Funūn e-sign flows.
- When to use it:
  - when wiring split-sheet signing
  - when implementing DocuSeal webhooks
  - when preparing DocuSeal embed or template decisions
- Example prompts:
  - `Use docuseal-code to confirm the correct webhook and embed pattern for Funūn's split-sheet signing flow.`
  - `Use docuseal-code to map this approved contract structure into a DocuSeal-ready implementation plan.`

### `docuseal-cli`

- Purpose: Run DocuSeal CLI operations from the terminal when credentials and the CLI are available.
- When to use it:
  - when listing templates or submissions
  - when creating or inspecting DocuSeal resources from the shell
  - when validating DocuSeal behavior in a controlled CLI workflow
- Example prompts:
  - `Use docuseal-cli to list available DocuSeal templates for the Funūn e-sign account.`
  - `Use docuseal-cli to inspect recent submissions related to Funūn split-sheet signing.`

### `documents`

- Purpose: Create, edit, render, and visually verify Word-style documents.
- When to use it:
  - when editing contract templates
  - when polishing branded document formatting
  - when exporting DOCX artifacts for internal review
- Example prompts:
  - `Use documents to reformat this split-sheet draft into a polished Funūn-branded DOCX and visually QA it.`
  - `Use documents to update the body formatting of this contract while preserving its legal text.`

### `template-creator`

- Purpose: Turn a refined document into a reusable personal template skill for future reuse.
- When to use it:
  - after a contract format is stable
  - when the team wants a reusable starting point for future contracts
- Example prompts:
  - `Use template-creator to turn this finished Funūn split-sheet DOCX into a reusable personal template.`
  - `Use template-creator to package this contract-locker template for future reuse.`

## Suggested Team Workflow

For a new contract template:

1. Start with `$funun-contract-template-intake`.
2. Approve the structure, field guidance, and branding level.
3. Use `documents` to create or refine the polished DOCX.
4. Use `docuseal-code` when translating the approved structure into DocuSeal.
5. Once stable, use `template-creator` if the document should become a reusable template.

For Buffer or social-posting work:

1. Start with `spike-findings-funun`.
2. Confirm the proposed implementation matches the verified spike findings.
3. Only then move into repo changes.

For a new shared Funūn Codex skill:

1. Draft or create the skill.
2. Use `funun-codex-skill-publisher` to place or update the shared repo copy under `.agents/skills`.
3. Use `funun-skills-inventory-updater` in the same pass so the inventory stays current.
4. Treat the repo copy as canonical for collaboration.

## Maintenance Notes

- Add every new Funūn-specific Codex skill here.
- Prefer `.agents/skills` for any Funūn Codex skill that should be shared with collaborators.
- When a new Funūn-specific Codex skill is created, use `funun-skills-inventory-updater` in the same pass so the inventory stays current.
- When a new Funūn-specific Codex skill should be collaborative, use `funun-codex-skill-publisher` in the same pass so the repo owns the shared copy.
- If a skill is retired or replaced, note that change clearly rather than silently deleting history.
- Keep prompts copy/paste-friendly.
- Keep `Funūn` spelled with the macron in user-facing examples.
- Keep Claude-only skills and workflows out of this file unless they are mentioned strictly as adjacent context.
