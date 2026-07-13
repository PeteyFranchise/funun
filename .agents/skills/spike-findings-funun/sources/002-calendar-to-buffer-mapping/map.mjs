// Spike 002: calendar-to-buffer-mapping
// Fact question: can a Funūn SocialPost[] map cleanly onto Buffer's createPost
// GraphQL inputs (validated in spike 001) with no *silent* data loss? Run:
// `node map.mjs`. Self-verifying — prints the per-post mapping, a data-loss
// report, a platform-coverage report, and a VERDICT. Also writes
// buffer-inputs.json (the exact createPost inputs) so they can be fed straight
// into spike 001's harness.
//
// Faithful to lib/launchpad/campaigns.ts (SocialPost) and the shipped CSV
// export rules: D-16 attaches an image only for static_image / lyric_graphic.

import { writeFileSync } from 'node:fs'

// ─── Funūn side (mirrors lib/launchpad/campaigns.ts) ──────────────────────────
// Platform: 'instagram' | 'tiktok' | 'x' | 'youtube_shorts' | 'facebook' | 'threads'
// ContentType: 'short_form_video' | 'static_image' | 'lyric_graphic' | 'text' | 'stories'

const SAMPLE_CAMPAIGN = {
  projectTitle: 'Midnight Bloom',
  coverArtUrl: 'https://cdn.funun.app/covers/midnight-bloom.jpg', // Funūn already hosts this publicly
  posts: [
    { id: 'p1', platform: 'instagram',     week: 1, content_type: 'static_image',     caption: 'Out now: Midnight Bloom 🌙', posting_time: '2026-07-15T16:00:00+00:00', completed: false, completed_at: null },
    { id: 'p2', platform: 'tiktok',        week: 1, content_type: 'short_form_video', caption: 'POV: the beat drops at 0:14',  posting_time: '2026-07-14T23:00:00Z',      completed: true,  completed_at: '2026-07-14T23:05:00Z' },
    { id: 'p3', platform: 'x',             week: 2, content_type: 'text',             caption: 'thank you for 10k streams 🙏',  posting_time: '2026-07-22T17:00:00Z',      completed: false, completed_at: null },
    { id: 'p4', platform: 'threads',       week: 2, content_type: 'lyric_graphic',    caption: '"we bloom in the dark"',        posting_time: '2026-07-23T13:00:00Z',      completed: false, completed_at: null },
    { id: 'p5', platform: 'youtube_shorts',week: 3, content_type: 'short_form_video', caption: 'behind the sound',              posting_time: '2026-07-30T22:00:00Z',      completed: false, completed_at: null },
  ],
}

// ─── Buffer side: the user's platform → connected channel map ──────────────────
// In the real product this comes from the channels query (spike 001). Buffer's
// `service` names differ from Funūn's platform slugs (note x→twitter). We leave
// youtube_shorts intentionally UNMAPPED to exercise the coverage-gap path.
const PLATFORM_TO_CHANNEL = {
  instagram: { channelId: 'chan_ig_001', service: 'instagram' },
  tiktok:    { channelId: 'chan_tt_002', service: 'tiktok' },
  x:         { channelId: 'chan_tw_003', service: 'twitter' }, // Buffer calls it "twitter"
  facebook:  { channelId: 'chan_fb_004', service: 'facebook' },
  threads:   { channelId: 'chan_th_005', service: 'threads' },
  // youtube_shorts: (no connected channel) — tests the skip+report path
}

// D-16: image attaches only for these content types (matches the CSV export)
const IMAGE_CONTENT_TYPES = new Set(['static_image', 'lyric_graphic'])

// ─── Mapping ──────────────────────────────────────────────────────────────────
// Buffer createPost input (spike 001 schema):
//   { text, channelId, schedulingType: 'automatic', mode: 'customScheduled',
//     dueAt: <ISO8601 UTC 'Z'>, assets?: [{ image: { url } }] }
function toUtcZ(iso) {
  // Buffer wants ISO 8601 UTC. Funūn stores timestamptz which may carry an
  // offset (+00:00) — normalize to a 'Z' UTC instant.
  return new Date(iso).toISOString()
}

function mapPost(post, campaign) {
  const chan = PLATFORM_TO_CHANNEL[post.platform]
  const droppedFields = ['week', 'content_type', 'completed', 'completed_at'] // Funūn-internal / format hints Buffer can't carry
  if (!chan) {
    return { post, skipped: true, reason: `no Buffer channel connected for platform "${post.platform}"`, droppedFields }
  }
  const input = {
    text: post.caption,
    channelId: chan.channelId,
    schedulingType: 'automatic',
    mode: 'customScheduled',
    dueAt: toUtcZ(post.posting_time),
  }
  if (IMAGE_CONTENT_TYPES.has(post.content_type) && campaign.coverArtUrl) {
    input.assets = [{ image: { url: campaign.coverArtUrl } }]
  }
  return { post, skipped: false, input, droppedFields }
}

