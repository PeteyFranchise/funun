# 22-05 — status correction, 2026-09-09

**`22-05-PLAN.md` is STALE. Do not execute it as written.**

## Most of it was absorbed by Phase 30

Phase 30 (*The Crate + Sync Library — Catalogue Engine*, 9/9, shipped 2026-08-13) delivered
almost everything 22-05 was written to do. `lib/deals/catalog.ts` says so in its own comment:
*"30-07: enriched additively with the real authored display fields ... the minimal 22-05 slice."*

| 22-05 must_have | Actual state |
|---|---|
| Enriched fields — artist, mood, energy, vocal, instruments, tri-state rights | **BUILT** (30-07) |
| Server-side filter / sort / pagination via the API | **BUILT** — `loadCatalogPage()`; the route parses genre, mood, energy, vocal, usageCleared, key, bpmMin/Max, page |
| Live rows; fixture retired to the empty case | **BUILT** — `app/sync/catalog/page.tsx` loads live and falls back to `SAMPLE_CATALOG_ROWS` only when no rights-ready rows exist |
| Instruments source | **EXISTS** — `INSTRUMENT_VALUES` / `INSTRUMENT_LABELS`, a real controlled vocab |

**The plan also names a file that does not exist:** `app/(buyer-portal)/buyers/catalog/page.tsx`.
The catalogue lives at `app/sync/catalog/page.tsx`.

## Its blocking decision gate is resolved

22-05 Task 0 blocks on the seven inclusion sub-decisions. Six are resolved — five by Phase 26
(2026-08-05/07), the rest on 2026-09-09. See
`.planning/deliberations/sync-catalogue-entry-and-samples.md`. The two the gate calls out
specifically are both closed: the tri-state definitions are decided (and were already computed
by `rightsBadge()` since 30-01), and the instruments source exists.

## What genuinely remains — two items

### 1. `isRightsReady()` must use the DECIDED gate, not the aggregate score

`lib/deals/catalog.ts` currently gates on:

```
admitted to sync library  AND  vault_readiness_score >= 60  AND  stage3.canContinue
```

The owner decided (2026-09-09) it should gate on **six specific readiness items** — split
sheets, copyright, producer agreements, audio files, metadata, cover art — and explicitly NOT
on the aggregate score, because 30 of its 100 points (ISRC, distributor, PRO, MLC) are
release admin a sync buyer has no stake in. Under today's threshold a song with every
signature and a finished master reads as unlicensable because nobody picked a distributor.

Needs item-level readiness data rather than the rolled-up number. `readinessItemsForProject()`
already produces per-item status, so the data exists.

**Ready to plan and build. No migration. No new decision needed.**

### 2. "All owners authorized" — BLOCKED on an owner decision

The owner decided every owner must authorize before a song is listed. **No such record
exists.** Verified 2026-09-09:

- `sync_listings` carries one `artist_user_id` and one `blanket_agreement_document_id`
- `mint-agreement.ts` renders for a single `artistName`/`artistEmail`, sign-once per artist
- split-sheet writers are `{ name, role, pro, ipi?, email?, split }` — **no Funūn user id**,
  and email is optional
- e-sign signers ride `vault_documents.document_data.esign` (JSONB) — no schema change needed
  for signers themselves
- `vault_documents.type` has a CHECK constraint — **a new document type IS a migration**

Three options, presented to the owner 2026-09-09:

| | Approach | Cost | Weakness |
|---|---|---|---|
| A | Treat a fully-signed split sheet as sufficient | none | agreeing to a 25% split is not agreeing to license; consent is inferred from a different document |
| B | Every co-writer needs their own blanket agreement | no migration; match composer email to a Funūn account | composer email is optional, and a song stays unlistable until every co-writer joins Funūn |
| C | A per-song licensing authorization the co-writers sign | one small human-gated migration for a new document type | more build than A |

**Recommended: C.** Split sheets already go out to co-writers by email for e-signature, so the
machinery exists and already works with people who are not Funūn users. Reuse it: one new
document type, no new table, genuine authorization from real owners without forcing every
co-writer to sign up.

## Recommended handling

1. Re-plan item 1 as a small scoped task. It is unblocked, needs no migration, and is exactly
   what the 2026-09-09 decisions freed.
2. Hold item 2 until the owner picks A, B or C. If C, it needs its own plan with a
   human-gated migration checkpoint.
3. Leave `22-05-PLAN.md` on disk for its Task 1 field-derivation detail, which is still
   accurate, but treat THIS file as the authority on what is left.
