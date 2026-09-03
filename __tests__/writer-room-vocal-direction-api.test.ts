import { readFileSync } from 'fs'
import path from 'path'

const route = readFileSync(
  path.join(process.cwd(), 'app/api/works/[workId]/blocks/[blockId]/route.ts'),
  'utf8'
)

describe('Writer’s Room vocal direction API contract', () => {
  it('allowlists a nullable, trimmed, bounded direction', () => {
    expect(route).toContain(
      "vocal_direction: z.string().trim().min(1).max(160).nullable().optional()"
    )
    expect(route).toContain(
      'if (fields.vocal_direction !== undefined) update.vocal_direction = fields.vocal_direction'
    )
  })

  it('keeps vocal direction out of locked lyric text saves', () => {
    expect(route).toMatch(
      /fields\.performers !== undefined \|\|\s+fields\.vocal_direction !== undefined/
    )
  })
})
