// ─── What the AI-entry receipt actually persists ──────────────────────
// composeReceipt() returns FOUR lines. The route stores ONE of them.
//
// This pins that split behaviourally, by capturing the real object the
// route hands to .insert(), because the docblock on composeReceipt() once
// claimed all four were "stored on the ai_entries row" and a reader acting
// on that would conclude a prior Crate eligibility verdict can be read back
// off the row. It cannot: migration 135 gives `ai_entries` no eligibility,
// verdict or consequence column, so any consumer that needs the verdict
// must RECOMPUTE it via resolveCrateConsequence() (under today's rules, not
// the rules in force when the artist filed) or persist a decision of its
// own. Phase 50's rights enforcement depends on knowing which.
//
// Deliberately NOT a source-text lock. Asserting that route.ts contains the
// string "citation: receipt.citation" would restate the source rather than
// exercise it, and this repo has already shipped a passing text-lock test
// over a control that did nothing (migration 230).

import { readFileSync } from 'fs'
import path from 'path'
import { composeReceipt } from '@/lib/catalogue/ai-entries'
import { POST } from '@/app/api/works/[workId]/ai-entries/route'

type InsertPayload = Record<string, unknown>

const insertCalls: InsertPayload[] = []

function selectSingle(data: unknown) {
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.limit = () => q
  q.maybeSingle = async () => ({ data, error: null })
  q.single = async () => ({ data, error: null })
  return q
}

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => ({
      ...selectSingle(null),
      insert: (payload: InsertPayload) => {
        insertCalls.push(payload)
        return selectSingle({ id: 'entry-1', ...payload })
      },
    }),
  }),
}))

jest.mock('@/lib/catalogue/access', () => ({
  createWorkAccessDeps: () => ({}),
  resolveWorkAccess: async () => ({ granted: true }),
}))

jest.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: async () => false,
}))

const WORK_ID = '11111111-1111-4111-8111-111111111111'

// mode 'generate' + component 'lyric' resolves to level 'work', the one
// combination that needs no versionId (resolveLevel, ai-entries.ts).
async function fileEntry() {
  insertCalls.length = 0
  const request = new Request('http://localhost/api/works/x/ai-entries', {
    method: 'POST',
    body: JSON.stringify({ mode: 'generate', component: 'lyric' }),
  })
  const response = await POST(request, { params: Promise.resolve({ workId: WORK_ID }) })
  return { response, body: await response.json(), insert: insertCalls[0] }
}

describe('AI entry: only the citation line is persisted', () => {
  it('writes receipt.citation to the row and writes no other receipt line', async () => {
    const { response, insert } = await fileEntry()
    expect(response.status).toBe(201)

    const receipt = composeReceipt({ mode: 'generate', component: 'lyric', hasHumanSource: false })
    expect(insert.citation).toBe(receipt.citation)

    // The three transient lines reach no column, under any spelling.
    const written = JSON.stringify(insert)
    expect(written).not.toContain(receipt.splitsEffect)
    expect(written).not.toContain(receipt.releaseEffect)
    expect(written).not.toContain(receipt.crateConsequence)
    for (const key of ['splitsEffect', 'releaseEffect', 'crateConsequence', 'splits_effect', 'release_effect', 'crate_consequence', 'eligible', 'verdict']) {
      expect(Object.keys(insert)).not.toContain(key)
    }
  })

  it('returns all four lines to the caller, so the artist sees a verdict the row never keeps', async () => {
    const { body } = await fileEntry()
    const receipt = composeReceipt({ mode: 'generate', component: 'lyric', hasHumanSource: false })

    expect(body.receipt).toEqual(receipt)
    expect(body.receipt.crateConsequence).toEqual(expect.stringContaining('Crate:'))
    // The persisted row carries the citation and nothing else from the receipt —
    // the gap this test exists to make visible.
    expect(body.data.citation).toBe(receipt.citation)
    expect(body.data.crateConsequence).toBeUndefined()
  })

  it('ai_entries has no column any eligibility verdict could land in', () => {
    const sql = readFileSync(
      path.join(process.cwd(), 'supabase/migrations/135_works_core.sql'),
      'utf8'
    )
    const table = sql.slice(sql.indexOf('CREATE TABLE public.ai_entries'))
    const body = table.slice(0, table.indexOf(');'))

    expect(body).toContain('citation                TEXT NOT NULL')
    for (const absent of ['eligible', 'verdict', 'consequence', 'crate_', 'splits', 'receipt']) {
      expect(body.toLowerCase()).not.toContain(absent)
    }
  })
})
