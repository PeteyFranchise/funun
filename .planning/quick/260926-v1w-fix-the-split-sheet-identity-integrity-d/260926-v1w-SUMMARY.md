---
quick_id: 260926-v1w
slug: fix-the-split-sheet-identity-integrity-defect
date: 2026-09-27
type: quick-full
security: true
status: complete
files_modified:
  - lib/split-sheets/identity-policy.ts
  - lib/split-sheets/identity-policy.test.ts
  - lib/split-sheets/resolve-party-identities.server.ts
  - lib/split-sheets/resolve-party-identities.server.test.ts
  - lib/split-sheets/live-identity.ts (deleted)
  - lib/split-sheets/live-identity.test.ts (deleted)
  - supabase/migrations/228_split_sheet_party_identity_provenance.sql (written, NOT pushed)
  - app/(artist)/split-sheets/[id]/page.tsx
  - lib/split-sheets/lifecycle.ts (comment only)
  - lib/split-sheets/change-summary.ts (comment only)
  - components/split-sheets/SplitSheetBuilder.tsx (comment only)
  - app/approve/[token]/page.tsx
  - app/api/split-sheets/[id]/mint-envelope/route.ts
  - app/api/webhooks/docuseal/route.ts
  - app/api/approve/[token]/route.ts
  - __tests__/approve-token-identity-action.test.ts
  - __tests__/docuseal-webhook.test.ts (deviation — see below)
  - __tests__/split-sheet-identity-boundary.test.ts
  - __tests__/split-sheet-identity-resolution.test.ts
commits:
  - aa1cfb70
  - a0fb3d86
  - d9cc31c2
---

# Fix the split-sheet identity integrity defect

One server-side resolver now supplies party identity to every surface that
displays or mints a split sheet, a corrected two-field-class policy stops a
profile default from silently overwriting a work-specific publishing choice,
and a pre-mint conflict gate blocks the send instead of the old always-pass
behavior. Migration 228 is written and NOT pushed.

## What changed

**The policy (Ruling 2, `lib/split-sheets/identity-policy.ts`, new, pure).**
Two field classes instead of one:

| Class | Fields | Rule |
|---|---|---|
| Person-scoped | `legal_name`, `pro`, `ipi` | A claimed party's CURRENT profile value wins pre-mint; a blank live value never blanks a real stored one. |
| Work-specific | `publishing_designee`, `administrator` | The party row wins, always. A profile value fills a blank field only — it never overwrites a choice already made for this sheet. |

The deleted `lib/split-sheets/live-identity.ts` treated all five fields with
overwrite semantics, which is the shipped defect: a claimed party's Settings
publisher default could silently replace a publishing designee they had
already chosen for a specific song. `identityDigest()` (stable sha256 over
the five fields, null/blank normalized identically) and
`identityDriftSinceLastAction()` (the gate predicate) live in the same pure
module.

**The one resolver (`lib/split-sheets/resolve-party-identities.server.ts`,
new).** `resolvePartyIdentitiesForSheet(sheetId)` reads the sheet's status
and every party row once. Post-mint (`esign_pending`/`executed`) with a
persisted envelope snapshot, it returns that snapshot verbatim. Otherwise it
batch-resolves claimed collaborators → `user_profiles` and applies the
policy per party — the SAME code path serves a post-mint sheet with no
snapshot (an envelope minted before this fix), since `resolveIdentityFields`'s
own post-mint branch returns the frozen row regardless of the live profile.
Returns each party's `frozen` (as-stored) fields alongside the resolved
`identity`, so a caller (the mint gate) can detect drift without querying
identity columns itself.

**Four readers converted, one gate added.**

