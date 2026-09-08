export type PublicationManifestItem = {
  key: string
  title: string
  sourcePath: string
  roomKey: string
  subgroupKey: string
  reviewerRoles: string[]
  gamePlanKeys: string[]
  supersedesTitles: string[]
}

export type PublicationReadiness = 'ready' | 'draft' | 'published' | 'changed' | 'blocked'

export type PublicationAssessment = PublicationManifestItem & {
  state: PublicationReadiness
  entryId: string | null
  entrySlug: string | null
  reasons: string[]
}

export const PUBLICATION_ENTRY_SELECT =
  'id, room_id, title, slug, status, source_path, source_hash, draft_source_hash' as const

const FUNCTIONAL_SOURCE = '.planning/deliberations/organizational-doctrine/functional-team-doctrines.md'
const LEGACY_AR_TITLES = [
  'A&R Core Responsibilities — Start Here', '01 — Discovery & Cultural Awareness',
  '02 — Creative Understanding & Development', '03 — Relationship Stewardship',
  '04 — Onboarding & Platform Guidance', '05 — Project & Catalogue Awareness',
  '06 — Opportunity Development & Matching', '07 — Internal AE Partnership & Opportunity Circulation',
  '08 — Collaboration & Team Building', '09 — Rights & Business Readiness',
  '10 — Internal Coordination & Documentation', '11 — Member Advocacy & Accountability',
  '12 — Safety, Privacy & Professional Conduct', '13 — Product & Organizational Learning',
]
const LEGACY_BDT_TITLES = [
  'BDT Foundation Doctrine — Start Here', '01 — BDT Relationship Scope',
  '02 — Cross-Team Relationship Ownership', '03 — Six-Month Incubation & Joint Ownership',
  '04 — Full-Handoff Standard', '05 — Client Partner Verification Authority',
  '06 — Organic Buyer Fast Path', '07 — Instant vs. Reviewed Licensing',
  '08 — CRM & Console Requirements',
]

