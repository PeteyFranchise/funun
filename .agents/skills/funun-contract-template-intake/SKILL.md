---
name: funun-contract-template-intake
description: Review and reformat blank music contract templates for Funūn while preserving legal substance. Use only for Funūn contract-library, split-sheet, rights, registration, and contract-locker work when working from a Word, DOCX, PDF, or pasted contract draft such as split sheets, work-for-hire agreements, producer agreements, and future contract-locker templates to separate legal language from brandable presentation, design a Funūn-branded structure, add Funūn-specific user-facing field guidance, and prepare a Claude handoff prompt for DocuSeal only after the structure is approved.
---

# Funūn Contract Template Intake

Use this skill to turn a raw contract template into a repeatable Funūn-ready document plan without jumping straight into implementation.

## Scope Lock

Use this skill for Funūn only.

- Assume the target brand, product voice, and workflow are Funūn unless the user explicitly says they want to adapt the workflow into a separate skill for another project.
- Do not generalize recommendations across unrelated brands or products.
- Do not replace `Funūn` with `Funun`.
- If a user brings a non-Funūn project into the same thread, stop using this skill unless they explicitly ask to port the workflow.

## Workflow

1. Read the source contract and extract the full text before making recommendations.
2. Classify each part into:
   - legal substance that should stay neutral unless the user explicitly asks for clause rewriting
   - presentation that can be restructured or branded
   - user guidance that should be added as helper text or completion instructions
3. Produce a short contract audit:
   - what the document is for
   - what information it collects
   - what language is legally operative
   - what feels dated, vague, or poorly structured
4. Produce a Funūn formatting brief:
   - title and subtitle
   - section structure
   - table or form layout
   - helper text for unclear fields
   - brand treatment level
5. Pause for user alignment before drafting document-edit instructions or DocuSeal setup guidance.
6. Only after the structure is approved, create a Claude handoff prompt for DocuSeal template setup.

## Default Output Shape

Unless the user asks for something else, return these sections:

- `Contract Audit`
- `Keep Neutral`
- `Can Be Branded`
- `Field Guidance`
- `Funūn Formatting Brief`
- `Claude Handoff Prompt` only after approval

## Guardrails

- Do not present legal advice as legal certainty.
- Do not rewrite operative clauses unless the user asks for a deeper language pass.
- Prefer clean form structure over decorative styling.
- Keep branding restrained on contracts: typography, hierarchy, helper text, and light accent treatment beat flashy visuals.
- Use `Funūn` with the macron in user-facing document recommendations.
- Keep recommendations aligned to Funūn's artist workflow, release-readiness context, and future contract locker.

## Funūn-Specific Defaults

- Read [references/funun-contract-formatting.md](references/funun-contract-formatting.md) for brand and field defaults.
- Read [references/contract-intake-rubric.md](references/contract-intake-rubric.md) when evaluating what should stay legal-neutral versus what can change.

## DocuSeal Handoff Rule

Do not create the DocuSeal setup prompt until the user explicitly says the structure is ready. When asked, the prompt should tell Claude to:

- preserve the approved contract structure
- keep secrets out of output
- map signer blocks carefully into DocuSeal roles/fields
- avoid unapproved clause rewrites
- report any fields that still need human/legal decisions
