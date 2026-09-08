import type { EntryStatus, EntryType } from '@/lib/playbook/entries'

export type MyPlaybookEntry = {
  id: string
  room_id: string
  sub_group_id: string | null
  entry_type: EntryType
  title: string
  slug: string | null
  status: EntryStatus
  author_id: string | null
  draft_author_id: string | null
  draft_updated_at: string | null
  owner_id: string | null
  review_due_at: string | null
  updated_at: string
  published_at: string | null
  revision_number: number
}

export function myPlaybookSections(
  entries: readonly MyPlaybookEntry[],
  viewerId: string
): {
  drafts: MyPlaybookEntry[]
  reviews: MyPlaybookEntry[]
  recent: MyPlaybookEntry[]
} {
  const active = entries.filter(entry => entry.status !== 'archived' && entry.status !== 'superseded')
  const drafts = active
    .filter(entry => entry.draft_author_id === viewerId)
    .sort((a, b) => Date.parse(b.draft_updated_at ?? b.updated_at) - Date.parse(a.draft_updated_at ?? a.updated_at))
  const reviews = active
    .filter(entry => entry.status === 'published' && entry.owner_id === viewerId)
    .sort((a, b) => Date.parse(a.review_due_at ?? '9999-12-31') - Date.parse(b.review_due_at ?? '9999-12-31'))
  const recent = active
    .filter(entry => entry.status === 'published')
    .sort((a, b) => Date.parse(b.published_at ?? b.updated_at) - Date.parse(a.published_at ?? a.updated_at))
    .slice(0, 12)
  return { drafts, reviews, recent }
}

export function reviewTiming(value: string | null, now: Date): 'overdue' | 'soon' | 'scheduled' | 'unscheduled' {
  if (!value) return 'unscheduled'
  const due = Date.parse(value)
  if (Number.isNaN(due)) return 'unscheduled'
  if (due < now.getTime()) return 'overdue'
  if (due <= now.getTime() + 30 * 24 * 60 * 60 * 1_000) return 'soon'
  return 'scheduled'
}
