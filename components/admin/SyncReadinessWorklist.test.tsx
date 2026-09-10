import { renderToStaticMarkup } from 'react-dom/server'
import { SyncReadinessWorklist } from '@/components/admin/SyncReadinessWorklist'
import type { WorklistRow } from '@/lib/sync-library/worklist'

// ─── SyncReadinessWorklist — the project-TYPE rule at the staff surface ───
// No @testing-library/react or jsdom is installed (jest testEnvironment is
// 'node'), so this renders to a static HTML string via react-dom/server and
// asserts on string content — the same approach as
// __tests__/playbook-status-banner.test.tsx.
//
// What this pins: the worklist can never render "Ready to admit" or
// "Checklist complete" for a project type the sync catalogue refuses. The
// shaper's syncEligible/ineligibleReason fields (lib/sync-library/worklist.ts)
// exist for exactly this, and lib/sync-library/worklist.test.ts proves they
// are derived from isSyncEligibleProjectType(); this proves the UI honours
// them, which is where the contradiction was actually visible.

const BASE_ROW: WorklistRow = {
  listingId: 'listing-1',
  status: 'pending_admit',
  trackId: 'track-1',
  trackTitle: 'Golden Hour',
  projectTitle: 'Golden Sessions',
  artistName: 'Jane Doe',
  appliedAt: '2026-08-01T00:00:00Z',
  missing: [],
  syncEligible: true,
  ineligibleReason: null,
  qualityOk: true,
  staffNotes: null,
}

const INELIGIBLE_REASON =
  "This song can't be admitted — it's an unreleased work, and the sync catalogue lists singles, EPs and albums only. It can be submitted again once its project is set up as a single, EP or album."

describe('SyncReadinessWorklist', () => {
  it('renders an ELIGIBLE, checklist-complete pending_admit row as "Ready to admit"', () => {
    const html = renderToStaticMarkup(
      <SyncReadinessWorklist rows={[BASE_ROW]} isLeadership={false} />
    )
    expect(html).toContain('Ready to admit')
    expect(html).toContain('Checklist complete')
    expect(html).toContain('data-sync-eligible="true"')
  })

  it('never says "Ready to admit" or "Checklist complete" for an INELIGIBLE project type', () => {
    // Same row — same pending_admit status, same empty missing[] — differing
    // ONLY in the type verdict. That is the exact state that used to lie.
    const html = renderToStaticMarkup(
      <SyncReadinessWorklist
        rows={[{ ...BASE_ROW, syncEligible: false, ineligibleReason: INELIGIBLE_REASON }]}
        isLeadership={false}
      />
    )
    expect(html).not.toContain('Ready to admit')
    expect(html).not.toContain('Checklist complete')
    expect(html).toContain('Not sync-eligible')
    expect(html).toContain('data-sync-eligible="false"')
  })

  it('shows the ineligible row rather than hiding it, with the reason spelled out', () => {
    const html = renderToStaticMarkup(
      <SyncReadinessWorklist
        rows={[{ ...BASE_ROW, syncEligible: false, ineligibleReason: INELIGIBLE_REASON }]}
        isLeadership={false}
      />
    )
    // The submission is still visible — a live listing awaiting a human
    // decision must not silently vanish from the surface that explains it.
    expect(html).toContain('Golden Hour')
    expect(html).not.toContain('Nothing on the worklist')
    expect(html).toContain('unreleased work')
    expect(html).toContain('singles, EPs and albums')
  })
})
