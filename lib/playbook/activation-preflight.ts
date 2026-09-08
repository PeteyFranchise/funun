export type ActivationPreflightInput = {
  activeMigrationFiles: readonly string[]
  candidate201: string | null
  candidate202: string | null
}

export type ActivationPreflightCheck = {
  key: string
  passed: boolean
  detail: string
}

export type ActivationPreflightResult = {
  readyForPromotionReview: boolean
  checks: ActivationPreflightCheck[]
  reminder: string
}

function hasMigration(files: readonly string[], number: number): boolean {
  const prefix = `${number}_`
  return files.some(file => file.startsWith(prefix) && file.endsWith('.sql'))
}

function candidateIsHumanGated(candidate: string | null, number: number): boolean {
  if (!candidate) return false
  return candidate.includes(`CANDIDATE migration ${number}`) && candidate.includes('HUMAN-GATED')
}

export function assessPlaybookActivationPreflight(input: ActivationPreflightInput): ActivationPreflightResult {
  const checks: ActivationPreflightCheck[] = [
    {
      key: 'migration-199',
      passed: hasMigration(input.activeMigrationFiles, 199),
      detail: 'Phase 38.2 migration 199 exists in the active local chain.',
    },
    {
      key: 'migration-200',
      passed: hasMigration(input.activeMigrationFiles, 200),
      detail: 'Phase 38.2 migration 200 exists in the active local chain.',
    },
    {
      key: 'candidate-201',
      passed: candidateIsHumanGated(input.candidate201, 201),
      detail: 'Candidate 201 exists and retains its human-application gate.',
    },
    {
      key: 'candidate-202',
      passed: candidateIsHumanGated(input.candidate202, 202),
      detail: 'Candidate 202 exists and retains its human-application gate.',
    },
    {
      key: 'no-active-collision',
      passed: !hasMigration(input.activeMigrationFiles, 201) && !hasMigration(input.activeMigrationFiles, 202),
      detail: 'The active migration directory does not already contain migration 201 or 202.',
    },
  ]

  return {
    readyForPromotionReview: checks.every(check => check.passed),
    checks,
    reminder: 'This is a local file preflight only. It does not inspect production, move migrations, apply SQL, or authorize promotion.',
  }
}
