// Spike 005: buffer-update-delete-repush
// Funūn slots change after a push (user edits a caption, regenerates a hook,
// removes a slot, adds one). Pushing again must NOT create duplicate Buffer
// posts. This proves the re-push DIFF: given the last push state + the current
// calendar, compute a create / edit / delete plan. Run: `node replan.mjs`.
//
// API surface confirmed from docs (reference.html):
//   createPost(input: CreatePostInput!): PostActionPayload!   (spike 001/002)
//   editPost(input: EditPostInput!): PostActionPayload!
//     EditPostInput { id, text, dueAt, assets, mode, schedulingType, ... }
//   deletePost(input: DeletePostInput!): DeletePostPayload!
//     DeletePostInput { id }   →  union DeletePostSuccess | NotFoundError
// A post already `sent` cannot be un-published — never edit/delete those.

const IMAGE_CONTENT_TYPES = new Set(['static_image', 'lyric_graphic'])
const toUtcZ = iso => new Date(iso).toISOString()

// A stable content signature so we only edit when something actually changed.
function contentSig(slot, coverArtUrl) {
  const img = IMAGE_CONTENT_TYPES.has(slot.content_type) && coverArtUrl ? coverArtUrl : ''
  return JSON.stringify([slot.caption, toUtcZ(slot.posting_time), img])
}

// ─── Previous push state: what Funūn recorded last time it pushed ─────────────
// Each entry: the Funūn slot id, the Buffer post id we stored, the content
// signature at push time, and Buffer's last-known status.
const lastPush = {
  coverArtUrl: 'https://cdn.funun.app/covers/midnight-bloom.jpg',
  records: [
    { slotId: 'p1', buffer_post_id: 'bp_1', sig: null, status: 'scheduled' }, // unchanged (sig filled below)
    { slotId: 'p2', buffer_post_id: 'bp_2', sig: null, status: 'scheduled' }, // caption will be edited
    { slotId: 'p3', buffer_post_id: 'bp_3', sig: null, status: 'sent' },      // already LIVE — must not touch
    { slotId: 'p4', buffer_post_id: 'bp_4', sig: null, status: 'scheduled' }, // will be removed from calendar
  ],
}

// ─── Current calendar (after the user worked the slots) ───────────────────────
const currentSlots = [
  { id: 'p1', platform: 'instagram', content_type: 'static_image',     caption: 'Out now: Midnight Bloom 🌙', posting_time: '2026-07-15T16:00:00Z' }, // unchanged
  { id: 'p2', platform: 'tiktok',    content_type: 'short_form_video', caption: 'POV: the beat hits at 0:14 (edited)', posting_time: '2026-07-14T23:00:00Z' }, // caption changed → edit
  { id: 'p3', platform: 'x',         content_type: 'text',             caption: 'thank you for 10k streams 🙏 (edited after send)', posting_time: '2026-07-22T17:00:00Z' }, // changed but ALREADY SENT → skip
  // p4 removed from the calendar → delete
  { id: 'p6', platform: 'threads',   content_type: 'lyric_graphic',    caption: '"we bloom in the dark"', posting_time: '2026-07-24T13:00:00Z' }, // brand new → create
]

// Fill in the last-push signatures for the ones that were "unchanged/edited"
// (simulating that p1 was pushed with its current content, p2/p3 with the OLD content).
const OLD = {
  p1: { caption: 'Out now: Midnight Bloom 🌙', posting_time: '2026-07-15T16:00:00Z', content_type: 'static_image' },
  p2: { caption: 'POV: the beat drops at 0:14',  posting_time: '2026-07-14T23:00:00Z', content_type: 'short_form_video' },
  p3: { caption: 'thank you for 10k streams 🙏',  posting_time: '2026-07-22T17:00:00Z', content_type: 'text' },
  p4: { caption: '"we bloom in the dark"',        posting_time: '2026-07-23T13:00:00Z', content_type: 'lyric_graphic' },
}
for (const rec of lastPush.records) rec.sig = contentSig(OLD[rec.slotId], lastPush.coverArtUrl)

// ─── The diff planner ─────────────────────────────────────────────────────────
function planRepush(current, last) {
  const byBufferSlot = new Map(last.records.map(r => [r.slotId, r]))
  const currentIds = new Set(current.map(s => s.id))
  const plan = { create: [], edit: [], delete: [], skipSent: [], noop: [] }

  // creates + edits from the current calendar
  for (const slot of current) {
    const rec = byBufferSlot.get(slot.id)
    if (!rec || !rec.buffer_post_id) {
      plan.create.push({ slotId: slot.id, input: buildCreate(slot, last.coverArtUrl) })
      continue
    }
    if (rec.status === 'sent') {
      // Cannot un-send. If content changed, surface it; never edit/delete a live post.
      if (contentSig(slot, last.coverArtUrl) !== rec.sig) plan.skipSent.push({ slotId: slot.id, reason: 'already sent — edit ignored' })
      else plan.noop.push(slot.id)
      continue
    }
    if (contentSig(slot, last.coverArtUrl) === rec.sig) { plan.noop.push(slot.id); continue }
    plan.edit.push({ slotId: slot.id, id: rec.buffer_post_id, input: buildEdit(rec.buffer_post_id, slot, last.coverArtUrl) })
  }

  // deletes: previously-pushed slots no longer in the calendar (but never delete a sent post)
  for (const rec of last.records) {
    if (currentIds.has(rec.slotId)) continue
    if (rec.status === 'sent') { plan.skipSent.push({ slotId: rec.slotId, reason: 'already sent — not deleted' }); continue }
    plan.delete.push({ slotId: rec.slotId, id: rec.buffer_post_id })
  }
  return plan
}

