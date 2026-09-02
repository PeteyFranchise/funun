import {
  passportFieldDefinition,
  passportTargetKey,
  type PassportFieldKey,
  type PassportLayer,
  type PassportSourceKind,
  type PassportTarget,
  type PassportVisibility,
} from '@/lib/song-passport/schema'

export type LegacyPassportFact = {
  fieldKey: PassportFieldKey
  target: PassportTarget
  value: unknown
  sourceKind: PassportSourceKind
  sourceRecordId: string
  sourceRevision?: string | null
}

export type PassportSeedValue = LegacyPassportFact & {
  layer: PassportLayer
  targetKey: string
  visibility: PassportVisibility
  sourceFingerprint: string
  state: 'inherited'
}

export type PassportDiscoveryIssue = {
  issueKey: string
  issueType: 'conflicting_values' | 'unsupported_legacy_value'
  layer: PassportLayer
  fieldKey: PassportFieldKey
  targetKey: string
  evidence: PassportSeedValue[]
}

export type PassportDiscoveryReport = {
  values: PassportSeedValue[]
  issues: PassportDiscoveryIssue[]
  summary: {
    discovered: number
    conflicts: number
    skippedEmpty: number
    skippedUnsupportedSource: number
  }
}

/**
 * Converts already-authorized legacy rows into an honest import proposal.
 * This is deliberately pure: callers can display a dry run before making
 * any database change, and tests can prove the exact same input is stable.
 */
export function discoverPassportFacts(facts: readonly LegacyPassportFact[]): PassportDiscoveryReport {
  const values: PassportSeedValue[] = []
  let skippedEmpty = 0
  let skippedUnsupportedSource = 0

  for (const fact of facts) {
    const definition = passportFieldDefinition(fact.fieldKey)
    if (!definition || definition.layer !== fact.target.layer) {
      skippedUnsupportedSource += 1
      continue
    }
    if (!definition.allowedSources.includes(fact.sourceKind)) {
      skippedUnsupportedSource += 1
      continue
    }
    if (isEmptyValue(fact.value)) {
      skippedEmpty += 1
      continue
    }

    const targetKey = passportTargetKey(fact.target)
    values.push({
      ...fact,
      layer: definition.layer,
      targetKey,
      visibility: definition.defaultVisibility,
      sourceFingerprint: sourceFingerprint(fact, targetKey),
      state: 'inherited',
    })
  }

  const issues = findConflicts(values)
  return {
    values,
    issues,
    summary: {
      discovered: values.length,
      conflicts: issues.length,
      skippedEmpty,
      skippedUnsupportedSource,
    },
  }
}

export function sourceFingerprint(fact: LegacyPassportFact, targetKey: string): string {
  const revision = normalizeToken(fact.sourceRevision ?? 'original')
  return [
    fact.sourceKind,
    normalizeToken(fact.sourceRecordId),
    fact.fieldKey,
    normalizeToken(targetKey),
    revision,
  ].join(':')
}

function findConflicts(values: readonly PassportSeedValue[]): PassportDiscoveryIssue[] {
  const groups = new Map<string, PassportSeedValue[]>()
  for (const value of values) {
    const key = `${value.layer}:${value.fieldKey}:${value.targetKey}`
    groups.set(key, [...(groups.get(key) ?? []), value])
  }

  const issues: PassportDiscoveryIssue[] = []
  for (const [key, candidates] of groups) {
    const distinct = new Set(candidates.map(candidate => stableJson(candidate.value)))
    if (distinct.size < 2) continue
    issues.push({
      issueKey: `conflict:${normalizeToken(key)}`,
      issueType: 'conflicting_values',
      layer: candidates[0]!.layer,
      fieldKey: candidates[0]!.fieldKey,
      targetKey: candidates[0]!.targetKey,
      evidence: [...candidates].sort((a, b) => a.sourceFingerprint.localeCompare(b.sourceFingerprint)),
    })
  }
  return issues.sort((a, b) => a.issueKey.localeCompare(b.issueKey))
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value as object).length === 0
  return false
}

function normalizeToken(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_')
  return normalized.slice(0, 80) || 'unknown'
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
