# Pass 5 — rights and eligibility review (2026-10-05)

The most serious pass so far. **Two criticals, four highs, five mediums.** Several are live money
bugs, not plan problems. 9 suites / 127 tests run; **the green suite covers none of the criticals.**

---

## C-01 — One admitted track makes every sibling track requestable. **LIVE.**

Song-level admission is reduced to a **project-level boolean**: `isAdmittedToSyncLibrary()`
(`lib/deals/catalog.ts:20-35`) is satisfied by *any* admitted `sync_listings` row.
`catalog-query.ts:313-345` evaluates eligibility once per project, then `:387-400` returns
**every track in that project**. `request-target.ts:95-111` checks only that the project has an
admitted listing. And `app/api/buyer/requests/route.ts:90-97` verifies only that the requested
track **belongs to the project** — never that it has its own admitted listing.

**So an album with Track A admitted and Track B never reviewed exposes Track B to buyers, and a
buyer can create a licence request explicitly targeting it.**

The readiness aggregation compounds it: `audio_files` is complete when `tracks.length > 0`, not
when every requested track has audio; metadata requires all fetched project tracks; split,
copyright and hire signals are largely project-level.

**The admin gate answers per track while catalogue visibility and request authorisation answer
per project.** Both false negatives and false positives follow, including licensing activity
against a song nobody admitted.

This is the same shape as the Selects gap closed in #148, but on the **request** path rather than
visibility — and it was not closed by that fix.

## C-02 — The AI disclosure ledger is editable by the person it describes. **LIVE.**

The route enforces real invariants: same-work version checks, the human source must predate the
assisted take, generated entries cannot claim a human source, and the citation is server-composed
(`app/api/works/[workId]/ai-entries/route.ts:42-50,77-158,183-203`).

**The database enforces none of them.** Migration 135:273-289 checks only vocabulary and
level/version consistency. **Migration 136:267-276 grants the owner or any work member `FOR ALL`
on `ai_entries`** — INSERT, UPDATE and DELETE. There is no append-only or
reject-update/delete trigger, and the diary trigger records INSERT only.

And `resolveTrackAiProvenance()` returns **`clear` on an empty entry list**
(`lib/catalogue/track-work-link.ts:51-65`).

So a work member with direct Supabase access can delete a disqualifying full-generation or
AI-vocal entry, change its component or mode, insert a fabricated performance entry pointing at
an unrelated human source, or replace the server-composed citation.

**Once Crate enforcement reads this ledger, deleting the inconvenient rows produces a confident
"clear" verdict.** The pure resolver behaves exactly as tested; the data underneath it does not.
This makes the planned AI-provenance gate unsafe as designed.

---

## H-01 — A songwriter's publishing share silently disappears on duplicate names

`lib/song-passport/legacy.ts:151-163`:

```ts
Object.fromEntries(parties.map(p => [p.user_id ?? p.collaborator_id ?? p.name, Number(p.split_percentage)]))
```

Two name-only parties called "Alex Kim" **collapse to one property**. A legitimate 50/50 sheet
imports as a single `"Alex Kim": 50`; the second payee vanishes and the total becomes 50.

The `writers` array keeps both people, so the Passport can say there are two writers while its
publishing-share map names one. The existing legacy test covers a single identified party and
tests neither duplicate names nor total preservation.

## H-02 — `canContinue` is not document completeness, and corrects Pass 4

`lib/vault/stage3.ts:327-339`: `canContinue = readinessScore >= 60 && !sampleBlock`. It does
**not** require `requiredComplete === requiredTotal`. A project can reach 60 on audio, artwork,
ISRC, ISWC/PRO, metadata and distributor points while split sheets, copyright evidence and
hire-right agreements remain incomplete.

**This corrects Pass 4's M-02.** `canContinue` does not simply refuse incomplete rights — depending
on unrelated release points it can refuse *or permit* the same incomplete-rights project. The
staff admission gate currently masks the dangerous allow case. **Remove rights completeness from
admission as Phase 50 plans, and `authorizeRequestTarget()` immediately permits requests against
admitted songs with unsigned splits.**

