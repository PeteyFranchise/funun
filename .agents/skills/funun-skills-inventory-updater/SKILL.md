---
name: funun-skills-inventory-updater
description: Keep Funūn's Codex skills inventory current. Use when a new Funūn-specific Codex skill is created, an existing Funūn Codex skill changes scope, prompts, or usage guidance, or the SOP/training inventory in docs/funun-skills-inventory.md needs to be updated so future employees have accurate explanations and copy/paste prompts. This skill is for Codex-managed skills only and should not be used to track or rewrite Claude-specific skills or Claude-only workflows.
---

# Funūn Skills Inventory Updater

Use this skill whenever Funūn gains, removes, renames, or materially changes a Codex skill.

## Goal

Keep `docs/funun-skills-inventory.md` accurate as the single SOP-friendly index of Funūn-related Codex skills.

## Required Updates

When a Funūn-specific Codex skill is added or changed:

1. Update `docs/funun-skills-inventory.md`.
2. Add or revise:
   - purpose
   - scope
   - best-for or when-to-use guidance
   - skill path
   - copy/paste example prompts
3. If the skill is Funūn-only, say that explicitly.
4. If the skill is a supporting non-Funūn-exclusive Codex skill, keep it in the supporting-skills section rather than the Funūn-specific section.
5. Do not use this skill to catalog Claude-only slash commands, Claude-only project skills, or Claude-specific internal workflows unless the inventory explicitly needs to mention them as external dependencies.
6. For collaboration-targeted Funūn skills, prefer the repo-owned copy under `.agents/skills` instead of a personal-only path.

## What Counts As A Material Change

Update the inventory if any of these change:

- skill name
- intended scope
- default prompts
- primary workflow
- where the skill lives
- whether it is safe for SOP reuse

## Output Standard

Keep entries readable by non-engineers. Prefer short plain-English bullets over technical detail dumps.

Example prompt entries should be:

- copy/paste friendly
- specific to Funūn
- realistic for how staff will actually ask for help

## Guardrails

- Do not invent skills that do not exist.
- Do not describe speculative future automation as if it already exists.
- Keep `Funūn` spelled with the macron in user-facing examples.
- Keep this skill scoped to the inventory file, not general contract or product implementation work.
- Keep this skill scoped to Codex skill inventory maintenance, not Claude skill maintenance.
