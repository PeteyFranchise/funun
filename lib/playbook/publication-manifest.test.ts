import { assessPublicationManifest, PLAYBOOK_PUBLICATION_MANIFEST, PUBLICATION_ENTRY_SELECT } from './publication-manifest'
import { readFileSync } from 'fs'
import path from 'path'

const room = { id: 'room-1', key: 'ar' }
const subgroup = { id: 'group-1', room_id: room.id, key: 'role-doctrine' }
const item = PLAYBOOK_PUBLICATION_MANIFEST.find(row => row.key === 'ar-doctrine')!

describe('Playbook publication manifest', () => {
  it('keeps the cross-room queue metadata-only', () => {
    const fields = PUBLICATION_ENTRY_SELECT.split(', ').map(field => field.trim())
    expect(fields).not.toContain('content')
    expect(fields).not.toContain('draft_content')
  })

  it('uses unique keys and source targets', () => {
    expect(new Set(PLAYBOOK_PUBLICATION_MANIFEST.map(row => row.key)).size).toBe(PLAYBOOK_PUBLICATION_MANIFEST.length)
    expect(new Set(PLAYBOOK_PUBLICATION_MANIFEST.map(row => row.sourcePath)).size).toBe(PLAYBOOK_PUBLICATION_MANIFEST.length)
  })

  it('points every section target at a real Markdown heading', () => {
    for (const item of PLAYBOOK_PUBLICATION_MANIFEST) {
      const [file, fragment] = item.sourcePath.split('#')
      const markdown = readFileSync(path.join(process.cwd(), file), 'utf8')
      if (!fragment) continue
      const headingSlugs = markdown.match(/^#{1,6}\s+.+$/gm)?.map(heading => heading
        .replace(/^#{1,6}\s+/, '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')) ?? []
      expect(headingSlugs).toContain(fragment)
    }
  })

  it('reports a clean unadopted target as ready', () => {
    expect(assessPublicationManifest({ manifest: [item], rooms: [room], subgroups: [subgroup], entries: [], leadRoomIds: [room.id], leadership: false, gamePlanKeys: [] })[0].state).toBe('ready')
  })

  it('blocks missing structure and source/title collisions', () => {
    const [result] = assessPublicationManifest({
      manifest: [item], rooms: [room], subgroups: [], leadRoomIds: [room.id], leadership: true, gamePlanKeys: [],
      entries: [
        { id: 'elsewhere', room_id: 'other', title: item.title, slug: null, status: 'published', source_path: item.sourcePath, source_hash: 'a', draft_source_hash: null },
        { id: 'collision', room_id: room.id, title: item.title, slug: null, status: 'published', source_path: 'docs/other.md', source_hash: 'b', draft_source_hash: null },
      ],
    })
    expect(result.state).toBe('blocked')
    expect(result.reasons).toEqual(expect.arrayContaining(['Target subgroup is not installed', 'Source is adopted in another room', 'Title is already used by a different source']))
  })

  it('shows room leads only the rooms they govern', () => {
    const hidden = assessPublicationManifest({ manifest: [item], rooms: [room], subgroups: [subgroup], entries: [], leadRoomIds: [], leadership: false, gamePlanKeys: [] })
    expect(hidden).toEqual([])
  })

  it('requires an explicit legacy supersession decision after publication', () => {
    const [result] = assessPublicationManifest({
      manifest: [item], rooms: [room], subgroups: [subgroup], leadRoomIds: [room.id], leadership: false, gamePlanKeys: [],
      entries: [
        { id: 'new', room_id: room.id, title: item.title, slug: 'ar-doctrine', status: 'published', source_path: item.sourcePath, source_hash: 'a', draft_source_hash: null },
        { id: 'old', room_id: room.id, title: item.supersedesTitles[0], slug: null, status: 'published', source_path: null, source_hash: null, draft_source_hash: null },
      ],
    })
    expect(result.state).toBe('blocked')
    expect(result.reasons).toContain('Legacy entry still needs an explicit supersession decision')
  })
})
