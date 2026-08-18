// ─── Vendor Directory (IT-room doc page) ────────────────────────────────
// Renders docs/observability/VENDOR-DIRECTORY.md via MarkdownDoc — the .md
// file stays the single source of truth (D-10). Self-guarded to
// leadership+it before any content read (fail closed, D-02, T-33-01).

import { requireStaffPage } from '@/lib/admin/gate'
import { readObservabilityDoc } from '@/lib/playbook/read-doc'
import { DOC_PAGE_FILE, IT_SUBPAGES } from '@/lib/playbook/nav'
import { ItRoomTopBar } from '@/components/playbook/ItRoomTopBar'
import { MarkdownDoc } from '@/components/playbook/MarkdownDoc'

const CRUMB = IT_SUBPAGES.find((p) => p.slug === 'vendor-directory')!.label

export default async function VendorDirectoryPage() {
  // Guard runs BEFORE any doc content is read — never widen to ALL_STAFF_ROLES.
  await requireStaffPage(['leadership', 'it'])

  const md = await readObservabilityDoc(DOC_PAGE_FILE['vendor-directory'])

  return (
    <div>
      <ItRoomTopBar crumb={CRUMB} />
      <MarkdownDoc content={md} />
    </div>
  )
}
