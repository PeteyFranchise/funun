import { renderToStaticMarkup } from 'react-dom/server'
import { StatusBanner } from '@/components/playbook/StatusBanner'

// ─── StatusBanner (33-07 Task 2, PLAYBOOK-07) ──────────────────────────
// No @testing-library/react or jsdom is installed in this codebase (jest
// config's testEnvironment is 'node') — per RESEARCH Pitfall 3's guidance
// to scope automated component coverage to what the existing toolchain
// supports, this renders to a static HTML string via react-dom/server
// (already an installed dependency) and asserts on string content /
// data-attributes rather than pulling in a new test-only package.

describe('StatusBanner', () => {
  it('renders the healthy state: pulsing dot + "All systems operational"', () => {
    const html = renderToStaticMarkup(<StatusBanner status="healthy" />)
    expect(html).toContain('All systems operational')
    expect(html).toContain('data-status="healthy"')
    expect(html).toContain('data-pulsing="true"')
    expect(html).toContain('uptime tracked externally by Better Stack')
  })

  it('renders the degraded state: steady dot + degraded title + Incident Runbook link', () => {
    const html = renderToStaticMarkup(<StatusBanner status="degraded" />)
    expect(html).toContain('Degraded — /api/health reporting an issue')
    expect(html).toContain('data-status="degraded"')
    expect(html).toContain('data-pulsing="false"')
    expect(html).toContain('Incident Runbook')
  })

  it('renders the unknown state: steady dot + "treat as degraded" subtext', () => {
    const html = renderToStaticMarkup(<StatusBanner status="unknown" />)
    expect(html).toContain('Health check unavailable — treat as degraded until confirmed')
    expect(html).toContain('data-status="unknown"')
    expect(html).toContain('data-pulsing="false"')
  })

  it('distinguishes healthy (pulsing) from degraded/unknown (steady) dot semantics', () => {
    const healthyHtml = renderToStaticMarkup(<StatusBanner status="healthy" />)
    const degradedHtml = renderToStaticMarkup(<StatusBanner status="degraded" />)
    const unknownHtml = renderToStaticMarkup(<StatusBanner status="unknown" />)
    expect(healthyHtml).toContain('data-pulsing="true"')
    expect(degradedHtml).toContain('data-pulsing="false"')
    expect(unknownHtml).toContain('data-pulsing="false"')
    expect(healthyHtml).not.toEqual(degradedHtml)
  })
})
