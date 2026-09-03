export type RightsSetupItemKey = 'legal_identity' | 'pro' | 'ipi' | 'publishing'
export type RightsSetupItemStatus = 'handled' | 'needs_attention' | 'waiting'

export type RightsSetupItem = {
  key: RightsSetupItemKey
  label: string
  detail: string
  status: RightsSetupItemStatus
  targetId: string
}

export type RightsSetupState = {
  items: RightsSetupItem[]
  handledCount: number
  remainingCount: number
  complete: boolean
}

export type RightsSetupInput = {
  legalNameLockedAt: string | null
  pro: string | null
  ipi: string | null
  publisher: string | null
}

function hasValue(value: string | null): boolean {
  return Boolean(value?.trim())
}

/**
 * Derives advisory profile setup from existing rights identity fields.
 * This is intentionally not a readiness score and is never an access gate.
 */
export function buildRightsSetupState(input: RightsSetupInput): RightsSetupState {
  const pro = input.pro?.trim() ?? ''
  const unaffiliated = pro === 'none'
  const items: RightsSetupItem[] = [
    {
      key: 'legal_identity',
      label: 'Legal identity',
      detail: input.legalNameLockedAt
        ? 'Confirmed for agreements and registrations'
        : 'Confirm the name you use for rights and agreements',
      status: input.legalNameLockedAt ? 'handled' : 'needs_attention',
      targetId: 'rights-legal-identity',
    },
    {
      key: 'pro',
      label: 'PRO affiliation',
      detail: unaffiliated ? 'Not affiliated yet' : pro || 'Choose your PRO status',
      status: pro ? 'handled' : 'needs_attention',
      targetId: 'rights-pro-affiliation',
    },
    {
      key: 'ipi',
      label: 'IPI / CAE number',
      detail: unaffiliated
        ? 'Not needed while you are unaffiliated'
        : hasValue(input.ipi)
          ? 'Added from your PRO record'
          : pro
            ? 'Add the number assigned by your PRO'
            : 'Choose your PRO status first',
      status: unaffiliated || hasValue(input.ipi) ? 'handled' : pro ? 'needs_attention' : 'waiting',
      targetId: 'rights-ipi',
    },
    {
      key: 'publishing',
      label: 'Publishing status',
      detail: hasValue(input.publisher)
        ? input.publisher!.trim()
        : 'Add a publisher or mark yourself self-published',
      status: hasValue(input.publisher) ? 'handled' : 'needs_attention',
      targetId: 'rights-publisher',
    },
  ]
  const handledCount = items.filter(item => item.status === 'handled').length

  return {
    items,
    handledCount,
    remainingCount: items.length - handledCount,
    complete: handledCount === items.length,
  }
}

export function isRightsSetupReminderDue(
  remindAt: string | null | undefined,
  now = new Date()
): boolean {
  if (!remindAt) return false
  const timestamp = Date.parse(remindAt)
  return Number.isFinite(timestamp) && timestamp <= now.getTime()
}
