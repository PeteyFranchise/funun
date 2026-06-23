// ─── Breakthrough Benchmarking engine ────────────────────────────────
// Compares an artist's growth metrics against the benchmarks of artists who
// crossed the NEXT career threshold, in their genre. Pure + client-safe.
//
// The interpretive layer ("Pete's framework") is encoded as the per-stage
// target metrics + the specific actions that move each number. The metric
// SHAPE (BenchmarkInput) is source-agnostic — manual entry today, a Spotify /
// data-partner feed later all map to the same shape. Seeded targets stand in
// until the aggregated user dataset takes over (network effects at 500+ users).

export type BenchmarkStageKey = 'emerging' | 'rising' | 'established' | 'breakthrough'

export type BenchmarkInput = {
  /** Spotify monthly listeners — sets the career stage. */
  monthlyListeners: number
  /** Saves ÷ streams, as a percentage (e.g. 3.1). */
  savesToStreamsPct: number
  /** Follower growth rate, % per month. */
  followerGrowthPctMonthly: number
  /** Avg engagement rate per social post, %. */
  engagementRatePct: number
  /** New playlist adds per month. */
  playlistAddsPerMonth: number
}

export type MetricStatus = 'ahead' | 'on_track' | 'behind'

export type BenchmarkMetric = {
  key: keyof Omit<BenchmarkInput, 'monthlyListeners'>
  label: string
  unit: '%' | '/mo'
  value: number
  target: number
  status: MetricStatus
  /** One-line read on the gap, in Pete's voice. */
  detail: string
  /** The 3 specific actions that move this number (genre-aware). */
  actions: string[]
}

export type BenchmarkStage = {
  key: BenchmarkStageKey
  label: string
  /** The threshold this artist is working toward. */
  nextThresholdLabel: string
}

export type BenchmarkResult = {
  stage: BenchmarkStage
  genre: string
  /** Carried through so audience-gated mappings (sync, festival…) can read it. */
  monthlyListeners: number
  metrics: BenchmarkMetric[]
  /** How many metrics are at/above the breakthrough benchmark. */
  onTrackCount: number
}

// ─── Stages ──────────────────────────────────────────────────────────
function stageFor(monthlyListeners: number): BenchmarkStage {
  if (monthlyListeners < 10_000)
    return { key: 'emerging', label: 'Emerging', nextThresholdLabel: '10K monthly listeners + editorial consideration' }
  if (monthlyListeners < 50_000)
    return { key: 'rising', label: 'Rising', nextThresholdLabel: '50K monthly listeners' }
  if (monthlyListeners < 100_000)
    return { key: 'established', label: 'Established', nextThresholdLabel: '100K monthly listeners + sync interest' }
  return { key: 'breakthrough', label: 'Breakthrough', nextThresholdLabel: 'sustained 100K+ and label/sync conversations' }
}

// ─── Seeded targets ("Pete's framework") ─────────────────────────────
// What artists who crossed the next threshold averaged, by stage. These are
// the interpretive benchmarks; the aggregated dataset refines them over time.
type Targets = Record<BenchmarkMetric['key'], number>
const STAGE_TARGETS: Record<BenchmarkStageKey, Targets> = {
  emerging:      { savesToStreamsPct: 5.2, followerGrowthPctMonthly: 8, engagementRatePct: 4.0, playlistAddsPerMonth: 12 },
  rising:        { savesToStreamsPct: 4.5, followerGrowthPctMonthly: 6, engagementRatePct: 3.5, playlistAddsPerMonth: 25 },
  established:   { savesToStreamsPct: 4.0, followerGrowthPctMonthly: 5, engagementRatePct: 3.0, playlistAddsPerMonth: 50 },
  breakthrough:  { savesToStreamsPct: 3.8, followerGrowthPctMonthly: 4, engagementRatePct: 2.8, playlistAddsPerMonth: 80 },
}

