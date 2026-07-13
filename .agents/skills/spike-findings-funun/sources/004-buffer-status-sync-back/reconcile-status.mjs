// Spike 004: buffer-status-sync-back
// The synergy linchpin. Spike 001 proved you can CREATE a post; this proves
// Funūn can READ status back and reconcile Buffer's lifecycle into slot
// completion. The API surface is confirmed from docs (a `posts` query with a
// `status` filter + Post.status/sentAt); the RISK is the reconciliation logic,
// which this self-verifies. Run: `node reconcile-status.mjs`.
//
// Real API call (documented, run via spike 001's harness with a live key):
//   query {
//     posts(first: 50, input: {
//       organizationId: "ORG"
//       filter: { channelIds: ["chan_..."], status: [scheduled, sent, error] }
//     }) {
//       edges { node { id status dueAt sentAt } }
//       pageInfo { hasNextPage endCursor }
//     }
//   }
// PostStatus enum: draft | scheduled | sent | sending | error

// ─── Funūn side: slots after a push, each carrying the Buffer post id we stored ─
// (In production, `buffer_post_id` is persisted on the slot when createPost returns.)
function makeSlots() {
  return [
    { id: 'p1', buffer_post_id: 'bp_1', platform: 'instagram', completed: false, completed_at: null },
    { id: 'p2', buffer_post_id: 'bp_2', platform: 'tiktok',    completed: false, completed_at: null },
    { id: 'p3', buffer_post_id: 'bp_3', platform: 'x',         completed: false, completed_at: null },
    { id: 'p4', buffer_post_id: 'bp_4', platform: 'threads',   completed: false, completed_at: null },
    { id: 'p5', buffer_post_id: null,   platform: 'facebook',  completed: false, completed_at: null }, // never pushed (was skipped)
  ]
}

// ─── Buffer side: a mocked `posts` query response (edges → node) ───────────────
const bufferPostsResponse = {
  data: {
    posts: {
      edges: [
        { node: { id: 'bp_1', status: 'sent',      dueAt: '2026-07-15T16:00:00.000Z', sentAt: '2026-07-15T16:00:03.000Z' } },
        { node: { id: 'bp_2', status: 'scheduled', dueAt: '2026-07-14T23:00:00.000Z', sentAt: null } },
        { node: { id: 'bp_3', status: 'error',     dueAt: '2026-07-22T17:00:00.000Z', sentAt: null } },
        // bp_4 intentionally absent — e.g. the user deleted it directly in Buffer
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
}

// ─── Reconciler ───────────────────────────────────────────────────────────────
// Maps Buffer's lifecycle back onto Funūn slots. Pure + idempotent: running it
// twice on the same data yields the same result (no double-apply).
function reconcile(slots, postsResponse) {
  const byId = new Map(
    (postsResponse?.data?.posts?.edges ?? []).map(e => [e.node.id, e.node])
  )
  const changes = []
  const errors = []
  const missing = []

  const next = slots.map(slot => {
    if (!slot.buffer_post_id) return slot // never pushed — nothing to sync
    const bp = byId.get(slot.buffer_post_id)
    if (!bp) {
      missing.push({ slot: slot.id, buffer_post_id: slot.buffer_post_id })
      return slot // post not in Buffer anymore (deleted there) — leave Funūn as-is, flag for review
    }
    if (bp.status === 'sent') {
      const completed_at = bp.sentAt ?? bp.dueAt ?? new Date().toISOString()
      if (slot.completed && slot.completed_at === completed_at) return slot // already synced (idempotent)
      changes.push({ slot: slot.id, from: slot.completed, to: true, at: completed_at })
      return { ...slot, completed: true, completed_at }
    }
    if (bp.status === 'error') {
      errors.push({ slot: slot.id, buffer_post_id: bp.id })
      return { ...slot, buffer_error: true }
    }
    // scheduled | sending | draft — not live yet, leave untouched
    return slot
  })

  return { next, changes, errors, missing }
}

// ─── Run + report ─────────────────────────────────────────────────────────────
const slots = makeSlots()
const r1 = reconcile(slots, bufferPostsResponse)

console.log('\n=== Spike 004: Buffer status → Funūn slot completion ===\n')
for (const s of r1.next) {
  const bp = s.buffer_post_id ?? '—'
  const state = s.completed ? `✓ complete @ ${s.completed_at}` : s.buffer_error ? '✗ buffer error' : s.buffer_post_id ? 'pending (not live yet)' : 'not pushed'
  console.log(`  ${s.id} [${s.platform}] buffer=${bp}  →  ${state}`)
}

console.log('\nchanges:', JSON.stringify(r1.changes))
console.log('errors :', JSON.stringify(r1.errors))
console.log('missing:', JSON.stringify(r1.missing))

// Idempotency: reconcile again over the already-updated slots + same response
const r2 = reconcile(r1.next, bufferPostsResponse)

// ─── Assertions ───────────────────────────────────────────────────────────────
const checks = []
const push = (n, pass) => checks.push({ n, pass })
const p1 = r1.next.find(s => s.id === 'p1')
const p2 = r1.next.find(s => s.id === 'p2')
const p3 = r1.next.find(s => s.id === 'p3')
const p5 = r1.next.find(s => s.id === 'p5')

push('sent post marks slot complete with sentAt as completed_at', p1.completed === true && p1.completed_at === '2026-07-15T16:00:03.000Z')
push('scheduled (not live) slot stays incomplete', p2.completed === false)
push('error status is flagged, not marked complete', p3.buffer_error === true && p3.completed === false)
push('never-pushed slot is untouched', p5.completed === false && !p5.buffer_error)
push('post missing from Buffer is reported (deleted-in-Buffer), slot left as-is', r1.missing.length === 1 && r1.missing[0].slot === 'p4')
push('exactly one completion change on first run', r1.changes.length === 1)
push('idempotent — second run applies ZERO new changes', r2.changes.length === 0)

console.log('\n=== Assertions ===')
for (const c of checks) console.log(`${c.pass ? '✓' : '✗'} ${c.n}`)

console.log('\n=== Notes for the build ===')
console.log('  • No webhook is documented — sync is a POLL of the `posts` query (filter status:[sent,error] by channelIds).')
console.log('  • Match Buffer posts to Funūn slots by the stored buffer_post_id (persist it when createPost returns).')
console.log('  • Reconcile is idempotent → safe to run on a schedule (cron / on Launchpad open) without double-applying.')
console.log('  • A post missing from Buffer = user deleted it there; surface it rather than silently completing/uncompleting.')

const allPass = checks.every(c => c.pass)
console.log(`\n=== VERDICT: ${allPass ? 'VALIDATED ✓' : 'FAILED ✗'} ===`)
console.log('API surface confirmed from docs (posts query + PostStatus enum + sentAt); reconciliation logic proven here.\n')
process.exit(allPass ? 0 : 1)
