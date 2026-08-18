// Wave 0 nav-structure test (33-04 Task 1). Asserts lib/playbook/nav.ts is
// the single source for Rail 2's 6 rooms + the 5 ordered IT sub-pages + the
// 4 doc-page → docs/observability filename mappings (D-10).
import { PLAYBOOK_ROOMS, IT_SUBPAGES, DOC_PAGE_FILE } from '@/lib/playbook/nav'

describe('lib/playbook/nav', () => {
  it('has exactly 6 rooms (D-05, mockup order)', () => {
    expect(PLAYBOOK_ROOMS).toHaveLength(6)
  })

  it('has exactly 5 comingSoon rooms', () => {
    const comingSoon = PLAYBOOK_ROOMS.filter(r => r.comingSoon)
    expect(comingSoon).toHaveLength(5)
  })

  it('has exactly one itGated room — IT Team, and it is not comingSoon (D-06)', () => {
    const itGated = PLAYBOOK_ROOMS.filter(r => r.itGated)
    expect(itGated).toHaveLength(1)
    expect(itGated[0].label).toBe('IT Team')
    expect(itGated[0].comingSoon).toBe(false)
  })

  it('has 5 IT sub-pages in the exact order, dashboard first', () => {
    expect(IT_SUBPAGES).toHaveLength(5)
    expect(IT_SUBPAGES.map(p => p.slug)).toEqual([
      'dashboard',
      'vendor-directory',
      'runbook',
      'operating-rhythm',
      'thresholds',
    ])
    expect(IT_SUBPAGES[0].slug).toBe('dashboard')
  })

  it('gives every IT sub-page the correct label and href', () => {
    const bySlug = Object.fromEntries(IT_SUBPAGES.map(p => [p.slug, p]))
    expect(bySlug['dashboard']).toMatchObject({
      label: 'Monitoring Dashboard',
      href: '/admin/playbook/it/dashboard',
    })
    expect(bySlug['vendor-directory']).toMatchObject({
      label: 'Vendor Directory',
      href: '/admin/playbook/it/vendor-directory',
    })
    expect(bySlug['runbook']).toMatchObject({
      label: 'Incident Runbook',
      href: '/admin/playbook/it/runbook',
    })
    expect(bySlug['operating-rhythm']).toMatchObject({
      label: 'Operating Rhythm',
      href: '/admin/playbook/it/operating-rhythm',
    })
    expect(bySlug['thresholds']).toMatchObject({
      label: 'Thresholds & Severity',
      href: '/admin/playbook/it/thresholds',
    })
  })

  it('maps the 4 doc pages to their exact docs/observability filenames (D-10)', () => {
    expect(DOC_PAGE_FILE).toEqual({
      'vendor-directory': 'VENDOR-DIRECTORY.md',
      runbook: 'RUNBOOK.md',
      'operating-rhythm': 'OPERATING-RHYTHM.md',
      thresholds: 'THRESHOLDS-AND-SEVERITY.md',
    })
  })
})
