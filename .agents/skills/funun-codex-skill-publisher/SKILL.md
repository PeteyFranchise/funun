---
name: funun-codex-skill-publisher
description: Publish new or updated Funūn Codex skills into the Funūn repository for collaboration. Use when a Funūn-specific Codex skill was first created in a personal Codex skills folder, was drafted outside the repo, or was materially updated and needs its shared repo copy under .agents/skills plus an inventory update in docs/funun-skills-inventory.md.
---

# Funūn Codex Skill Publisher

Use this skill to make a Funūn Codex skill collaborative by ensuring the repo owns the shared copy.

## Goal

For every Funūn-specific Codex skill that should be reusable by collaborators:

1. Make sure the skill exists under `.agents/skills/<skill-name>/`
2. Bring along any required `references/`, `scripts/`, `assets/`, or `agents/` files
3. Update `docs/funun-skills-inventory.md`
4. Keep the repo version treated as the canonical collaboration copy

## When To Use It

Use this skill when:

- a Funūn skill was first created under `~/.codex/skills`
- a Funūn skill exists only in a personal Codex location
- a repo-local Funūn skill changed and collaborators need the updated version
- a new Funūn skill should be documented for SOP/training use

## Required Workflow

1. Check whether the skill already exists under `.agents/skills`.
2. If not, copy or recreate the skill there with the same behavior and supporting files.
3. If both personal and repo copies exist, treat the repo copy as canonical for collaboration and update it intentionally.
4. Update `docs/funun-skills-inventory.md` with:
   - purpose
   - scope
   - skill path
   - example prompts
5. If inventory maintenance guidance changed, update the `funun-skills-inventory-updater` expectations too.

## Guardrails

- Use this for Funūn Codex skills only.
- Do not treat Claude-specific skills as candidates for repo publishing unless the user explicitly wants a Codex version created.
- Do not silently leave the only usable copy in `~/.codex/skills` if the skill is meant for team collaboration.
- Prefer repo-local `.agents/skills` ownership for all shared Funūn Codex skills.
