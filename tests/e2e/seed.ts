/**
 * Deterministic seed for the Phase 14 UAT suite. Run with:  npm run e2e:seed
 *
 * Creates (or reuses) two projects owned by User A:
 *   - FULL: is_public, master + instrumental + stems + real writer credits +
 *     full track metadata (ISRC/ISWC/BPM/key/language). Backs checks 3,4,7,8,9
 *     and the cross-tenant target for 5,6.
 *   - UPLOAD: private, master only, with stems/instrumental cleared each run so
 *     the "+ Add" inputs render. Backs the upload checks 1 and 2.
 *
 * Uploads backing files to the private `track-audio` bucket at owner-prefixed
 * paths so signed URLs and export assembly resolve. Writes tests/e2e/.auth/seed.json.
 *
 * Needs (in .env.test): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * E2E_USER_A_EMAIL, E2E_USER_B_EMAIL.
 */
import { config as loadEnv } from 'dotenv'
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

for (const f of ['.env.test', '.env.local']) {
  const p = resolve(__dirname, '..', '..', f)
  if (existsSync(p)) loadEnv({ path: p })
}

import { ensureStemsZip, ensureWav } from './fixtures'
import { AUTH_DIR, SEED_FILE } from './env'

const BUCKET = 'track-audio'
const FULL_TITLE = 'E2E UAT Phase 14 - Full'
const UPLOAD_TITLE = 'E2E UAT Phase 14 - Upload Target'

function req(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing ${name} - set it in .env.test`)
  return v
}

async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string> {
  const target = email.toLowerCase()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find(u => (u.email ?? '').toLowerCase() === target)
    if (hit) return hit.id
    if (data.users.length < 200) break
  }
  throw new Error(`No auth user found for ${email}. Create the account first.`)
}

async function uploadFile(admin: SupabaseClient, path: string, localFile: string, contentType: string) {
  const bytes = readFileSync(localFile)
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true })
  if (error) throw new Error(`Upload ${path} failed: ${error.message}`)
  return statSync(localFile).size
}

async function upsertProject(
  admin: SupabaseClient,
  ownerId: string,
  title: string,
  isPublic: boolean,
): Promise<string> {
  const { data: existing } = await admin
    .from('vault_projects')
    .select('id')
    .eq('user_id', ownerId)
    .eq('title', title)
    .maybeSingle()

  if (existing?.id) {
    await admin.from('vault_projects').update({ is_public: isPublic }).eq('id', existing.id)
    return existing.id as string
  }

  const { data, error } = await admin
    .from('vault_projects')
    .insert({
      user_id: ownerId,
      title,
      type: 'single',
      status: isPublic ? 'released' : 'in_progress',
      is_public: isPublic,
      vault_readiness_score: isPublic ? 100 : 40,
      genre: 'R&B',
    })
    .select('id')
    .single()
  if (error) throw new Error(`Project insert failed (${title}): ${error.message}`)
  return data.id as string
}

async function getOrCreateTrack(
  admin: SupabaseClient,
  ownerId: string,
  projectId: string,
): Promise<string> {
  const { data: existing } = await admin
    .from('tracks')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', ownerId)
    .order('track_number', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (existing?.id) return existing.id as string

  const { data, error } = await admin
    .from('tracks')
    .insert({
      project_id: projectId,
      user_id: ownerId,
      title: 'Golden Hour',
      track_number: 1,
      duration_seconds: 187,
      isrc: 'US-S1Z-26-00001',
      iswc: 'T-000.000.001-0',
      bpm: 92,
      key_signature: 'F# minor',
      language: 'English',
    })
    .select('id')
    .single()
  if (error) throw new Error(`Track insert failed: ${error.message}`)
  return data.id as string
}

async function main() {
  const url = req('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRole = req('SUPABASE_SERVICE_ROLE_KEY')
  const emailA = req('E2E_USER_A_EMAIL')
  const emailB = req('E2E_USER_B_EMAIL')

  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const ownerAId = await findUserIdByEmail(admin, emailA)
  const ownerBId = await findUserIdByEmail(admin, emailB)

  // ── FULL project: master + instrumental + stems + credits, is_public ──
  const fullProjectId = await upsertProject(admin, ownerAId, FULL_TITLE, true)
  const fullTrackId = await getOrCreateTrack(admin, ownerAId, fullProjectId)

  const masterPath = `${ownerAId}/${fullProjectId}/master.wav`
  const instrumentalPath = `${ownerAId}/${fullProjectId}/instrumental.wav`
  const stemsPath = `${ownerAId}/${fullProjectId}/${fullTrackId}.stems.zip`

  const masterSize = await uploadFile(admin, masterPath, ensureWav(3, 'master'), 'audio/wav')
  const instrumentalSize = await uploadFile(admin, instrumentalPath, ensureWav(2, 'instrumental'), 'audio/wav')
  const stemsSize = await uploadFile(admin, stemsPath, ensureStemsZip(6), 'application/zip')

  const fullMetadata = {
    master: { path: masterPath, size: masterSize, ext: 'wav' },
    instrumental: { path: instrumentalPath, size: instrumentalSize, ext: 'wav' },
    stems: { path: stemsPath, size: stemsSize, name: 'stems.zip' },
    composers: [
      { name: 'Maya Reyes', role: 'composer_lyricist', pro: 'ASCAP', ipi: '00000000391', email: 'maya@example.com', split: 60 },
      { name: 'Deja Carter', role: 'producer', pro: 'BMI', ipi: '00000000408', email: 'deja@example.com', split: 40 },
    ],
  }
  const { error: fullUpdErr } = await admin
    .from('tracks')
    .update({ audio_file_url: masterPath, metadata: fullMetadata })
    .eq('id', fullTrackId)
  if (fullUpdErr) throw new Error(`Full track update failed: ${fullUpdErr.message}`)

  // ── UPLOAD-TARGET project: master only, stems/instrumental cleared so the ──
  // "+ Add" inputs render. Reset every seed run for repeatable upload checks.
  const uploadProjectId = await upsertProject(admin, ownerAId, UPLOAD_TITLE, false)
  const uploadTrackId = await getOrCreateTrack(admin, ownerAId, uploadProjectId)

  const upMasterPath = `${ownerAId}/${uploadProjectId}/master.wav`
  const upMasterSize = await uploadFile(admin, upMasterPath, ensureWav(3, 'master'), 'audio/wav')

  // Remove any stems/instrumental objects left by a prior run (best-effort).
  await admin.storage
    .from(BUCKET)
    .remove([
      `${ownerAId}/${uploadProjectId}/${uploadTrackId}.stems.zip`,
      `${ownerAId}/${uploadProjectId}/${uploadTrackId}.instrumental.wav`,
      `${ownerAId}/${uploadProjectId}/${uploadTrackId}.instrumental.mp3`,
    ])
    .catch(() => undefined)

  const { error: upUpdErr } = await admin
    .from('tracks')
    .update({
      audio_file_url: upMasterPath,
      metadata: { master: { path: upMasterPath, size: upMasterSize, ext: 'wav' } },
    })
    .eq('id', uploadTrackId)
  if (upUpdErr) throw new Error(`Upload track reset failed: ${upUpdErr.message}`)

  // Artist name for the PDF headers.
  await admin.from('artist_profiles').upsert({ id: ownerAId, artist_name: 'Maya Reyes' })

  mkdirSync(AUTH_DIR, { recursive: true })
  const seed = { fullProjectId, fullTrackId, uploadProjectId, uploadTrackId, ownerAId, ownerBId }
  writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2))
  console.log('Seeded:', seed)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
