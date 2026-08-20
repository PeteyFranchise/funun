import { renderToStaticMarkup } from 'react-dom/server'

// No @testing-library/react or jsdom is installed (jest testEnvironment is
// 'node') — matching the repo convention (see playbook-status-banner.test.tsx),
// this renders to static markup via react-dom/server and asserts on string
// content. useEffect (where Sentry.captureException runs) does NOT execute
// under static render, so the live capture round-trip is a deploy-time
// verification (folded into the Sentry live-verify UAT, audit #16/#32-06);
// this suite proves the boundary itself renders a self-contained fallback.

const mockCaptureException = jest.fn()
jest.mock('@sentry/nextjs', () => ({
  captureException: (...a: unknown[]) => mockCaptureException(...a),
}))

import GlobalError from '@/app/global-error'

describe('GlobalError (audit #16)', () => {
  it('renders a self-contained fallback document (own html + body) so a root-layout crash still shows UI', () => {
    const html = renderToStaticMarkup(
      <GlobalError error={new Error('boom') as Error & { digest?: string }} />
    )
    expect(html).toContain('<html')
    expect(html).toContain('<body')
    expect(html).toContain('Something went wrong')
  })

  it('does not capture during SSR — capture is client-effect-gated (runs on mount, not render)', () => {
    renderToStaticMarkup(<GlobalError error={new Error('boom') as Error & { digest?: string }} />)
    expect(mockCaptureException).not.toHaveBeenCalled()
  })
})
