import { renderToStaticMarkup } from 'react-dom/server'
import { ClientWorkspace } from './ClientWorkspace'

// ─── ClientWorkspace — last-contacted card render (D-31.1-02 verification
// Gap 2) ──────────────────────────────────────────────────────────────────
// Component tests use renderToStaticMarkup (testEnvironment 'node', no
// jsdom): effects don't run, so the workspace renders in its default
// Contacts tab — exactly what we assert against. mode="company" only
// (mode="person" unconditionally mounts GamePlanPanel, which calls
// next/navigation's useRouter() and throws outside an AppRouterContext
// provider — SharedProjectBadge.test.tsx/StaffAdmin.test.tsx's pattern
// avoids router-dependent subtrees for the same reason).

function baseProps() {
  return {
    mode: 'company' as const,
    orgId: 'org-1',
    companyName: 'Neon Sky Records',
    companyStatus: 'active' as const,
    companyWebsite: null,
    contacts: [],
    initialSelects: [],
    initialRelationshipLog: [],
    briefs: [],
    licenseRequests: [],
  }
}

describe('ClientWorkspace — last-contacted card render', () => {
  it('renders relative "Last contacted X days ago" when lastContactedAt is set', () => {
    const twelveDaysAgo = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString()
    const markup = renderToStaticMarkup(
      <ClientWorkspace {...baseProps()} lastContactedAt={twelveDaysAgo} />
    )
    expect(markup).toContain('Last contacted 12 days ago')
  })

  it('renders "Last contacted 1 day ago" (singular) at exactly one day', () => {
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
    const markup = renderToStaticMarkup(
      <ClientWorkspace {...baseProps()} lastContactedAt={oneDayAgo} />
    )
    expect(markup).toContain('Last contacted 1 day ago')
  })

  it('renders "Last contacted today" for a same-day contact', () => {
    const justNow = new Date().toISOString()
    const markup = renderToStaticMarkup(
      <ClientWorkspace {...baseProps()} lastContactedAt={justNow} />
    )
    expect(markup).toContain('Last contacted today')
  })

  it('renders "No contact logged yet" when lastContactedAt is null', () => {
    const markup = renderToStaticMarkup(
      <ClientWorkspace {...baseProps()} lastContactedAt={null} />
    )
    expect(markup).toContain('No contact logged yet')
  })

  it('renders "No contact logged yet" when lastContactedAt is omitted entirely', () => {
    const markup = renderToStaticMarkup(<ClientWorkspace {...baseProps()} />)
    expect(markup).toContain('No contact logged yet')
  })
})
