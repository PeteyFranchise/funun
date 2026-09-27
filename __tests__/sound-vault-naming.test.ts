import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

const ROOTS = ['app', 'components']
const BARE_VAULT = /\b(?:your|the|a)\s+vault\b/i

function isCommentLine(trimmed: string): boolean {
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('{/*')
  )
}

function walk(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      walk(fullPath, files)
    } else if (
      entry.endsWith('.tsx') &&
      !entry.endsWith('.test.tsx') &&
      !entry.endsWith('.spec.tsx')
    ) {
      files.push(fullPath)
    }
  }
}

function collectBareVaultHits(): string[] {
  const cwd = process.cwd()
  const files: string[] = []
  for (const root of ROOTS) {
    walk(path.join(cwd, root), files)
  }

  const hits: string[] = []
  for (const file of files) {
    const relPath = path.relative(cwd, file)
    const source = readFileSync(file, 'utf8')
    const lines = source.split('\n')
    lines.forEach((line, index) => {
      const trimmed = line.trim()
      if (isCommentLine(trimmed)) return
      if (BARE_VAULT.test(line)) {
        hits.push(`${relPath}:${index + 1}: ${trimmed}`)
      }
    })
  }

  return hits
}

describe('Sound Vault naming', () => {
  it('has no bare "vault" left in member-facing copy', () => {
    const hits = collectBareVaultHits()
    expect(hits).toEqual([])
  })

  it('pins the canonical name to its source of truth', () => {
    const navSource = readFileSync(
      path.join(process.cwd(), 'components/nav/ArtistNav.tsx'),
      'utf8'
    )
    expect(navSource).toContain("label: 'Sound Vault'")
  })
})
