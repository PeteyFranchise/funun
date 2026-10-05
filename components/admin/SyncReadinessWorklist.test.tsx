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
  "This song can't be admitted — it's a snippet, a promo clip rather than a licensable recording, and the sync catalogue lists finished recordings. Submit the full recording instead."

describe('SyncReadinessWorklist', () => {
  it('renders an ELIGIBLE, checklist-complete pending_admit row as "Ready to admit"', () => {
    const html = renderToStaticMarkup(
      <SyncReadinessWorklist rows={[BASE_ROW]} canReviewQuality={false} />
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
        canReviewQuality={false}
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
        canReviewQuality={false}
      />
    )
    // The submission is still visible — a live listing awaiting a human
    // decision must not silently vanish from the surface that explains it.
    expect(html).toContain('Golden Hour')
    expect(html).not.toContain('Nothing on the worklist')
    expect(html).toContain('snippet')
    expect(html).toContain('finished recordings')
  })

  // OWNER DECISION 2026-10-04 ("Quality review is part of A&R's job."):
  // the quality-review controls now gate on `canReviewQuality` (mirroring
  // the quality route's own requireStaff(['leadership','anr'])), NOT on
  // leadership status alone. These two tests pin that the prop — not a
  // leadership flag — is what drives the controls, so a future reversion
  // back to an isLeadership-shaped gate fails here.
  it('renders the quality-review controls (Pass/Fail) when canReviewQuality is true — the anr case', () => {
    const html = renderToStaticMarkup(
      <SyncReadinessWorklist rows={[BASE_ROW]} canReviewQuality={true} />
    )
    expect(html).toContain('Quality review')
    expect(html).toContain('Pass')
    expect(html).toContain('Fail')
    expect(html).toContain('Guidance notes for the artist team')
  })

  it('hides the quality-review controls and shows read-only guidance when canReviewQuality is false — the ae/bd case', () => {
    const html = renderToStaticMarkup(
      <SyncReadinessWorklist
        rows={[{ ...BASE_ROW, staffNotes: 'Re-master before resubmitting' }]}
        canReviewQuality={false}
      />
    )
    expect(html).not.toContain('Quality review')
    expect(html).not.toContain('>Pass<')
    expect(html).not.toContain('>Fail<')
    expect(html).toContain('Guidance:')
    expect(html).toContain('Re-master before resubmitting')
  })
})
