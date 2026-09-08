import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { assessPlaybookActivationPreflight } from '@/lib/playbook/activation-preflight'

const repositoryRoot = process.cwd()
const migrationDirectory = path.join(repositoryRoot, 'supabase', 'migrations')
const candidateDirectory = path.join(repositoryRoot, '.planning', 'quick', '260907-playbook-doctrine-publication-uat')

async function readCandidate(filename: string): Promise<string | null> {
  try {
    return await readFile(path.join(candidateDirectory, filename), 'utf8')
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : ''
    if (code === 'ENOENT') return null
    throw error
  }
}

async function main() {
  const [activeMigrationFiles, candidate201, candidate202] = await Promise.all([
    readdir(migrationDirectory),
    readCandidate('201_playbook_rich_documents.sql'),
    readCandidate('202_playbook_reading_operations.sql'),
  ])
  const result = assessPlaybookActivationPreflight({ activeMigrationFiles, candidate201, candidate202 })

  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    process.stdout.write('Playbook production activation — local file preflight\n\n')
    for (const check of result.checks) {
      process.stdout.write(`${check.passed ? 'PASS' : 'HOLD'}  ${check.detail}\n`)
    }
    process.stdout.write(`\n${result.reminder}\n`)
    process.stdout.write(`\nResult: ${result.readyForPromotionReview ? 'READY FOR HUMAN PROMOTION REVIEW' : 'HELD'}\n`)
  }

  if (!result.readyForPromotionReview) process.exitCode = 1
}

void main().catch(error => {
  process.stderr.write(`Activation preflight failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`)
  process.exitCode = 1
})
