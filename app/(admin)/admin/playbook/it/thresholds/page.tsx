// ─── Thresholds & Severity (IT-room doc page) ───────────────────────────
// Renders docs/observability/THRESHOLDS-AND-SEVERITY.md via MarkdownDoc —
// the .md file stays the single source of truth (D-10). Self-guarded to
// the data-driven it-team room grant before any content read (fail
// closed, D-02, T-33-01). Re-pointed from the Phase 33 hardcoded
// requireStaffPage(['leadership','it']) literal to requireRoomAccessPage
// ('it-team') (31.2-07 Task 3, Pitfall 6) — migration 130 seeds it-team
// grantable to 'it' (leadership passes structurally), so day-one behavior
// is unchanged, but the access matrix now controls this gate for real.

import { requireRoomAccessPage } from '@/lib/playbook/rooms'
import { readObservabilityDoc } from '@/lib/playbook/read-doc'
import { DOC_PAGE_FILE, IT_SUBPAGES } from '@/lib/playbook/nav'
import { ItRoomTopBar } from '@/components/playbook/ItRoomTopBar'
import { MarkdownDoc } from '@/components/playbook/MarkdownDoc'

const CRUMB = IT_SUBPAGES.find((p) => p.slug === 'thresholds')!.label

export default async function ThresholdsPage() {
  // Guard runs BEFORE any doc content is read — never widen scope (D-02).
  await requireRoomAccessPage('it-team')

  const md = await readObservabilityDoc(DOC_PAGE_FILE['thresholds'])

  return (
    <div>
      <ItRoomTopBar crumb={CRUMB} />
      <MarkdownDoc content={md} />
    </div>
  )
}
