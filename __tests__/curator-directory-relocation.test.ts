import { readFileSync } from 'fs'
import path from 'path'

const pitchplugPage = readFileSync(
  path.join(process.cwd(), 'app/(artist)/tools/pitchplug/page.tsx'),
  'utf8'
)

const adminLayout = readFileSync(path.join(process.cwd(), 'app/(admin)/layout.tsx'), 'utf8')

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
    const linkStart = adminLayout.indexOf('href="/admin/curators"')
    expect(linkStart).toBeGreaterThan(-1)
    const nearby = adminLayout.slice(Math.max(0, linkStart - 200), linkStart + 300)
    expect(nearby).toContain('PitchPlug')
  })

  it('keeps the /admin/curators route unchanged', () => {
    expect(adminLayout).toContain('href="/admin/curators"')
  })
})
