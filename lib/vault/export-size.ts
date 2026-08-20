import type { SupabaseClient } from '@supabase/supabase-js'

// ─── resolveStorageBytes (audit #10) ─────────────────────────────────────
// The export manifest's per-file sizes come from DB metadata, and the stem /
// instrumental sizes recorded there are CLIENT-PROVIDED and uncapped (the
// upload routes accept a client-supplied size, defaulting to 0). So summing
// the manifest can badly UNDERCOUNT and wave an oversized pack past the size
// gate — which then OOMs or times out mid-assembly inside Vercel's 10s budget.
// This resolves the ACTUAL Storage object sizes before the job is accepted.
//
// Returns null if any object's size cannot be read (Storage error, or the
// object is missing / carries no size metadata) so the caller can fall back to
// the manifest sum rather than block a legitimate export on a transient stat
// hiccup. When it returns a number, that number is the true on-disk total.
export async function resolveStorageBytes(
  service: SupabaseClient,
  bucket: string,
  paths: string[]
): Promise<number | null> {
  let total = 0
  for (const path of paths) {
    const slash = path.lastIndexOf('/')
    const folder = slash >= 0 ? path.slice(0, slash) : ''
    const name = slash >= 0 ? path.slice(slash + 1) : path

    const { data, error } = await service.storage.from(bucket).list(folder, { search: name, limit: 100 })
    if (error) return null

    // `search` is a substring filter — match the exact object name.
    const match = (data ?? []).find(o => o.name === name)
    const size = match?.metadata?.size
    if (typeof size !== 'number') return null
    total += size
  }
  return total
}
