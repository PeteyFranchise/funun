import { readFileSync } from 'fs'
import path from 'path'

const root = process.cwd()
const layout = readFileSync(path.join(root, 'app/(artist)/layout.tsx'), 'utf8')
const addRoute = readFileSync(path.join(root, 'app/api/ideas/[ideaId]/recordings/[recordingId]/add-to-work/route.ts'), 'utf8')
const createRoute = readFileSync(path.join(root, 'app/api/ideas/route.ts'), 'utf8')
const branchRoute = readFileSync(path.join(root, 'app/api/ideas/[ideaId]/branch/route.ts'), 'utf8')
const completeRoute = readFileSync(path.join(root, 'app/api/ideas/[ideaId]/recordings/complete/route.ts'), 'utf8')
const collectionsRoute = readFileSync(path.join(root, 'app/api/ideas/[ideaId]/collections/route.ts'), 'utf8')

describe('Global Quick Capture boundaries', () => {
  it('mounts from the persistent member shell only when the resolved account has a Member workspace', () => {
    expect(layout).toContain('isMemberAccount = accountContext.hasMemberWorkspace')
    expect(layout).toContain('enableGlobalCapture={isMemberAccount}')
  })

  it('requires a User Account at both Idea creation and room attachment', () => {
    expect(createRoute).toContain("from('user_profiles').select('id').eq('id', user.id)")
    expect(addRoute).toContain("from('user_profiles').select('id').eq('id', user.id)")
    expect(addRoute).toContain("resolveWorkAccess(createWorkAccessDeps(supabase), parsed.data.workId, user.id, 'contribute')")
    expect(addRoute).toContain("ideaAccess.permission !== 'owner'")
  })

  it('delegates the write to the service-only atomic database function', () => {
    expect(addRoute).toContain("service.rpc('add_idea_recording_to_work'")
    expect(addRoute).not.toContain("from('work_versions').insert")
    expect(addRoute).not.toContain('split_percentage')
    expect(addRoute).not.toContain('rights_status')
  })

  it('uses transactional RPCs for recording completion, branches, and collection membership', () => {
    expect(completeRoute).toContain("service.rpc('complete_idea_recording_transactional'")
    expect(completeRoute).not.toContain("from('idea_markers').insert")
    expect(branchRoute).toContain("service.rpc('branch_idea_transactional'")
    expect(branchRoute).toContain('requestId')
    expect(collectionsRoute).toContain("service.rpc('add_idea_to_collection_transactional'")
    expect(collectionsRoute).toContain("service.rpc('remove_idea_from_collection_transactional'")
  })
})
