import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Onboarding tasks — D-07 auto-created handoff task queue (migration 128) ─
// One row per handoff, created ONLY by insertOnboardingTask below — fired as
// a best-effort side effect from the ae assign route (Task 1) AFTER the
// ae_user_id authority write commits. Surfaced on the assignee's My view via
// listOpenOnboardingTasks + OnboardingTasksPanel (Task 2). Service-role
// only — onboarding_tasks is zero-RLS-policy + REVOKE'd from
// authenticated/anon (migration 128, section e), reachable only via the
// service role from requireStaff-gated routes/pages.

export type OnboardingChecklistItem = {
  id: string
  label: string
  done: boolean
}

// The 31.1 seeded default checklist (full Playbook SOP authoring is 31.2,
// per the CONTEXT.md scope re-cut). Every new handoff task starts with this
// exact list, each item unchecked — a plain data constant, not yet
// leadership-configurable.
export const SEEDED_ONBOARDING_CHECKLIST: ReadonlyArray<Omit<OnboardingChecklistItem, 'done'>> = [
  { id: 'intro_call', label: 'Schedule an intro call with the client' },
  { id: 'review_history', label: "Review the client's relationship log and past deals" },
  { id: 'confirm_contacts', label: 'Confirm the primary contact and billing details are current' },
  { id: 'log_first_touch', label: 'Log your first outreach in the relationship log' },
]

function buildSeededChecklist(): OnboardingChecklistItem[] {
  return SEEDED_ONBOARDING_CHECKLIST.map(item => ({ ...item, done: false }))
}

export type OnboardingTask = {
  id: string
  buyer_org_id: string
  assignee_id: string
  created_by: string | null
  title: string
  checklist: OnboardingChecklistItem[]
  status: 'open' | 'done' | 'dismissed'
  handoff_note: string | null
  created_at: string
  completed_at: string | null
}

export const ONBOARDING_TASK_COLUMNS =
  'id, buyer_org_id, assignee_id, created_by, title, checklist, status, handoff_note, created_at, completed_at'

/**
 * Insert the D-07 auto-created handoff task for a freshly assigned AE. The
 * caller (the ae route) wraps this in .catch() — a failure here is a
 * best-effort side effect and must never roll back or fail the assignment
 * response.
 */
export async function insertOnboardingTask(
  service: SupabaseClient,
  args: {
    orgId: string
    assigneeId: string
    createdBy: string | null
    title: string
    handoffNote: string
  }
): Promise<OnboardingTask> {
  const { data, error } = await service
    .from('onboarding_tasks')
    .insert({
      buyer_org_id: args.orgId,
      assignee_id: args.assigneeId,
      created_by: args.createdBy,
      title: args.title,
      checklist: buildSeededChecklist(),
      handoff_note: args.handoffNote,
    })
    .select(ONBOARDING_TASK_COLUMNS)
    .single()

  if (error) throw new Error(`Failed to create onboarding task: ${error.message}`)
  return data as OnboardingTask
}

/**
 * The signed-in AE's open onboarding tasks — surfaced on their My view
 * (OnboardingTasksPanel, Task 2). Oldest-open-first so the earliest handoff
 * a rep hasn't started reads first.
 */
export async function listOpenOnboardingTasks(
  service: SupabaseClient,
  assigneeId: string
): Promise<OnboardingTask[]> {
  const { data, error } = await service
    .from('onboarding_tasks')
    .select(ONBOARDING_TASK_COLUMNS)
    .eq('assignee_id', assigneeId)
    .eq('status', 'open')
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to list onboarding tasks: ${error.message}`)
  return (data ?? []) as OnboardingTask[]
}
