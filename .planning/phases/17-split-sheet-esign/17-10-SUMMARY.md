---
phase: 17-split-sheet-esign
plan: 10
subsystem: esign
tags: [react-pdf, resend, email, docuseal, provenance, certificate, split-sheet, white-label]

# Dependency graph
requires:
  - phase: 17-split-sheet-esign
    provides: "registerFunuunPdfFonts() Unicode-safe font registration (17-08)"
  - phase: 17-split-sheet-esign
    provides: "lib/split-sheets/agreement.ts display helpers + the approved single-dimension share vocabulary; SplitSheetAgreementInput (17-09)"
provides:
  - "lib/split-sheets/esign-invite.ts — buildSignatureInviteEmail() / sendSignatureInvite() / sendSignatureInvites(): a Funūn-branded, Funūn-sent signature invite whose only action link is Funūn's own /approve/[token] page, sent from and reply-to ESIGN_FROM_EMAIL, never throwing, returning a per-signer structured result"
  - "lib/vault/pdf/completion-certificate.tsx — renderCompletionCertificate(): Funūn's own Certificate of Completion, with provenance separated at the TYPE level (funuunObserved vs providerReported) and a single attributed consumer of the provider group"
  - "PROVIDER_RECORD_ID / NOT_LEGAL_ADVICE_STATEMENT / SCOPE_STATEMENT exported constants"
  - "Provenance-containment test pattern: render-tree walk that removes the attributed region's contiguous text run and asserts no provider-reported value survives anywhere else on the page"
