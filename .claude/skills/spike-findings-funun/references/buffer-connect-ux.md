# Buffer Connect & Push UX

The frontend half — the in-Funūn experience of connecting Buffer and pushing a calendar. Synthesized from spike 003 (connect-and-push-ux, VALIDATED). A working, demoable mock exists at `sources/003-connect-and-push-ux/index.html`.

## Requirements

- **BYOK onboarding must be framed honestly.** There is no one-click OAuth for new apps. The connect step is a paste-a-personal-key screen with a plain explanation of *why*. Hiding this makes the step feel broken.
- **The connect screen must include a plain-language "What is Buffer?" explainer.** Funūn artists may not know Buffer. State what it is (a social scheduling tool for IG/TikTok/X/Facebook/Threads), what connecting does (pushes the calendar into Buffer's queue so posts publish automatically — no CSV), and link to buffer.com.
- **Platform coverage gaps are a calm nudge, not an error.** When a user's Funūn platform has no matching Buffer channel, skip those slots and offer to connect the channel.
- **Status sync-back is the feature that makes this synergistic.** Buffer Scheduled→Sent must flow back into Funūn's per-slot completion tracking. Without it, this is "CSV export with extra steps."

## How to Build It

Three-step flow (see the mock for exact markup + Funūn brand tokens):

### Step 1 — Connect (BYOK)
1. **"What is Buffer?" explainer block first** (indigo notice): what it is, what connecting does, "Learn more ↗" → buffer.com.
2. **BYOK explainer** (honest): "Buffer doesn't offer one-click connect for new apps yet. Paste a personal API key — in Buffer go to Settings → API, create a key, paste below. Funūn stores it encrypted."
3. Password-style key input + Connect button. On connect, run the account+channels query (see `buffer-integration.md`) and advance.

### Step 2 — Map channels
- Auto-match each Funūn platform to a detected Buffer channel by `service` name (surface the `x → twitter` rename transparently, e.g. label "X (Twitter)").
- Each row: Funūn platform chip → a `<select>` of the user's Buffer channels (pre-selected to the match), OR an amber **"no channel — will skip"** chip when none exists.
- Amber notice naming the skipped platform(s) with a "connect it in Buffer, or export separately" nudge.

### Step 3 — Push & status
- Render the 4-week calendar slots. "Push 4-week calendar to Buffer" loops mapped slots through `createPost`; skipped slots stay Funūn-only.
- Per-slot status dot + label: `not pushed → queuing → scheduled` (and `skipped` for unmapped). Handle a `429` as `rate-limited · retrying` then `scheduled` — resilience, not a dead end.
- Summary line: "Pushed N slot(s); M skipped."
- **Sync status from Buffer** action: reflect Scheduled→Sent back — a sent post flips the slot to "posted ✓" and auto-marks Funūn completion. This is the synergy payoff.
- A per-slot event log models the telemetry production should capture (connect, push-start, skip, retry, scheduled, sync).

### Brand tokens (match Funūn)
Dark `#0a0a0f` bg, `#12121c` cards, `#23233a` hairlines, `#818CF8→#D946EF` gradient (`bg-grad`/`shadow-cta`) for primary CTAs only. In the real app use the Tailwind tokens (`bg-card`, `border-hair`, `bg-grad`, `text-lavdim`, `brandindigo`) rather than hardcoded hexes.

## What to Avoid

- **Don't present a fake "Connect with Buffer" OAuth button** — it can't work and will feel broken when it dead-ends.
- **Don't ask for a key with no context** — the "What is Buffer?" + "why a key" explainers are load-bearing, not decoration.
- **Don't render skipped slots as errors** — amber "will skip" + a connect nudge reads as calm and intentional.
- **Don't ship push without status sync-back** — it's what separates this from the existing CSV export and justifies the whole integration.
- **Don't push from the client** — the key lives server-side; the UI calls Funūn API routes that call Buffer.

## Constraints

- Onboarding friction is inherent: paste-a-key + paid Buffer plan. This is a **product decision**, not an engineering one — the mock exists to make the tradeoff feelable vs. the current one-click CSV export.
- Rate limit (100/15min per client) means large calendars need spacing/retry — surface retry as a normal slot state.
- Real build reuses `buffer-integration.md`'s mapping + channels query; this reference is UI only.

## Origin

Synthesized from spike: 003 (connect-and-push-ux, VALIDATED — flow coherent; strategic UX judgment is the user's).
Source files: `sources/003-connect-and-push-ux/` (open `index.html` directly — fully self-contained mock).
