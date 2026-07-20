# Phase 17 — Resume Here

**Paused:** 2026-07-20 · **Branch:** `codex/phase-11-presence-messaging` · **Head at pause:** `2482e66`

**Phase 17 code is COMPLETE.** All ten plans have SUMMARYs; `gsd-tools` reports zero incomplete plans. Migrations 062–065 are applied and verified on the remote database. Gates green: `npm run build` succeeds, `npx tsc --noEmit` clean (before *and* after a build), `npm run lint` clean, **71 suites / 831 tests**.

Everything below is human-gated work. Nothing is half-finished in the codebase — no partial edits, no uncommitted state, no broken intermediate.

---

## THE BLOCKER — start here

Three environment variables are **missing from the Vercel production target** (`funun`, scope `peteyfranchises-projects`, prod URL `https://www.funun.studio`). Codex inspected and correctly stopped rather than deploying with partial config.

```bash
npx vercel env add DOCUSEAL_API_KEY production --scope peteyfranchises-projects --project funun
npx vercel env add DOCUSEAL_WEBHOOK_SECRET production --scope peteyfranchises-projects --project funun
npx vercel env add ESIGN_FROM_EMAIL production --scope peteyfranchises-projects --project funun
```

Each prompts interactively, so nothing lands in shell history.

**Pete must do this personally.** Two of the three are live API credentials — not delegable to Claude or Codex, and they must not pass through a chat transcript. `.env.local` is permission-guarded for the same reason.

Getting these right matters:

| Var | Watch out for |
|---|---|
| `DOCUSEAL_WEBHOOK_SECRET` | Must be **byte-identical** to the DocuSeal dashboard secret, `whsec_` prefix included. Do not strip it, do not base64-decode it. A mismatch rejects every genuine webhook as forged — and it fails *silently*, looking exactly like DocuSeal never delivered. |
| `DOCUSEAL_API_KEY` | The `X-Auth-Token` from the **Pro** account (upgraded 2026-07-20), not a leftover trial token. |
| `ESIGN_FROM_EMAIL` | `esign@funun.studio`. **Not a secret** — this one is delegable. But the mailbox must exist, be monitored, and sit on a Resend-verified domain. It is both sender AND reply-to, so a collaborator hitting reply on a split-sheet invite lands there. Likely the first inbound message any collaborator ever sends Funūn. |

Verify by name only when done:
```bash
npx vercel env ls production --scope peteyfranchises-projects --project funun
```

Already set in production: Supabase (URL/anon/service-role), Anthropic, all Stripe keys, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_APP_URL`, Google Places, `NEXT_PUBLIC_VAULT_DEMO`.

---

## Then, in order

### 1. Deploy + wire the webhook — delegable to Codex

The full prompt is in this folder's git history and can be regenerated; the substance:

- Pre-deploy gates (build / tsc / lint / test) — **already passing as of `2482e66`**, but re-run them; a failing build is what blocked this entire path for most of 2026-07-20.
- Deploy to production (Pete already approved production in-session on 2026-07-20; re-confirm if that has gone stale).
- Report the deployed URL.
- **Probe the webhook — this is a real security test, not a smoke test:**
  ```bash
  curl -i -X POST https://<deployed-url>/api/webhooks/docuseal \
    -H 'Content-Type: application/json' -d '{}'
  ```
  Expect **401** (verification failed) with the secret set, or **503** (not configured) without it. **A 200 or 500 is a problem — stop.** A webhook that accepts unsigned payloads lets anyone forge a "document executed" event, which files contracts into lockers and moves readiness scores.
- Point the DocuSeal dashboard webhook at `https://<deployed-url>/api/webhooks/docuseal`, subscribed to submission-completion events.
- Confirm the dashboard secret matches the Vercel value — report **match/mismatch only**, never print either.

### 2. The 10-step live checkpoint (17-07 Task 3) — SPLIT

Full text: `.planning/phases/17-split-sheet-esign/17-07-PLAN.md`, the `checkpoint:human-verify` task.

**Delegable (mechanical):** step 6 (tampered-payload rejection + replay idempotency) and step 7 (telemetry readout vs the AM-3 $500/mo trigger).

**Pete only — cannot be honestly delegated:**
- **Step 2** — signing on a *physical* 375px viewport. This is what the whole D-18b mobile-first decision rests on. An agent reporting "mobile verified" from a headless browser is asserting something it cannot know.
- **Step 8** — confirming an invite *arrived*, came from Funūn's mailbox, that replying lands there, and that no provider-branded mail arrived. Only someone with the inbox can say this.
- **Steps 9–10** — reading the rendered certificate, and confirming a non-Latin-1 name renders correctly. Same class of check as the `Funkn` bug: a text search returns clean *while the bug is present*, because Identity-H stores glyph IDs, not ASCII. Eyes are the only reliable instrument.

**This run costs real money** ($0.20 per completed document) and **sends real email**. Use three email addresses you control.

**Expect step 3 to fail, and it is not a new bug:** `ReconcileDiff` is mounted on no page. 17-05 built the component and both routes but wired no surface. `reconcileOffered` fires correctly and links to `/split-sheets/{id}`, where there may be nothing to render it. This is the `/split-sheets` orphaning that **Phase 18 exists to fix**.

### 3. Attorney review — the long-lead item

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

## After Phase 17 closes

**Phase 18** (Split-Sheet Home) has four plans drafted and unexecuted: waves 18-01 → 18-03 → 18-02 ∥ 18-04. It fixes the `/split-sheets` orphaning, the living draft, the Contract Locker workspace, and coverage-based readiness — including the `ReconcileDiff` surface that the checkpoint will expose as missing.
