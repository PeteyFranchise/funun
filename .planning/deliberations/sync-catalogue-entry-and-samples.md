# Deliberation — Sync catalogue entry, and what to do about samples

**Status:** CORE DECIDED 2026-09-09 (owner). One sub-decision deliberately left OPEN.
**Supersedes:** the tri-state question in `tri-state-rights-mapping.md` (2026-09-09), which
asked the wrong question. Kept for its data mapping, which remains accurate.
**Unblocks:** Phase 22 · plan 22-05.
**Corrected 2026-09-10** — see "Two corrections" below. One factual premise in the original
draft was wrong; the decisions survive it.

---

## Two corrections (2026-09-10)

### 1. The tri-state IS computed. The earlier draft said it was not.

This document was written on the premise that "partial rights" was a label nobody had built
yet. **That is wrong.** `rightsBadge()` in `lib/sync-library/gate.ts` has computed the
tri-state since Phase 30-01, `RIGHTS_BADGE_TO_CATALOG_RIGHTS` maps it to the catalogue's
`'ok' | 'part' | 'req'` code, and `catalogRightsFromStage3()` in `lib/deals/catalog.ts`
composes the two. The buyer Crate has been rendering all three since 22-02.

**The decisions above survive the correction, but the reason changes.** "Partial rights" is
not an unbuilt label — it is a **computed state the entry gate makes unreachable for a
buyer**. Given every required document signed and every owner authorized, `rightsBadge()`
cannot return `'partial'` for anything a buyer can see: `requiredComplete === 0` is gated
out, and "some but not all required docs" is gated out. `'contact'` remains reachable only
through `sampleBlock`.

So the change is **unreachable, not wrong** — which is a materially different instruction:

- **Do NOT delete `'partial'` from the engine.** `rightsBadge()` returns three states and
  must keep returning three. Staff Crate review (30-08 `READINESS_STATUS_LABEL`,
  `needs_completion` / `pending_admit`) legitimately needs `'partial'` to describe a
  part-way submission that has not been admitted.
- **Only the BUYER surfaces stop advertising it** — the help page definition, the Rights
  filter option, and the public sample fixture. `RIGHTS_LABEL` and `RIGHTS_FILTER_LABEL`
  stay exhaustive over `CatalogRights` so a legacy row still renders a real label.

Shipped 2026-09-10, quick `260910-buyer-rights-two-states`, with a mutation-tested drift
guard (`__tests__/buyer-rights-two-states.test.ts`) on exactly this distinction.

### 2. Unlocking is not listing. There are THREE steps, not two.

The draft below conflates "the artist unlocks eligibility" with "the song is in the
catalogue". **Owner clarification:**

1. **The artist unlocks eligibility** by completing the six sync requirements and securing
   every owner's licensing authorization. This is the gamified readiness experience — the
   artist's own work.
2. **The artist submits** the song for consideration. Eligible is not the same as offered;
   the artist still chooses.
3. **A Funūn team member admits it to The Crate.** Nothing reaches a buyer without a human
   admit decision. This is the curation step, and it is what makes "being listed is the
   guarantee" true.

**Owner's point about invites:** a Funūn invite to a named opportunity gives the artist a
concrete reason to finish the gate quickly. An abstract checklist gets deferred; "this brief
is open and your song qualifies once the split sheet is signed" does not. The invite is the
forcing function that converts eligibility work from housekeeping into a deadline.

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
- **Two states for the BUYER, three in the engine.** The buyer sees
  listed-and-licensable, or listed-with-a-sample. "Partial rights" has no remaining
  condition a buyer can reach — but it is still computed, and staff review still needs it
  (correction 1 above). `components/buyer/CatalogBrowserLight.tsx` and `app/help/page.tsx`
  stopped advertising it on 2026-09-10; `rightsBadge()` was deliberately left untouched.
- **No schema change and no migration** is implied by any decision above. Every condition is
  already computed by `computeStage3()` and the readiness item registry.
