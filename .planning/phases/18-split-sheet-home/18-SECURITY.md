---
phase: 18-split-sheet-home
audited: 2026-07-22
asvs_level: 1
block_on: high
threats_registered: 35
threats_closed: 34
threats_open: 0
threats_open_nonblocking: 1
status: SECURED
---

# Phase 18 (split-sheet-home) — Retroactive Security Audit

**Method:** every threat below was verified against the actual shipped code, not against SUMMARY.md/VERIFICATION.md prose. Each `mitigate`-disposition row cites the file:symbol read directly during this audit. `accept`-disposition rows are closed by recording them in the Accepted Risks Log at the bottom of this document (they were previously undocumented as an explicit log — this audit is that log). ASVS Level 1 depth applied: mitigation confirmed PRESENT in the cited file at the correct location (session vs. service client, allowlist vs. free field, scoping key).

Full regression gate independently re-run during this audit: `npx jest` → 84 suites / 1031 tests passing. `npx supabase migration list` → LOCAL=REMOTE parity confirmed through 068. `git log` confirms zero phase-18 commits touch `components/collaborators/CollaboratorPicker.tsx` or `components/vault/MetadataStudio.tsx`.

---

## 18-01 (Living-Draft Surface)

| Threat ID | STRIDE | Severity | Disposition | Declared Mitigation | Status | Evidence |
|---|---|---|---|---|---|---|
| T-18-01 | Info Disclosure | high | mitigate | Draft sheets returned only to initiator, enforced server-side | **CLOSED** | `lib/split-sheets/list.ts:45-61` `mergeSplitSheetRows()` drops any party-of draft row unless `initiator_user_id === userId`; belt-and-suspenders `.neq('status','draft')` in the party-of query at line 98. Both layers independently enforce the rule. |
| T-18-02 | Info Disclosure | medium | accept | Co-party legal name/PRO/IPI disclosure via share token, bounded by existing token expiry/entropy | **CLOSED** (logged) | See Accepted Risks Log #1. `app/api/split-sheets/[id]/share/route.ts:70` reuses `generateApprovalToken()` (existing 256-bit entropy, `lib/split-sheets/approval.ts`) and `APPROVAL_TOKEN_EXPIRY_DAYS`. |
| T-18-03 | Elevation of Privilege | high | mitigate | Share route: initiator-only, 409 outside draft/countered, never writes status | **CLOSED** | `app/api/split-sheets/[id]/share/route.ts:32-53` — `.eq('initiator_user_id', user.id)` on the read; explicit `sheet.status !== 'draft' && sheet.status !== 'countered'` → 409; the mint loop (line 69-81) touches only `approval_token`/`token_expires_at`, never `status`. |
| T-18-04 | Tampering | critical | mitigate | UI renders `assertEditable()`'s refusal; server PATCH remains sole enforcement | **CLOSED** | Client: `components/split-sheets/SplitSheetBuilder.tsx:210` gate computed via `assertEditable`. Server: `app/api/split-sheets/[id]/route.ts:83-86` calls `assertEditable(current.status, editsParties)` and returns `gate.error`/`gate.status` before any write — the actual enforcement point, independent of the client. |
| T-18-05 | Repudiation | medium | mitigate | `summarizePartyChanges()` produces named from/to record set over FROZEN values | **CLOSED** | `lib/split-sheets/change-summary.ts:67-97` diffs `id`/`name`/`split_percentage` only; type `PartyChangeSnapshot` documents identity fields are "NEVER read." Caller `app/(artist)/split-sheets/[id]/page.tsx:231-235` passes `frozenParties` built from the raw DB row, never the live-resolved values. |
| T-18-06 | Info Disclosure | high | mitigate | No route/module in this plan accepts a caller-supplied string | **CLOSED** | `share/route.ts` never calls `request.json()` (only path param). `change-summary.ts` exports no function with a string parameter. `approve/[token]/route.ts`'s `update_identity` action allowlists exactly 5 structured fields (line 11), no note/message key. |
| T-18-01a | Info Disclosure | high | mitigate | `artist_profiles` read is server-side only, scoped by server-verified `collaborators.claimed_by`, never a client id | **CLOSED** | `app/(artist)/split-sheets/[id]/page.tsx:94-96` gates the entire page on `isInitiator \|\| isParty` (404 otherwise) BEFORE any profile read; `collaboratorIds` (line 142-144) are drawn only from this already-authorized sheet's own party rows; `claimedByByCollaboratorId`/`claimedProfileByUserId` (146-185) are built from server reads keyed off those ids — no client-supplied user/party id ever selects whose profile is read. |
| T-18-01b | Tampering | high | mitigate | §7 write target resolved strictly by token; explicit field allowlist; freeze-boundary guard | **CLOSED** | `app/api/approve/[token]/route.ts:35-39` resolves `party` by `.eq('approval_token', token)` only; `IDENTITY_FIELDS` allowlist (line 11) filters the update object (line 72-82); freeze check at line 68 refuses when `esign_pending`/`executed`; write scoped `.eq('id', party.id)` (line 93) — never a client-supplied party id. |
| T-18-01c | Tampering | medium | mitigate (declared) — **verified GAP, non-blocking** | Mint-envelope's legal-name requirement "still blocks minting a party without a real legal name" — flagged in the plan as a cross-phase check to confirm, not assume | **OPEN — non-blocking** (below block_on:high) | Confirmed by direct read: `app/api/split-sheets/[id]/mint-envelope/route.ts:147-150` filters `signableParties` on **email only** (`normalizeRecipient(p.email)`); no `legal_name` non-empty check exists anywhere in that file. The plan's own mitigation text called this out as unverified ("to confirm, not assume") — verification confirms it is NOT true. This is the same gap already recorded in `18-VERIFICATION.md`'s "Cross-Phase Finding" and is genuinely pre-existing Phase 17 code (`git log` shows the file's only history is commit `d68fc84`, Phase 17, no phase-18 commits). **Attributed to Phase 17**, not a Phase 18 regression — Phase 18 introduces the scenario (fast-added party with an empty `legal_name`) that makes the pre-existing gap reachable in a new way, but does not touch the vulnerable file. Tracked as a follow-up to `mint-envelope/route.ts`, not a Phase 18 blocker (medium severity, below this audit's `block_on: high` threshold). |
| T-18-01d | Tampering | medium | mitigate | Client requires email OR phone; server allowlists gain no unvalidated field | **CLOSED** | `components/split-sheets/PartyPicker.tsx:230-233` — `if (!trimmedEmail && !trimmedPhone) { setError(...); return }`. Server `app/api/split-sheets/route.ts` `PARTY_FIELDS`/`sanitizeParty()` (lines 14-25, 47-66) unchanged shape, only `name` required. |
| T-18-SC | Tampering (supply chain) | low | accept | No package installs | **CLOSED** | `git diff` / `package.json` — no new dependency added in any 18-01 commit. |

## 18-02 (Contract Locker Workspace)

| Threat ID | STRIDE | Severity | Disposition | Declared Mitigation | Status | Evidence |
|---|---|---|---|---|---|---|
| T-18-07 | Info Disclosure | high | mitigate | Draft rows filtered to initiator inside `buildAttentionSections()` | **CLOSED** | `lib/contracts/locker-attention.ts:195` — `visibleSheets = sheets.filter(s => s.status !== 'draft' \|\| s.initiatorUserId === viewerUserId)`, applied before every section is built; page (`app/(artist)/contracts/page.tsx`) passes `viewerUserId` and does no bucketing itself. |
| T-18-08 | Denial of Service | critical | mitigate | Hide route issues no delete on any path, scoped by caller's `user_id` | **CLOSED** | `app/api/contracts/documents/[id]/hide/route.ts` — no `.delete(` call anywhere in the file; read (line 36-41) and write (line 52-57) both carry `.eq('user_id', user.id)`. |
| T-18-09 | Tampering | medium | mitigate | `document_data` read-then-merged, never overwritten wholesale | **CLOSED** | `hide/route.ts:49-50` — `const nextDocumentData = { ...existingData, hidden }`, spreads existing keys before adding `hidden`. |
| T-18-10 | Info Disclosure | high | mitigate | Block exception documented in-source at the query, citing section 10c | **CLOSED** | `app/(artist)/contracts/page.tsx:25-34` — full comment block naming the exception, its scope ("this agreement and its parties' details on THIS agreement, and no other Phase 13 surface reopens"), and citing section 10c. |
| T-18-11 | Info Disclosure | low | accept | Co-party detail disclosed by design; bound = only this agreement's data, no other catalog data leaks | **CLOSED** (logged) | See Accepted Risks Log #2. `lib/contracts/locker-attention.ts` types (`AttentionPartyInput` etc.) carry only per-sheet fields — no catalog/other-sheet data flows into the module. |
| T-18-12 | Spoofing | high | mitigate | Hide route accepts no note/reason/message field | **CLOSED** | `hide/route.ts:30-32` — only `body.hidden` is read; any other key is ignored. |
| T-18-SC | Tampering (supply chain) | low | accept | No package installs | **CLOSED** | No new dependency in any 18-02 commit. |

**Additional confirmation — block filtering not accidentally removed elsewhere:** `grep -rl "block-check\|isBlockedRelativeTo"` across `app/api` still returns `wall/route.ts`, `connections/route.ts`, `endorsements/route.ts`, `follows/route.ts`, `release-comments/route.ts` — all untouched by Phase 18, confirming the P18-12 exception is scoped to the split-sheet/Locker surface only and did not spread to (or get accidentally removed from) other social surfaces.

## 18-03 (Song-Level Attachment)

| Threat ID | STRIDE | Severity | Disposition | Declared Mitigation | Status | Evidence |
|---|---|---|---|---|---|---|
| T-18-13 | Elevation of Privilege | high | mitigate | Party-and-owner double check preserved verbatim | **CLOSED** | `app/api/split-sheets/[id]/attach/route.ts:56-79` — party check (`isParty`) then separate `vault_projects` ownership check (`.eq('user_id', user.id)`); `detach/route.ts:33-55` mirrors it identically. |
| T-18-14 | Tampering | high | mitigate | Track id verified to belong to destination project before write | **CLOSED** | `attach/route.ts:87-98` — `.eq('id', trackId).eq('project_id', vaultProjectId)`, 403 generic rejection if absent, checked with the session client before any service-client write. |
| T-18-15 | Denial of Service | critical | mitigate | Detach deletes only the attachment row; track FK is `ON DELETE SET NULL` | **CLOSED** | `detach/route.ts:61-67` deletes only from `split_sheet_attachments`, scoped by sheet+project(+track); migration `067_split_sheet_song_attachment.sql:89` — `track_id UUID REFERENCES tracks ON DELETE SET NULL`. |
| T-18-16 | Tampering | high | mitigate | Idempotent backfill, string-asserted + human-verified row count | **CLOSED** (code); live spot-check deferred | Migration `067...sql:161-170` — `INSERT ... WHERE ... NOT EXISTS (... track_id IS NOT DISTINCT FROM ...)`, confirmed idempotent by inspection. `__tests__/migration-067.test.ts` passes. The live pre/post row-count spot-check is listed in `18-VERIFICATION.md`'s `human_verification` (item 8) as deferred — consistent with this project's established migration-checkpoint convention, not a code gap. |
| T-18-17 | Tampering | medium | mitigate | Leading candidate marked only above a confidence threshold, never preselected | **CLOSED** | `lib/split-sheets/attachment.ts:66` `CONFIDENCE_THRESHOLD = 0.72`; `suggestTrackMatches()` (line 86-95) sets `suggested` true only for index 0 AND `score >= CONFIDENCE_THRESHOLD`. |
| T-18-18 | Repudiation | critical | mitigate | No regeneration path built on any surface | **CLOSED** | `describeSignedTitle()` (`attachment.ts:132-138`) returns a data record only. `grep -rin "regenerat\|reissue"` across `components/split-sheets`, `components/vault/LinkSplitSheet.tsx`, `app/api/split-sheets` → zero matches. |
| T-18-19 | Info Disclosure | high | mitigate | P18-12 comment at cross-party queries in attach/detach | **CLOSED** | `attach/route.ts:46-55` and `detach/route.ts:30-32` both carry the section-10c comment. |
| T-18-20 | Info Disclosure | medium | mitigate | Attach/detach accept no note/reason/message field | **CLOSED** | `attach/route.ts:35-38` and `detach/route.ts:19-22` — body typed to `{ vault_project_id, track_id }` only; extra keys ignored. |
| T-18-SC | Tampering (supply chain) | low | accept | No package installs | **CLOSED** | No new dependency in any 18-03 commit. |

## 18-04 (Coverage-Based Readiness)

| Threat ID | STRIDE | Severity | Disposition | Declared Mitigation | Status | Evidence |
|---|---|---|---|---|---|---|
| T-18-21 | Spoofing | critical | mitigate | Coverage rule replaces all-or-nothing gate; 5-tracks-1-sheet is a named regression-guard fixture | **CLOSED** | `lib/vault/readiness-coverage.ts:74-96` `coverageTier()` — status is `'complete'` only when `earnedPoints >= 15`, which requires every needing track individually at top tier; partial coverage yields an averaged, sub-15, `'warning'` score. |
| T-18-22 | Tampering | high | mitigate | One shared fixture drives both TS and SQL derivations; SQL half backed by human spot-check | **CLOSED** (structural); live parity spot-check deferred | `lib/vault/coverage-fixtures.ts` exists and is imported by both `readiness-coverage.test.ts` and referenced structurally in `migration-068.test.ts`; migration `068...sql` comment block explicitly cross-references the TS module and the fixture. Live DB-vs-page parity spot-check is `18-VERIFICATION.md human_verification` item 9 (deferred, no SQL client available at push time — established project convention). |
| T-18-23 | Denial of Service | high | mitigate | Legacy branch evaluated first, unchanged, in both implementations | **CLOSED** | `lib/vault/readiness.ts:106-107` — `legacyStatus === 'complete'` checked and returned before any coverage logic runs. Migration `068...sql:150` — `score := score + 15; -- legacy wet-sign-upload path, unchanged` is the first branch of the `IF`. |
| T-18-24 | Repudiation | medium | mitigate | Breakdown names covered-of-needing count and specific uncovered songs | **CLOSED** | `components/vault/SplitSheetCoverage.tsx:32-46` renders `{covered} of {needing} songs covered` and lists `uncoveredTracks.map(t => t.title)`. |
| T-18-25 | Spoofing | medium | mitigate | No solo-written exemption field anywhere; grep gate enforces | **CLOSED** | Independently re-run: `grep -rn "solo_written\|no_sheet_needed\|soloWritten"` across `lib/`, `app/`, `components/`, `supabase/migrations/` → zero matches. |
| T-18-SC | Tampering (supply chain) | low | accept | No package installs | **CLOSED** | No new dependency in any 18-04 commit. |

## 18-05 (Identity Foundation)

| Threat ID | STRIDE | Severity | Disposition | Declared Mitigation | Status | Evidence |
|---|---|---|---|---|---|---|
| T-18-26 | Info Disclosure | high | mitigate | Resolver pure/no-I/O; the feeding read is server-side, scoped by server-verified `claimed_by`, invoked only for authorized-viewable parties | **CLOSED** | `lib/split-sheets/live-identity.ts` — zero I/O in the module (confirmed: no imports of any Supabase client). Sole caller `app/(artist)/split-sheets/[id]/page.tsx` gated by the same `isInitiator \|\| isParty` 404 check (line 96) verified under T-18-01a above. |
| T-18-27 | Tampering | high | mitigate | Every write informed by the resolver is scoped strictly by `claimed_by = verified user id`, never a client-supplied id | **CLOSED** | The resolver itself performs no writes (data-only). The one write path it informs, §7 (`approve/[token]/route.ts:90-107`), scopes `split_sheet_parties` by `party.id` (token-resolved) and `collaborators` by `party.collaborator_id` (read off that same token-resolved row) — never a client-supplied id. |
| T-18-28 | Tampering / EoP | high | mitigate | `legal_name_locked_at` kept out of `EDITABLE_FIELDS`; server-owned, one-time, no unlock path | **CLOSED** | `app/api/profile/route.ts` — `EDITABLE_FIELDS` (lines 18-52) does not list `legal_name_locked_at`; lock logic (196-215) only triggers on `body.lock_legal_name === true`, checks `alreadyLocked` first (line 203-204), stamps `new Date().toISOString()` (line 212) — never a client-supplied timestamp, no code path clears it. |
| T-18-29 | Tampering | medium | mitigate | SECURITY DEFINER trigger scoped strictly by `NEW.collaborator_id` | **CLOSED** | Migration `066...sql:129-142` — `UPDATE public.collaborators SET status = 'confirmed' WHERE id = NEW.collaborator_id AND status <> 'confirmed'`; `SET search_path = ''` present (line 130) preventing search-path hijack. |
| T-18-30 | Tampering | high | mitigate | Every column additive; no ALTER/DROP; idempotent guards | **CLOSED** | Migration `066...sql` — independently re-grepped: zero matches for `ALTER COLUMN`/`DROP COLUMN`/`DROP CONSTRAINT` across migrations 066/067/068; every `ADD COLUMN` carries `IF NOT EXISTS`. |
| T-18-SC | Tampering (supply chain) | low | accept | No package installs | **CLOSED** | No new dependency in any 18-05 commit. |

---

## Accepted Risks Log

This log did not exist before this audit; the `accept`-disposition threats below were declared in the plans' threat models but never previously recorded in a standing log. Recording them here closes them per this audit's verification method (accept → check log → absent means OPEN; this entry makes them present).

1. **T-18-02** (18-01, medium) — Split-sheet share tokens (`/approve/[token]` preview links) disclose co-party legal name, PRO, and IPI to whoever holds the URL. Accepted because parties to a shared agreement are meant to see each other's details on that agreement (design section 10b); bounded by the token's existing 30-day expiry and 256-bit entropy, unchanged from the pre-existing approval token. No wider disclosure surface was added.
2. **T-18-11** (18-02, low) — Same co-party detail (legal name, PRO, IPI) surfaces again on the Contract Locker's awaiting-signature rows. Accepted for the same reason (parties to one agreement legitimately see each other's details on that agreement); the bound verified in this audit is that `lib/contracts/locker-attention.ts`'s input types carry only per-sheet fields, so no other catalog data can leak through this surface.
3. **T-18-SC** (all five plans, low) — No package installs occurred in Phase 18; verified via `package.json`/lockfile diff across every phase-18 commit.