// Genre nudges the targets (streaming behaviour differs by genre). Default 1.0.
const GENRE_FACTORS: Record<string, Partial<Targets>> = {
  'hip-hop': { savesToStreamsPct: 0.8, playlistAddsPerMonth: 1.2 },
  rap: { savesToStreamsPct: 0.8, playlistAddsPerMonth: 1.2 },
  pop: { followerGrowthPctMonthly: 1.15 },
  'r&b': { savesToStreamsPct: 1.1 },
  electronic: { playlistAddsPerMonth: 1.25 },
  indie: { savesToStreamsPct: 1.15 },
  folk: { savesToStreamsPct: 1.2, playlistAddsPerMonth: 0.8 },
}

const META: Record<BenchmarkMetric['key'], { label: string; unit: '%' | '/mo' }> = {
  savesToStreamsPct: { label: 'Saves-to-streams ratio', unit: '%' },
  followerGrowthPctMonthly: { label: 'Follower growth rate', unit: '%' },
  engagementRatePct: { label: 'Engagement per post', unit: '%' },
  playlistAddsPerMonth: { label: 'Playlist-add velocity', unit: '/mo' },
}

// The 3 actions that move each metric (the prescriptive layer).
const ACTIONS: Record<BenchmarkMetric['key'], string[]> = {
  savesToStreamsPct: [
    'Tighten the intro — saves spike when the hook lands inside the first 15 seconds.',
    'Run a pre-save campaign on the next single; early saves train the algorithm.',
    'Pitch to curators who index on saves, not just stream counts.',
  ],
  followerGrowthPctMonthly: [
    'Convert listeners to followers with an end-of-track CTA and a pinned follow prompt.',
    'Post a consistent weekly cadence — growth compounds with predictability.',
    'Cross-promote your Spotify profile from your highest-traffic social channel.',
  ],
  engagementRatePct: [
    'Lead with a hook in the first 2 seconds; watch-time drives reach.',
    'Reply to every comment in the first hour — early engagement widens distribution.',
    'Post the snippet that tests best as a teaser before release day.',
  ],
  playlistAddsPerMonth: [
    'Submit to Spotify editorial 4+ weeks ahead via Spotify for Artists.',
    'Build relationships with 10 niche independent curators in your genre.',
    'Keep a release cadence — playlist algorithms favour consistent activity.',
  ],
}

function statusOf(value: number, target: number): MetricStatus {
  if (value >= target) return 'ahead'
  if (value >= target * 0.8) return 'on_track'
  return 'behind'
}

function detailFor(m: { label: string; unit: string }, value: number, target: number, status: MetricStatus): string {
  const v = `${value}${m.unit}`
  const t = `${target}${m.unit}`
  if (status === 'ahead') return `Your ${v} is at or above the ${t} breakthrough benchmark — keep it up.`
  if (status === 'on_track') return `Your ${v} is close to the ${t} benchmark. A small push gets you there.`
  return `Your ${v} trails the ${t} that artists at your stage hit before breaking through.`
}

export function evaluateBenchmarks(input: BenchmarkInput, genre: string | null): BenchmarkResult {
  const stage = stageFor(input.monthlyListeners)
  const base = STAGE_TARGETS[stage.key]
  const factors = GENRE_FACTORS[(genre ?? '').trim().toLowerCase()] ?? {}

  const keys: BenchmarkMetric['key'][] = [
    'savesToStreamsPct',
    'followerGrowthPctMonthly',
    'engagementRatePct',
    'playlistAddsPerMonth',
  ]

  const metrics: BenchmarkMetric[] = keys.map(key => {
    const target = Math.round(base[key] * (factors[key] ?? 1) * 10) / 10
    const value = input[key]
    const status = statusOf(value, target)
    return {
      key,
      label: META[key].label,
      unit: META[key].unit,
      value,
      target,
      status,
      detail: detailFor(META[key], value, target, status),
      actions: ACTIONS[key],
    }
  })

  return {
    stage,
    genre: genre?.trim() || 'your genre',
    monthlyListeners: input.monthlyListeners,
    metrics,
    onTrackCount: metrics.filter(m => m.status !== 'behind').length,
  }
}