- `app/(artist)/split-sheets/[id]/page.tsx` (reader #1) — the staged-flag
  "current value" panel and the builder's party list both now read the same
  resolver call; the page's own `split_sheet_parties` projection carries no
  identity columns.
- `app/approve/[token]/page.tsx` (reader #2) — token lookup narrowed away
  from `select('*')`; `partyIdentity` comes from the resolver.
- `app/api/split-sheets/[id]/mint-envelope/route.ts` (reader #3, the gate,
  the snapshot) — `partiesMissingLegalName` now runs on resolved legal
  names (the stored-row check used to block spuriously or pass wrongly).
  **The identity-drift gate runs before `assertCounselReviewedForProduction()`,
  the new-recipient cap query, `renderSplitSheet`, and `claim_esign_mint`** —
  on conflict it returns 409 with a structured `conflicts` array and nothing
  downstream runs. `esign_envelopes.party_identity_snapshot` is written in
  the same insert that records the envelope.
- `app/api/webhooks/docuseal/route.ts` (reader #4 — **Finding A**, not named
  in the original contract) — the Certificate of Signature's
  `funuunObserved.parties` now comes from the resolver instead of raw
  `split_sheet_parties` columns. The sheet is post-mint at this point, so
  the resolver returns the persisted snapshot — the certificate certifies
  the same identity the signed PDF carries, by construction.

**The write-back fix (`app/api/approve/[token]/route.ts`).** The guest
`update_identity` action's collaborators write-back is now person-scoped
only (`legal_name`, `pro`, `ipi`) — `publishing_designee` and `administrator`
are work-specific (Ruling 2, Finding D: mapping to `collaborators.publisher`
was the tempting wrong fix) and stay on this sheet's own party row. The
write's error is now checked and surfaced as a 500, not swallowed. The party
row's own update carries `identity_source: 'token_holder_submitted'` and
`identity_submitted_at` in the same UPDATE (Finding C naming: this records
only that the token holder POSTed the value, never a claim that the
described person asserted it). `approve`/`counter` persist
`identity_digest_at_approval` as the gate's baseline — **best-effort**,
wrapped in its own try/catch so a resolver hiccup cannot block a party's
approve/counter action from registering (matching the existing
best-effort `notifyInitiator` call in the same handler); worst case on
failure is no baseline recorded, which is exactly every party's default
state today.

**Migration 228** (`supabase/migrations/228_split_sheet_party_identity_provenance.sql`,
written, autonomous: false, **NOT pushed**): `identity_source` (three-step
nullable → backfill-to-`'unknown'` → `NOT NULL DEFAULT 'inviter_supplied'`,
so pre-existing rows never carry a false `'inviter_supplied'` claim),
`identity_submitted_at`, `identity_digest_at_approval` on
`split_sheet_parties`, plus the `GRANT SELECT` on those three columns
(Finding B — without it they 42501 through the authenticated client and the
gate silently degrades to always-passing). `esign_envelopes.party_identity_snapshot
JSONB` (no GRANT needed — that table carries no column-level REVOKE).

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — direct consequence of the Task 2 file change] `__tests__/docuseal-webhook.test.ts`
required an update, though it was not in the plan's `files_modified` list.**
Converting `app/api/webhooks/docuseal/route.ts` to call
`resolvePartyIdentitiesForSheet()` means the webhook route now issues a
FIFTH table read the file's existing fake service client did not model
(`split_sheets`, for the resolver's own internal query). Without a matching
mock response the resolver threw inside `renderAndStoreCertificate`'s own
try/catch, degrading the certificate render silently and failing 4 of the
file's 28 tests (`toHaveBeenCalledTimes(1)` / reading `mock.calls[0][0]` on
an uncalled mock). Extended `makeService()` to derive a `split_sheets` row
for table `'split_sheets'` from the same envelope fixture (adding
`status: 'esign_pending'`, since the completion webhook only ever fires
post-mint). Because the fixture's parties carry no `collaborator_id`, the
resolver's live-profile lookup is skipped and the resolved values equal the
fixture's original raw `legal_name`/`pro`/`publishing_designee`/`administrator`
exactly, so none of the file's existing value assertions needed to change.
All 28 tests pass; the certificate now genuinely flows through the
resolver, matching Finding A's requirement.
- **Found during:** Task 2, after converting the docuseal webhook route.
- **Files modified:** `__tests__/docuseal-webhook.test.ts`.
- **Commit:** a0fb3d86.

**2. [Rule 1] `__tests__/approve-token-identity-action.test.ts` needed a
full rewrite, not just an update, to assert the corrected behavior.** The
plan named this file for update; the rewrite adds two entirely new cases
(the collaborators write is skipped when the payload has no person-scoped
fields, rather than issuing a no-op UPDATE; a failing collaborators write
surfaces a non-200) beyond what the plan's action list enumerated, because
writing the "person-scoped payload" assertion correctly required also
proving the negative (no `publishing_designee`/`administrator` reach
`collaborators`) and the skip-when-empty behavior mentioned in the route's
own action item.
- **Files modified:** `__tests__/approve-token-identity-action.test.ts`.
- **Commit:** a0fb3d86.

### No changes needed

`__tests__/adversarial-review-fixes.test.ts` — not in the plan's file list
and NOT modified. Its approve-action test's `service.from` mock is a
`jest.fn().mockReturnValueOnce(...)` chain of exactly 4 responses. The new
best-effort `recordApprovalIdentityBaseline()` call issues a 5th `.from()`
call the mock does not define; jest returns `undefined`, the resolver's
subsequent `.select()` call throws a `TypeError`, and that throw is caught
by the best-effort try/catch — the test's existing assertions (which only
check the party-row update) are unaffected. Verified this test still passes
unmodified; no deviation needed.

