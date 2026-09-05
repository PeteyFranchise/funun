import {
  defaultRunContext,
  instantiateChecklist,
  mergeChecklistUpdates,
  summarizeChecklist,
  UpdateRunSchema,
} from './game-plan'

const template = [
  { id: 'upload', section: 'Project', label: 'Upload the current track' },
  { id: 'invite', section: 'Project', label: 'Invite the artist' },
]

describe('Member onboarding game plans', () => {
  it('creates a fresh pending checklist without mutating the template', () => {
    const run = instantiateChecklist(template)
    run[0].status = 'completed'
    expect(template[0]).not.toHaveProperty('status')
    expect(run[1]).toEqual({ ...template[1], status: 'pending', note: '' })
  })

  it('accepts status and notes but preserves authoritative template copy', () => {
    const current = instantiateChecklist(template)
    const merged = mergeChecklistUpdates(current, [
      { ...current[0], label: 'Browser rewrite', status: 'completed', note: '  done  ' },
      { ...current[1], section: 'Browser rewrite', status: 'skipped', note: '' },
    ])
    expect(merged[0]).toEqual({ ...template[0], status: 'completed', note: 'done' })
    expect(merged[1]).toEqual({ ...template[1], status: 'skipped', note: '' })
  })

  it('rejects missing or duplicate checklist items', () => {
    const current = instantiateChecklist(template)
    expect(() => mergeChecklistUpdates(current, [current[0]])).toThrow('checklist changed')
    expect(() => mergeChecklistUpdates(current, [current[0], current[0]])).toThrow('duplicate')
  })

  it('counts skipped and pending items without making completion rigid', () => {
    const items = instantiateChecklist(template)
    items[0].status = 'completed'
    items[1].status = 'skipped'
    expect(summarizeChecklist(items)).toEqual({ completed: 1, skipped: 1, pending: 0, total: 2 })
  })

  it('strictly validates a complete-run payload', () => {
    const parsed = UpdateRunSchema.safeParse({
      action: 'complete',
      items: instantiateChecklist(template),
      context: defaultRunContext(),
      overallNotes: '',
      isAdmin: true,
    })
    expect(parsed.success).toBe(false)
  })
})
