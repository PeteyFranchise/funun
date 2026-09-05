import { getStaffRole } from '@/lib/admin/staff-role'

export type AccountWorkspace = 'personal' | 'team'

export type TabIdentity = {
  userId: string
  context: AccountWorkspace
  label: string
}

export type AccountSwitchIntent = {
  targetContext: AccountWorkspace
  startedAt: number
}

export const TAB_IDENTITY_KEY = 'funun:tab-identity:v1'
export const ACCOUNT_SWITCH_INTENT_KEY = 'funun:account-switch-intent:v1'
export const ACCOUNT_SWITCH_INTENT_TTL_MS = 10 * 60 * 1000

function isAccountWorkspace(value: unknown): value is AccountWorkspace {
  return value === 'personal' || value === 'team'
}

export function readTabIdentity(raw: string | null): TabIdentity | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<TabIdentity>
    if (
      typeof parsed.userId !== 'string' ||
      parsed.userId.length === 0 ||
      !isAccountWorkspace(parsed.context) ||
      typeof parsed.label !== 'string'
    ) {
      return null
    }
    return { userId: parsed.userId, context: parsed.context, label: parsed.label }
  } catch {
    return null
  }
}

export function readAccountSwitchIntent(raw: string | null): AccountSwitchIntent | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<AccountSwitchIntent>
    if (!isAccountWorkspace(parsed.targetContext) || typeof parsed.startedAt !== 'number') {
      return null
    }
    return { targetContext: parsed.targetContext, startedAt: parsed.startedAt }
  } catch {
    return null
  }
}

export function isValidAccountSwitchIntent(
  intent: AccountSwitchIntent | null,
  context: AccountWorkspace,
  now = Date.now()
): boolean {
  if (!intent || intent.targetContext !== context) return false
  const age = now - intent.startedAt
  return age >= 0 && age <= ACCOUNT_SWITCH_INTENT_TTL_MS
}

export function accountWorkspaceForUser(user: { app_metadata?: unknown }): AccountWorkspace {
  return getStaffRole(user) ? 'team' : 'personal'
}

export function accountWorkspaceHome(context: AccountWorkspace): string {
  return context === 'team' ? '/admin/client-partners' : '/vault'
}

export function accountWorkspaceLabel(context: AccountWorkspace): string {
  return context === 'team' ? 'Funūn Team' : 'Personal workspace'
}

export function writeTabIdentity(identity: TabIdentity): void {
  sessionStorage.setItem(TAB_IDENTITY_KEY, JSON.stringify(identity))
}

export function clearTabIdentity(): void {
  sessionStorage.removeItem(TAB_IDENTITY_KEY)
  sessionStorage.removeItem(ACCOUNT_SWITCH_INTENT_KEY)
}

export function beginAccountSwitch(targetContext: AccountWorkspace): void {
  const intent: AccountSwitchIntent = { targetContext, startedAt: Date.now() }
  sessionStorage.setItem(ACCOUNT_SWITCH_INTENT_KEY, JSON.stringify(intent))
}

export function finishAccountSwitch(identity: TabIdentity): void {
  writeTabIdentity(identity)
  sessionStorage.removeItem(ACCOUNT_SWITCH_INTENT_KEY)
}
