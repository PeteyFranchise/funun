import { assessDoctrinePilot, isDoctrinePackageUnlocked, isMissingPlaybookActivationSchema } from '@/lib/playbook/activation'
import type { PublicationAssessment, PublicationManifestItem } from '@/lib/playbook/publication-manifest'

const pilot: PublicationAssessment = {
  key: 'ar-doctrine', title: 'A&R Doctrine', sourcePath: 'docs/ar.md', roomKey: 'ar', subgroupKey: 'role-doctrine',
  reviewerRoles: ['anr', 'leadership'], gamePlanKeys: [], supersedesTitles: ['Legacy A&R'],
  state: 'ready', entryId: null, entrySlug: null, reasons: [],
}

describe('Playbook doctrine activation', () => {
  it('requires UAT before the first A&R draft', () => {
    expect(assessDoctrinePilot({ items: [pilot], uatComplete: false, packageUnlocked: false }).stage).toBe('uat_required')
    expect(assessDoctrinePilot({ items: [pilot], uatComplete: true, packageUnlocked: false }).stage).toBe('ready')
  })

  it('keeps the package held while the pilot is under review or legacy cleanup', () => {
    const review = { ...pilot, state: 'draft' as const, entryId: 'entry-1' }
    const cleanup = { ...pilot, state: 'blocked' as const, entryId: 'entry-1', reasons: ['Legacy entry still needs an explicit supersession decision'] }
    expect(assessDoctrinePilot({ items: [review], uatComplete: true, packageUnlocked: false }).stage).toBe('review')
    expect(assessDoctrinePilot({ items: [cleanup], uatComplete: true, packageUnlocked: false }).stage).toBe('legacy_cleanup')
  })

  it('unlocks only after the replacement is published and active legacy entries are superseded', () => {
    const manifest = pilot as PublicationManifestItem
    expect(isDoctrinePackageUnlocked({ pilot: manifest, entries: [{ title: pilot.title, status: 'published', source_path: pilot.sourcePath }, { title: 'Legacy A&R', status: 'published', source_path: null }] })).toBe(false)
    expect(isDoctrinePackageUnlocked({ pilot: manifest, entries: [{ title: pilot.title, status: 'published', source_path: pilot.sourcePath }, { title: 'Legacy A&R', status: 'superseded', source_path: null }] })).toBe(true)
  })

  it('recognizes only known missing-schema failures', () => {
    expect(isMissingPlaybookActivationSchema({ code: 'PGRST204', message: "Could not find the 'source_path' column" })).toBe(true)
    expect(isMissingPlaybookActivationSchema({ code: 'PGRST205', message: "Could not find table 'playbook_reading_assignments'" })).toBe(true)
    expect(isMissingPlaybookActivationSchema({ code: '42501', message: 'permission denied' })).toBe(false)
  })
})
