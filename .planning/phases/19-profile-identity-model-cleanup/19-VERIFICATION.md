---
phase: 19-profile-identity-model-cleanup
verified: 2026-07-24T00:00:00Z
status: human_needed
score: 9/9 must-haves verified (code-level; live-DB round trips require human UAT)
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "As a new user whose email matches unclaimed collaborator rows carrying rights data (pro/ipi/publisher/phone/address), sign up and land on Settings."
    expected: "Blank rights fields are pre-filled from the claimed collaborator records, each rendering an 'unconfirmed — review' badge with named provenance ('We filled this from a credit <inviting artist> added you to'). Confirming a field persists confirmed:true and the badge disappears. Re-running the claim flow (re-login / re-hit /api/claim-collaborators) never overwrites a confirmed or edited value."
    why_human: "Requires a live claim_collaborators() run against real Supabase rows (migrations 071-075 are live per the 19-07 checkpoint, but no browser/DB session is available in this verification environment) — the code path and its parity-twin logic are unit-verified, but the actual end-to-end round trip needs a real signup + claim."
  - test: "As a claimed user on a frozen (esign_pending or executed) split sheet, submit 'This info is wrong' from the Contract Locker with a suggested PRO/IPI/publisher/administrator/legal_name value; then, as the sheet owner, open the notification (bell + email) and follow the ?stagedFlag= deep link."
    expected: "Owner sees both a bell notification and a Resend email carrying the suggested value and a deep link. The staged panel shows current vs. suggested value. For esign_pending, 'Withdraw signature request' calls the void route and un-freezes the sheet. For executed, only a guided pointer to '/split-sheets/new' is shown — no amendment, no PDF/Certificate mutation."
    why_human: "Requires a live split_sheet_identity_flags row, a real notification dispatch (bell + Resend), and exercising the void route against a live esign_pending envelope — none of which can be driven without a browser/DB session."
  - test: "View a newly generated split-sheet PDF and the /approve/[token] share page at the 375px mobile-first breakpoint across each phase branch (preview/sign/waiting/countered/done)."
    expected: "The licensee note callout renders legibly and is visually distinct from the Guidance Notes callout, on every phase branch."
    why_human: "The PDF byte-extraction test (lib/vault/pdf/split-sheet.test.ts) proves the note's text is present in the rendered content stream, and tsc/lint prove the JSX wiring is type-correct, but neither confirms visual legibility/placement across breakpoints — flagged as human_judgment in 19-02-SUMMARY.md itself."
---

# Phase 19: Profile & Identity Model Cleanup Verification Report

