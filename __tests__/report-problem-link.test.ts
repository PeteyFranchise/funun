import { SUPPORT_EMAIL } from '@/components/nav/ReportProblemLink'

// The report link is a beta escape hatch: an artist who hits something broken
// has no other way to tell us (Sentry only catches code that throws). These
// assertions guard the two ways it could silently stop working.
describe('ReportProblemLink — support address', () => {
  it('points at a real, monitored mailbox', () => {
    expect(SUPPORT_EMAIL).toMatch(/^[^@\s]+@funun\.studio$/)
  })

  // docs/STATUS.md lists support@/hello@/privacy@ as PLANNED addresses. Pointing
  // beta users at an alias nobody reads is worse than shipping no link, so this
  // fails loudly if someone swaps in an aspirational address. Update this test
  // deliberately, at the same time the mailbox is actually created.
  it('is not an aspirational alias that may not exist yet', () => {
    expect(['support@funun.studio', 'hello@funun.studio', 'privacy@funun.studio']).not.toContain(
      SUPPORT_EMAIL
    )
  })
})
