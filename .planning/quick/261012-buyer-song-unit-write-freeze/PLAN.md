# Buyer Song Unit Write Freeze

## Objective

Prevent new project-shaped licensing data from being created while Phase 50.5 is redesigned around
an immutable, captured Crate song record.

## Scope

- Add one centralized server response for licensing writes that must remain unavailable until the
  captured Crate song model is deployed.
- Apply the response after authorization and before mutation in the buyer request, buyer shortlist,
  admin deal, deal progression, artist licensing terms and Selects send routes.
- Complete the staged handback requirement in the frozen admin deals route: while the read flags
  are active, ignore the project-derived match filter and omit both `matched_precleared` and the
  project readiness figure from its response.
- Remove timing promises from the shared response. Do not send a guessed `Retry-After` horizon.
- Add focused Node-environment tests that prove the response contract and route coverage.
- Do not change UI, schema, migrations or the artist-owned Sound Vault.
- Do not edit `lib/selects/` or `app/selects/`; the server-side Selects send route is explicitly
  assigned to Codex by the H-2 fence.

## Files expected to change

- `lib/deals/buyer-song-unit-withholding.ts`
- `app/api/buyer/requests/route.ts`
- `app/api/buyer/shortlists/route.ts`
- `app/api/admin/deals/route.ts`
- `app/api/admin/deals/route.test.ts`
- `app/api/admin/deals/[id]/route.ts`
- `app/api/admin/deals/[id]/pay/route.ts`
- `app/api/admin/deals/[id]/executed/route.ts`
- `app/api/vault/[projectId]/licensing/route.ts`
- `app/api/admin/selects/[id]/send/route.ts`
- `app/api/admin/selects/[id]/send/route.test.ts`
- `app/api/admin/deals/[id]/executed/route.test.ts`
- `__tests__/buyer-song-unit-write-freeze.test.ts`
- `__tests__/buyer-song-unit-withheld.test.ts` (stale ownership comment only)
- `.planning/quick/261012-buyer-song-unit-write-freeze/SUMMARY.md`

## Verification plan

- Run the focused write-freeze test in the repository's Node Jest environment.
- Run the admin deals route-response test in both withheld and open read states.
- Run strict TypeScript checking.
- Run lint with zero warnings.
- Run the complete required CI validation set if the focused checks pass, excluding `npm run build`.
- Inspect the final diff and worktree status to confirm unrelated changes remain untouched.

## Risks and coordination notes

- This is a temporary fail-closed guard, not the one-song implementation.
- The admin GET change is read containment only. It does not implement captured-song matching or
  readiness and must preserve the open-state behavior for eventual flag removal.
- The response must run only after authorization so it does not disclose protected route behavior.
- D-16's audio ownership choice remains open, so no migration can be finalized or applied here.
- No migration, deployment, commit or push is authorized by this task.
- Existing unrelated worktree changes belong to other workstreams and must remain untouched.