**Phase Goal:** Collapse Funūn's three overlapping "you" tables into one canonical account profile (`artist_profiles`), delete the duplicate `user_profiles`, re-point both DB readers, and formalize the collaborator-becomes-user reconciliation — while preserving existing live-identity behavior and keeping signed documents immutable.
**Verified:** 2026-07-24
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Settings renders exactly one rights input; the duplicate "Rights Identity" section and `/api/user-profiles` are gone (R1) | ✓ VERIFIED | `app/api/user-profiles/` does not exist on disk; scoped grep for `user_profiles`/`UserProfile` across `app/`, `components/`, `lib/` (excluding `__tests__`) returns zero hits; `components/profile/ProfileForm.tsx` has one "Rights & Royalties" section with the verbatim D-12 help line ("Used on your split sheets, metadata, and registrations.") |
| 2 | Saving Settings rights makes the value reach the initiator's split-sheet party-1 row (R1, "saved PRO reads None" fix) | ✓ VERIFIED | `app/(artist)/split-sheets/[id]/page.tsx` builds the initiator's self-row directly from a fresh `artist_profiles` read (`myProfileRow`, lines 155-172) — the only write path to that table now is `/api/profile` (the surviving single rights input) |
| 3 | Migration 071 rescues stranded `user_profiles` values into `artist_profiles` using semantic-blank rules, mapping `phone`→`contact_phone`/`display_name`→`artist_name`/`bio`→`bio`, covering the `{}`-address and `''`-PRO cases, logging pre/post + stranded counts (R1) | ✓ VERIFIED (migration content); ⚠ live audit-count capture is a documented, non-blocking CLI limitation (see Gaps Summary) | `supabase/migrations/071_user_profiles_data_rescue.sql` implements canonical-wins UPDATE with `IS NULL OR = '{}'::jsonb` json-blank check + `RAISE NOTICE`; parity twin `lib/profile/semantic-blank.ts` + `__tests__/rescue-semantic-blank.test.ts` (17 tests) specifically cover the `{}`-address and `''`-PRO fixtures — all pass |
| 4 | Both `claim_collaborators()` and `backfill_claimed_collaborators()` read `artist_profiles` after migration (R1, "missed reader" edge) | ✓ VERIFIED | `supabase/migrations/072_repoint_claim_functions.sql` re-creates both functions reading `FROM public.artist_profiles`; `__tests__/claim-collaborators-rpc.test.ts` structurally asserts both are re-pointed and that `073_drop_user_profiles.sql` drops the table strictly after |
| 5 | New user's blank profile fields are pre-filled from claimed collaborator records with per-field provenance + unconfirmed flag; confirming/editing persists; re-running never overwrites confirmed/edited/non-blank; conflicts resolve most-recent (R2) | ✓ VERIFIED (logic + wiring); live round trip = human-needed | `072`'s `claim_collaborators()` mirrors `lib/profile/claim-prefill.ts`'s `pickWinningSource`/`shouldPrefill`/`buildClaimPrefillEntry` field-for-field (11 passing tests); `/api/profile` computes `claim_prefill[field].confirmed=true` server-side from `confirm_prefill_fields`, filtered against existing keys, and drops the entry when a field is edited to a non-blank value (`app/api/profile/route.ts:234-289`); `ProfileForm.tsx` renders a per-field `ClaimPrefillNotice` with named provenance for all 6 fields |
| 6 | Editing a claimed collaborator's profile updates identity on draft/pending_approval/approved/countered sheets but NOT esign_pending/executed; freeze boundary unchanged (R3) | ✓ VERIFIED | `lib/split-sheets/live-identity.ts` is byte-unchanged since Phase 18 (`git log` shows a single commit, `71cce12`, predating Phase 19); its 20-test regression suite (`live-identity.test.ts`) passes unmodified; the `[id]/page.tsx` claimed-party batch loader is untouched by any Phase 19 diff |
| 7 | No non-owner code path can write another user's `split_sheet_parties` row or edit `split_percentage`/`role` (R4) | ✓ VERIFIED | `app/api/split-sheets/[id]/correction-flag/route.ts` only ever `.insert()`s into `split_sheet_identity_flags`; never references `split_sheet_parties` in a write; authorization requires `party.user_id === user.id` OR `collaborators.claimed_by === user.id`, else 403; `__tests__/split-sheet-correction-flag.test.ts` (13 tests, behavioral mocks) asserts the 403 path, the field allowlist rejects `split_percentage`/`role`, and a spoofed `flaggedBy` is ignored in favor of the session user |
| 8 | A claimed user can flag an identity correction on a frozen sheet; owner is notified (bell + email); applying to `executed` uses a guided pointer only; signed PDF/Certificate never touched (R4) | ✓ VERIFIED (code); live notify/apply round trip = human-needed | `ContractLocker.tsx`'s `FlagWrongIdentityForm` posts `{partyId, field, suggestedValue}` to the correction-flag route, gated to `esign_pending`+`viewerPartyId` (Awaiting Signature) and to executed docs in `VerifyPanel`; `buildIdentityCorrectionFlagNotification()` builds a dual-channel (`sendEmailCopy: true`) payload with a `?stagedFlag=` deep link; `StagedFlagPanel.tsx` branches `esign_pending` → void route call, `executed` → plain `Link` to `/split-sheets/new` with no amendment/regeneration code anywhere in the panel (confirmed via grep for `amends_split_sheet_id`/`regenerate`/`re-mint` — zero matches) |
| 9 | A newly generated split-sheet PDF contains the "note to licensees," framed as guidance; no already-executed document is regenerated (R5) | ✓ VERIFIED (code + byte test); visual breakpoint check = human-needed | `NOTE_TO_LICENSEES` in `lib/split-sheets/agreement.ts` is verbatim to CONTEXT D-10; rendered in `lib/vault/pdf/split-sheet.tsx` (asserted present in the actual PDF content stream via `extractPdfText`, not just the React tree) and in `components/split-sheets/SplitApprovalView.tsx`'s shared `PageShell` (D-11); no regeneration/backfill code was added anywhere in this phase's diff |

