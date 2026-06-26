# Funūn — build ideas backlog

> A running list of product/feature concepts to evaluate and build. Each idea
> uses the same card format so we can compare effort vs. defensibility at a
> glance. Add new ideas at the bottom; move to "Building / shipped" when picked
> up. Implementation specs live in their own doc (linked from the card).

### Card template
```
## <Feature name>
- Effort: <low | medium | high>   ·   Defensibility: <low | medium | high | very high>
- One-liner: "<the pitch in one sentence>"
- What it is: <2–4 sentences>
- Requires: <data / integrations / expertise>
- Why not replicable with an LLM alone: <the moat>
- Gets better at: <scale milestone>
- Status: <idea | building | shipped> — <link to spec/PR>
```

---

## Breakthrough Benchmarking
- **Effort:** medium (UI + engine) — note: real data acquisition is the hard part
- **Defensibility:** very high
- **One-liner:** "Funūn tells you not just how you're growing — but how your growth compares to artists who actually broke through at your stage, in your genre, in the current market."
- **What it is:** A benchmarking engine that connects to the artist's streaming + social accounts and compares their metrics — saves-to-streams ratio, follower-growth rate, engagement per post, playlist-add velocity — against a proprietary dataset of artists who crossed key thresholds (10K / 50K / 100K monthly listeners, first editorial playlist, first sync). The artist doesn't see generic advice; they see: "Your saves-to-streams ratio is 3.1%. Artists at your stage who got editorial consideration averaged 5.2%. Here are the 3 specific actions that moved that number for artists in your genre." A coach, not a fitness tracker.
- **Requires:** aggregated user data · external API integrations · Pete's framework for interpretation · network effects
- **Why not replicable with an LLM alone:** No access to Spotify-for-Artists-class data, no knowledge of which metrics actually correlate with editorial/label consideration (vs. what merely sounds like they should), and no aggregated dataset of real artist trajectories. Pete's expertise is the interpretive layer — he knows what a 3.1% saves ratio means for editorial consideration because he has seen what labels look at. Data + framework is something no individual artist can build for themselves.
- **Gets better at:** 500+ users (network effects)
- **Status:** MVP built — own room at `/benchmarks` (data source deferred). Spec: `docs/breakthrough-benchmarking.md`. PR: #2. Spotify integration rules: `docs/spotify-api-guidelines.md`.

---

<!-- Add new ideas below using the card template. -->

## SpotPitch — Spotify editorial pitch (v1 shipped; iteration roadmap)
- **Effort:** low–med per iteration   ·   **Defensibility:** medium → high (with the performance loop)
- **One-liner:** "Turn a release into a great, paste-ready Spotify editorial pitch — and make it smarter as Funūn learns what actually earns playlist adds."
- **Built (PR #10):** drafts the ≤500-char Spotify-for-Artists pitch + genres/moods/instruments to tag + submission tips, from the project + profile; refuses to fabricate stats.
- **Near-term iterations:**
  - Personalize from real **Benchmarking metrics** (saves rate, follower growth, prior-single performance) — credible, not generic.
  - **Playlist targeting** — recommend which editorial playlists/genres to aim for (ties to Antenna/Benchmarks).
  - **Angle variants** (story vs. sound vs. cultural moment) to choose from.
  - **Tags from the master audio** (BPM/key/energy/instruments) instead of guessing from text.
  - **Timing discipline** — warn if <7 days to release; nudge the 4-week window; surface it in Launchpad.
- **Bigger:**
  - **Multi-DSP pitches** (Amazon Music, Apple Music, Deezer) — enter once, pitch everywhere.
  - **Full editorial packet** — pitch + Canvas + cover + press one-liner generated together and consistent.
  - **Performance loop (the moat)** — track which pitches/tags earned adds (DSR/streaming data) and feed it back to sharpen future pitches per genre ("what got R&B editorial consideration in the last 6 months").
- **Ceiling/limit:** Spotify has **no public pitch API** → can't auto-submit; draft-and-paste until a partnership/API exists. Follow `docs/spotify-api-guidelines.md` — don't fabricate, don't train ML on Spotify data; the performance loop must use the artist's own authorized/exported data.
- **Status:** v1 shipped (PR #10). Iterations: idea.
