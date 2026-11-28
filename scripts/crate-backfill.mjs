#!/usr/bin/env node
// Phase 50.5B (B4) — backfill captured songs for listings admitted before
// byte-tied review existed, then shadow-read the result.
//
// DRY RUN BY DEFAULT. Pass --apply to write. Requires SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY, and migrations 248, 252 and 253 applied.
//
// Backfilled songs get a row in crate_backfill_attestations, NOT in
// crate_quality_reviews: a backfill is not a review, and owner decision
// 2026-11-28 keeps the two structurally separate so no approval writer can
// mistake one for the other. They are captured in lifecycle_state 'draft',
// reach no buyer, and stay that way until staff review the CAPTURED object
// through crate_review_captured_artifact (migration 254).

import { createClient } from '@supabase/supabase-js'
import { createHash, randomUUID } from 'node:crypto'

const APPLY = process.argv.includes('--apply')

// M7 (review 2026-11-28): a backfill is an OPERATOR act. The first version passed
// the artist's id as the capture actor, so an append-only row would have recorded
// the artist as having performed a migration an operator ran. The database now
// refuses that outright; this is the caller half.
const OPERATOR = process.env.CRATE_BACKFILL_OPERATOR_ID
if (APPLY && !OPERATOR) {
  console.error('CRATE_BACKFILL_OPERATOR_ID is required with --apply: a backfill is an operator act, and the row recording it is immutable.')
  process.exit(2)
}
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0')

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(2)
}
const db = createClient(url, key, { auth: { persistSession: false } })

const { data: admitted, error: listErr } = await db
  .from('sync_listings')
  .select('id, track_id, vault_project_id, artist_user_id')
  .eq('status', 'admitted')
if (listErr) { console.error('could not read listings:', listErr.message); process.exit(1) }

const { data: captured } = await db.from('crate_songs').select('source_listing_id')
const already = new Set((captured ?? []).map((r) => r.source_listing_id))
let todo = (admitted ?? []).filter((l) => !already.has(l.id))
if (LIMIT > 0) todo = todo.slice(0, LIMIT)

console.log(`admitted listings: ${admitted?.length ?? 0}`)
console.log(`already captured:  ${already.size}`)
console.log(`to backfill:       ${todo.length}${APPLY ? '' : '   (dry run, nothing will be written)'}`)

let done = 0
const failures = []
for (const listing of todo) {
  const { data: track } = await db
    .from('tracks').select('title, audio_file_url').eq('id', listing.track_id).maybeSingle()
  const sourcePath = track?.audio_file_url
  if (!sourcePath) { failures.push({ listing: listing.id, reason: 'no_audio' }); continue }

  if (!APPLY) { done += 1; continue }

  const src = await db.storage.from('track-audio').download(sourcePath)
  if (src.error || !src.data) { failures.push({ listing: listing.id, reason: 'source_unreadable' }); continue }
  const bytes = Buffer.from(await src.data.arrayBuffer())
  const ext = sourcePath.slice(sourcePath.lastIndexOf('.') + 1).toLowerCase()
  const destPath = `captured/${listing.id}/${randomUUID()}.review_playback.${ext}`

  const up = await db.storage.from('crate-audio').upload(destPath, bytes, { upsert: false })
  if (up.error) { failures.push({ listing: listing.id, reason: 'copy_failed' }); continue }

  // Hash the COPY, not the source: the digest must describe what The Crate holds.
  const back = await db.storage.from('crate-audio').download(destPath)
  if (back.error || !back.data) {
    // M5: do not leak the copy. Delete it, and record the leak if that fails too.
    const rm = await db.storage.from('crate-audio').remove([destPath])
    failures.push({ listing: listing.id, reason: rm.error ? 'readback_failed_object_leaked' : 'readback_failed' })
    continue
  }
  const copied = Buffer.from(await back.data.arrayBuffer())

  // M4: title, artist, track, project and payee are derived inside the function
  // from the locked listing. The caller sends only the digest and the operator.
  const { error } = await db.rpc('crate_backfill_capture_song', {
    p_listing_id: listing.id,
    p_bucket: 'crate-audio',
    p_path: destPath,
    p_sha256: createHash('sha256').update(copied).digest('hex'),
    p_size_bytes: copied.byteLength,
    p_mime_type: src.data.type || 'application/octet-stream',
    p_operator_id: OPERATOR,
  })
  if (error) {
    // M3 (review 2026-11-28): an error is not proof that nothing committed. Only
    // delete the copy when the database definitively refused; on an ambiguous
    // failure leave it, because deleting after a lost response destroys the live
    // object a committed artifact needs.
    const definitive = Boolean(error.code) && !['08000', '08006', '57014'].includes(error.code)
    if (!definitive) {
      failures.push({ listing: listing.id, reason: `${error.message} (ambiguous: object left for reconciliation)` })
      continue
    }
    const rm = await db.storage.from('crate-audio').remove([destPath])
    failures.push({ listing: listing.id, reason: rm.error ? `${error.message} (object leaked)` : error.message })
    continue
  }
  done += 1
}

console.log(`${APPLY ? 'captured' : 'would capture'}: ${done}`)
console.log(`failures: ${failures.length}`)
for (const f of failures) console.log(`  ${f.listing}  ${f.reason}`)
process.exit(failures.length > 0 ? 1 : 0)
