## What Changed

Created a Funūn-specific skills inventory doc for SOP/training use and documented the currently relevant skills, their purposes, and copy/paste example prompts.

Added a repo-local Funūn Codex skill, `funun-skills-inventory-updater`, whose explicit job is to keep the inventory current whenever a Funūn-specific Codex skill is created or materially changed.

Added a second repo-local Funūn Codex skill, `funun-codex-skill-publisher`, whose job is to move or mirror shared Funūn Codex skills into `.agents/skills` and keep the repo copy as the collaboration source of truth.

## Validation Run

- Confirmed the new inventory file exists
- Confirmed referenced skill paths exist
- Confirmed planning artifact was created alongside the doc

## Remaining Risks / Follow-Ups

- The inventory should be updated whenever new Funūn-specific skills are added
- Some supporting skills are bundled/system skills and may evolve over time; prompts should be refreshed if their workflows change materially
