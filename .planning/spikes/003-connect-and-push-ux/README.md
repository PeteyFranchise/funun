---
spike: 003
name: connect-and-push-ux
type: standard
validates: "Given the BYOK constraint, when a user connects Buffer and pushes a calendar, then the connect→map→push→status flow feels coherent"
verdict: VALIDATED
related: [001, 002]
tags: [buffer, ui, ux, byok]
---

# Spike 003: Connect Buffer & push calendar (UX)

## What This Validates

Given that Buffer has **no third-party OAuth for new apps** (so onboarding must be BYOK — paste a personal key), when a user connects Buffer and pushes their 4-week calendar from Funūn, then the whole flow — **Connect → Map channels → Push → Status** — feels coherent and honest rather than clunky. This is the "UI experience" half of the idea: can the constrained integration still feel good enough to ship?

## How to Run

Open the file directly in a browser (no server, no key needed — everything is simulated):

```bash
open .planning/spikes/003-connect-and-push-ux/index.html
```

1. **Connect** — see the honest BYOK explainer, paste any text as a "key", click Connect.
2. **Map channels** — 5 detected Buffer channels auto-match Funūn's platforms; YouTube Shorts shows the coverage-gap treatment (amber "will skip").
3. **Push** — watch each slot go queued → scheduled, with a simulated rate-limit retry on one slot and the unmapped slot skipped. See the summary.
4. **Sync status** — simulate Buffer reporting one post already went live (Scheduled → Sent → Funūn marks it complete).
5. **Push log** — view the simulated telemetry (what real observability would capture).

## Observability

Simulated push log: `{ts, cat, ...}` events for connect, push-start, skip, retry, scheduled, push-done, sync. Viewable via the "Push log" button — models what production telemetry should record per slot.

## Investigation Trail

1. **Faced the honest constraint head-on.** The instinct is a "Connect Buffer" OAuth button; that's impossible for new apps in 2026. So step 1 is explicitly a paste-a-personal-key screen with a plain-language explainer of *why*. The spike's real question became: does BYOK feel acceptable, or does it kill the experience?
2. **Auto-matched channels by service name**, surfacing the `x → twitter` rename from spike 002 transparently (the user sees "X (Twitter)" map to their twitter channel).
3. **Made the coverage gap a first-class UX moment**, not an error. YouTube Shorts (no connected channel) gets an amber "will skip" chip + a notice offering to connect it or export separately — turning spike 002's skip-and-report into a calm nudge.
4. **Simulated failure + retry** on one slot (a 429 rate-limit → retry → scheduled) so the flow shows resilience, not just a happy path. This matters because Buffer's limit is 100 req/15min per client (spike 001 research).
5. **Modeled the status round-trip** (Scheduled → Sent → Funūn auto-completes the slot) — the synergy the user originally asked about: Funūn plans, Buffer publishes, Funūn reflects go-live status back into completion tracking.

## Results

**Verdict: VALIDATED ✓** — the flow is coherent and demoable end-to-end. The BYOK constraint, handled honestly, does **not** wreck the experience: a one-time paste-a-key step, then the map/push/status flow feels like a normal integration. The coverage gap and rate-limit retry are absorbed as calm UI states rather than dead ends.

**The strategic judgment is the user's** (this is a "feel" spike): is a paste-a-personal-key onboarding — plus requiring users to be on a paid Buffer plan — acceptable versus the current one-click CSV export? The mock exists to make that tradeoff concrete.

**Signal for the build:**
- The whole surface is ~4 small pieces: a connect/settings screen (encrypt + store the key), a channel-map step (reuse spike 002's mapping + the channels query), a push action (loop spike 002's inputs through spike 001's createPost), and a status-sync job.
- Two UX requirements crystallized: (1) the coverage gap must be a **nudge, not an error**; (2) status **sync-back** is what makes the integration feel synergistic — without it, this is just "CSV export with extra steps."
- The honest framing of BYOK ("Buffer doesn't support one-click connect yet — here's a key") is essential; hiding it would make the paste-key step feel broken.