affects: [17-06, 17-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Provenance separation as a TYPE boundary, not a naming convention: a renderer's input is two named groups and exactly one sub-component receives the untrusted/unobserved group, so leaking a provider-reported fact into an unattributed section requires deliberately moving a value across a type boundary"
    - "Containment testing by contiguous-subtree text subtraction: locate the attributed region by marker id in the expanded react-pdf tree, assert its aggregated text is a substring of the document text, remove that one run, and assert every sensitive value is absent from the remainder"
    - "Provider-free assertion against RENDERED output rather than source: scanning the produced subject/html/text for provider hosts/paths/brand marks means a header comment naming what the module replaces can neither break the gate nor falsely satisfy it"
    - "Structured notConfigured flag on a delivery result, distinguishing 'email is not set up in this environment' from 'we tried and it failed' — a single boolean would conflate a benign unconfigured state with a real bounce the initiator should be prompted to resend"

key-files:
  created:
    - lib/split-sheets/esign-invite.ts
    - lib/split-sheets/esign-invite.test.ts
    - lib/vault/pdf/completion-certificate.tsx
    - lib/vault/pdf/completion-certificate.test.ts
  modified: []

key-decisions:
  - "The certificate's Execution Summary lives INSIDE the attributed provider region, not above it. The plan's behavior block lists an execution summary (per-signer completion timestamps) as a section preceding the provenance section, but those timestamps are themselves provider-reported — rendering them in an unattributed section would violate the very constraint the plan calls non-negotiable. Resolution: the provider region opens with the attribution, then renders Execution Summary → Verification Details → Document Integrity in the plan's stated order, all under headings naming DocuSeal. Section order is preserved; attribution is not compromised."
  - "Provider region located in tests by an explicit `id={PROVIDER_RECORD_ID}` marker prop (react-pdf NodeProps supports `id`) rather than by style-shape matching — a style-based selector would silently start matching a different View the moment someone reuses the accent border, which is exactly the failure mode 17-09 hit and fixed in its own test authoring"
  - "completionMethod is 'interactive' | 'api' — an API completion renders 'Completed via the DocuSeal API (no interactive signing session)', an interactive one renders 'Signed interactively in a signing session'. A P17-01 fast-lane party who never sat in front of a signing session must not read identically to one who did."
  - "The certificate reports the ONE share dimension the executed agreement states (songwriting/publishing), not writer/publisher/master dimensions — see Deviation 1. It restates the agreement's master-ownership carve-out verbatim in substance so the certificate cannot be read as covering master rights it never governed."
  - "NOT_LEGAL_ADVICE_STATEMENT is defined locally in the certificate module rather than added to lib/split-sheets/agreement.ts — see Deviation 2. agreement.ts holds counsel-gated verbatim text and is not in this plan's files_modified."
  - "sendSignatureInvite checks ESIGN_FROM_EMAIL itself AND still passes an explicit `from` key to the wrapper. The local check gives the caller an explicit notConfigured signal instead of forcing it to string-match the wrapper's generic error; the explicit `from` key keeps the wrapper's own override gating as the backstop (T-17-34)."
  - "sendSignatureInvites fans out sequentially rather than in parallel, so a provider rate limit degrades into slower delivery instead of a burst of failures, and the result array order matches the input order the caller reports on"
  - "approveUrl() emits a relative path when NEXT_PUBLIC_APP_URL is unset rather than 'undefined/approve/…'. A broken link is recoverable; a link that visibly reads 'undefined' destroys the single trust signal this message depends on (T-17-31)."

patterns-established:
  - "Type-level provenance separation for any artifact that mixes self-observed and third-party-reported facts — the group with one legitimate consumer gets exactly one consumer, and containment is test-asserted rather than review-asserted"
  - "Mutation-checking a containment gate before trusting it: deliberately leak a sensitive value into the forbidden section and confirm the test fails, so an all-green-first-run assertion is not mistaken for a working assertion"

requirements-completed: [ESIGN-18, ESIGN-19]

coverage:
  - id: D1
    description: "buildSignatureInviteEmail() renders a Funūn-branded subject/html/text naming the song, the initiator, the signer's own share, and every party on the sheet, with exactly one action link — Funūn's /approve/[token] page for the recipient's own token — and no provider host, path, image, or brand mark anywhere in the output"
    requirement: "ESIGN-18"
    verification:
      - kind: unit
        ref: "lib/split-sheets/esign-invite.test.ts#buildSignatureInviteEmail"
        status: pass
    human_judgment: false
  - id: D2
    description: "sendSignatureInvite() sends through the lib/email Resend wrapper with from AND replyTo both set to ESIGN_FROM_EMAIL, never throws, returns a structured per-signer result, and no-ops with an explicit notConfigured result when the mailbox or the Resend key is unset"
    requirement: "ESIGN-18"
    verification:
      - kind: unit
        ref: "lib/split-sheets/esign-invite.test.ts#sendSignatureInvite"
        status: pass
    human_judgment: false
  - id: D3
    description: "sendSignatureInvites() fans out per signer and returns a per-signer result array, so one signer's delivery failure neither aborts a spent mint nor hides partial delivery from the caller (T-17-33)"
    requirement: "ESIGN-18"
    verification:
      - kind: unit
        ref: "lib/split-sheets/esign-invite.test.ts#sendSignatureInvites"
        status: pass
    human_judgment: false
  - id: D4
    description: "renderCompletionCertificate() returns a valid PDF Buffer carrying a Funūn-branded header, the work, the parties with legal/professional names and their share dimension, the Funūn split-sheet identifier, and the executed-document location — using the registered Noto Sans family so non-Latin-1 party legal names survive (17-08 regression surface)"
    requirement: "ESIGN-19"
    verification:
      - kind: unit
        ref: "lib/vault/pdf/completion-certificate.test.ts#renderCompletionCertificate"
        status: pass
      - kind: unit
        ref: "lib/vault/pdf/completion-certificate.test.ts#font registration (ESIGN-15 / P17-08)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The honesty constraint holds structurally: the input separates funuunObserved from providerReported, ProviderRecordSection is the only consumer of the latter, and every provider-reported value (submission id, both SHA256s, audit-log path, per-signer IP / session id / user agent / timezone / completion timestamp / email-verification status) renders ONLY inside the attributed region naming DocuSeal (T-17-30)"
    requirement: "ESIGN-19"
    verification:
      - kind: unit
        ref: "lib/vault/pdf/completion-certificate.test.ts#provenance containment (T-17-30 — the honesty constraint)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The certificate states that the listed details were captured and reported by DocuSeal and that Funūn did not independently capture them, cites the provider's audit log by its Contract Locker location as the underlying evidence record rather than reproducing it, and renders an API-completed signer distinguishably from an interactive one"
    requirement: "ESIGN-19"
    verification:
      - kind: unit
        ref: "lib/vault/pdf/completion-certificate.test.ts#provenance containment (T-17-30 — the honesty constraint)"
        status: pass
      - kind: unit
        ref: "lib/vault/pdf/completion-certificate.test.ts#completion method"
        status: pass
    human_judgment: false
  - id: D7
    description: "ESIGN_FROM_EMAIL documented in .env.example as the monitored e-sign mailbox where collaborator replies land"
    verification: []
    human_judgment: true
    rationale: "NOT DONE — .env.example is unreadable and unwritable by this agent under the session's permission settings (Read, cat, and grep all denied). One line must be added by hand; exact text supplied under User Setup Required. This is the one automated verify step in the plan that could not be satisfied."
  - id: D8
    description: "A real collaborator receives the invite from a live esign@funun.studio mailbox, it lands in the inbox rather than spam, and a reply reaches a human"
    verification: []
    human_judgment: true
    rationale: "Requires a configured ESIGN_FROM_EMAIL with live domain deliverability and an actual send to a real inbox — no unit test can establish inbox placement or that a mailbox is genuinely monitored."
  - id: D9
    description: "The rendered certificate reads honestly and legibly to a non-lawyer artist — the attributed provenance region is visually unmistakable as the provider's report rather than Funūn's own evidence"
    verification: []
    human_judgment: true
    rationale: "Containment is machine-asserted, but whether a reader actually perceives the attribution boundary is a visual/editorial judgment. Generate a sample certificate and read it before the first real artist does."

# Metrics
duration: ~40min
completed: 2026-07-20
status: complete
---

# Phase 17 Plan 10: De-DocuSeal the Artist-Facing Surface Summary

**Built the two Funūn-owned artifacts that replace the provider's branded touchpoints — a Funūn-sent signature invite whose only link is Funūn's own approve page, and a Funūn Certificate of Completion whose input type makes it structurally impossible to print DocuSeal-reported evidence as Funūn-observed fact.**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-07-20
- **Tasks:** 2 of 2 (both autonomous; no checkpoints in this plan)
- **Files created:** 4 (2 modules, 2 test suites)

## Accomplishments

- **`lib/split-sheets/esign-invite.ts`** — `buildSignatureInviteEmail()` renders a Funūn-branded subject/html/text naming the song, the initiator, the recipient's own share, and every party on the sheet. Exactly one `href` in the whole message, always `{NEXT_PUBLIC_APP_URL}/approve/{token}` for *that* signer's token; no `<img>` at all; no provider host, path, or brand mark anywhere in the rendered output. `sendSignatureInvite()` goes through the existing `lib/email` Resend wrapper with `from` **and** `replyTo` both set to `ESIGN_FROM_EMAIL`, never throws, and returns a structured per-signer result. `sendSignatureInvites()` fans out sequentially and returns a per-signer array so the caller can report partial delivery.
- **`lib/vault/pdf/completion-certificate.tsx`** — Funūn's own Certificate of Completion. The input is two named groups: `funuunObserved` (song, artist, album/project, linked Funūn project, label, parties with legal/professional names and their share dimension, PRO, publishing designee, split-sheet id, executed-document path, rights scope) and `providerReported` (provider name, submission id, both document SHA256s, audit-log location, and per-signer completion timestamp, completion method, email-verification status, IP address, session id, user agent, timezone). `ProviderRecordSection` is the **only** component that receives the second group.
- **The honesty constraint is enforced by construction, and the enforcement was mutation-checked.** Every provider-reported value renders under headings naming DocuSeal, preceded by an explicit statement that DocuSeal captured them and Funūn did not. The audit log is cited by its Contract Locker location as the underlying evidence record — never reproduced, never claimed as Funūn's. API-completed signers render distinguishably from interactive ones.
- **Unicode safety preserved** — the certificate imports `registerFunuunPdfFonts()` from 17-08 rather than registering fonts itself, so `Nikola Jokić` and the `Funūn` brand string survive. A dedicated test asserts no `Text` overrides `fontFamily` with anything other than the registered family.

## Task Commits

1. **Task 1: Funūn-branded signature-invite email** — `ac6c79e` (test, RED) → `fa67ae2` (feat, GREEN)
2. **Task 2: Funūn Certificate of Completion with structurally-enforced provenance** — `a473751` (test, RED) → `065680c` (feat, GREEN)

**Plan metadata:** (this commit)

## Files Created/Modified

- `lib/split-sheets/esign-invite.ts` — the Funūn signature-invite email module (build + send + fan-out)
- `lib/split-sheets/esign-invite.test.ts` — 27 tests
- `lib/vault/pdf/completion-certificate.tsx` — the Certificate of Completion renderer with type-separated provenance
- `lib/vault/pdf/completion-certificate.test.ts` — 25 tests
- `.env.example` — **NOT modified; blocked by permissions.** See Deviation 3 and User Setup Required.

## Decisions Made

See `key-decisions` in frontmatter. The two that most affect future readers:

1. **The Execution Summary sits inside the attributed provider region.** Per-signer completion timestamps are provider-reported facts. The plan's behavior block lists the execution summary as a section *preceding* the provenance section, but rendering those timestamps in an unattributed section would break the constraint the plan itself calls non-negotiable. The provider region therefore opens with the attribution and then renders Execution Summary → Verification Details → Document Integrity in the plan's stated order — order preserved, attribution intact.
2. **The provider region is found in tests by an explicit `id` marker, not by style shape.** 17-09's own test authoring hit exactly the failure a style-based selector produces (matching an outer wrapper `View` instead of the intended one); a marker prop cannot drift that way.

## Deviations from Plan

### 1. [Superseded by the authoritative 17-09 spec] The certificate reports one share dimension, not three

- **Found during:** Task 2 planning
- **Issue:** The plan's `<action>` says to "reuse the share vocabulary from `lib/split-sheets/agreement.ts` (17-09) so the certificate reports the same writer, publisher, and master dimensions the executed agreement states," and the plan's `key_links` references a `resolvePartyShares` helper. Neither exists. 17-09 explicitly and deliberately did **not** build writer/publisher/master dimensions: its `key-decisions` record that the approved template spec (`17-SPLIT-SHEET-TEMPLATE-SPEC.md`) rejects them in favor of a fixed songwriting/publishing-only document, with a verbatim master-ownership Guidance Note replacing a master-split section entirely. `SplitSheetParty` carries a single `split_percentage`. `grep` for `resolvePartyShares`, `writer_share`, `publisher_share`, `master_share` across `lib/` and `types/` returns nothing.
- **Resolution:** The certificate reports the single dimension the executed agreement actually states, under the explicit column heading **"Songwriting / Publishing Split"** — which is the plan's real intent (report what the agreement states, do not re-derive or flatten), applied to the document that actually exists. It additionally restates the agreement's master-ownership carve-out (`SCOPE_STATEMENT`) so the certificate cannot be read as covering master rights it never governed. **Nothing was flattened** — there was only ever one dimension to report.
- **Verification:** `lib/vault/pdf/completion-certificate.test.ts` asserts the labelled dimension and the master carve-out.

### 2. [Rule 2 — missing critical content] No shared not-legal-advice statement existed to reuse

- **Found during:** Task 2
- **Issue:** The plan says the certificate "carries the same not-legal-advice statement the agreement carries." The agreement carries no such statement — `AGREEMENT_CLAUSES` and `GUIDANCE_NOTES` contain none, and the footer says only "Confidential — for licensing and registration use only." The nearest analogues in the repo are AI-prompt strings in `lib/tools/hireright.ts` and `lib/contracts/verify.ts`, neither reusable.
- **Fix:** Defined `NOT_LEGAL_ADVICE_STATEMENT` locally in the certificate module and exported it. Deliberately **not** added to `lib/split-sheets/agreement.ts`: that module holds counsel-gated verbatim legal text under an open P17-09a attorney-review checkpoint, and it is not in this plan's `files_modified`. Adding text there would put unreviewed wording inside the artifact awaiting review.
- **Recommendation for a later plan:** once counsel review closes, consider promoting a single shared disclaimer constant so the agreement and the certificate cannot drift apart.
- **Files:** `lib/vault/pdf/completion-certificate.tsx`
- **Committed in:** `065680c`

### 3. [Blocked — could not complete] `.env.example` was not modified

- **Found during:** Task 1
- **Issue:** `.env.example` is denied to this agent by the session's permission settings — `Read`, `cat`, and `grep` were all refused ("File is in a directory that is denied by your permission settings"). I did not attempt to route around the denial, since these guards exist specifically to keep an agent out of env files.
- **Impact:** Task 1's `<automated>` verify step `grep -Eq "ESIGN_FROM_EMAIL" .env.example` is **unsatisfied**. This is documentation only — no code path depends on `.env.example`, and `sendSignatureInvite()` already no-ops safely and explicitly when the variable is unset. Every other automated check in both tasks passed.
- **Action required:** one line, by hand. Exact text under User Setup Required below.

### 4. [Process note] The containment gate passed on its first run, so it was mutation-checked before being trusted

- **Found during:** Task 2
- **Issue:** All 25 certificate tests passed on the first implementation run. For an assertion whose entire job is proving a leak *cannot* happen, an all-green first run is as consistent with a vacuous test as with a working one.
- **Action:** Deliberately injected a leak — rendered `providerReported.submissionId` inside the Funūn-observed "Funūn Record" section — and confirmed **2 tests failed**. Reverted, re-confirmed 25/25 green, and confirmed `git diff` clean against the committed file.
- **Why this is recorded:** the containment test is the mitigation for T-17-30. A future contributor changing this renderer should know the gate was verified to actually fire, not merely observed to be green.

## Verification

- `npx jest lib/split-sheets/esign-invite.test.ts` — **27/27 passing**
- `npx jest lib/vault/pdf/completion-certificate.test.ts` — **25/25 passing**
- `npx tsc --noEmit` — clean
- `npm run lint` — clean (0 errors, 0 warnings, `--max-warnings=0`)
- **Full suite: 66 suites / 736 tests passing** — baseline was 64 suites / 684 tests; **+2 suites, +52 tests, zero regressions**
- `__tests__/pdf-unicode.test.ts` (the 17-08 Unicode suite) still passes unmodified
- Containment gate mutation-checked (see Deviation 4)
- **Not run:** `grep -Eq "ESIGN_FROM_EMAIL" .env.example` — see Deviation 3
- **Not touched, per instruction:** no DocuSeal API call, no database push, no purchase

## Issues Encountered

Only the `.env.example` permission block (Deviation 3). No implementation problems; both modules are pure, dependency-light, and required no new packages.

## User Setup Required

**1. Add `ESIGN_FROM_EMAIL` to `.env.example`** (I could not — see Deviation 3). Suggested placement is beside the other `*_FROM_EMAIL` entries:

```
# Monitored e-sign mailbox. Signature invites are sent FROM this address and
# replyTo points at it, so a collaborator's reply about a document they are
# being asked to sign reaches a real person. Leave unset and invites no-op
# safely — they never fall back to the generic RESEND_FROM_EMAIL sender.
ESIGN_FROM_EMAIL=
```

**2. Configure `ESIGN_FROM_EMAIL` in the deployment environment** (e.g. `esign@funun.studio`) and confirm the domain's deliverability, and that the mailbox is genuinely monitored by a human. Until it is set, every invite returns `{ ok: false, notConfigured: true }` and nothing is sent.

**3. Still open from earlier plans, and still blocking real artist use:**
- DocuSeal Pro purchase — required before ANY real artist use (the sandbox banner observed at the provider gate), independent of white-labelling. Pete's call; not this plan's work.
- Migration 063 push (17-09 checkpoint 1).
- Attorney review of `AGREEMENT_CLAUSES` (P17-09a, 17-09 checkpoint 2) — `COUNSEL_REVIEW_STATUS` is still `'unreviewed'`, so `assertCounselReviewedForProduction()` blocks any production mint by design.

## Next Phase Readiness

Both modules are ready to be called; **this plan wired nothing**, per its own ownership boundary.

- **17-06 (mint route)** calls `sendSignatureInvite(input)` once per signer after the envelope and signer rows persist, with DocuSeal's own invite email disabled (`send_email: false`) and per-submitter `reply_to` set. It should surface the returned per-signer results as partial-delivery status with a resend affordance — the results distinguish `notConfigured` from a real failure precisely so the UI can say the right thing.
- **17-07 (completion webhook)** calls `renderCompletionCertificate({ funuunObserved, providerReported })` and files the Buffer into Contract Locker alongside the executed PDF and the provider's audit log. **The audit log must actually be stored at the path passed as `auditLogPath`** — the certificate cites that location as the underlying evidence record, and a citation to a file that is not there is worse than no citation. That is the one integration invariant this plan cannot enforce from inside a pure module.

---
*Phase: 17-split-sheet-esign*
*Completed: 2026-07-20*

## Self-Check: PASSED

All 5 created files confirmed present on disk. All 4 task commits (`ac6c79e`, `fa67ae2`, `a473751`, `065680c`) confirmed in git log. No file deletions across the plan's commit range.
