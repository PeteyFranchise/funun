# Phase 17 — Resume Here

**Paused:** 2026-07-20, updated 2026-07-21 · **Branch:** `codex/phase-11-presence-messaging`

**Phase 17 code is COMPLETE.** All ten plans have SUMMARYs; `gsd-tools` reports zero incomplete plans. Migrations 062–065 are applied and verified on the remote database. Gates green: `npm run build` succeeds, `npx tsc --noEmit` clean (before *and* after a build), `npm run lint` clean, **71 suites / 831 tests**.

**Deploy and webhook wiring are DONE, as of 2026-07-21.** Env vars are set in Vercel production (Pete added `DOCUSEAL_API_KEY`, `DOCUSEAL_WEBHOOK_SECRET`, `ESIGN_FROM_EMAIL` personally), production is deployed, and the webhook probe confirmed **401 on an unsigned payload** — the route is live and verification is active. Section "1. Deploy + wire the webhook" below is historical record, not a pending task.

---

## THE ACTUAL BLOCKER NOW — a deliberate sequencing decision, not a technical one

**The live checkpoint (§2 below) is intentionally ON HOLD.** Not because anything is broken in Phase 17's code — because attempting the checkpoint surfaced a real product problem worth fixing *before* testing against it, and Pete decided to fix that first rather than test a flow already known to be confusing.

**What happened:** while preparing to run the checkpoint, a live reproduction (Maya Rayes account, `funun.studio/split-sheets`, screenshotted step-by-step) turned up what looked like a state-corruption bug — adding a second party appeared to overwrite the first party's data. A careful, deliberate re-reproduction proved **the underlying code is not broken**: two independently-added parties rendered correctly and split cleanly to 50/50. The real cause was the *flow itself* — the initiator has to manually add-and-fill their own row (via "+ Add party" then "Use my info") before they can even add a real collaborator, and that confusion is compounded by a genuinely broken, cramped collaborator-picker popup. Full trace: `.planning/deliberations/split-sheet-identity-and-collaborator-model.md`, "Originating bug" section.

**That investigation grew into a full redesign**, captured in the same document: the initiator should be party 1 automatically (legal name locked, PRO/IPI live-linked from Settings, no manual add-yourself step); collaborators get added via email/phone only; a real structured Groups feature; SMS invites; and a symmetrical "advanced info" pattern on both the initiator's and the recipient's side. Eight decisions, fully reasoned, in that document.

**Pete's call: build this redesign before running the live checkpoint**, rather than test the current, known-confusing flow and then redo the test once the redesign ships. This is deliberate, not a stall.

**Concrete conflict this surfaced:** Phase 18's `18-01-PLAN.md` (drafted, unexecuted) explicitly says *"CollaboratorPicker is rendered on every party row exactly as it is in create mode"* — meaning it's written to extend the current picker onto the living-draft surface unchanged. Executing 18-01 as drafted before the redesign would bake the same confusing pattern into a second surface. **So this isn't a separate new phase — the redesign needs to fold into and reshape Phase 18's existing drafts.** `/gsd-discuss-phase 18` is the next step, reconciling `split-sheet-identity-and-collaborator-model.md` against 18-01 through 18-04 before any of them execute.

**Sequencing from here:** `/gsd-discuss-phase 18` → replan 18-01..18-04 against the new identity model → execute → *then* resume the live checkpoint (§2) against the improved flow, not the current one.

---

## Reference — env var setup (DONE, kept for the record)

Three environment variables were missing from the Vercel production target (`funun`, scope `peteyfranchises-projects`, prod URL `https://www.funun.studio`). Codex inspected and correctly stopped rather than deploying with partial config; Pete then added them personally, since two are live API credentials that shouldn't pass through a chat transcript or agent hands.

```bash
npx vercel env add DOCUSEAL_API_KEY production --scope peteyfranchises-projects --project funun
npx vercel env add DOCUSEAL_WEBHOOK_SECRET production --scope peteyfranchises-projects --project funun
npx vercel env add ESIGN_FROM_EMAIL production --scope peteyfranchises-projects --project funun
```

All three confirmed present via `vercel env ls` — Encrypted, Production. Already set alongside them: Supabase (URL/anon/service-role), Anthropic, all Stripe keys, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_APP_URL`, Google Places, `NEXT_PUBLIC_VAULT_DEMO`.

---

## 1. Deploy + wire the webhook — DONE, 2026-07-21

Completed by Codex. Pre-deploy gates all passed, production deployed and auto-promoted to `https://www.funun.studio`, webhook probe confirmed:

```bash
curl -i -X POST https://funun.studio/api/webhooks/docuseal -H 'Content-Type: application/json' -d '{}'
# -> 401 {"error":"Webhook verification failed"}
```

That's the correct, expected result — the route exists, the secret is loaded, and an unsigned/forged payload is rejected. DocuSeal dashboard webhook events subscribed: `form.viewed`, `form.started`, `form.completed`, `form.declined`, `submission.completed`. No dashboard change needed — the route only acts on `submission.completed`; everything else is acknowledged and ignored.

## 2. The 10-step live checkpoint (17-07 Task 3) — SPLIT, ON HOLD (see blocker above)

Full text: `.planning/phases/17-split-sheet-esign/17-07-PLAN.md`, the `checkpoint:human-verify` task.

