import { readFileSync } from 'fs'
import path from 'path'

const acknowledge = readFileSync(
  path.join(process.cwd(), 'app/api/producer-handoffs/[handoffId]/acknowledge/route.ts'),
  'utf8'
)
const returnedMix = readFileSync(
  path.join(process.cwd(), 'app/api/producer-handoffs/[handoffId]/returns/route.ts'),
  'utf8'
)
const inboxPage = readFileSync(
  path.join(process.cwd(), 'app/(artist)/vault/producer-inbox/page.tsx'),
  'utf8'
)

describe('producer return route authorization contracts', () => {
  it('binds acknowledgement to the authenticated addressed recipient and current room access', () => {
    expect(acknowledge).toContain('supabase.auth.getUser()')
    expect(acknowledge).toContain(".eq('recipient_user_id', user.id)")
    expect(acknowledge).toContain("resolveWorkAccess(createWorkAccessDeps(supabase), handoff.work_id, user.id, 'contribute')")
    expect(acknowledge).toContain('recipient_user_id: user.id')
  })

  it('binds a returned version to the same recipient, work and active upload', () => {
    expect(returnedMix).toContain(".eq('recipient_user_id', user.id)")
    expect(returnedMix).toContain(".eq('work_id', handoff.work_id)")
    expect(returnedMix).toContain(".eq('user_id', user.id)")
    expect(returnedMix).toContain("version.source !== 'upload'")
    expect(returnedMix).toContain('created_by: user.id')
    expect(returnedMix).not.toMatch(/created_by:\s*input\./)
  })

  it('recipient-scopes the server inbox before any private audio URL is signed', () => {
    const recipientFilter = inboxPage.indexOf(".eq('recipient_user_id', user.id)")
    const signingCall = inboxPage.indexOf('await signVersionUrls(')
    expect(recipientFilter).toBeGreaterThan(-1)
    expect(signingCall).toBeGreaterThan(recipientFilter)
  })
})
