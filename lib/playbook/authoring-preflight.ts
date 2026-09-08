import type { PlaybookEntryType } from '@/lib/playbook/content'

export type PlaybookPreflightSeverity = 'blocker' | 'warning'

export type PlaybookPreflightIssue = {
  code: string
  severity: PlaybookPreflightSeverity
  label: string
  detail: string
}

export type PlaybookAuthoringPreflight = {
  issues: PlaybookPreflightIssue[]
  blockerCount: number
  warningCount: number
  canProceed: boolean
  wordCount: number
  characterCount: number
  estimatedReadingMinutes: number
}

export type PlaybookAuthoringPreflightInput = {
  title: string
  entryType: PlaybookEntryType
  body: string
  ownerPresent?: boolean
  audiencePresent?: boolean
  reviewCadencePresent?: boolean
}

const STARTER_LANGUAGE = [
  /\badd the (?:note|warning) here\b/i,
  /\b(?:explain|describe|define|state|name|list|document) (?:the|what|which|who|why)\b/i,
  /\bresponsibility (?:one|two|three)\b/i,
  /\brequirement (?:one|two)\b/i,
  /\bfirst (?:point|action)\b/i,
  /\bsecond point\b/i,
  /\bsection title\b/i,
  /\bby the end, the learner can\b/i,
  /\blearning outcome\b[^\n]*\.\.\./i,
]

function issue(
  code: string,
  severity: PlaybookPreflightSeverity,
  label: string,
  detail: string
): PlaybookPreflightIssue {
  return { code, severity, label, detail }
}

function hasFilledField(body: string, labels: string[]): boolean {
  return body.split('\n').some(line => {
    const normalized = line.replace(/^\s*>?\s*/, '').replace(/\*\*/g, '').trim()
    return labels.some(label => {
      const match = normalized.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, 'i'))
      if (!match) return false
      const value = match[1].trim()
      return value.length > 2 && !/^(name|choose|add|describe|define|state|n\/a|tbd)\b/i.test(value)
    })
  })
}

function emptyMarkdownHeadings(body: string): string[] {
  const lines = body.split('\n')
  const empty: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*#{1,6}\s+(.+?)\s*#*\s*$/)
    if (!match) continue
    let next = index + 1
    while (next < lines.length && !lines[next].trim()) next += 1
    if (next >= lines.length || /^\s*#{1,6}\s+/.test(lines[next])) empty.push(match[1])
  }
  return empty
}

function hasMalformedMarkdownLink(body: string): boolean {
  return body.split('\n').some(line => {
    if (!line.includes('](')) return false
    const withoutCompleteLinks = line.replace(/\[[^\]]*\]\([^\s)][^)]*\)/g, '')
    return withoutCompleteLinks.includes('](')
  })
}

function hasInconsistentMarkdownTable(body: string): boolean {
  const groups: string[][] = []
  let current: string[] = []
  for (const line of body.split('\n')) {
    if (/^\s*\|.*\|\s*$/.test(line)) current.push(line)
    else if (current.length) {
      groups.push(current)
      current = []
    }
  }
  if (current.length) groups.push(current)

  return groups.some(group => {
    if (group.length < 2) return false
    const columns = group.map(line => line.split('|').slice(1, -1).length)
    return columns.some(count => count !== columns[0])
  })
}

function hasIncompleteMermaid(body: string): boolean {
  const lines = body.split('\n')
  let openAt = -1
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*```mermaid\s*$/i.test(lines[index])) {
      if (openAt !== -1) return true
      openAt = index
      continue
    }
    if (openAt !== -1 && /^\s*```\s*$/.test(lines[index])) {
      const source = lines.slice(openAt + 1, index).join('\n').trim()
      if (!/^(?:flowchart|graph|sequenceDiagram|stateDiagram(?:-v2)?|classDiagram|erDiagram|journey|timeline|gantt|pie)\b/.test(source)) {
        return true
      }
      openAt = -1
    }
  }
  return openAt !== -1
}

export function assessPlaybookAuthoringPreflight(
  input: PlaybookAuthoringPreflightInput
): PlaybookAuthoringPreflight {
  const title = input.title.trim()
  const body = input.body.trim()
  const wordCount = body ? body.split(/\s+/).filter(Boolean).length : 0
  const issues: PlaybookPreflightIssue[] = []

  if (!title) {
    issues.push(issue('missing-title', 'blocker', 'Add a title', 'A title is required before this entry can move forward.'))
  }
  if (!body) {
    issues.push(issue('missing-content', 'blocker', 'Add some content', 'An empty entry cannot be submitted or published.'))
  }

  if (body && STARTER_LANGUAGE.some(pattern => pattern.test(body))) {
    issues.push(issue(
      'starter-language',
      'warning',
      'Starter language remains',
      'Some instructional placeholder copy still appears in the entry. Replace it or confirm that it is intentional.'
    ))
  }

  if (input.entryType === 'document' && body) {
    const emptyHeadings = emptyMarkdownHeadings(body)
    if (emptyHeadings.length) {
      issues.push(issue(
        'empty-headings',
        'warning',
        'Empty sections detected',
        `${emptyHeadings.slice(0, 3).join(', ')}${emptyHeadings.length > 3 ? ` and ${emptyHeadings.length - 3} more` : ''} need content or should be removed.`
      ))
    }
    if (hasMalformedMarkdownLink(body)) {
      issues.push(issue('malformed-link', 'warning', 'Check document links', 'At least one Markdown link is empty or missing a closing parenthesis.'))
    }
    if (hasInconsistentMarkdownTable(body)) {
      issues.push(issue('inconsistent-table', 'warning', 'Check document tables', 'At least one Markdown table has a different number of cells between rows.'))
    }
    if (hasIncompleteMermaid(body)) {
      issues.push(issue('incomplete-diagram', 'warning', 'Check document diagrams', 'A Mermaid block is unclosed, empty, or missing a supported diagram declaration.'))
    }
  }

  const ownerPresent = input.ownerPresent || hasFilledField(body, ['owner'])
  const audiencePresent = input.audiencePresent || hasFilledField(body, ['applies to', 'audience'])
  const reviewCadencePresent = input.reviewCadencePresent || hasFilledField(body, ['review cadence', 'review interval'])

  if (!ownerPresent) {
    issues.push(issue('missing-owner', 'warning', 'Owner is not identified', 'Name the accountable role or assign an owner after saving the draft.'))
  }
  if (!audiencePresent) {
    issues.push(issue('missing-audience', 'warning', 'Audience is not identified', 'State who should use or follow this entry.'))
  }
  if (!reviewCadencePresent) {
    issues.push(issue('missing-review-cadence', 'warning', 'Review cadence is not set', 'State a cadence in the entry or schedule its next review after saving.'))
  }

  const blockerCount = issues.filter(item => item.severity === 'blocker').length
  const warningCount = issues.filter(item => item.severity === 'warning').length
  return {
    issues,
    blockerCount,
    warningCount,
    canProceed: blockerCount === 0,
    wordCount,
    characterCount: input.body.length,
    estimatedReadingMinutes: wordCount === 0 ? 0 : Math.max(1, Math.ceil(wordCount / 220)),
  }
}
