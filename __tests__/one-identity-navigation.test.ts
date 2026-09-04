import { readFileSync } from 'fs'
import path from 'path'

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

const memberNav = read('components/nav/ArtistNav.tsx')
const memberLayout = read('app/(artist)/layout.tsx')
const syncLayout = read('app/sync/layout.tsx')
const buyerNav = read('components/buyer/BuyerTopNav.tsx')
const lockerPage = read('app/(artist)/contracts/page.tsx')
const legacySplitSheetIndex = read('app/(artist)/split-sheets/page.tsx')

describe('One Identity, Many Roles navigation contract', () => {
  it('uses one universal Contract Locker item and treats split sheet detail routes as active', () => {
    expect(memberNav.match(/label: 'Contract Locker'/g)).toHaveLength(1)
    expect(memberNav).not.toContain("label: 'Split Sheets', match: '/split-sheets'")
    expect(memberNav).toContain("alsoMatches: ['/split-sheets']")
    expect(memberNav).not.toContain('requiresCapability')
  })

  it('renders Split Sheets inside Contract Locker and preserves the old list URL', () => {
    expect(lockerPage).toContain("view === 'split-sheets'")
    expect(lockerPage).toContain('<SplitSheetList sheets={splitSheets} />')
    expect(legacySplitSheetIndex).toContain("redirect('/contracts?view=split-sheets')")
  })

  it('derives Client Partner context from organization membership instead of auth metadata', () => {
    expect(syncLayout).toContain(".from('buyer_members')")
    expect(syncLayout).not.toContain("app_metadata as { role?: string }")
    expect(memberLayout).toContain(".from('buyer_members')")
  })

  it('provides workspace switches in both contexts for dual-context people', () => {
    expect(memberNav).toContain('Open The Crate')
    expect(buyerNav).toContain('My workspace')
  })
})
