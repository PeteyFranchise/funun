#!/usr/bin/env node
// Phase 50.5B (B4) — backfill captured songs for listings admitted before
// byte-tied review existed, then shadow-read the result.
//
// DRY RUN BY DEFAULT. Pass --apply to write. Requires SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY, and migrations 248, 252 and 253 applied.
//
// Backfilled songs get a provenance='backfilled', verdict='unreviewed' review
// row with no reviewer, because no human approved those exact bytes. They are
// captured in lifecycle_state 'draft' and are not exposed to anyone by this
// script.

import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

const APPLY = process.argv.includes('--apply')
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
  const destPath = `captured/${listing.id}/review_playback.${ext}`

  const up = await db.storage.from('crate-audio').upload(destPath, bytes, { upsert: true })
  if (up.error) { failures.push({ listing: listing.id, reason: 'copy_failed' }); continue }

  // Hash the COPY, not the source: the digest must describe what The Crate holds.
  const back = await db.storage.from('crate-audio').download(destPath)
  if (back.error || !back.data) { failures.push({ listing: listing.id, reason: 'readback_failed' }); continue }
  const copied = Buffer.from(await back.data.arrayBuffer())

  const { data: owner } = await db
    .from('user_profiles').select('artist_name').eq('id', listing.artist_user_id).maybeSingle()

  const { error } = await db.rpc('crate_backfill_capture_song', {
    p_listing_id: listing.id,
    p_bucket: 'crate-audio',
    p_path: destPath,
    p_sha256: createHash('sha256').update(copied).digest('hex'),
    p_size_bytes: copied.byteLength,
    p_mime_type: src.data.type || 'application/octet-stream',
    p_source_bucket: 'track-audio',
    p_source_path: sourcePath,
    p_title: track.title ?? 'Untitled',
    p_primary_artist_name: owner?.artist_name ?? '',
    p_payee_user_id: listing.artist_user_id,
    p_captured_by: listing.artist_user_id,
    p_source_track_id: listing.track_id,
    p_source_project_id: listing.vault_project_id,
  })
  if (error) { failures.push({ listing: listing.id, reason: error.message }); continue }
  done += 1
}

console.log(`${APPLY ? 'captured' : 'would capture'}: ${done}`)
console.log(`failures: ${failures.length}`)
for (const f of failures) console.log(`  ${f.listing}  ${f.reason}`)
process.exit(failures.length > 0 ? 1 : 0)