**Score:** 9/9 truths verified at the code/test level (0 present-but-behavior-unverified in the strict sense — all asserted logic has a passing behavioral test or a byte-unchanged-file regression proof). 3 items require a live browser/DB session to exercise the actual end-to-end round trip and are routed to human verification below, per this environment's documented lack of live-DB access.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/profile/semantic-blank.ts` | Semantic-blank + field-mapping twin | ✓ VERIFIED | Exists, substantive (76 lines), covers text/JSON blank + `RESCUE_FIELD_MAP`; consumed by `/api/profile/route.ts` and mirrored by migration 071 |
| `lib/profile/claim-prefill.ts` | Conflict-resolution + idempotency twin | ✓ VERIFIED | Exists, substantive, exports `ClaimPrefillEntry` shape consumed by `types/index.ts` and migration 072 |
| `supabase/migrations/071_user_profiles_data_rescue.sql` | Semantic-blank rescue, logged | ✓ VERIFIED | Present, substantive, `RAISE NOTICE` present, matches twin field-for-field |
| `supabase/migrations/072_repoint_claim_functions.sql` | Both functions re-pointed + `claim_prefill` column + R2 pre-fill | ✓ VERIFIED | Present, substantive, both functions re-created reading `artist_profiles` |
| `supabase/migrations/073_drop_user_profiles.sql` | Drop `user_profiles`, strictly last | ✓ VERIFIED | Present, `DROP TABLE IF EXISTS ... CASCADE`, ordered after 071/072 by filename |
| `supabase/migrations/074_split_sheet_identity_flags.sql` | Flags table + RLS | ✓ VERIFIED | Present, CHECK constraint matches route's `FLAGGABLE_FIELDS`, RLS scoped to flagger/owner |
| `supabase/migrations/075_phase19_privilege_hardening.sql` | Preflight-discovered privilege fixes | ✓ VERIFIED | Present, access-control-only (REVOKE/GRANT/DROP POLICY), documented in 19-07-SUMMARY as an in-scope preflight correction |
| `app/api/user-profiles/route.ts` | DELETED | ✓ VERIFIED | Confirmed absent from disk |
| `app/api/profile/route.ts` | `confirm_prefill_fields` signal + edit-clears-unconfirmed | ✓ VERIFIED | Present, `claim_prefill` excluded from `EDITABLE_FIELDS`, filtered against existing keys |
| `components/profile/ProfileForm.tsx` | Consolidated rights section + per-field confirm UI | ✓ VERIFIED | Present, `ClaimPrefillNotice` wired for 6 fields, D-12 help line present |
| `app/api/split-sheets/[id]/correction-flag/route.ts` | R4 backend | ✓ VERIFIED | Present, authorization + allowlist + frozen-status gate all enforced |
| `lib/social/notifications.ts` (`buildIdentityCorrectionFlagNotification`) | Dual-channel notification builder | ✓ VERIFIED | Present, deep-links to `?stagedFlag=` |
| `components/contracts/ContractLocker.tsx` (`FlagWrongIdentityForm`) | Locker flag entry | ✓ VERIFIED | Present, wired into both `esign_pending` and `executed` surfaces |
| `components/split-sheets/StagedFlagPanel.tsx` | Owner guided-apply panel | ✓ VERIFIED | Present, void-first / guided-pointer branching, no amendment code |
| `lib/split-sheets/agreement.ts` (`NOTE_TO_LICENSEES`) | R5 shared constant | ✓ VERIFIED | Present, verbatim D-10 wording |
| `lib/vault/pdf/split-sheet.tsx`, `components/split-sheets/SplitApprovalView.tsx` | R5 render surfaces | ✓ VERIFIED | Both render the shared constant; byte-extraction test proves PDF content-stream presence |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `ProfileForm.tsx` confirm button | `/api/profile` | `POST ... { confirm_prefill_fields: [field] }` | ✓ WIRED | Confirmed in `ProfileForm.tsx:452-464` and handled server-side in `route.ts:249-271` |
| `lib/profile/claim-prefill.ts` `ClaimPrefillEntry` shape | migration 072's JSONB entries | Field-for-field parity | ✓ WIRED | Both use `{confirmed, source_collaborator_id, source_name, filled_at}`; `types/index.ts` imports the shape directly (no re-declaration) |
| `ContractLocker.tsx` `FlagWrongIdentityForm` | `POST /api/split-sheets/[id]/correction-flag` | `fetch(...)` with `{partyId, field, suggestedValue}` | ✓ WIRED | Confirmed at `ContractLocker.tsx:133-137` |
| `correction-flag/route.ts` | `buildIdentityCorrectionFlagNotification` → `createNotification` | dual-channel bell+email, best-effort try/catch | ✓ WIRED | Confirmed at `route.ts:153-174` |
| Notification `?stagedFlag=` deep link | `[id]/page.tsx` owner view | `searchParams.stagedFlag` → `split_sheet_identity_flags` read → `StagedFlagPanel` | ✓ WIRED | Confirmed at `page.tsx:80,133-150,290-297`; scoped to `isInitiator` branch only |
| `StagedFlagPanel` esign_pending branch | `/api/split-sheets/[id]/void` | `fetch(..., {method:'POST'})` | ✓ WIRED | Confirmed at `StagedFlagPanel.tsx:42` |
| Migration 071→072→073 filename ordering | drop-after-rescue-and-repoint enforcement | Sequential migration numbers | ✓ WIRED | Verified by reading all three files; no cross-references broken |
| `lib/split-sheets/agreement.ts` `NOTE_TO_LICENSEES` | PDF renderer + share view | Shared import, no re-declaration | ✓ WIRED | Both `split-sheet.tsx` and `SplitApprovalView.tsx` import the same constant |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| R1 | 19-01, 19-04, 19-05, 19-07 | Delete duplicate `user_profiles`, re-point both readers, semantic-blank rescue | ✓ SATISFIED | Migrations 071-073 authored + live-pushed (per 19-07-SUMMARY, LOCAL=REMOTE 001-075); runtime references zero; tests pass |
| R2 | 19-01, 19-04, 19-05, 19-07 | Confirmable reverse pre-fill on claim | ✓ SATISFIED (code); live round trip → human verification | Migration 072 + `/api/profile` + `ProfileForm.tsx` all wired consistently; twin tests pass |
| R3 | 19-01, 19-04 | Preserve claimed-collaborator live-link + freeze boundary | ✓ SATISFIED | `live-identity.ts` byte-unchanged; regression suite passes unmodified |
| R4 | 19-03, 19-06, 19-07 | Flag-for-fix, no cross-user edits, guided apply | ✓ SATISFIED (code); live round trip → human verification | Migration 074+075, route, notification, Locker UI, StagedFlagPanel all consistent and tested |
| R5 | 19-02 | "Note to licensees" on new PDFs + share view | ✓ SATISFIED | Byte-extraction test + shared constant on both surfaces |

