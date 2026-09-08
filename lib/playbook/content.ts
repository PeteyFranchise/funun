import { z } from 'zod'

export const PLAYBOOK_TITLE_MAX = 300
export const PLAYBOOK_LIST_ITEM_MAX = 2_000
export const PLAYBOOK_LIST_ITEMS_MAX = 250
export const PLAYBOOK_MARKDOWN_MAX = 250_000

const boundedLine = z.string().trim().min(1).max(PLAYBOOK_LIST_ITEM_MAX)

export const SopContentSchema = z
  .object({
    items: z.array(boundedLine).min(1).max(PLAYBOOK_LIST_ITEMS_MAX),
  })
  .strict()

export const TopicContentSchema = z
  .object({
    questions: z.array(boundedLine).min(1).max(PLAYBOOK_LIST_ITEMS_MAX),
  })
  .strict()

export const DocumentContentSchema = z
  .object({
    schemaVersion: z.literal(1),
    format: z.literal('markdown'),
    body: z.string().min(1).max(PLAYBOOK_MARKDOWN_MAX),
  })
  .strict()

export type SopContent = z.infer<typeof SopContentSchema>
export type TopicContent = z.infer<typeof TopicContentSchema>
export type DocumentContent = z.infer<typeof DocumentContentSchema>
export type PlaybookContent = SopContent | TopicContent | DocumentContent
export type PlaybookEntryType = 'sop' | 'topic' | 'document'

export function contentSchemaFor(entryType: PlaybookEntryType) {
  if (entryType === 'sop') return SopContentSchema
  if (entryType === 'topic') return TopicContentSchema
  return DocumentContentSchema
}

export function parsePlaybookContent(entryType: PlaybookEntryType, value: unknown): PlaybookContent {
  return contentSchemaFor(entryType).parse(value) as PlaybookContent
}

export function safeParsePlaybookContent(entryType: PlaybookEntryType, value: unknown) {
  return contentSchemaFor(entryType).safeParse(value)
}

export function readDocumentBody(value: unknown): string | null {
  const parsed = DocumentContentSchema.safeParse(value)
  return parsed.success ? parsed.data.body : null
}

export function slugifyPlaybookTitle(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '')

  return slug || 'document'
}

export function documentContent(body: string): DocumentContent {
  return { schemaVersion: 1, format: 'markdown', body }
}
