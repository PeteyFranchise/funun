import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { normalizePlaybookSourcePath, playbookSourceHash } from '@/lib/playbook/adoption'

export type PublicationSource = {
  sourcePath: string
  filePath: string
  section: string | null
  markdown: string
  sourceHash: string
}

export function markdownHeadingSlug(heading: string): string {
  return heading
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, '-')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
}

export function extractPublicationMarkdown(markdown: string, fragment: string | null): string {
  const normalized = markdown.replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')

  if (!fragment) {
    const firstContentLine = lines.findIndex(line => line.trim().length > 0)
    const body =
      firstContentLine >= 0 && /^#\s+/.test(lines[firstContentLine])
        ? [...lines.slice(0, firstContentLine), ...lines.slice(firstContentLine + 1)].join('\n').trim()
        : normalized.trim()
    if (!body) throw new Error('Publication source document has no body')
    return body
  }

  const matches: Array<{ index: number; level: number }> = []
  lines.forEach((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (match && markdownHeadingSlug(match[2]) === fragment) {
      matches.push({ index, level: match[1].length })
    }
  })
  if (matches.length === 0) throw new Error(`Publication source section was not found: ${fragment}`)
  if (matches.length > 1) throw new Error(`Publication source section is ambiguous: ${fragment}`)

  const match = matches[0]
  let end = lines.length
  for (let index = match.index + 1; index < lines.length; index += 1) {
    const heading = /^(#{1,6})\s+/.exec(lines[index])
    if (heading && heading[1].length <= match.level) {
      end = index
      break
    }
  }
  const body = lines.slice(match.index + 1, end).join('\n').trim()
  if (!body) throw new Error(`Publication source section has no body: ${fragment}`)
  return body
}

export async function readPublicationSource(sourceReference: string): Promise<PublicationSource> {
  const sourcePath = normalizePlaybookSourcePath(sourceReference)
  const [filePath, fragment = null] = sourcePath.split('#')
  const repositoryRoot = path.resolve(process.cwd())
  const absolutePath = path.resolve(repositoryRoot, filePath)
  const relativePath = path.relative(repositoryRoot, absolutePath)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Publication source must remain inside the repository')
  }
  const source = await readFile(absolutePath, 'utf8')
  const markdown = extractPublicationMarkdown(source, fragment)
  return { sourcePath, filePath, section: fragment, markdown, sourceHash: playbookSourceHash(markdown) }
}
