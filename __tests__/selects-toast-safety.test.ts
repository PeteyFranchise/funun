import { readFileSync } from 'fs'
import path from 'path'

describe('Selects toast rendering', () => {
  it('renders toast messages as React text, never injected HTML', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'components/selects-player/SelectsPlayer.tsx'),
      'utf8'
    )
    expect(source).not.toContain('dangerouslySetInnerHTML')
    expect(source).not.toContain('escapeHtml')
    expect(source).toContain('<span>{toast}</span>')
  })
})