---

## Cross-Phase Finding (attributed to Phase 17, not a Phase 18 gap)

**T-18-01c, downgraded from "mitigate: confirmed" to "mitigate: declared but unverified in fact — gap found."** `app/api/split-sheets/[id]/mint-envelope/route.ts` (Phase 17 file, zero Phase 18 commits touch it per `git log`) requires every signable party to have a normalizable `email` (line 147-150) but has **no check that `legal_name` is non-empty** before minting. Phase 18's fast-add flow (`PartyPicker.tsx`) makes this reachable in a new way: a fast-added, not-yet-responded party has a placeholder `name` (their email/phone) and an empty `legal_name`, and nothing in the mint-envelope route blocks that party from being minted onto a legal document with a missing/placeholder legal name.

This is genuinely pre-existing Phase 17 behavior — Phase 18 does not modify the vulnerable file, and this exact gap is already recorded (independently) in `18-VERIFICATION.md`'s "Cross-Phase Finding" section. Recorded here per this audit's instruction to attribute it to Phase 17 rather than re-derive it as a new Phase 18 finding. Severity: medium (a placeholder identity value on a legal document, not a data-access or privilege breach) — below this audit's `block_on: high` threshold, so it does not block Phase 18 and is tracked as a Phase 17 follow-up (add a non-empty-`legal_name` gate to `mint-envelope/route.ts`).

---

## Verdict

**34 of 35 registered threats CLOSED** with direct code evidence (file:symbol) verified in this session — not accepted on the strength of SUMMARY.md/VERIFICATION.md prose. **1 threat (T-18-01c) is OPEN but non-blocking** (medium severity, below `block_on: high`), and is a Phase 17 file's pre-existing gap that Phase 18 makes newly reachable — tracked as a Phase 17 follow-up, not a Phase 18 regression.

No high- or critical-severity threat is open. `threats_open` (the severity-filtered blocking count) = **0**. Phase 18 is not blocked from shipping on security grounds.

Independently re-verified in this session (not taken from prior reports): full test suite (84/84 suites, 1031/1031 tests), `npx supabase migration list` (LOCAL=REMOTE through 068), zero `solo_written`/`no_sheet_needed`/`soloWritten` occurrences, zero `ALTER COLUMN`/`DROP COLUMN`/`DROP CONSTRAINT` in migrations 066-068, zero Phase 18 commits touching `CollaboratorPicker.tsx`/`MetadataStudio.tsx`, and every cited mitigation read directly from source.