### Design decisions not explicit in the plan

**Field-level drift detail is an approximation, documented in code.**
`identityDriftSinceLastAction()` compares the freshly resolved identity
against the party row's OWN current fields (the best available proxy for
"what they saw when they responded") to build the 409's `conflicts` array,
because only a digest — not a full field snapshot — is persisted at
approval time (Finding C's deliberate minimalism). In the rare case where
this comparison shows no per-field difference despite an overall digest
mismatch, every identity field is listed rather than none, erring toward
over-reporting. This never affects WHETHER the gate blocks (decided by the
digest alone) — only what the 409 body can tell the initiator about why.
Documented in `lib/split-sheets/identity-policy.ts`'s docstring for
`identityDriftSinceLastAction`.

**The boundary test's "no identity columns in code" check is scoped to
`.select()` call bodies touching `split_sheet_parties`, not the whole file.**
All four converted readers necessarily destructure the resolver's
`ResolvedPartyIdentity` return value by field name (`resolved.pro`,
`identity.publishing_designee`, ...) to build their own output shapes —
there is no way to consume that object without spelling its field names,
and doing so is the intended way to use the resolver's contract, not a
boundary violation. `__tests__/split-sheet-identity-boundary.test.ts`
therefore checks whether each reader's OWN `.select()` calls (the actual
database query) name an identity column, which is the real security-relevant
question, and separately sweeps the whole codebase for un-allowlisted
`publishing_designee` references and `split_sheet_parties` projections
naming the other four columns. **The plan's own per-task
`sed | grep -q 'publishing_designee'` gate on
`app/(artist)/split-sheets/[id]/page.tsx` therefore fails literally** (the
page legitimately writes `resolved.publishing_designee` once), while the
boundary test — the plan's own designated authority per its
`<gate_hygiene>` section — passes. Documented in the boundary test's header.

## Threat Flags

None — every new column/surface is exactly what the plan's `<threat_model>`
named (T-v1w-01 through T-v1w-06, T-v1w-SC). No new endpoint, no new trust
boundary, no new dependency.

## Known Stubs

None.

## Verification

**Dry-run of negative assertions against the pre-fix tree (3499f7f2/8f5d0967),
confirmed via `git show`, not assumed:**

| Assertion | Pre-fix result |
|---|---|
| Each of the four readers imports `resolve-party-identities.server` | FAILED on all four — `git show 3499f7f2:<path> \| grep resolve-party-identities` returned no matches for any of the four files (the module did not exist). |
| The owner page's / mint route's own `.select()` bodies name no identity column | FAILED — both selected `pro, ipi, legal_name, publishing_designee, administrator` directly on `split_sheet_parties`. |
| `lib/split-sheets/live-identity.ts` does not exist | FAILED — `git show 3499f7f2:lib/split-sheets/live-identity.ts` printed the file. |
| Migration 228 carries `GRANT SELECT` | FAILED — `git show 3499f7f2:supabase/migrations/228_...` errors: path does not exist in that tree. |
| Mint 409s on drift, zero spend calls | Not independently dry-runnable (the pre-fix mint route has no gate to import) — confirmed instead by reading the pre-fix route directly: no `identityDriftSinceLastAction` import, no 409 branch before the counsel gate. |

**Full CI validate job, run in order:**

```
npm run security:migrations:verify
→ PASS: migrations 214–218 are transactional, collision-sensitive,
  least-privilege, checksum-pinned, and covered by read-only probes.
  (Confirms migration 228 is untouched by this pinned-migration checker,
  per claim 17 — it only enumerates 214–217.)

npm run typecheck:strict
→ clean (tsc --noEmit --noUnusedLocals --noUnusedParameters), no output.

npm run lint
→ clean, 0 warnings (--max-warnings=0).

npm test -- --runInBand
→ Test Suites: 633 passed, 633 total
  Tests:       7775 passed, 7775 total
  (Real count, replacing the plan's unverified "7,745" figure. 631 suites /
  7759 tests pre-existing + 2 suites / 16 tests new.)

npm audit --omit=dev --audit-level=moderate
→ found 0 vulnerabilities

npm audit --audit-level=high
→ found 0 vulnerabilities
```

