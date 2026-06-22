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
