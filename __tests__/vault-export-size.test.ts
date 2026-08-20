import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveStorageBytes } from '@/lib/vault/export-size'

// Proves the export size gate can measure ACTUAL Storage bytes (audit #10),
// so a client-undercounted stem no longer waves an oversized pack past the
// gate — and that it degrades to null (caller falls back) when a size can't
// be read, rather than throwing or blocking exports.

function makeService(
  objectsByFolder: Record<string, { name: string; size: number | null }[]>,
  opts?: { errorOnFolder?: string }
) {
  const list = jest.fn(async (folder: string, _o?: { search?: string; limit?: number }) => {
    if (opts?.errorOnFolder === folder) return { data: null, error: { message: 'storage down' } }
    const data = (objectsByFolder[folder] ?? []).map(o => ({
      name: o.name,
      metadata: o.size === null ? {} : { size: o.size },
    }))
    return { data, error: null }
  })
  const service = { storage: { from: jest.fn(() => ({ list })) } } as unknown as SupabaseClient
  return { service, list }
}

const MB = 1024 * 1024

describe('resolveStorageBytes (audit #10)', () => {
  it('sums the true on-disk sizes across folders (catches a client-undercounted stem)', async () => {
    const { service } = makeService({
      artist1: [
        { name: 'master.wav', size: 40 * MB },
        // Real 300MB stems — the manifest metadata for this could say 0/50MB.
        { name: 'stems.zip', size: 300 * MB },
      ],
      shares: [{ name: 'preview.mp3', size: 4 * MB }],
    })

    const total = await resolveStorageBytes(service as SupabaseClient, 'track-audio', [
      'artist1/master.wav',
      'artist1/stems.zip',
      'shares/preview.mp3',
    ])

    expect(total).toBe((40 + 300 + 4) * MB)
    // > the 200MB pack cap on real bytes — the route rejects (413) up front
    // instead of OOMing mid-assembly.
    expect(total!).toBeGreaterThan(200 * MB)
  })

  it('returns null when Storage list errors (caller falls back to the manifest sum)', async () => {
    const { service } = makeService({ artist1: [{ name: 'master.wav', size: 10 * MB }] }, {
      errorOnFolder: 'artist1',
    })
    const total = await resolveStorageBytes(service as SupabaseClient, 'track-audio', ['artist1/master.wav'])
    expect(total).toBeNull()
  })

  it('returns null when an object is missing or carries no size metadata', async () => {
    const { service } = makeService({
      artist1: [{ name: 'master.wav', size: null }], // present but no size
    })
    const missing = await resolveStorageBytes(service as SupabaseClient, 'track-audio', ['artist1/gone.wav'])
    expect(missing).toBeNull()

    const noSize = await resolveStorageBytes(service as SupabaseClient, 'track-audio', ['artist1/master.wav'])
    expect(noSize).toBeNull()
  })
})