`npm run build` was not run (not part of CI's validate job; a dev server is
live on :3000).

**Jest discovery, confirmed (no bracketed-path trap):**
`npx jest --listTests __tests__/split-sheet-identity-boundary.test.ts __tests__/split-sheet-identity-resolution.test.ts`
returned exactly those two files.

## Constraints honored

- Never ran `supabase db push`; migration 228 is committed, unapplied.
- Never `git add -A` or `git add .` — every commit staged explicit paths.
- No third-party file touched: `.planning/ROADMAP.md`,
  `.planning/deliberations/organizational-doctrine/*`,
  `.planning/todos/pending/2026-09-01-writers-room-live-collaboration.md`,
  `.planning/todos/pending/2026-09-26-stripe-subscriptions-setup-and-phase.md`
  remain modified-but-uncommitted exactly as found; `.planning/deliberations/cookups-product-doctrine.md`,
  `.planning/quick/260926-writers-room-cookup-events/`, and
  `.planning/todos/pending/2026-09-26-writers-room-cookup-events-and-guest-access.md`
  remain untracked and unread. Confirmed via `git show --stat` on each of
  the three commits.
- `npm run build` not run.
- No merge/rebase/pull against `main`; branch stayed 8 commits behind as
  instructed.
- No new npm/pip/cargo dependency — `identityDigest` uses `node:crypto`
  (Node built-in), matching the threat model's `T-v1w-SC` disposition.
- Member-facing copy (the mint route's 409 error) says "changed since they
  last responded to this split sheet" — never "Sound Vault" is not
  applicable here (no bare "vault" reference introduced), and never implies
  the party "approved a different identity" (Finding C wording).

## Self-Check: PASSED

- `lib/split-sheets/identity-policy.ts` — FOUND
- `lib/split-sheets/resolve-party-identities.server.ts` — FOUND
- `supabase/migrations/228_split_sheet_party_identity_provenance.sql` — FOUND, not pushed
- `lib/split-sheets/live-identity.ts` — CONFIRMED ABSENT
- `__tests__/split-sheet-identity-boundary.test.ts` — FOUND, 12 tests
- `__tests__/split-sheet-identity-resolution.test.ts` — FOUND, 4 tests
- Commit `aa1cfb70` — FOUND in `git log`, 11 files (Task 1)
- Commit `a0fb3d86` — FOUND in `git log`, 6 files (Task 2)
- Commit `d9cc31c2` — FOUND in `git log`, 2 files (Task 3)
- `git diff --diff-filter=D` across all three commits — only the two
  intentional `live-identity.ts`/`live-identity.test.ts` deletions
- Full suite: 7775/7775 passing; all six CI validate steps green

## What the owner must do about migration 228

1. **Push it.** `supabase db push` (or the deploy pipeline's equivalent) —
   this was never run by the executor, per `autonomous: false`.
2. **Verify the output, not that it ran** (per CLAUDE.md — "the code ran"
   and "the answer is right" are separate claims):
   - `identity_source` is `NOT NULL`, and **every pre-existing row reads
     `'unknown'`**, not `'inviter_supplied'`. If any pre-existing row reads
     `'inviter_supplied'`, the backfill ordering broke and the column is now
     a populated, plausible, false label.
   - `authenticated` can `SELECT` all three new columns
     (`identity_source`, `identity_submitted_at`, `identity_digest_at_approval`).
     A `42501` here means the gate degrades to always-passing (Finding B).
   - `esign_envelopes.party_identity_snapshot` exists and is nullable.
   - Immediately after the push, count rows where
     `identity_source = 'token_holder_submitted'` — **it must be zero**.
     Nothing has written that value yet; a non-zero count means the
     CHECK/default interacted with something unexpected.
3. Only after that verification passes should split-sheet minting resume
   in production with this fix live — before the push, the mint route's new
   identity-drift gate runs against a database that lacks the columns it
   reads, which will 42501 rather than silently degrade (Finding B's GRANT
   makes the failure loud, not quiet).