**Delegable (mechanical):** step 6 (tampered-payload rejection + replay idempotency) and step 7 (telemetry readout vs the AM-3 $500/mo trigger).

**Pete only — cannot be honestly delegated:**
- **Step 2** — signing on a *physical* 375px viewport. This is what the whole D-18b mobile-first decision rests on. An agent reporting "mobile verified" from a headless browser is asserting something it cannot know.
- **Step 8** — confirming an invite *arrived*, came from Funūn's mailbox, that replying lands there, and that no provider-branded mail arrived. Only someone with the inbox can say this.
- **Steps 9–10** — reading the rendered certificate, and confirming a non-Latin-1 name renders correctly. Same class of check as the `Funkn` bug: a text search returns clean *while the bug is present*, because Identity-H stores glyph IDs, not ASCII. Eyes are the only reliable instrument.

**This run costs real money** ($0.20 per completed document) and **sends real email**. Use three email addresses you control.

**Expect step 3 to fail, and it is not a new bug:** `ReconcileDiff` is mounted on no page. 17-05 built the component and both routes but wired no surface. `reconcileOffered` fires correctly and links to `/split-sheets/{id}`, where there may be nothing to render it. This is the `/split-sheets` orphaning that **Phase 18 exists to fix**.

## 3. Attorney review — the long-lead item, independent of the sequencing decision above

Package ready and unchanged: `~/Desktop/Funun-Split-Sheet-Attorney-Review/` (also in `counsel-review/` here).

Production minting stays **hard-blocked** until this returns: `assertCounselReviewedForProduction()` throws in production while `COUNSEL_REVIEW_STATUS === 'unreviewed'` in `lib/split-sheets/agreement.ts`. Flipping that constant to `'reviewed'` — with reviewer name, firm, and date recorded in the comment above it — is the only thing that unblocks it. **Do not flip it to test the flow.**

The two questions that matter most, from the package's §3:
- **§3.1 provenance** — the operative clauses came from a Word template of unknown origin. If it is someone's proprietary drafting, the answer is a clean-room rewrite, not a review. Flag this at first contact so it is not a mid-engagement surprise.
- **§3.2 placement** — the master-rights disclaimer sits in a *Guidance Note*, not the operative clauses. Producers sign these. If one signs believing master rights are settled, that is a product failure regardless of the legal answer.

---

## Open follow-ups — tracked, not urgent

| Item | Why it matters |
|---|---|
| **Repo-wide privilege sweep** (background task running) | `TRUNCATE` — and possibly `TRIGGER` — still granted to `authenticated`/`anon` on `capability_grants`, `green_room_placements`, `reports`, `dm_threads`, `dm_messages`. TRUNCATE ignores RLS. Migration 062 is the corrected reference pattern. |
| **`calculate_vault_readiness()` is SECURITY INVOKER** while reading `split_sheets` | Any future RLS on a table it touches re-arms the 42P17 class of failure that broke the vault write path on 2026-07-20. Making it SECURITY DEFINER closes it permanently — a security decision, deliberately not smuggled into the recursion fix. |
| **Migration 040's doctrine is narrower than documented** | `artist_profiles.administrator` matches `publisher` exactly (both carry `anon UPDATE`, `anon`/`authenticated INSERT`, `REFERENCES`) — but that is *not* "zero privileges" as 063's comment claims. Not a regression; belongs to the same sweep. |
| **No guard against page-module exports** | The `contracts/page.tsx` build break survived three plans because it surfaces only via build-generated `.next/types`. A CI step running `npm run build`, or an ESLint rule on page exports, catches it at introduction. |
| **Readiness tiering has never fired** | All three vault projects showed zero delta on every push — none has split sheets attached. The tiering branch is applied but unexercised. The live checkpoint is its first real test. |
| **`ReconcileDiff` unmounted** | See step 3 above. Phase 18 territory. |

---

## Where the details live

- `.planning/phases/17-split-sheet-esign/17-07-SUMMARY.md` — checkpoint prerequisites, and what could not be verified without a live run (notably: `fetchCompletionArtifacts` field names are *inferred* from provider docs, not observed — if they differ, certificate fields render empty rather than wrong)
- `17-PROVIDER-VERIFICATION.md` — the verified webhook scheme, certificate inspection, void-billing answer
- `17-MIGRATION-PUSH-HANDOFF.md` — migration push prompts + the three defects the 062 push surfaced
- `.planning/debug/split-sheet-rls-recursion.md` — the 42P17 root cause and its resolution
- `.planning/FINANCIALS.md` — AM-2c recipient cap, AM-3 spend trigger, D-18c single-provider decision
- `counsel-review/COUNSEL-REVIEW-PACKAGE.md` — §6 holds notes for Pete that were stripped from the attorney-facing copy

## After Phase 17's checkpoint (deliberately deferred — see blocker above)

**Phase 18** (Split-Sheet Home) has four plans drafted and unexecuted: waves 18-01 → 18-03 → 18-02 ∥ 18-04. It fixes the `/split-sheets` orphaning, the living draft, the Contract Locker workspace, and coverage-based readiness — including the `ReconcileDiff` surface that the checkpoint will expose as missing. **These plans are now stale against `split-sheet-identity-and-collaborator-model.md` and need a discuss/replan pass before executing** — see the blocker section at the top of this document.
