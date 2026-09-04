import { readFileSync } from 'fs'
import path from 'path'

const routes = [
  'app/api/tools/[slug]/route.ts',
  'app/api/tools/pitchplug/route.ts',
  'app/api/vault/[projectId]/documents/generate/route.ts',
  'app/api/launchpad/[projectId]/campaigns/route.ts',
  'app/api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]/generate/route.ts',
  'app/api/pitches/draft/route.ts',
  'app/api/contracts/verify/route.ts',
  'app/api/buyer/brief-draft/route.ts',
  'app/api/buyer/brief-rerank/route.ts',
  'app/api/sync-library/tag-suggest/route.ts',
  'app/api/admin/selects/[id]/ai-draft/route.ts',
]

describe('paid AI routes', () => {
  it.each(routes)('%s claims durable budget before invoking its model layer', route => {
    const source = readFileSync(path.join(process.cwd(), route), 'utf8')
    expect(source).toContain('claimAiUsage(')
    expect(source).toContain('finishAiUsage(')
    expect(source).toContain('aiProviderSignal()')
  })
})
