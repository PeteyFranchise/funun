import { readFileSync } from 'fs'
import path from 'path'

const suggestionsRoute = readFileSync(
  path.join(process.cwd(), 'app/api/works/[workId]/blocks/[blockId]/suggestions/route.ts'),
  'utf8'
)
const decisionRoute = readFileSync(
  path.join(process.cwd(), 'app/api/works/[workId]/blocks/[blockId]/suggestions/[suggestionId]/route.ts'),
  'utf8'
)
const workPage = readFileSync(path.join(process.cwd(), 'components/catalogue/WorkPage.tsx'), 'utf8')
const presence = readFileSync(path.join(process.cwd(), 'components/catalogue/WriterRoomPresence.tsx'), 'utf8')

describe("Writer's Room lyric suggestions API and wiring", () => {
  it('checks participant access and exact work/block ownership before returning proposals', () => {
    expect(suggestionsRoute).toContain("resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')")
    expect(suggestionsRoute).toContain(".eq('id', blockId)")
    expect(suggestionsRoute).toContain(".eq('work_id', workId)")
    expect(suggestionsRoute).toContain('block.repeat_of_block_id')
    expect(suggestionsRoute).toContain('.limit(100)')
  })

  it('normalizes suggestions, resolves only current-participant mentions and notifies exact mentions', () => {
    expect(suggestionsRoute).toContain('SuggestionSchema.safeParse')
    expect(suggestionsRoute).toContain('normalizeSuggestedText(parsed.data.proposedText)')
    expect(suggestionsRoute).toContain("resolveMentionedUserIds(note ?? '', participants)")
    expect(suggestionsRoute).toContain("supabase.rpc('create_work_lyric_block_suggestion'")
    expect(suggestionsRoute).toContain("type: 'writer_room_mention'")
    expect(suggestionsRoute).toContain('suggestionId: inserted.id')
  })

  it('sends only exact server-resolved decision inputs to the atomic RPC', () => {
    expect(decisionRoute).toContain("z.enum(['accept', 'decline'])")
    expect(decisionRoute).toContain("supabase.rpc('decide_work_lyric_block_suggestion'")
    expect(decisionRoute).toContain('p_work_id: workId')
    expect(decisionRoute).toContain('p_block_id: blockId')
    expect(decisionRoute).toContain('p_suggestion_id: suggestionId')
    expect(decisionRoute).not.toContain('authorUserId')
    expect(decisionRoute).not.toContain('canAdminister')
  })

  it('broadcasts only a bounded refetch hint and reloads canonical state', () => {
    expect(workPage).toContain("broadcast('suggestion_changed', { blockId: panel.blockId })")
    expect(workPage).toContain("hint.kind === 'suggestion_changed'")
    expect(workPage).toContain('void refreshLyricSuggestions(hint.blockId)')
    expect(presence).toContain("{ event: 'suggestion_changed' }")
  })
})
