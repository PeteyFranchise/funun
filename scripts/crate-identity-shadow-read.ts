#!/usr/bin/env tsx
// Phase 50.5B (B4) — the shadow read. Proves captured identity and legacy
// identity agree, and STATES THE COUNTS rather than reporting "clean".
// Read-only. Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and
// migration 248 applied.

import { createClient } from '@supabase/supabase-js'
import {
  compareCapturedIdentity,
  formatEquivalenceReport,
  type CapturedSongRow,
  type LegacyListingRow,
} from '@/lib/sync-library/crate-identity-equivalence'

async function main(): Promise<number> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
    return 2
  }
  const db = createClient(url, key, { auth: { persistSession: false } })

  const { data: songs, error: songErr } = await db
    .from('crate_songs')
    .select('id, source_listing_id, source_track_id, source_project_id, lifecycle_state')
  if (songErr) {
    console.error('could not read crate_songs:', songErr.message)
    return 1
  }

  const { data: listings, error: listErr } = await db
    .from('sync_listings')
    .select('id, status, track_id, vault_project_id')
  if (listErr) {
    console.error('could not read sync_listings:', listErr.message)
    return 1
  }

  const report = compareCapturedIdentity(
    (songs ?? []) as CapturedSongRow[],
    (listings ?? []) as LegacyListingRow[]
  )
  console.log(formatEquivalenceReport(report))
  for (const d of report.disagreements) {
    console.log(`  ${d.crateSongId}  ${d.field}  captured=${d.captured ?? 'null'}  legacy=${d.legacy ?? 'null'}`)
  }
  return report.disagreed > 0 ? 1 : 0
}

main().then((code) => process.exit(code))
