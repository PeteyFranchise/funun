# Deliberation — Buyer-Catalogue Inclusion Model (which Sound Vault songs reach buyers)

**Status:** OPEN — needs a product decision + a workflow before the buyer catalogue pulls from live data
**Opened:** 2026-08-04 (owner, during the buyer-catalogue light redesign)
**Blocks:** the buyer-catalogue "make it real" step (live-data wiring, slice 1.5) — see `lib/deals/catalog-sample.ts`
**Related:** `lib/deals/catalog.ts` (`isRightsReady`, `CATALOG_READINESS_THRESHOLD`), Phase 16 CONTEXT D-16, the tri-state rights badge (Rights ready / Partial / Contact required)

---

## The question

Songs in the buyer catalogue will eventually come from **within users' Sound Vaults** — that much is settled. What is **not** settled: **does every song make it to the buyer catalogue, and by what process?** We need to design both the **criteria** and the **workflow** for catalogue inclusion before wiring the catalogue to live data.

## What exists today (the beta placeholder, not the decision)

`lib/deals/catalog.ts` → `isRightsReady(project, stage3)` currently gates catalogue visibility on a single computed condition:

- `project.is_public === true`, **AND**
- `project.vault_readiness_score >= CATALOG_READINESS_THRESHOLD` (currently **60**, deliberately tunable in one place), **AND**
- `computeStage3().canContinue`

So today, catalogue membership is a **side effect of readiness + public visibility** — there is no explicit "list this for licensing" action, no submission, no curation, and no per-song owner control beyond making the project public. This was a reasonable beta placeholder; it is **not** a considered inclusion model.

## Open sub-decisions (to resolve before slice 1.5)

1. **Automatic vs opt-in.** Do all rights-ready songs auto-appear in the buyer catalogue, or must an artist explicitly **opt a song in** ("List for sync licensing")? Auto = maximum supply, zero friction, but artists may not want every readiness-passing demo shown to buyers. Opt-in = artist control, but smaller catalogue and another step.
2. **Curation / quality bar.** Is there a Funūn-side **review/approval** step (curated catalogue) or is it fully self-serve? Curation raises buyer trust and catalogue quality but adds operational load and gatekeeping.
3. **What the tri-state rights actually mean.** The design shows **Rights ready / Partial rights / Contact required** — but the live model only computes a binary rights-ready. What real conditions map to *Partial* (e.g. some splits unsigned, a sample uncleared, no pre-cleared terms) and *Contact required* (e.g. rights unknown, exclusive elsewhere)? This needs a real definition tied to the split-sheet / readiness / pre-cleared-terms data.
4. **Relationship to pre-cleared terms (16-04).** Should a song only be *licensable-in-catalogue* once the artist has set pre-cleared terms, or can it be *browsable* (discoverable) before terms exist, with "Contact required"? Browsable-without-terms grows the catalogue; licensable-only-with-terms keeps every listing actionable.
5. **Data model.** Any answer beyond "readiness side effect" likely needs an explicit catalogue-status concept (e.g. a `catalog_listing` state per project/track: not-listed / listed / partial / contact) rather than deriving membership purely from `is_public + readiness`. Decide this before the schema hardens.
6. **Granularity.** Project-level or track-level listing? A project may have some rights-ready tracks and some not.
7. **Removal / revocation.** How an artist pulls a song from the catalogue, and what happens to in-flight buyer interest when they do.

## Why it matters

Inclusion policy is load-bearing for **catalogue quality** (what buyers trust), **artist control** (whether their unfinished/private work is exposed), **supply** (how much catalogue exists at launch), and the **data model** (a real listing state vs a readiness side effect). Getting it wrong in either direction — too open (junk catalogue, artist trust breach) or too closed (empty catalogue) — hurts the GTM.

## Decision on sequencing (owner, 2026-08-04)

- Build the buyer-catalogue **experience** first (light browse, working filters, audio player, License request modal — slices 2a/2b) over a representative fixture.
- **Defer** the inclusion model + live-data wiring (slice 1.5) until this deliberation is resolved.
- When the time comes to make the catalogue pull real songs, resolve the sub-decisions above **first**, then implement `isRightsReady` (or its successor) + the enriched query + any `catalog_listing` schema to match.
