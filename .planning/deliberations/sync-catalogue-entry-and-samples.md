# Deliberation — Sync catalogue entry, and what to do about samples

**Status:** CORE DECIDED 2026-09-09 (owner). One sub-decision deliberately left OPEN.
**Supersedes:** the tri-state question in `tri-state-rights-mapping.md` (2026-09-09), which
asked the wrong question. Kept for its data mapping, which remains accurate.
**Unblocks:** Phase 22 · plan 22-05.

---

## What changed, and why the earlier draft asked the wrong question

The earlier draft asked *"what label do we show a buyer when a song's rights are incomplete?"*
and mapped three states onto conditions the code already computes.

**The owner's answer reframed it: unfinished songs should not be in the catalogue at all.**
Funūn now has other homes for work in progress. Entering the sync catalogue should be something
the artist **unlocks** by completing sync requirements — folded into the gamified release-
readiness experience that already exists, so the artist sees a goal rather than a mystery.

That turns most of the tri-state into a **gate**, not a label.

---

## DECIDED — what it takes to enter the sync catalogue

| Requirement | Points | Required? |
|---|---|---|
| Split sheets signed | 15 | **yes** |
| Copyright registered | 15 | **yes** |
| Producer agreements (hire-right) | 10 | **yes** |
| Audio files uploaded | 10 | **yes** |
| Metadata captured | 10 | **yes** |
| Cover art | 10 | **yes** — shop-window quality, not a licensing blocker |
| ISRC codes | 10 | **no** |
| Distributor selected | 10 | **no** |
| PRO registration | 5 | **no** |
| MLC registration | 5 | **no** |

**The aggregate readiness score is the wrong instrument and is NOT used.** It was designed for
releasing on Spotify. Thirty of its hundred points — ISRC, distributor, PRO, MLC — are release
admin a music supervisor has no stake in. Judging sync-licensability by that score means a song
with every signature in place and a finished master reads as unlicensable because nobody picked
a distributor. Use the specific items above; ignore the total.

## DECIDED — all owners must authorize before a song appears

A signed split sheet means the writers agreed **who owns what**. It does not mean they agreed to
**license**. Where a song has multiple owners, every one of them must have authorized before it
enters the catalogue.

**This makes ownership a GATE, not a label.** The "unsigned co-writer" case never reaches a
buyer, so it needs no state in the UI. **Being listed is the guarantee.**

## DECIDED — sampled tracks ARE included, in the default browse

Sample-based music is a large share of what supervisors actually place. Excluding it shrinks the
catalogue unevenly, cutting the genres that place most.

**Label:** wording along the lines of *"Contains a sample — licensing needs clearance first."*

**It must NOT promise a timeline.** An earlier draft of this conversation floated "typically 4-8
weeks". That number was invented by the assistant and the owner nearly adopted it. Sample
clearance routinely takes months and a meaningful share never clears. **Any timeline on the
catalogue must come from Funūn's own completed cases, not from an estimate.**

### The reason sampled tracks earn their place even when clearance fails

*(Owner insight, 2026-09-09 — this is the load-bearing idea in this document.)*

A sampled track that never clears is not a dead end. It is a **demand signal**:

1. It reveals what that supervisor's ear actually wants
2. It gives a Funūn producer a concrete target to build a clean version against — same vibe,
   royalty-free source
3. It produces a lead that would not otherwise exist

So the call to action beside a sampled track should not be *"request clearance"* (a wait with an
uncertain end). It should open a conversation — clearance is then **one of two outcomes**, and
an original may land faster than a clearance ever would. This also dissolves the timing trap
that kills sync deals: you stop promising a clearance date you do not control.

**Architecturally this needs no new surface.** The Brief Builder already exists as the home for
outside "here's the vibe I want" references, and Vibe Match turns a reference into ranked
catalogue matches. An uncleerable sampled track is functionally an outside reference that
happens to live inside the catalogue — same shape, same job.

---

## OPEN — does Funūn clear, facilitate, or partner?

**Deliberately not decided.** The owner's honest position is "I don't know yet", and forcing it
now would bake an unvalidated answer into the product.

| Path | What it means | Cost of being wrong |
|---|---|---|
| **Clear** | Funūn does the work — identify owner, negotiate, paper it | Best buyer experience and real timelines, but specialist demand-driven work that is hard to staff, and Funūn owns the failure |
| **Facilitate** | Tooling and guidance; the artist does the legwork | Cheapest and scales, but no credible timeline is ever possible and buyer experience becomes a lottery |
| **Partner** | Route to a clearance house; take a margin or none | Credible timelines and real expertise without hiring for it — likely the pragmatic middle for Funūn's current stage |

**Recommended approach: handle the first several by hand, whatever way works.** Learn what they
actually cost, how long they really take, and how often they fail. Then decide from evidence.
**Avoid building a "clearance service" surface or automated timeline promises before that.**

Related: the owner leaned toward clear-on-demand (not proactive) with sampled tracks staying in
the default browse. Note the tension that creates: clearance only begins when a buyer asks, so
any timeline shown is a promise about a process not yet started with a third party who has not
agreed to anything. The honest label above is what makes that survivable.

---

## Consequences for the build

- **22-05 is unblocked.** The catalogue query filters on the six entry requirements plus
  all-owners-authorized. `isRightsReady()` in `lib/deals/catalog.ts` is already the single named
  home for this definition — deliberately not a flag column — so the change has one site.
- **Two states, not three.** Listed-and-licensable, and listed-with-a-sample. "Partial rights"
  as a distinct state has no remaining condition to express; the UI in
  `components/buyer/CatalogBrowserLight.tsx` and the copy in `app/help/page.tsx` both need
  revisiting to match.
- **No schema change and no migration** is implied by any decision above. Every condition is
  already computed by `computeStage3()` and the readiness item registry.
- **Aggregate interest in uncleerable tracks must be captured** — see Phase 39 in the roadmap.
  If six supervisors save the same sampled track, that is a commissioned original with proven
  demand behind it, not six dead ends. Left to individual conversations, that signal evaporates.