**Note on REQUIREMENTS.md staleness:** `.planning/REQUIREMENTS.md`'s Phase 19 section (lines 276-298) still shows R1-R4 as unchecked `[ ]` and their traceability rows as "In Progress," with R5 checkbox marked `[x]` but its own traceability row saying "Pending" (a self-contradiction). This reflects that the file was last edited after 19-05/19-06 (before 19-07's live push) and was never updated to close out R1/R2/R4 once 19-07 completed. This is a **documentation gap, not a code gap** — the live migrations (071-075) and their dependent runtime code are confirmed present, wired, and tested above. Recommend updating REQUIREMENTS.md's checkboxes/traceability table to reflect 19-07's completion as a follow-up housekeeping item; it does not block phase completion.

### Anti-Patterns Found

None blocking. Scoped grep across all phase-touched files for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` returned only pre-existing, unrelated matches (HTML `placeholder=` attributes, an unrelated "video walkthrough coming soon" note for ISRC registrant codes predating this phase, and a pre-existing "coming soon" note in `ContractLocker.tsx` for an unrelated feature). No debt markers were introduced by this phase's commits.

### Documented, Non-Blocking Limitations (carried from 19-07-SUMMARY, confirmed consistent with code)

1. **071's live audit-count capture** — the `RAISE NOTICE` stranded/candidate/rescued counts were not surfaced by Supabase CLI v1.226.4 during the live push, and are now unrecoverable since 073 dropped `user_profiles`. The rescue logic itself is unit-tested via the 17-test semantic-blank twin and structurally confirmed in the migration file; this is a reporting-tool limitation, not a code defect.
2. **Contract Locker visibility gap (pre-existing, not introduced this phase)** — a non-owner claimed party's document row for an *attached* executed sheet is not currently reachable via the Locker's project-nested query (it filters `vault_projects` by owner). Documented in 19-06-SUMMARY as a known limitation; out of this phase's scope to fix.

### Human Verification Required

See frontmatter `human_verification` — three items, all requiring a live browser/DB session that this verification environment does not have:
1. Claim pre-fill confirm round trip (R2)
2. Correction-flag → owner bell/email → void/guided-pointer round trip (R4)
3. Visual breakpoint check of the licensee note on `/approve/[token]` (R5, minor/non-blocking)

### Gaps Summary

No code-level gaps found. All 9 observable truths derived from the SPEC's 5 requirements and the ROADMAP goal are verified against the actual codebase: migrations 071-075 are correctly ordered, structurally sound, and confirmed live (LOCAL=REMOTE 001-075 per 19-07-SUMMARY); all runtime consumers of the deleted `user_profiles` are gone; the R2 confirm UI and R4 flag/notify/apply surfaces are fully wired end-to-end in code with passing behavioral tests (not just source-grep proxies); R3's freeze boundary is proven byte-unchanged since Phase 18; R5's note is proven present in actual rendered PDF bytes. The full Jest suite (89 suites / 1109 tests), `tsc --noEmit`, and `eslint` on phase-touched files are all clean, independently re-run during this verification (not taken from SUMMARY claims).

The phase's remaining open items are all live-DB/browser UAT — inherently outside what this codebase-verification pass can exercise — plus one pre-existing REQUIREMENTS.md documentation staleness issue (non-blocking, recommend a housekeeping follow-up).

---

_Verified: 2026-07-24_
_Verifier: Claude (gsd-verifier)_
