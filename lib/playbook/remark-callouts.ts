type MarkdownNode = {
  type?: string
  value?: string
  depth?: number
  children?: MarkdownNode[]
  data?: {
    hName?: string
    hProperties?: Record<string, string>
  }
}

const CALLOUT_PATTERN = /^\[!(NOTE|TIP|CAUTION|WARNING)\]\s*/i

/**
 * Converts GitHub-style alert blockquotes into an app-owned aside element.
 * Raw HTML remains disabled by the renderer; only this four-value allowlist
 * can select a callout presentation.
 */
export function remarkPlaybookCallouts() {
  return (tree: MarkdownNode) => {
    walk(tree)
  }
}

export type PlaybookHeading = { depth: number; text: string; id: string }

/** Adds deterministic, duplicate-safe anchors to Markdown headings. */
export function remarkPlaybookHeadingIds() {
  return (tree: MarkdownNode) => {
    const seen = new Map<string, number>()
    walkHeadings(tree, seen)
  }
}

function walkHeadings(node: MarkdownNode, seen: Map<string, number>): void {
  if (node.type === 'heading') {
    const text = nodeText(node).trim()
    const id = uniqueHeadingId(text, seen)
    if (id) {
      node.data = {
        ...(node.data ?? {}),
        hProperties: { ...(node.data?.hProperties ?? {}), id },
      }
    }
  }
  for (const child of node.children ?? []) walkHeadings(child, seen)
}

function nodeText(node: MarkdownNode): string {
  if (typeof node.value === 'string') return node.value
  return (node.children ?? []).map(nodeText).join('')
}

function headingBaseId(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function uniqueHeadingId(text: string, seen: Map<string, number>): string {
  const base = headingBaseId(text)
  if (!base) return ''
  const count = (seen.get(base) ?? 0) + 1
  seen.set(base, count)
  return count === 1 ? base : `${base}-${count}`
}

/** Lightweight TOC extraction matching the heading-anchor rules above. */
export function extractPlaybookHeadings(markdown: string): PlaybookHeading[] {
  const headings: PlaybookHeading[] = []
  const seen = new Map<string, number>()
  let fence: string | null = null

  for (const line of markdown.split('\n')) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      fence = fence === marker ? null : fence ?? marker
      continue
    }
    if (fence) continue

    const match = /^(#{2,4})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!match) continue
    const text = match[2]
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[`*_~]/g, '')
      .trim()
    const id = uniqueHeadingId(text, seen)
    if (id) headings.push({ depth: match[1].length, text, id })
  }

  return headings
}

function walk(node: MarkdownNode): void {
  if (node.type === 'blockquote') convertBlockquote(node)
  for (const child of node.children ?? []) walk(child)
}

function convertBlockquote(node: MarkdownNode): void {
  const firstParagraph = node.children?.[0]
  if (firstParagraph?.type !== 'paragraph') return
  const firstText = firstParagraph.children?.[0]
  if (firstText?.type !== 'text' || typeof firstText.value !== 'string') return

  const match = CALLOUT_PATTERN.exec(firstText.value)
  if (!match) return

  const kind = match[1].toLowerCase()
  firstText.value = firstText.value.slice(match[0].length)
  node.data = {
    ...(node.data ?? {}),
    hName: 'aside',
    hProperties: { 'data-callout': kind },
  }
}