export const PLAYBOOK_PUBLICATION_MANIFEST: PublicationManifestItem[] = [
  { key: 'ar-doctrine', title: 'A&R Doctrine', sourcePath: `${FUNCTIONAL_SOURCE}#1-a-r-doctrine`, roomKey: 'ar', subgroupKey: 'role-doctrine', reviewerRoles: ['anr', 'leadership'], gamePlanKeys: [], supersedesTitles: LEGACY_AR_TITLES },
  { key: 'ae-sales-doctrine', title: 'Account Executive and Sales Doctrine', sourcePath: `${FUNCTIONAL_SOURCE}#2-account-executive-and-sales-doctrine`, roomKey: 'ae-sales', subgroupKey: 'role-doctrine', reviewerRoles: ['ae', 'leadership'], gamePlanKeys: [], supersedesTitles: [] },
  { key: 'business-development-doctrine', title: 'Business Development Doctrine', sourcePath: `${FUNCTIONAL_SOURCE}#3-business-development-doctrine`, roomKey: 'business-development', subgroupKey: 'role-doctrine', reviewerRoles: ['bd', 'leadership'], gamePlanKeys: ['client-partner-qualification'], supersedesTitles: LEGACY_BDT_TITLES },
  { key: 'talent-services-doctrine', title: 'Talent Services and Member Success Doctrine', sourcePath: `${FUNCTIONAL_SOURCE}#4-talent-services-and-member-success-doctrine`, roomKey: 'talent-services', subgroupKey: 'role-doctrine', reviewerRoles: ['tms', 'anr', 'leadership'], gamePlanKeys: ['beta-producer-onboarding-v1'], supersedesTitles: [] },
  { key: 'sync-licensing-doctrine', title: 'Sync and Licensing Doctrine', sourcePath: `${FUNCTIONAL_SOURCE}#5-sync-and-licensing-doctrine`, roomKey: 'sync-licensing', subgroupKey: 'role-doctrine', reviewerRoles: ['ae', 'legal', 'leadership'], gamePlanKeys: ['qualified-brief-intake', 'licence-clearance-delivery', 'cue-sheet-follow-up'], supersedesTitles: [] },
  { key: 'rights-legal-doctrine', title: 'Rights, Legal and Contract Operations Doctrine', sourcePath: `${FUNCTIONAL_SOURCE}#6-rights-legal-and-contract-operations-doctrine`, roomKey: 'rights-legal', subgroupKey: 'role-doctrine', reviewerRoles: ['legal', 'leadership'], gamePlanKeys: ['licence-clearance-delivery'], supersedesTitles: [] },
  { key: 'catalogue-doctrine', title: 'Catalogue, Metadata and Verification Operations Doctrine', sourcePath: `${FUNCTIONAL_SOURCE}#7-catalogue-metadata-and-verification-operations-doctrine`, roomKey: 'catalogue-operations', subgroupKey: 'role-doctrine', reviewerRoles: ['anr', 'legal', 'leadership'], gamePlanKeys: ['exact-version-crate-admission'], supersedesTitles: [] },
  { key: 'finance-doctrine', title: 'Finance, Accounting and Royalties Doctrine', sourcePath: `${FUNCTIONAL_SOURCE}#8-finance-accounting-and-royalties-doctrine`, roomKey: 'finance', subgroupKey: 'role-doctrine', reviewerRoles: ['accounting', 'leadership'], gamePlanKeys: [], supersedesTitles: [] },
  { key: 'marketing-doctrine', title: 'Marketing, Community and Audience Development Doctrine', sourcePath: `${FUNCTIONAL_SOURCE}#9-marketing-community-and-audience-development-doctrine`, roomKey: 'marketing', subgroupKey: 'role-doctrine', reviewerRoles: ['marketing', 'leadership'], gamePlanKeys: [], supersedesTitles: [] },
  { key: 'product-it-doctrine', title: 'Product, Engineering and IT Doctrine', sourcePath: `${FUNCTIONAL_SOURCE}#10-product-engineering-and-it-doctrine`, roomKey: 'it-team', subgroupKey: 'role-doctrine', reviewerRoles: ['it', 'leadership'], gamePlanKeys: ['incident-response'], supersedesTitles: [] },
  { key: 'leadership-doctrine', title: 'Leadership Doctrine', sourcePath: `${FUNCTIONAL_SOURCE}#11-leadership-doctrine`, roomKey: 'leadership', subgroupKey: 'leadership-doctrine', reviewerRoles: ['leadership'], gamePlanKeys: [], supersedesTitles: [] },
  { key: 'tms-doctrine', title: 'Team Member Services Doctrine', sourcePath: `${FUNCTIONAL_SOURCE}#12-team-member-services-doctrine`, roomKey: 'tms', subgroupKey: 'role-doctrine', reviewerRoles: ['tms', 'leadership'], gamePlanKeys: ['team-member-onboarding'], supersedesTitles: [] },
  { key: 'training-doctrine', title: 'Training and Enablement Doctrine', sourcePath: `${FUNCTIONAL_SOURCE}#13-training-and-enablement-doctrine`, roomKey: 'tms', subgroupKey: 'training-enablement', reviewerRoles: ['tms', 'leadership'], gamePlanKeys: ['team-member-onboarding'], supersedesTitles: [] },
  { key: 'trust-safety-doctrine', title: 'Trust and Safety Doctrine', sourcePath: `${FUNCTIONAL_SOURCE}#14-trust-and-safety-doctrine`, roomKey: 'trust-safety', subgroupKey: 'role-doctrine', reviewerRoles: ['leadership'], gamePlanKeys: ['incident-response'], supersedesTitles: [] },
  { key: 'support-doctrine', title: 'Support Operations Doctrine', sourcePath: `${FUNCTIONAL_SOURCE}#15-support-operations-doctrine`, roomKey: 'support-operations', subgroupKey: 'role-doctrine', reviewerRoles: ['tms', 'it', 'leadership'], gamePlanKeys: ['incident-response'], supersedesTitles: [] },
  { key: 'deal-flow', title: 'Funūn Deal Flow', sourcePath: '.planning/deliberations/sync-library-operating-model.md#funun-deal-flow', roomKey: 'company-wide', subgroupKey: 'cross-functional-operations', reviewerRoles: ['ae', 'bd', 'anr', 'legal', 'accounting', 'leadership'], gamePlanKeys: ['bdt-to-ae-handoff', 'qualified-brief-intake', 'licence-clearance-delivery'], supersedesTitles: [] },
  { key: 'workforce-scale', title: 'Workforce and Commercial Scale Plan', sourcePath: '.planning/deliberations/organizational-doctrine/workforce-and-commercial-scale-plan.md', roomKey: 'leadership', subgroupKey: 'workforce-planning', reviewerRoles: ['leadership'], gamePlanKeys: [], supersedesTitles: [] },
  { key: 'six-month-launch', title: 'First Six-Month Launch Growth Plan', sourcePath: '.planning/deliberations/organizational-doctrine/first-six-month-launch-growth-plan.md', roomKey: 'leadership', subgroupKey: 'launch-planning', reviewerRoles: ['leadership'], gamePlanKeys: [], supersedesTitles: [] },
]