// ─── Run + report ─────────────────────────────────────────────────────────────
const results = SAMPLE_CAMPAIGN.posts.map(p => mapPost(p, SAMPLE_CAMPAIGN))
const mapped = results.filter(r => !r.skipped)
const skipped = results.filter(r => r.skipped)

console.log('\n=== Spike 002: Funūn SocialPost[] → Buffer createPost inputs ===\n')
for (const r of results) {
  const { post } = r
  if (r.skipped) {
    console.log(`✗ ${post.id} [${post.platform}/${post.content_type}] SKIPPED — ${r.reason}`)
    continue
  }
  const img = r.input.assets ? ' +image' : ''
  console.log(`✓ ${post.id} [${post.platform}/${post.content_type}] → channel ${r.input.channelId}  dueAt ${r.input.dueAt}${img}`)
}

// ── Assertions (the "no silent loss" contract) ───────────────────────────────
const checks = []
const push = (name, pass, detail) => checks.push({ name, pass, detail })

push('every mapped post carries the caption as text', mapped.every(r => r.input.text === r.post.caption))
push('every mapped post has a channelId', mapped.every(r => typeof r.input.channelId === 'string' && r.input.channelId))
push('every dueAt is valid ISO 8601 UTC (ends in Z)', mapped.every(r => /Z$/.test(r.input.dueAt) && !Number.isNaN(Date.parse(r.input.dueAt))))
push('offset timestamps normalized to UTC (+00:00 → Z)', mapped.find(r => r.post.id === 'p1')?.input.dueAt === '2026-07-15T16:00:00.000Z')
push('image attached ONLY for static_image / lyric_graphic (D-16)',
  mapped.every(r => Boolean(r.input.assets) === IMAGE_CONTENT_TYPES.has(r.post.content_type)))
push('image url is the campaign public cover_art_url', mapped.filter(r => r.input.assets).every(r => r.input.assets[0].image.url === SAMPLE_CAMPAIGN.coverArtUrl))
push('unmapped platform is skipped + reported (not silently dropped)', skipped.length === 1 && skipped[0].post.platform === 'youtube_shorts')

console.log('\n=== Assertions ===')
for (const c of checks) console.log(`${c.pass ? '✓' : '✗'} ${c.name}`)

// ── Data-loss report ─────────────────────────────────────────────────────────
console.log('\n=== Data-loss report (Funūn fields Buffer cannot carry) ===')
console.log('  • content_type  — Buffer has no format field; the format is implied by the channel + media. For short_form_video/stories,')
console.log('                    Buffer routes by channel type, not a post attribute. Acceptable: caption + media still post correctly.')
console.log('  • week          — a Funūn planning concept; already baked into posting_time → dueAt. No loss of scheduling intent.')
console.log('  • completed /   — Funūn-internal go-live tracking. Buffer has its own Scheduled→Sent lifecycle; these stay Funūn-side and')
console.log('    completed_at    would be *synced back* from Buffer status rather than pushed. (Round-trip = future work, not a push-loss.)')

// ── Platform coverage report ─────────────────────────────────────────────────
console.log('\n=== Platform coverage (Funūn platform → Buffer service) ===')
for (const p of ['instagram', 'tiktok', 'x', 'youtube_shorts', 'facebook', 'threads']) {
  const chan = PLATFORM_TO_CHANNEL[p]
  console.log(`  ${chan ? '✓' : '⚠'} ${p.padEnd(15)} → ${chan ? chan.service + ' (' + chan.channelId + ')' : 'NOT CONNECTED — user must connect this channel in Buffer, or the slot is skipped'}`)
}
console.log('  Note: Funūn "x" maps to Buffer service "twitter". youtube_shorts/threads depend on the user having those channels on their Buffer plan.')

// ── Write the generated inputs for reuse in spike 001 ────────────────────────
const inputs = mapped.map(r => r.input)
writeFileSync(new URL('./buffer-inputs.json', import.meta.url), JSON.stringify(inputs, null, 2) + '\n')

const allPass = checks.every(c => c.pass)
console.log(`\n=== VERDICT: ${allPass ? 'VALIDATED ✓' : 'FAILED ✗'} ===`)
console.log(`${mapped.length}/${SAMPLE_CAMPAIGN.posts.length} posts mapped, ${skipped.length} skipped (coverage gap, reported).`)
console.log('Wrote buffer-inputs.json — feed these straight into spike 001 to actually schedule them.\n')
process.exit(allPass ? 0 : 1)
