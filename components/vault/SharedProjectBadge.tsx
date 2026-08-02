import type { ProjectRole } from '@/lib/vault/membership'
import { PROJECT_ROLE_LABELS } from '@/lib/vault/membership'

// ─── Shared-project badge (③) ─────────────────────────────────────────
// Small presentational component for the "Shared with me" vault lane.
// Shows the owner's name (or degrades gracefully when unknown) and the
// VIEWER'S OWN role only — never an owner-only edit affordance. Follows
// the same absolute-positioned chip idiom as VaultProjectCard's status
// chip, but is rendered from a different corner so the two never collide.

export function SharedProjectBadge({
  ownerName,
  role,
}: {
  ownerName: string | null
  role: ProjectRole
}) {
  const projectText = ownerName ? `Shared · ${ownerName}'s project` : 'Shared project'
  const roleLabel = PROJECT_ROLE_LABELS[role]?.toLowerCase() ?? 'member'

  return (
    <span className="absolute right-[14px] top-[14px] z-[2] flex flex-col items-end gap-[2px] rounded-[10px] border border-brandindigo/30 bg-brandindigo/10 px-[11px] py-[6px] text-right">
      <span className="text-[12.5px] font-bold text-brandindigo">{projectText}</span>
      <span className="text-[11px] font-semibold text-lavdim">You&apos;re a {roleLabel}</span>
    </span>
  )
}
