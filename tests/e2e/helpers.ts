import { existsSync, readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SEED_FILE, SUPABASE, WR01_PROJECT_ID } from './env'

// The seed context ties every spec to known owned projects + tracks. It comes
// from tests/e2e/.auth/seed.json (written by `npm run e2e:seed`) or, failing
// that, from env vars pointing at projects someone seeded by hand.
//
// Two projects because the asset-upload checks (1, 2) need a target that does
// NOT already have the asset (the "+ Add" input only renders when it's absent),
// while the export/playback/public checks need one fully populated.
export type SeedContext = {
  // Fully populated, is_public: master + instrumental + stems + credits + metadata.
  fullProjectId: string
  fullTrackId: string
  // Master only, private: the upload target for stems (1) and instrumental (2).
  uploadProjectId: string
  uploadTrackId: string
  ownerAId: string // User A's auth uid
  ownerBId: string // User B's auth uid (for the cross-tenant path prefix)
}

export function readSeedFile(): Partial<SeedContext> | null {
  if (!existsSync(SEED_FILE)) return null
  try {
    return JSON.parse(readFileSync(SEED_FILE, 'utf8')) as Partial<SeedContext>
  } catch {
    return null
  }
}

export function getSeedContext(): SeedContext | null {
  const f = readSeedFile() ?? {}
  const ctx: Partial<SeedContext> = {
    fullProjectId: f.fullProjectId || process.env.E2E_FULL_PROJECT_ID,
    fullTrackId: f.fullTrackId || process.env.E2E_FULL_TRACK_ID,
    uploadProjectId: f.uploadProjectId || process.env.E2E_UPLOAD_PROJECT_ID,
    uploadTrackId: f.uploadTrackId || process.env.E2E_UPLOAD_TRACK_ID,
    ownerAId: f.ownerAId || process.env.E2E_OWNER_A_ID,
    ownerBId: f.ownerBId || process.env.E2E_OWNER_B_ID,
  }
  if (ctx.fullProjectId && ctx.fullTrackId && ctx.uploadProjectId && ctx.uploadTrackId && ctx.ownerAId) {
    return ctx as SeedContext
  }
  return null
}

export function hasFullSeed(): boolean {
  const c = getSeedContext()
  return Boolean(c?.fullProjectId && c?.fullTrackId)
}

export function hasUploadSeed(): boolean {
  const c = getSeedContext()
  return Boolean(c?.uploadProjectId && c?.uploadTrackId)
}

export const WR01_PROJECT = WR01_PROJECT_ID

export function supabaseAdmin(): SupabaseClient {
  return createClient(SUPABASE.url, SUPABASE.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// A playable audio src must be a server-minted signed URL, not the raw storage
// path stored in the DB. Signed Supabase URLs carry a `token=` query param and
// go through the /storage/v1/object/sign path.
export function isSignedStorageUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    return (
      u.protocol === 'https:' &&
      u.pathname.includes('/storage/v1/object/') &&
      u.searchParams.has('token')
    )
  } catch {
    return false
  }
}
