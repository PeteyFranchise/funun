import type { SupabaseClient } from '@supabase/supabase-js'
import {
  SEEDED_ONBOARDING_CHECKLIST,
  insertOnboardingTask,
  listOpenOnboardingTasks,
} from './onboarding'

// ─── lib/client-partners/onboarding (31.1 plan 06, Task 1, D-07) ─────────────
// Minimal in-memory fake service client, mirrors contacts.test.ts's
// buildFakeContactsService() convention — purpose-built to onboarding.ts's
// exact call shapes against `onboarding_tasks` (insert().select().single(),
// select().eq().eq().order()).

type FakeRow = Record<string, unknown>

function buildFakeOnboardingService(initialRows: FakeRow[] = []) {
  const rows = [...initialRows]

  function makeInsertBuilder(payload: FakeRow) {
    return {
      select() {
        return {
          async single() {
            const newRow = { id: `task-${rows.length + 1}`, status: 'open', ...payload }
            rows.push(newRow)
            return { data: newRow, error: null }
          },
        }
      },
    }
  }

  function makeSelectBuilder() {
    const filters: Array<{ col: string; val: unknown }> = []
    const builder = {
      eq(col: string, val: unknown) {
        filters.push({ col, val })
        return builder
      },
      order() {
        const filtered = rows.filter(r => filters.every(f => r[f.col] === f.val))
        return Promise.resolve({ data: filtered, error: null })
      },
    }
    return builder
  }

  const from = jest.fn((table: string) => {
    if (table !== 'onboarding_tasks') throw new Error(`Unexpected table: ${table}`)
    return {
      insert: (payload: FakeRow) => makeInsertBuilder(payload),
      select: () => makeSelectBuilder(),
    }
  })

  return { from, rows } as unknown as SupabaseClient & { rows: FakeRow[] }
}

const ORG_ID = 'org-1'
const ASSIGNEE_ID = 'ae-1'
const CREATOR_ID = 'leader-1'

describe('insertOnboardingTask', () => {
  it('inserts a row seeded with the default checklist, the handoff note, and status open', async () => {
    const service = buildFakeOnboardingService()

    const task = await insertOnboardingTask(service, {
      orgId: ORG_ID,
      assigneeId: ASSIGNEE_ID,
      createdBy: CREATOR_ID,
      title: 'Welcome Acme Co to your book',
      handoffNote: 'They love fast turnarounds.',
    })

    expect(task.buyer_org_id).toBe(ORG_ID)
    expect(task.assignee_id).toBe(ASSIGNEE_ID)
    expect(task.created_by).toBe(CREATOR_ID)
    expect(task.handoff_note).toBe('They love fast turnarounds.')
    expect(task.status).toBe('open')
    expect(task.checklist).toHaveLength(SEEDED_ONBOARDING_CHECKLIST.length)
    expect(task.checklist.every(item => item.done === false)).toBe(true)
    expect(task.checklist[0].label).toBe(SEEDED_ONBOARDING_CHECKLIST[0].label)
  })

  it('propagates a DB error as a descriptive thrown Error', async () => {
    const service = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: { message: 'insert failed' } }),
          }),
        }),
      }),
    } as unknown as SupabaseClient

    await expect(
      insertOnboardingTask(service, {
        orgId: ORG_ID,
        assigneeId: ASSIGNEE_ID,
        createdBy: CREATOR_ID,
        title: 'Welcome',
        handoffNote: 'Note.',
      })
    ).rejects.toThrow('Failed to create onboarding task: insert failed')
  })
})

describe('listOpenOnboardingTasks', () => {
  it('returns only open tasks for the given assignee', async () => {
    const service = buildFakeOnboardingService([
      { id: 't1', assignee_id: ASSIGNEE_ID, status: 'open', title: 'Open one' },
      { id: 't2', assignee_id: ASSIGNEE_ID, status: 'done', title: 'Done one' },
      { id: 't3', assignee_id: 'someone-else', status: 'open', title: 'Not mine' },
    ])

    const tasks = await listOpenOnboardingTasks(service, ASSIGNEE_ID)

    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('t1')
  })

  it('returns an empty array when there are no open tasks', async () => {
    const service = buildFakeOnboardingService([])
    const tasks = await listOpenOnboardingTasks(service, ASSIGNEE_ID)
    expect(tasks).toEqual([])
  })
})
