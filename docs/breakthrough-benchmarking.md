# Breakthrough Benchmarking

> Status: MVP built (own room) · Last updated: 2026-06-21 · Defensibility: very high

## What it is
Funūn doesn't just show you how you're growing — it shows **how your growth
compares to artists who actually broke through** at your stage, in your genre,
in the current market. It reads an artist's streaming + social metrics
(saves-to-streams ratio, follower-growth rate, engagement per post, playlist-add
velocity) and benchmarks them against the metrics of artists who crossed key
thresholds (10K / 50K / 100K monthly listeners, first editorial playlist, first
sync), then surfaces the **3 specific actions** that moved each number for
artists like them. A coach, not a fitness tracker.

## Why it's defensible
Not replicable with an LLM alone: it needs Spotify-for-Artists-class data, an
aggregated dataset of real artist trajectories, and **Pete's interpretive
framework** (what a 3.1% saves ratio actually means for editorial consideration —
because he's seen what labels look at). Data + framework + **network effects**
(gets sharper at 500+ users) = a moat no individual artist can build alone.

## Where it lives
**Its own top-level room** (`/benchmarks`, nav between Antenna and PitchPlug) —
it anchors the "get discovered" pillar the way Sound Vault anchors "get
release-ready" and Earnings anchors "get paid." It complements:
- **Antenna** — benchmarks make "raise readiness to unlock opportunities"
  concrete ("3.1% saves vs the 5.2% that earns editorial consideration").
- **Profile** stats — the comparative, prescriptive version of your raw numbers.

## MVP (built)
- `lib/benchmarks/engine.ts` — source-agnostic `BenchmarkInput` shape +
  `evaluateBenchmarks(input, genre)`. Derives the career **stage** from monthly
  listeners, applies **seeded stage targets** (Pete's framework) with **genre
  factors**, and returns per-metric value/target/status (ahead/close/behind) +
  the 3 actions. The aggregated dataset replaces the seeds over time.
- `components/benchmarks/BenchmarkView.tsx` — manual metric entry → live
  comparison (stage banner, per-metric bars vs the breakthrough benchmark,
  expandable "3 actions").
- `app/(artist)/benchmarks/page.tsx` — prefills monthly listeners + genre from
  the profile; demo shows the emerging-stage saves-ratio gap from the pitch.

## Deferred: the data source (decided "later")
The room + engine are built against a defined metric shape so any source plugs
in. **Spotify for Artists has no public API**, so real ingestion is a separate
decision among: artist CSV upload (fastest MVP), a paid data partner
(Chartmetric / Soundcharts / Songstats), or Spotify Web API OAuth (partial).
For now artists enter their numbers manually; the comparison + actions are fully
live.

## Next steps
- Pick + wire a real data source (above); store snapshots to chart trajectory.
- Begin **collecting the aggregated dataset** (anonymised thresholds crossed) to
  move from seeded targets to real cohort benchmarks (the network-effect moat).
- Deepen Pete's framework: per-genre action libraries, threshold-specific
  playbooks (e.g. "what got editorial consideration in R&B in the last 6 months").
- Tie a "breakthrough-ready" signal into Antenna's opportunity ranking.
