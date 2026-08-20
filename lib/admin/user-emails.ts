import type { SupabaseClient } from '@supabase/supabase-js'

// ─── attachUserEmails (audit #11) ────────────────────────────────────────
// user_profiles has no email column — email lives on auth.users, so admin
// surfaces attach it via the Auth Admin API. Doing that as an unbounded
// `Promise.all(ids.map(getUserById))` per section (and re-fetching the same id
// across sections) fans out hundreds of GoTrue round-trips on every page load
// (audit #11: sync-library issued up to ~300 + duplicates). This helper:
//   • deduplicates ids,
//   • caps concurrency (a small worker pool, not a 300-wide burst),
//   • reuses a caller-supplied cache so an id is fetched at most once per
//     request across multiple sections,
//   • never throws — a failed lookup resolves that id to '' (same graceful
//     degradation the call sites already had).
// The durable fix for all ~20 call sites is denormalizing email onto a read
// model (owner-gated migration); this is the code-only cheap win.
export async function attachUserEmails(
  service: SupabaseClient,
  ids: string[],
  opts?: { concurrency?: number; cache?: Map<string, string> }
): Promise<Map<string, string>> {
  const cache = opts?.cache ?? new Map<string, string>()
  const concurrency = Math.max(1, opts?.concurrency ?? 8)

  // Only resolve ids we have not already fetched this request.
  const pending = [...new Set(ids)].filter(id => id && !cache.has(id))
  if (pending.length === 0) return cache

  let cursor = 0
  const worker = async () => {
    while (cursor < pending.length) {
      const id = pending[cursor++]
      try {
        const { data } = await service.auth.admin.getUserById(id)
        cache.set(id, data?.user?.email ?? '')
      } catch {
        cache.set(id, '')
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker))
  return cache
}
