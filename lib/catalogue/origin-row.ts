// ─── Work-page provenance row — pure decision + formatting, no I/O ─────
// Mirrors lib/catalogue/access.ts's own documented split: the DECISION
// (`pickVisibleOriginIdeas`) and the FORMATTING (`timeAgo`) are pure
// functions over data the caller already fetched, so both are
// unit-testable without a Supabase mock or a DOM. This file imports
// nothing from `@/lib/supabase/*` and nothing from `react` on purpose.

// ─── timeAgo — a deliberate LOCAL COPY, not an import ──────────────────
// This codebase has no shared relative-time export. The established
// convention (components/profile/ActivityFeed.tsx's original, re-copied
// byte-for-byte at components/catalogue/DiaryFeed.tsx, whose own comment
// states why) is an independent local copy per consumer rather than a
// shared formatter — followed here rather than introduced as a drive-by
// refactor.
export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── pickVisibleOriginIdeas — the access decision, pure ────────────────
// Filters a work's origin ideas down to only those the current viewer has
// been granted access to (per lib/ideas/access.ts's resolveIdeaAccess()),
// preserving input order. A work can legitimately accumulate more than one
// origin idea via repeated promote_idea_to_work() merges, so this returns
// a list, not a single idea.
export function pickVisibleOriginIdeas<T extends { id: string }>(ideas: T[], grantedIds: Set<string>): T[] {
  return ideas.filter(idea => grantedIds.has(idea.id))
}
