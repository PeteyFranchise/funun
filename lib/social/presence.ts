// Pure functions only — no Supabase client, no I/O.
// Implements the D-21 presence bucket ladder for offline status display.
// Mirrors lib/social/notifications.ts pure-function convention.

/**
 * Format a `last_seen_at` ISO timestamp into a human-readable presence
 * status string using D-21 coarse-bucket semantics.
 *
 * Buckets (from most to least recent):
 *   < 2 min   → 'Active now'
 *   < 60 min  → 'Active {N}m ago' (floored minutes)
 *   < 24 h    → 'Active {N}h ago' (floored hours)
 *   < 7 days  → 'Active this week'
 *   ≥ 7 days  → null  (D-21 cutoff: a stale member advertises no status)
 *   null input → null
 */
export function formatPresenceStatus(lastSeenAt: string | null): string | null {
  if (!lastSeenAt) return null

  const diffMs = Date.now() - new Date(lastSeenAt).getTime()
  const diffMin = diffMs / 60_000
  const diffHr = diffMs / 3_600_000
  const diffDay = diffMs / 86_400_000

  if (diffMin < 2) return 'Active now'
  if (diffMin < 60) return `Active ${Math.floor(diffMin)}m ago`
  if (diffHr < 24) return `Active ${Math.floor(diffHr)}h ago`
  if (diffDay < 7) return 'Active this week'
  return null // D-21: nothing after ~7 days
}