- **Aggregate interest in uncleerable tracks must be captured** — see Phase 39 in the roadmap.
  If six supervisors save the same sampled track, that is a commissioned original with proven
  demand behind it, not six dead ends. Left to individual conversations, that signal evaporates.

---

# DECIDED 2026-09-09 — how "all owners authorized" is satisfied

The entry gate requires every owner to authorize licensing before a song is listed. **No such
record existed.** Verified: `sync_listings` carries one `artist_user_id` and one
`blanket_agreement_document_id`; `mint-agreement.ts` renders for a single artist, sign-once;
split-sheet writers are `{ name, role, pro, ipi?, email?, split }` with **no Funūn user id** and
an optional email.

Option A — treating a signed split sheet as sufficient — was **rejected**. Agreeing to a 25%
split is not agreeing to license to a car commercial; inferring consent from a different
document is the version that costs you in a dispute.

## The model: B preferred, C as the fallback

**B is the goal.** A co-owner who is on Funūn signs their own blanket agreement, once, and is
done. This is the preferred path because it brings co-writers onto the platform — and given
Funūn is invite-gated, a co-written song is a warm introduction to a writer who already has a
reason to be here.

**C is the escape hatch.** A co-owner who will not or cannot join signs a **per-song licensing
authorization** sent by email. This reuses the machinery that already sends split sheets to
co-writers for e-signature, so it works with people who are not users.

**Why both, rather than one:** B alone means a song stays dark until every co-writer signs up —
trading catalogue supply for user growth. C alone gets the authorization but never brings the
writer onto the platform. Together, the default brings people in and the fallback stops adoption
from blocking supply.

Both paths answer the same question: **has every writer on this song's split sheet authorized
this song?**

## Required change for B: the blanket agreement's scope

The agreement text currently reads *"it covers each Song the Artist submits to and that Funūn
admits into the Sync Library"*. A co-writer signing that authorizes songs **they** submit — not
the song their collaborator submitted, which is the case that matters.

**The scope must cover songs the artist holds a share in, whoever submits them.** One clause.
Without it, B does not actually authorize anything and the whole model rests on C.

## What this costs

- **B:** the agreement scope clause above, plus resolving a split-sheet writer to a Funūn account.
  Composer email is OPTIONAL today, so matching is best-effort and the fallback carries the rest.
- **C:** one new `vault_documents.type` value. `vault_documents.type` is CHECK-constrained, so
  that is a **human-gated migration** — small, but a migration. E-sign signers ride
  `document_data.esign` (JSONB) and need no schema change.
- **Neither** requires a new table.

## Open, smaller

- Does an authorization request to a non-user co-writer also mint a Funūn invite (`artist_invites`
  / `collaborator_invites` already carry token machinery)? Making the signing moment an on-ramp
  is how B grows over time — but it must be an OFFER, not a toll gate, or C stops being a
  fallback and the supply problem returns.
- What happens to an already-listed song when a co-owner withdraws authorization.

---

# RESOLVED 2026-09-10 — the two decisions had contradicted each other in code

Two decisions on this page were both implemented, and **they cancelled each other out in
production**:

- **"Sampled tracks ARE included, in the default browse"** shipped its label. `rightsBadge()`
  returns `'contact'` when `stage3.sampleBlock` is true, `RIGHTS_BADGE_TO_CATALOG_RIGHTS` maps
  that to `'req'`, and `components/buyer/CatalogBrowserLight.tsx` renders it as
  *"Contains a sample"* (commit `37c7737a`).
- **The entry gate** — `isRightsReady()` in `lib/deals/catalog.ts`, the single buyer-visibility
  authority — ended `return stage3.canContinue`, and `canContinue` is
  `readinessScore >= CONTINUE_THRESHOLD && !sampleBlock` (`lib/vault/stage3.ts`).

