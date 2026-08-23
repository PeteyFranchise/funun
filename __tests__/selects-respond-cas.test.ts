import { readFileSync } from 'fs'
import path from 'path'

// Guards audit #10: the Selects approve / request-changes transition must be a
// compare-and-swap on the status it validated, so two concurrent responses can't
// both win. Asserted at the source level because a true simultaneous-request
// test needs a live DB.
const src = readFileSync(
  path.join(process.cwd(), 'app/api/selects/[token]/respond/route.ts'),
  'utf8'
)

describe('selects respond — compare-and-swap on status (audit #10)', () => {
  it('filters the status update on BOTH id and the validated current status', () => {
    expect(src).toMatch(
      /\.update\(\{ status: target \}\)[\s\S]*\.eq\('id', selects\.id\)[\s\S]*\.eq\('status', selects\.status\)/
    )
  })

  it('returns a retryable 409 when no row matched (concurrent change)', () => {
    expect(src).toContain('status: 409')
  })
})
