import { readFileSync } from 'fs'
import path from 'path'

function route(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

const working = route('app/api/producer-handoffs/[handoffId]/working/route.ts')
const nudge = route('app/api/producer-handoffs/[handoffId]/nudge/route.ts')
const activity = route('app/api/producer-handoffs/[handoffId]/activity/route.ts')
const complete = route('app/api/works/[workId]/recording-sessions/[sessionId]/handoffs/complete/route.ts')
const returned = route('app/api/producer-handoffs/[handoffId]/returns/route.ts')

describe('producer handoff workspace route contracts', () => {
  it('binds Working on it to the addressed recipient and Nudge to the original sender', () => {
    expect(working).toContain(".eq('recipient_user_id', user.id)")
    expect(working).toContain('p_producer: user.id')
    expect(nudge).toContain(".eq('created_by', user.id)")
    expect(nudge).toContain('p_sender: user.id')
    expect(nudge).toContain('A reminder was already sent in the last 24 hours.')
  })

  it('keeps activity room-scoped, strictly typed and caller-bound', () => {
    expect(activity).toContain("z.enum(['listened', 'compared'])")
    expect(activity).toContain("resolveWorkAccess(createWorkAccessDeps(supabase), handoff.work_id, user.id, 'contribute')")
    expect(activity).toContain('p_actor: user.id')
    expect(activity).not.toMatch(/p_actor:\s*parsed\.data/)
  })

  it('snapshots only selected unresolved comments from this work and validates return responses against that snapshot', () => {
    expect(complete).toContain(".eq('work_id', workId)")
    expect(complete).toContain(".is('parent_comment_id', null)")
    expect(complete).toContain(".is('resolved_at', null)")
    expect(complete).toContain('comments.length !== feedbackIds.length')
    expect(returned).toContain('validFeedbackIds.has(response.feedbackId)')
    expect(returned).toContain("z.enum(['done', 'tried', 'discuss'])")
  })

  it('uses direct links for inbox and room notifications', () => {
    expect(complete).toContain('`/vault/producer-inbox?handoff=${data.id}`')
    expect(returned).toContain('`/vault/works/${handoff.work_id}?handoff=${handoffId}&version=${input.versionId}`')
  })
})