So the gate rejected sampled songs **before the badge ever ran**. The "Contains a sample" state
was **unreachable in production**: we had shipped copy for a state the gate forbade. Nobody saw
it, because the only way to notice is to trace the gate and the label together — the label's own
tests passed, and the gate's own tests passed.

## The resolution, and the reasoning that matters more than the diff

**`canContinue` conflates two different questions, and the sync gate must not borrow it.**

| Consumer | Question it asks | Must an uncleared sample block? |
|---|---|---|
| The artist's release pipeline (`computeStage3`, Stage 3 → Stage 4) | *"May this artist advance to Generate Assets and distribute?"* | **YES** — you cannot distribute a track with an uncleared sample |
| The sync catalogue (`isRightsReady`) | *"May a supervisor see this song and start a conversation about it?"* | **NO** — decided on this page |

One boolean cannot answer both. The defect was never `canContinue` itself; it was that the sync
gate reached for a signal built to answer somebody else's question.

**What changed:** `stage3.canContinue` was **removed from `isRightsReady()` only**. `computeStage3()`
and `canContinue` are untouched — an uncleared sample still returns `canContinue: false` and still
blocks the artist's distribution path, and there is now a test asserting exactly that, so nobody
"simplifies" the sample rule out of the release path on the strength of the decision above.

Both halves of `canContinue` were wrong for sync anyway:

- `readinessScore >= 60` was **redundant**. Migration 070 awards 10+10+15+15+10+10 = 70 for exactly
  the six entry items, so anything passing `isSyncEntryComplete()` already cleared 60. It could
  never reject a project the six-item check accepted.
- `!sampleBlock` **was the contradiction**.

**The label then works by itself.** With the gate no longer rejecting them, a sampled track enters
the catalogue and `catalogRightsFromStage3()` marks it `'req'` — *"Contains a sample."* The gate
decides **whether** a buyer sees the song; the badge decides **what it says** about its rights.
Those are two jobs and they now live in two places. No new rights condition belongs in the gate.

## The `stage3` parameter went with the condition

`isRightsReady(project, readinessItems)` — two parameters, not three. The parameter was **removed,
not kept-and-ignored**: an unread parameter is invisible to `tsc` and to the tests, it makes every
call site look like it is feeding the gate a rights signal when it is not, and it leaves `stage3`
sitting in the signature as an invitation to reach for `canContinue` again. (A silently-unused
parameter caused a separate fail-open bug earlier the same day.)

That cost four call sites, and paid for itself: only **one** of them still needs a `Stage3Result`
at all — `loadCatalogPage` (`lib/deals/catalog-query.ts`), for the badge and the staff
`rightsDetail` string. The other three (`lib/deals/shortlists.ts`, `lib/selects/tracks-query.ts`,
`app/api/admin/selects/[id]/ai-draft/route.ts`) were assembling a full `Stage3Result` per project
**solely** to feed this parameter. Those `computeStage3()` calls are now gone, along with
`AiDraftCandidate.stage3`.

## Pinned by tests

`lib/deals/catalog.test.ts`, describe block *"a sampled track is LISTED, not hidden"*:

1. A sampled track with all six entry items complete, an eligible type and admitted → gate
   **passes**. **Mutation-verified**: restoring `return stage3.canContinue` turns exactly this
   test red and leaves the other 66 in the file green.
2. That same `Stage3Result` reads `rightsBadge() === 'contact'` / `catalogRightsFromStage3() === 'req'`
   — proving the "Contains a sample" label is now reachable end to end.
3. A clean track with the same six reads `'ready'` / `'ok'` — listing sampled tracks did not
   flatten the two buyer-visible states into one.
4. `computeStage3()` still returns `canContinue: false` on an uncleared sample — the release
   pipeline is unchanged.

**No migration and no schema change**, consistent with "Consequences for the build" above.

## Still open, unchanged by this

The **"clear, facilitate, or partner?"** question above remains deliberately undecided. Nothing
here builds a clearance service or promises a timeline; a sampled track is listed, honestly
labelled, and its call to action opens a conversation.
