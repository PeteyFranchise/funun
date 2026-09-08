import { readDocumentBody, type PlaybookEntryType } from '@/lib/playbook/content'

export type SearchablePlaybookEntry = {
  id: string
  roomId: string
  roomKey: string
  roomLabel: string
  entryType: PlaybookEntryType
  title: string
  slug: string
  content: Record<string, unknown>
  revisionNumber: number
  publishedAt: string
}

export type PlaybookSearchResult = {
  entryId: string
  roomKey: string
  roomLabel: string
  entryType: PlaybookEntryType
  title: string
  slug: string
  section: string | null
  sectionId: string | null
  excerpt: string
  revisionNumber: number
  publishedAt: string
  score: number
}

function slugifyHeading(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function documentSections(body: string): Array<{ label: string | null; id: string | null; text: string }> {
  const sections: Array<{ label: string | null; id: string | null; text: string }> = []
  let label: string | null = null
  let lines: string[] = []
  const flush = () => {
    const text = lines.join(' ').replace(/[`*_>#|\[\]]/g, ' ').replace(/\s+/g, ' ').trim()
    if (text) sections.push({ label, id: label ? slugifyHeading(label) : null, text })
    lines = []
  }
  for (const line of body.split('\n')) {
    const heading = line.match(/^#{2,4}\s+(.+?)\s*$/)
    if (heading) {
      flush()
      label = heading[1].replace(/[*_`]/g, '').trim()
    } else if (!line.startsWith('```')) {
      lines.push(line)
    }
  }
  flush()
  return sections
}

function occurrences(haystack: string, needle: string): number {
  let count = 0
  let index = 0
  while ((index = haystack.indexOf(needle, index)) >= 0) {
    count += 1
    index += Math.max(needle.length, 1)
  }
  return count
}

function excerpt(text: string, query: string): string {
  const lower = text.toLowerCase()
  const index = lower.indexOf(query)
  const start = Math.max(0, index < 0 ? 0 : index - 90)
  const end = Math.min(text.length, start + 260)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

export function searchPlaybookEntries(entries: readonly SearchablePlaybookEntry[], rawQuery: string, limit = 40): PlaybookSearchResult[] {
  const query = rawQuery.trim().toLowerCase().replace(/\s+/g, ' ')
  if (query.length < 2) return []
  const tokens = query.split(' ').filter(token => token.length > 1)
  const results: PlaybookSearchResult[] = []

  for (const entry of entries) {
    const title = entry.title.toLowerCase()
    const titleScore = title.includes(query) ? 120 + occurrences(title, query) * 5 : tokens.filter(token => title.includes(token)).length * 15
    const sections = entry.entryType === 'document'
      ? documentSections(readDocumentBody(entry.content) ?? '')
      : ((entry.content[entry.entryType === 'sop' ? 'items' : 'questions'] as unknown[]) ?? []).flatMap((value, index) =>
          typeof value === 'string' ? [{ label: `${entry.entryType === 'sop' ? 'Step' : 'Prompt'} ${index + 1}`, id: null, text: value }] : []
        )
    for (const section of sections) {
      const sectionLabel = (section.label ?? '').toLowerCase()
      const body = section.text.toLowerCase()
      const phraseMatch = body.includes(query) || sectionLabel.includes(query)
      const tokenMatches = tokens.filter(token => body.includes(token) || sectionLabel.includes(token)).length
      if (!phraseMatch && tokenMatches === 0 && titleScore === 0) continue
      const score = titleScore + (sectionLabel.includes(query) ? 70 : 0) + (body.includes(query) ? 50 + occurrences(body, query) * 3 : tokenMatches * 8)
      results.push({
        entryId: entry.id, roomKey: entry.roomKey, roomLabel: entry.roomLabel, entryType: entry.entryType,
        title: entry.title, slug: entry.slug, section: section.label, sectionId: section.id,
        excerpt: excerpt(section.text || entry.title, query), revisionNumber: entry.revisionNumber,
        publishedAt: entry.publishedAt, score,
      })
    }
    if (sections.length === 0 && titleScore > 0) {
      results.push({ entryId: entry.id, roomKey: entry.roomKey, roomLabel: entry.roomLabel, entryType: entry.entryType, title: entry.title, slug: entry.slug, section: null, sectionId: null, excerpt: entry.title, revisionNumber: entry.revisionNumber, publishedAt: entry.publishedAt, score: titleScore })
    }
  }

  return results.sort((left, right) => right.score - left.score || Date.parse(right.publishedAt) - Date.parse(left.publishedAt)).slice(0, Math.max(1, Math.min(limit, 100)))
}
