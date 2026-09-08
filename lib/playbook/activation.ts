import type { PublicationAssessment, PublicationManifestItem } from '@/lib/playbook/publication-manifest'

export const DOCTRINE_PILOT_KEY = 'ar-doctrine'

export type DoctrinePilotStage = 'not_visible' | 'blocked' | 'uat_required' | 'ready' | 'review' | 'legacy_cleanup' | 'complete'

export type DoctrinePilotAssessment = {
  stage: DoctrinePilotStage
  pilot: PublicationAssessment | null
  packageUnlocked: boolean
  label: string
  detail: string
}

export function assessDoctrinePilot(args: {
  items: readonly PublicationAssessment[]
  uatComplete: boolean
  packageUnlocked: boolean
}): DoctrinePilotAssessment {
  const pilot = args.items.find(item => item.key === DOCTRINE_PILOT_KEY) ?? null
  if (args.packageUnlocked) {
    return { stage: 'complete', pilot, packageUnlocked: true, label: 'Pilot complete', detail: 'A&R is published, legacy entries are resolved, and the remaining doctrine package may proceed one draft at a time.' }
  }
  if (!pilot) {
    return { stage: 'not_visible', pilot: null, packageUnlocked: false, label: 'A&R pilot in progress', detail: 'Leadership and the A&R room lead own the first production pilot. Other doctrine drafts remain held until it is complete.' }
  }
  const legacyOnly = pilot.reasons.length > 0 && pilot.reasons.every(reason => reason === 'Legacy entry still needs an explicit supersession decision')
  if (legacyOnly && pilot.entryId) {
    return { stage: 'legacy_cleanup', pilot, packageUnlocked: false, label: 'Resolve legacy A&R entries', detail: 'The replacement is published. Complete each explicit supersession decision before unlocking the full package.' }
  }
  if (pilot.state === 'blocked') {
    return { stage: 'blocked', pilot, packageUnlocked: false, label: 'Pilot blocked', detail: pilot.reasons.join('; ') || 'Resolve the A&R publication blockers before proceeding.' }
  }
  if (pilot.state === 'draft' || pilot.state === 'changed') {
    return { stage: 'review', pilot, packageUnlocked: false, label: 'A&R draft in review', detail: 'Complete room review, approval, publication, and any required legacy supersession decisions.' }
  }
  if (pilot.state === 'published') {
    return { stage: 'complete', pilot, packageUnlocked: true, label: 'Pilot complete', detail: 'A&R is published and the remaining doctrine package may proceed one draft at a time.' }
  }
  if (!args.uatComplete) {
    return { stage: 'uat_required', pilot, packageUnlocked: false, label: 'Complete production UAT', detail: 'All access, rendering, revision, and supersession checks must pass before creating the A&R pilot draft.' }
  }
  return { stage: 'ready', pilot, packageUnlocked: false, label: 'A&R pilot ready', detail: 'The UAT pass is complete. Preview the A&R source and create one unpublished review draft.' }
}

export function isDoctrinePackageUnlocked(args: {
  pilot: PublicationManifestItem
  entries: ReadonlyArray<{ title: string; status: string; source_path: string | null }>
}): boolean {
  const replacement = args.entries.find(entry => entry.source_path === args.pilot.sourcePath)
  if (replacement?.status !== 'published') return false
  return !args.entries.some(entry => args.pilot.supersedesTitles.includes(entry.title) && entry.status !== 'superseded')
}

export function isMissingPlaybookActivationSchema(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false
  const message = (error.message ?? '').toLowerCase()
  const knownCode = ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error.code ?? '')
  const knownSurface = ['source_path', 'playbook_reading_assignments', 'playbook_entry_revisions'].some(value => message.includes(value))
  return knownCode && knownSurface
}