function buildCreate(slot, coverArtUrl) {
  const input = { text: slot.caption, schedulingType: 'automatic', mode: 'customScheduled', dueAt: toUtcZ(slot.posting_time) }
  if (IMAGE_CONTENT_TYPES.has(slot.content_type) && coverArtUrl) input.assets = [{ image: { url: coverArtUrl } }]
  return input
}
function buildEdit(id, slot, coverArtUrl) {
  const input = { id, text: slot.caption, schedulingType: 'automatic', mode: 'customScheduled', dueAt: toUtcZ(slot.posting_time) }
  if (IMAGE_CONTENT_TYPES.has(slot.content_type) && coverArtUrl) input.assets = [{ image: { url: coverArtUrl } }]
  return input
}

// ─── Run + report ─────────────────────────────────────────────────────────────
const plan = planRepush(currentSlots, lastPush)

console.log('\n=== Spike 005: re-push diff plan ===\n')
console.log('CREATE :', plan.create.map(c => c.slotId))
console.log('EDIT   :', plan.edit.map(e => e.slotId))
console.log('DELETE :', plan.delete.map(d => `${d.slotId}(${d.id})`))
console.log('NOOP   :', plan.noop)
console.log('SKIP(sent):', plan.skipSent.map(s => `${s.slotId} — ${s.reason}`))

// ─── Assertions ───────────────────────────────────────────────────────────────
const checks = []
const push = (n, pass) => checks.push({ n, pass })

push('unchanged slot (p1) → no-op, not re-created', plan.noop.includes('p1') && !plan.create.some(c => c.slotId === 'p1'))
push('edited caption (p2) → editPost with new text, not a new create',
  plan.edit.some(e => e.slotId === 'p2' && e.input.text.includes('edited')) && !plan.create.some(c => c.slotId === 'p2'))
push('new slot (p6) → createPost', plan.create.some(c => c.slotId === 'p6'))
push('removed slot (p4) → deletePost by stored id', plan.delete.some(d => d.slotId === 'p4' && d.id === 'bp_4'))
push('already-SENT slot (p3) never edited even though content changed', !plan.edit.some(e => e.slotId === 'p3') && plan.skipSent.some(s => s.slotId === 'p3'))
push('no slot appears in more than one action bucket (no dup work)', (() => {
  const all = [...plan.create.map(c => c.slotId), ...plan.edit.map(e => e.slotId), ...plan.delete.map(d => d.slotId), ...plan.noop]
  return new Set(all).size === all.length
})())
push('edit reuses the stored buffer_post_id (bp_2), never creates a duplicate', plan.edit.find(e => e.slotId === 'p2')?.id === 'bp_2')

// Idempotency: after applying edits (sigs now match current), a re-plan yields no creates/edits/deletes
const appliedRecords = lastPush.records
  .filter(r => currentSlots.some(s => s.id === r.slotId))         // keep still-present
  .map(r => {
    const slot = currentSlots.find(s => s.id === r.slotId)
    return { ...r, sig: r.status === 'sent' ? r.sig : contentSig(slot, lastPush.coverArtUrl) } // edits applied (sent unchanged)
  })
// add the newly-created p6 as now-tracked
appliedRecords.push({ slotId: 'p6', buffer_post_id: 'bp_6', sig: contentSig(currentSlots.find(s => s.id === 'p6'), lastPush.coverArtUrl), status: 'scheduled' })
const plan2 = planRepush(currentSlots, { coverArtUrl: lastPush.coverArtUrl, records: appliedRecords })
push('idempotent — re-plan after apply yields 0 creates/edits/deletes', plan2.create.length === 0 && plan2.edit.length === 0 && plan2.delete.length === 0)

console.log('\n=== Assertions ===')
for (const c of checks) console.log(`${c.pass ? '✓' : '✗'} ${c.n}`)

console.log('\n=== Notes for the build ===')
console.log('  • Persist per slot: buffer_post_id + a content signature [caption, dueAt(UTC), imageUrl] + last-known status.')
console.log('  • Re-push = diff current calendar vs stored signatures → createPost / editPost / deletePost. No blind re-create.')
console.log('  • NEVER edit/delete a post whose status is `sent` — it already went live; surface the conflict instead.')
console.log('  • editPost + deletePost are union payloads — branch on success vs MutationError / NotFoundError.')

const allPass = checks.every(c => c.pass)
console.log(`\n=== VERDICT: ${allPass ? 'VALIDATED ✓' : 'FAILED ✗'} ===\n`)
process.exit(allPass ? 0 : 1)
