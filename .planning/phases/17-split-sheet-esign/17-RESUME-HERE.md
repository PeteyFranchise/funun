# Phase 17 — Resume Here

**Paused:** 2026-07-20, updated 2026-07-22 (Phase 18 now shipped — see STATUS below) · **Branch:** `codex/phase-11-presence-messaging`

**Phase 17 code is COMPLETE.** All ten plans have SUMMARYs; `gsd-tools` reports zero incomplete plans. Migrations 062–065 are applied and verified on the remote database. Gates green: `npm run build` succeeds, `npx tsc --noEmit` clean (before *and* after a build), `npm run lint` clean, **71 suites / 831 tests**.

**Deploy and webhook wiring are DONE, as of 2026-07-21.** Env vars are set in Vercel production (Pete added `DOCUSEAL_API_KEY`, `DOCUSEAL_WEBHOOK_SECRET`, `ESIGN_FROM_EMAIL` personally), production is deployed, and the webhook probe confirmed **401 on an unsigned payload** — the route is live and verification is active. Section "1. Deploy + wire the webhook" below is historical record, not a pending task.

---

## STATUS 2026-07-22 — Phase 18 SHIPPED; the sequencing blocker is CLEARED

**The redesign that put this checkpoint on hold is done.** Phase 18 (Split-Sheet Home) was replanned against `split-sheet-identity-and-collaborator-model.md` and fully executed on 2026-07-22 — 5 plans / 3 waves, migrations 066/067/068 live (LOCAL=REMOTE through 068), verifier `passed_with_human_checks`, security audit **34/35 threats closed, 0 high/critical** (`18-SECURITY.md`), and 3 of 4 code-review findings fixed (`18-REVIEW.md`; suite 84 suites / 1043 tests, `npm run build` re-run clean exit 0 post-fix on 2026-07-22).

**What shipped** (the exact things this checkpoint was waiting on): the initiator is now party 1 automatically — legal name locked from Settings, PRO/IPI/publisher/administrator live-linked (migration 066 + `resolvePartyIdentity()`); collaborators are added via the new email/phone-first **PartyPicker** (the cramped popup is gone, and `CollaboratorPicker` was left byte-for-byte untouched so MetadataStudio is unaffected); the living draft exists (`/split-sheets` list + `/split-sheets/[id]` edit — the orphaning §2/step-3 relied on is fixed); the attention-first Contract Locker; song-level attachment (migration 067); and coverage-based readiness (migration 068). **Groups and SMS were explicitly deferred** to future phases — they are NOT in Phase 18.

**So the live checkpoint (§2) is no longer blocked on a redesign.** Remaining real prerequisites before running it:

1. **Mint-envelope legal-name gate (NEW — surfaced by Phase 18; fix in progress).** A party fast-added by email/phone has a blank `legal_name`, and `app/api/split-sheets/[id]/mint-envelope/route.ts` does not require one before minting — so a fast-added party can be minted onto the legal PDF as a bare em-dash. Confirmed by the Phase 18 security audit (open item, medium, attributed here to Phase 17) and code review. A fix (guard blocking mint until every party has a real legal name) is being applied in a separate session. **This is the exact mint path the checkpoint exercises — land it first.**
2. **Confirm the counsel-review flip is genuine.** Commit `1e3aac5` (17-09a) set `COUNSEL_REVIEW_STATUS = 'reviewed'`, unblocking production minting. §3 below previously said *"do not flip it to test the flow."* Before minting real documents, confirm an actual attorney review (or a deliberate, recorded owner decision) backs that flip — reviewer/firm/date in the comment above the constant.
3. **The Pete-only live steps (§2).** Mobile 375px signing, inbox confirmation (arrival, from-address, no provider-branded mail), and certificate/glyph rendering — none honestly delegable. Real money ($0.20/completed doc) and real email; use three addresses you control.

DocuSeal API + webhook wiring is already DONE (env vars set in Vercel prod, webhook probe returns 401 on an unsigned payload — see the record below).

**Sequencing from here:** land the mint-gate fix → confirm the counsel-review backing → run the §2 live checkpoint against the improved flow.

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

**Step 3 (was "expect it to fail"): re-verify — Phase 18 shipped the surface.** `reconcileOffered` links to `/split-sheets/{id}`, which was orphaned when this was written (17-05 built `ReconcileDiff` + both routes but wired no page). **Phase 18's 18-01 shipped `/split-sheets/[id]`**, so the orphaning is fixed. Before assuming step 3 still fails, confirm whether `ReconcileDiff` (or the reconcile affordance) is actually mounted on the new `[id]` page — if 18-01 wired it, this expected failure is resolved; if not, it's a small remaining gap to close before the checkpoint, not the wholesale orphaning it used to be.

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

**Phase 18** (Split-Sheet Home) is **DONE** — executed 2026-07-22 (5 plans / 3 waves: 18-05 identity foundation, 18-03 song attachment, 18-01 living draft, 18-04 coverage readiness, 18-02 Contract Locker). The `split-sheet-identity-and-collaborator-model.md` redesign was folded in via a replan (18-05 added; 18-01/18-02 rewritten; 18-03/18-04 unchanged) and shipped. It fixed the `/split-sheets` orphaning, the living draft, the Locker workspace, coverage-based readiness, and the identity/collaborator flow. See the STATUS section at the top of this document for the current state and the remaining checkpoint prerequisites.
