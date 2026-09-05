import { z } from 'zod'

export const MEMBER_ONBOARDING_STAFF_ROLES = ['leadership', 'ae', 'anr'] as const

export const ItemStatusSchema = z.enum(['pending', 'completed', 'skipped'])
export type ItemStatus = z.infer<typeof ItemStatusSchema>

export const TemplateChecklistItemSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    section: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(500),
  })
  .strict()

export type TemplateChecklistItem = z.infer<typeof TemplateChecklistItemSchema>

export const RunChecklistItemSchema = TemplateChecklistItemSchema.extend({
  status: ItemStatusSchema,
  note: z.string().max(2000),
}).strict()

export type RunChecklistItem = z.infer<typeof RunChecklistItemSchema>

export const RunContextSchema = z
  .object({
    artistName: z.string().trim().max(200),
    projectName: z.string().trim().max(200),
    sessionMode: z.enum(['remote', 'in_person', '']).default(''),
  })
  .strict()

export type RunContext = z.infer<typeof RunContextSchema>

export const StartRunSchema = z
  .object({
    memberId: z.string().uuid(),
    templateId: z.string().uuid(),
    context: RunContextSchema.optional(),
  })
  .strict()

export const UpdateRunSchema = z
  .object({
    action: z.enum(['save', 'complete']),
    items: z.array(RunChecklistItemSchema).max(80),
    context: RunContextSchema,
    overallNotes: z.string().max(5000),
  })
  .strict()

export type MemberGamePlanTemplate = {
  id: string
  key: string
  title: string
  description: string
  beta_only: boolean
  version: number
  checklist: TemplateChecklistItem[]
  playbook_entry_id: string | null
  active: boolean
}

export type MemberGamePlanRun = {
  id: string
  template_id: string
  member_id: string
  member_label: string
  facilitator_id: string | null
  facilitator_label: string
  template_key: string
  template_title: string
  template_version: number
  status: 'open' | 'completed' | 'cancelled'
  items: RunChecklistItem[]
  context: RunContext
  overall_notes: string
  started_at: string
  completed_at: string | null
  created_at: string
  updated_at: string
}

export function instantiateChecklist(items: TemplateChecklistItem[]): RunChecklistItem[] {
  return items.map(item => ({ ...item, status: 'pending', note: '' }))
}

/**
 * Apply user-editable status/note fields without accepting rewritten template
 * labels, sections, extra items, or missing items from the browser.
 */
export function mergeChecklistUpdates(
  current: RunChecklistItem[],
  incoming: RunChecklistItem[]
): RunChecklistItem[] {
  if (current.length !== incoming.length) throw new Error('The checklist changed. Refresh and try again.')

  const incomingById = new Map(incoming.map(item => [item.id, item]))
  if (incomingById.size !== incoming.length) throw new Error('The checklist contains duplicate items.')

  return current.map(item => {
    const update = incomingById.get(item.id)
    if (!update) throw new Error('The checklist changed. Refresh and try again.')
    return { ...item, status: update.status, note: update.note.trim() }
  })
}

export function summarizeChecklist(items: RunChecklistItem[]) {
  const completed = items.filter(item => item.status === 'completed').length
  const skipped = items.filter(item => item.status === 'skipped').length
  const pending = items.length - completed - skipped
  return { completed, skipped, pending, total: items.length }
}

export function defaultRunContext(): RunContext {
  return { artistName: '', projectName: '', sessionMode: '' }
}
