import { createHash } from 'node:crypto'

export const PLAYBOOK_SOURCE_PATH_MAX = 500
const APPROVED_SOURCE_ROOTS = ['.planning/deliberations/', 'docs/'] as const

export type AdoptionState = 'available' | 'unchanged' | 'changed' | 'already_adopted_elsewhere'

export function normalizePlaybookSourcePath(input: string): string {
  const normalized = input.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/')
  if (!normalized || normalized.length > PLAYBOOK_SOURCE_PATH_MAX) {
    throw new Error('Source path is required and must be 500 characters or fewer')
  }
  const parts = normalized.split('#')
  if (parts.length > 2) throw new Error('Source path may contain only one section fragment')
  const [filePath, section] = parts
  if (filePath.startsWith('/') || filePath.split('/').includes('..')) {
    throw new Error('Source path must be repository-relative')
  }
  if (!filePath.toLowerCase().endsWith('.md')) throw new Error('Source path must point to a Markdown file')
  if (!APPROVED_SOURCE_ROOTS.some(root => filePath.startsWith(root))) {
    throw new Error('Source path must be inside an approved doctrine directory')
  }
  if (section !== undefined && !/^[a-z0-9][a-z0-9-]{0,119}$/.test(section)) {
    throw new Error('Source section must be a lowercase heading slug')
  }
  return section ? `${filePath}#${section}` : filePath
}

export function playbookSourceHash(markdown: string): string {
  return createHash('sha256').update(markdown, 'utf8').digest('hex')
}

export function classifyAdoption(args: {
  targetRoomId: string
  sourceHash: string
  existing: { room_id: string; source_hash: string | null } | null
}): AdoptionState {
  if (!args.existing) return 'available'
  if (args.existing.room_id !== args.targetRoomId) return 'already_adopted_elsewhere'
  return args.existing.source_hash === args.sourceHash ? 'unchanged' : 'changed'
}
