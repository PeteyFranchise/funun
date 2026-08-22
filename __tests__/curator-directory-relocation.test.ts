import { readFileSync } from 'fs'
import path from 'path'

const pitchplugPage = readFileSync(
  path.join(process.cwd(), 'app/(artist)/tools/pitchplug/page.tsx'),
  'utf8'
)

// The admin sidebar nav moved out of app/(admin)/layout.tsx into the
// AdminNav client component (icon + collapse redesign) — the curators nav
// entry now lives there.
const adminNav = readFileSync(path.join(process.cwd(), 'components/nav/AdminNav.tsx'), 'utf8')

describe('curator directory relocation — PitchPlug placement (INDUSTRY-05)', () => {
  it('adds a discoverable /curators link from the PitchPlug page', () => {
    expect(pitchplugPage).toMatch(/href=(["'])\/curators\1/)
  })

  it('does not wire curator data or the pitch composer into PitchPlug', () => {
    expect(pitchplugPage).not.toContain('CuratorDirectory')
    expect(pitchplugPage).not.toContain('PitchComposer')
    expect(pitchplugPage).not.toContain('pitch_history')
  })

  it('labels the admin /admin/curators nav entry as PitchPlug-associated', () => {
    const linkStart = adminNav.indexOf('/admin/curators')
    expect(linkStart).toBeGreaterThan(-1)
    const nearby = adminNav.slice(Math.max(0, linkStart - 200), linkStart + 300)
    expect(nearby).toContain('PitchPlug')
  })

  it('keeps the /admin/curators route unchanged', () => {
    expect(adminNav).toContain('/admin/curators')
  })
})
