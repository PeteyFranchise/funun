---
quick_id: 260910-buyer-rights-two-states
created: 2026-09-10
type: quick
autonomous: true
files_modified:
  - app/help/page.tsx
  - components/buyer/CatalogBrowserLight.tsx
  - .planning/deliberations/sync-catalogue-entry-and-samples.md
---

# Buyer-facing rights states: three to two

## Why

Owner decisions 2026-09-09, recorded in
`.planning/deliberations/sync-catalogue-entry-and-samples.md`. **Read that first.**

The sync catalogue is an UNLOCK-then-ADMIT gate, not a labelled browse. A song reaches a
buyer only after (a) the artist completes six requirements — split sheets, copyright,
producer agreements, audio files, metadata, cover art — (b) EVERY owner authorizes
licensing, and (c) a Funūn team member admits it to The Crate.

Given (a) and (b), `rightsBadge()` cannot return `partial` for anything a buyer sees:
`requiredComplete === 0` is gated out, and "some but not all required docs" is gated out.
The only reachable buyer states are `ready` and `contact` (the latter only via
`sampleBlock`).

**So `partial` is UNREACHABLE for buyers, not wrong.** Do not delete it — stop the buyer
surfaces advertising it.

## DO NOT CHANGE

`rightsBadge()` in `lib/sync-library/gate.ts`, `RIGHTS_BADGE_TO_CATALOG_RIGHTS`,
`catalogRightsFromStage3()` in `lib/deals/catalog.ts`, or the `CatalogRightsCode` union.
All three states stay in the engine: **staff** Crate surfaces (30-08
`READINESS_STATUS_LABEL`, `needs_completion` / `pending_admit`) legitimately need
`partial` when reviewing an unadmitted submission.

## Task 1 — `app/help/page.tsx`

The `BADGES` array publishes three definitions to buyers.

- Remove the `part` / 'Partial rights' entry.
- Rewrite the `req` entry to describe what it now means: a track containing a sample that
  needs clearing.
- **It must NOT promise any timeline.** The deliberation records that an assistant invented
  "typically 4-8 weeks" and the owner nearly adopted it. Sample clearance routinely takes
  months and often fails outright.
- Include the forward path: the owner's insight is that an uncleerable track is a demand
  signal, not a dead end — the buyer's route may be a commissioned original built to the
  same brief, not a clearance.
- Keep the existing voice: confident, casual, insider. Not corporate.

## Task 2 — `components/buyer/CatalogBrowserLight.tsx`

- `FILTER_OPTIONS.Rights` offers `['Rights ready', 'Partial', 'Contact required']`. Drop
  `'Partial'` — no buyer-visible track can carry it and an always-empty filter looks broken.
- `RIGHTS_LABEL` and `RIGHTS_FILTER_LABEL` are `Record<CatalogRights, string>`: **keep all
  three keys** so the maps stay exhaustive and nothing throws on a legacy row. Do not narrow
  the union.
- Comment at each site explaining why `part` is retained but not offered, pointing at the
  deliberation.
- Check for any other rendering of the Partial option in this component (legend, chip list,
  count) and handle it.

## Task 3 — repo sweep

Grep for other **buyer-facing** renderings of 'Partial rights' / 'Partial' as a rights
state. Fix what you find. **Leave STAFF surfaces alone.** Report which files you checked and
which you deliberately left, with the reason.

## Tests

1. The help page no longer publishes a Partial-rights definition.
2. The buyer filter does not offer Partial.
3. `RIGHTS_LABEL` still has all three keys (maps stay exhaustive).
4. **Drift guard: `rightsBadge()` is UNCHANGED.** On reading "two states" the temptation is
   to delete the third from the engine and break staff review. Mutation-test this one.

## Also update the deliberation

`.planning/deliberations/sync-catalogue-entry-and-samples.md`, two corrections:

1. It says the tri-state is not computed. **That is WRONG** — `rightsBadge()` has computed
   it since Phase 30-01. Correct it, and note the owner's decisions were partly made on that
   wrong premise but survive it: the entry gate makes `partial` unreachable rather than
   incorrect.
2. It conflates unlocking with listing. Record the owner's clarification that it is **three**
   steps: artist unlocks eligibility by completing sync requirements → artist submits → a
   Funūn team member admits to The Crate. Add the owner's point that a Funūn invite gives the
   artist a concrete reason to finish the gate quickly, because a named opportunity is
   waiting rather than an abstract checklist.

## Constraints

- Never `git add -A`. Stage only files you change, by explicit path. Another agent has ~27
  uncommitted Playbook files here — leave them alone.
- Do not touch `lib/playbook/`, `components/playbook/`, `app/api/admin/playbook/`, or
  `supabase/migrations/`. No migration or schema change is implied.
- Check for a dev server (`lsof -iTCP:3000 -sTCP:LISTEN -n -P`, `pgrep -fl "next dev"`)
  before building. If nothing is listening you MAY and SHOULD run `npm run build` — a
  client/server boundary break earlier today passed `tsc --noEmit` and a full green suite and
  still failed the production build.
- `npx tsc --noEmit` and `npx jest` must both be clean.
- **Do not push.** The orchestrator handles that.
