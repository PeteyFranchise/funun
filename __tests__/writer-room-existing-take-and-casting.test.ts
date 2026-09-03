import { readFileSync } from 'fs'
import path from 'path'

const aiRoute = readFileSync(
  path.join(process.cwd(), 'app/api/works/[workId]/ai-entries/route.ts'),
  'utf8'
)
const blockRoute = readFileSync(
  path.join(process.cwd(), 'app/api/works/[workId]/blocks/[blockId]/route.ts'),
  'utf8'
)
const workPage = readFileSync(
  path.join(process.cwd(), 'components/catalogue/WorkPage.tsx'),
  'utf8'
)
const aiFlow = readFileSync(
  path.join(process.cwd(), 'components/catalogue/AiEntryFlow.tsx'),
  'utf8'
)

describe("Writer's Room existing-take evidence and casting wiring", () => {
  it('uses the real picker in the first disclosure and Not sure paths', () => {
    expect(workPage).toContain("kind: 'existing-take'")
    expect(workPage).toContain('takes={eligibleEarlierTakes(versions, flow.targetVersionId)}')
    expect(workPage).toContain('humanSourceVersionId,')
    expect(aiFlow).toContain('takes={eligibleEarlierTakes(existingTakes, versionId)}')
    expect(aiFlow).toContain("void submit('performance', component, selectedVersionId)")
  })

  it('rejects a source from another song, an AI-tagged source, and a source that is not earlier', () => {
    expect(aiRoute).toContain(".eq('id', humanSourceVersionId)")
    expect(aiRoute).toContain(".eq('work_id', workId)")
    expect(aiRoute).toContain(".eq('version_id', humanSourceVersionId)")
    expect(aiRoute).toContain('The human source must be an earlier take without an AI entry.')
    expect(aiRoute).toContain('sourceCreatedAt >= targetCreatedAt')
    expect(aiRoute).toContain('The human source must have been recorded before the AI-assisted take.')
  })

  it('patches performers and vocal direction independently so casting preserves direction', () => {
    expect(blockRoute).toContain('if (fields.performers !== undefined) update.performers = fields.performers')
    expect(blockRoute).toContain('if (fields.vocal_direction !== undefined) update.vocal_direction = fields.vocal_direction')
    expect(workPage).toContain("patchVocalPlan(activeSingerBlock.id, { performers })")
    expect(workPage).toContain("patchVocalPlan(activeSingerBlock.id, { vocal_direction: direction })")
  })
})
