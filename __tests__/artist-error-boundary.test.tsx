import { renderToStaticMarkup } from 'react-dom/server'

// No @testing-library/react or jsdom is installed (jest testEnvironment is
// 'node'), so this follows the repo convention set by global-error.test.tsx:
// render to static markup and assert on string content. useEffect (where
// Sentry.captureException runs) does NOT execute under static render.

const mockCaptureException = jest.fn()
jest.mock('@sentry/nextjs', () => ({
  captureException: (...a: unknown[]) => mockCaptureException(...a),
}))

import ArtistError from '@/app/(artist)/error'

const noop = () => {}

describe('ArtistError — the artist segment error boundary', () => {
  // The whole reason this file exists: before it, an artist page crash fell
  // through to global-error.tsx, which replaces the entire document. This
  // boundary must render INSIDE the layout, so it must NOT emit its own
  // html/body — that is the structural difference from global-error, and the
  // thing that silently breaks if someone copies the wrong file as a template.
  it('renders inside the layout — no html/body of its own', () => {
    const html = renderToStaticMarkup(
      <ArtistError error={new Error('boom') as Error & { digest?: string }} reset={noop} />
    )
    expect(html).not.toContain('<html')
    expect(html).not.toContain('<body')
    expect(html).toContain('This page didn')
  })

  // Production strips the error message before it reaches the browser, so the
  // digest is the only handle for correlating a user report with the real
  // error. If it stops rendering, bug reports go back to being unactionable.
  it('surfaces error.digest so a report can be correlated with the real error', () => {
    const error = Object.assign(new Error('boom'), { digest: 'abc123def' })
    const html = renderToStaticMarkup(<ArtistError error={error} reset={noop} />)
    expect(html).toContain('abc123def')
  })

  it('omits the error-ref line entirely when there is no digest', () => {
    const html = renderToStaticMarkup(
      <ArtistError error={new Error('boom') as Error & { digest?: string }} reset={noop} />
    )
    expect(html).not.toContain('Error ref:')
  })

  // reset() cannot fix a stale-deploy chunk failure — it re-runs the same
  // doomed fetch against a build that no longer exists. Only a hard reload
  // gets the current build. Shipping "Try again" alone would be a button that
  // can never work for the exact failure this boundary was added for.
  it('offers a hard reload as well as reset, because reset cannot fix a stale build', () => {
    const html = renderToStaticMarkup(
      <ArtistError error={new Error('boom') as Error & { digest?: string }} reset={noop} />
    )
    expect(html).toContain('Try again')
    expect(html).toContain('Reload the page')
  })

  it('does not capture during SSR — capture is client-effect-gated', () => {
    renderToStaticMarkup(
      <ArtistError error={new Error('boom') as Error & { digest?: string }} reset={noop} />
    )
    expect(mockCaptureException).not.toHaveBeenCalled()
  })
})