## H-03 — Graduation can copy another release target's ISRC

The Passport permits multiple release targets (`schema.ts:205-221`). Migration 230's graduation
function, inherited from 154, selects `release_date`, `label_name`, `upc`, `isrc` and `lyrics`
using only `passport_id + field_key + LIMIT 1` — **no `target_key` constraint, no
`vault_project_id`/`track_id` filter, no `ORDER BY`.**

PostgreSQL may pick an arbitrary matching row. **Graduation can assign the wrong ISRC, or copy
another project's UPC, label or release date.** Migration 231 governs *who* may write
`tracks.work_id`; it cannot make these values correct.

## H-04 — Migration 172's guard is "owner only", not "valid linkage"

At `172:6-28` it allows a no-op, allows an authenticated owner, allows **any context where
`auth.uid()` is NULL** (service role and direct sessions), and rejects an authenticated
non-owner. It fires only when `graduated_project_id` is named.

**It never verifies the target project belongs to the owner.** Migration 136:199-208 lets the
owner update `works` directly, so an owner can point a work at **any** vault-project UUID that
satisfies the foreign key — corrupting provenance, blocking normal graduation, and changing
release-controller resolution (`song-passport/repository.ts:103-113`).

No production code assumes the trigger merely logs. Its test only asserts SQL strings exist.

---

## M-02 — Thirteen readiness outputs, not nine

Pass 4's count was low. The reviewer enumerated **thirteen production decision outputs**, every
one able to disagree with the others: `vault_readiness_score`, `readinessItemsForProject`,
`readinessLabel().canSubmit`, Stage 3 `requiredComplete/Total`, Stage 3 `canContinue`,
`isSyncEntryComplete`, `isSyncRightsClear`, `isSyncMetadataComplete`, `evaluateInclusionGate`,
`isRightsReady`, `rightsBadge`, `authorizeRequestTarget`, `resolveTrackAiProvenance`.

Plus Song Passport's `missingByLayer`, `trustedFacts` and `visibleFacts` — which are
**viewer-dependent**, computed from visibility-filtered fields. A viewer without legal access
sees publishing shares reported as *"missing"* when they exist. **Those must never be reused as
authoritative legal completeness.**

## M-03 — The equal-default rule survives, with one correction

**The strongest rule holds.** Nothing derives a share from activity, word counts, lyric-block
counts or contribution weight. Lyric authorship and take creation decide who gets a *nudge*, never
a percentage. Catalogue promotion redrafts every party equally. Verified across the module.

**But "splits default to equal unless writers decide otherwise" is not globally true.**
`SplitSheetBuilder.tsx:227-258` automatically calls **proportional** redistribution whenever a
party is added or removed (`redistribute.ts:68-108`), preserving existing ratios. Equal
redistribution is a separate button. So the system proposes new proportional numbers before the
writers approve them — not contribution-derived, but not equal-by-default either.

## M-01, M-04, M-05 — in brief

**M-01:** Crate eligibility has two recomputation paths, no persisted verdict and no authoritative
entry projection. The missing authority is not the predicate but **the query defining which
work-level and version-level entries apply to a released track**.

**M-04:** Migration 231 has no current bypass, and graduation remains compatible — but the trigger
permits *every* service-role write and *every* direct session, not specifically the graduation
function. "Only graduation may write this column" is application convention.

**M-05:** Sample clearance has three deliberate outcomes, but score-only surfaces ignore it. One
project can simultaneously read "Ready to submit" on the dashboard, be blocked from Stage 4,
be admitted and visible in The Crate, be labelled "contact", and be refused by
`authorizeRequestTarget()`. The listing/admission split is intentional; **the score-based "ready
to submit" label is not** — it treats a release score as a sample-aware release decision.

---

## What the green suite does not cover

9 suites / 127 tests pass, and **none of them touch the criticals**: no authenticated
direct-write/update/delete test for `ai_entries`; no duplicate-name publishing-share import test;
no multi-track test proving an unadmitted sibling cannot be requested; no graduation test with
multiple ISRC target keys. The 172/230/231 tests largely verify SQL text, not behaviour.
