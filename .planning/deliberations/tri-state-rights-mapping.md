# Deliberation — What "Partial rights" and "Contact required" actually mean

**Status:** DRAFT for owner decision. Blocks Phase 22 · plan 22-05.
**Written:** 2026-09-09

---

## The problem, stated plainly

**Funūn already promises buyers a three-state rights signal it cannot compute.**

Shipped today:
- `components/buyer/CatalogBrowserLight.tsx` renders all three states with working filters
  (`ok` / `part` / `req`)
- `app/help/page.tsx` publishes user-facing definitions to buyers

Computed today:
- `lib/deals/catalog.ts` → `isRightsReady()` — **one boolean.** Admitted to the sync library,
  AND `vault_readiness_score >= 60`, AND `computeStage3().canContinue`.

So the catalogue can currently say "Rights ready" or nothing. The other two states come from
the fixture. Plan 22-05 flips the catalogue to live data and cannot ship until this resolves.

## What the help page already commits us to

These are live to users, so they are a constraint, not a blank page:

> **Partial rights** — "Most rights are in place; a detail or two may need confirming before
> signing."
>
> **Contact required** — "Licensing needs a conversation first — for example a co-writer or a
> sample to clear."

Two things follow. *Contact required* is explicitly about **a missing human signature** — a
co-writer, a sample owner. *Partial* is about **a detail**, something minor and administrative.
The copy is a usable definition; it needs mapping to data.

## The signals that actually exist

`computeStage3()` (`lib/vault/stage3.ts`) tracks five document requirements:

| # | Requirement | Scope | Required? | What its absence means |
|---|-------------|-------|-----------|------------------------|
| 1 | **CopyrightKit** | project | required | The work is not registered. Administrative — it does not change WHO owns the song. |
| 2 | **SplitSheet** | per track with >1 writer | required | A co-writer has not signed. **Someone else may own part of this.** |
| 3 | **HireRight** | per hired collaborator | required | A hired contributor has not signed away their contribution. **Ownership is unsettled.** |
| 4 | **SampleClear** | per track with a flagged sample | required | An uncleared sample. **A third party can block the license.** |
| 5 | **ContentID** | project | recommended, dismissible | Not a rights question at all. |

Plus: `sampleBlock` (any unsigned SampleClear), `canContinue`
(`readiness >= 60 && !sampleBlock`), `requiredComplete` / `requiredTotal`,
`has_admitted_sync_listing`, `vault_readiness_score`.

**The useful distinction the data already supports:** requirements 2, 3 and 4 are about
**whether someone else has a claim**. Requirement 1 is about **paperwork with the government**.
That is exactly the line the help copy draws.

---

## RECOMMENDED MAPPING

### Contact required — someone else may have a claim
Any of:
- `sampleBlock` is true (an unsigned SampleClear on any track)
- an unsigned **SplitSheet** on any track with more than one writer
- an unsigned **HireRight** for any hired collaborator

**Why:** each means a third party's signature is missing, so Funūn cannot promise the buyer a
clean license without a conversation. This is exactly what the shipped copy says — "a co-writer
or a sample to clear".

### Partial rights — ownership is settled, paperwork is not
All of requirements 2, 3 and 4 are signed, but either:
- **CopyrightKit** is unsigned/unregistered, or
- `vault_readiness_score` is below `CATALOG_READINESS_THRESHOLD` (60) while the rights documents
  are complete

**Why:** nobody else has a claim. The song can be licensed; a detail needs confirming before
signing. That is the help copy's "a detail or two".

### Rights ready — licensable now
- admitted to the sync library, AND
- every **required** Stage 3 document signed, AND
- `vault_readiness_score >= CATALOG_READINESS_THRESHOLD`

This is today's `isRightsReady()` plus the explicit per-requirement check, so nothing that reads
"Rights ready" today would stop doing so.

### Not listed at all
Not admitted to the sync library. Admission remains the outer gate — the tri-state describes
songs that are *in* the catalogue, never whether they belong there.

---

## Why pre-cleared terms are NOT part of this (open sub-decision #7)

The inclusion deliberation asked whether a song should be browsable before pre-cleared terms
exist. **Recommendation: yes, and terms should not affect the tri-state at all.**

Reasoning: Phase 26's blanket agreement already **pre-authorizes terms except price**
(`.planning/deliberations/sync-license-signing-model.md`). So admission itself carries term
pre-authorization; what remains negotiable is price. Price is a commercial variable, not a
rights question, and folding it into a *rights* signal would make "Rights ready" mean two
different things at once.

If a price-set / price-negotiable distinction is wanted for buyers, it deserves its own
affordance, not a third meaning bolted onto this one.

---

## Decisions needed from the owner

1. **Adopt the three-way split above** — third-party claim → *Contact required*; own paperwork →
   *Partial*; complete → *Rights ready*? **(Recommended: yes.)**
2. **Does a low readiness score with complete rights docs read as *Partial*, or should readiness
   be excluded from the rights signal entirely?** Recommended: *Partial*, because a buyer
   browsing sees one signal and a half-finished song should not read identically to a finished
   one. The counter-argument is that readiness is a production-completeness measure, not a rights
   measure, and mixing them makes the label imprecise.
3. **Terms/price excluded from the tri-state?** **(Recommended: yes, per above.)**
4. **Granularity** — the states are computed per *project* today. A project may hold one track
   with an uncleared sample and three without. Does one blocked track make the whole project
   *Contact required*? Recommended: **yes, fail closed** — a buyer who licenses a project should
   never discover a blocked track afterwards. Flagged because it will surface as "why is my
   album Contact required when only one song has a sample".

## What happens once decided

Plan 22-05 is unblocked. `isRightsReady()` becomes a three-state function in the same file — it
is already the single named place the definition lives, deliberately not a flag column, so the
change has one home. Every condition above is already computed by `computeStage3()`; **no new
data collection, no schema change, and no migration is needed.**