export function assessPublicationManifest(args: {
  manifest?: readonly PublicationManifestItem[]
  rooms: ReadonlyArray<{ id: string; key: string }>
  subgroups: ReadonlyArray<{ id: string; room_id: string; key: string }>
  entries: ReadonlyArray<{ id: string; room_id: string; title: string; slug: string | null; status: string; source_path: string | null; source_hash: string | null; draft_source_hash: string | null }>
  leadRoomIds: readonly string[]
  leadership: boolean
  gamePlanKeys: readonly string[]
}): PublicationAssessment[] {
  const manifest = args.manifest ?? PLAYBOOK_PUBLICATION_MANIFEST
  const sourceCounts = new Map<string, number>()
  for (const item of manifest) sourceCounts.set(item.sourcePath, (sourceCounts.get(item.sourcePath) ?? 0) + 1)
  const rooms = new Map(args.rooms.map(room => [room.key, room]))
  const gamePlanKeys = new Set(args.gamePlanKeys)

  return manifest.flatMap(item => {
    const room = rooms.get(item.roomKey)
    if (room && !args.leadership && !args.leadRoomIds.includes(room.id)) return []
    const reasons: string[] = []
    if ((sourceCounts.get(item.sourcePath) ?? 0) > 1) reasons.push('Duplicate source target in publication manifest')
    if (!room) reasons.push('Target room is not installed')
    const subgroup = room && args.subgroups.find(row => row.room_id === room.id && row.key === item.subgroupKey)
    if (room && !subgroup) reasons.push('Target subgroup is not installed')
    const sourceEntry = args.entries.find(entry => entry.source_path === item.sourcePath)
    const titleCollision = room && args.entries.find(entry => entry.room_id === room.id && entry.title === item.title && entry.source_path !== item.sourcePath)
    if (sourceEntry && room && sourceEntry.room_id !== room.id) reasons.push('Source is adopted in another room')
    if (titleCollision) reasons.push('Title is already used by a different source')
    const missingPlans = item.gamePlanKeys.filter(key => !gamePlanKeys.has(key))
    if (missingPlans.length > 0) reasons.push(`Gameplans not installed: ${missingPlans.join(', ')}`)
    const legacy = room ? args.entries.filter(entry => entry.room_id === room.id && item.supersedesTitles.includes(entry.title)) : []
    if (sourceEntry?.status === 'published' && legacy.some(entry => entry.status !== 'superseded')) {
      reasons.push('Legacy entry still needs an explicit supersession decision')
    }
    let state: PublicationReadiness = 'ready'
    if (reasons.length > 0) state = 'blocked'
    else if (sourceEntry?.draft_source_hash && sourceEntry.draft_source_hash !== sourceEntry.source_hash) state = 'changed'
    else if (sourceEntry?.status === 'published') state = 'published'
    else if (sourceEntry) state = 'draft'
    return [{ ...item, state, reasons, entryId: sourceEntry?.id ?? null, entrySlug: sourceEntry?.slug ?? null }]
  })
}

export const PUBLICATION_UAT_CHECKS = [
  'Ordinary Team Member can read only rooms granted to one of their current roles.',
  'Ordinary Team Member cannot open another room by typing its URL.',
  'Room lead can preview and govern only rooms they lead.',
  'Leadership can inspect every manifest target without creating a grant row.',
  'Pending draft body is visible only to its author and authorized approvers.',
  'Tables scroll cleanly on narrow mobile screens without clipping the page.',
  'Callout meaning remains clear without relying on color alone.',
  'Allowed Mermaid diagrams render on desktop and mobile.',
  'Unsafe Mermaid, raw HTML, scripts, remote images and unsafe links fail closed.',
  'Publishing creates an immutable revision and never removes the prior revision.',
  'Adopting a changed source creates a review draft and never overwrites live content.',
  'Superseding legacy A&R or BDT entries is explicit and auditable.',
] as const
