import fs from 'fs'
import path from 'path'

const architecture = fs.readFileSync(path.join(process.cwd(), 'docs/architecture/ACCOUNT-TYPES.md'), 'utf8')
const doctrine = fs.readFileSync(path.join(process.cwd(), '.planning/deliberations/member-workspaces/member-workspaces-doctrine.md'), 'utf8')

describe('Member workspace doctrine', () => {
  it('keeps the approved three identity classes', () => {
    expect(architecture).toContain('## The three identity classes')
    expect(architecture).toContain('**Member Account**')
    expect(architecture).toContain('**Limited guest/signature recipient**')
    expect(architecture).toContain('**Funūn Team Member Account**')
    expect(architecture).toContain('Client Partner is **not an identity class**')
  })

  it('keeps workspace context separate from rights and Member custody', () => {
    const normalized = doctrine.replace(/\s+/g, ' ')
    for (const statement of [
      'never evidence of credit, ownership, royalties, representation, or signing',
      'never copies, moves, or transfers custody',
      'does not put anyone on a split sheet',
      'Workspace billing is separate from every Member plan',
      'Beta usage is measured, not enforced',
    ]) expect(normalized).toContain(statement)
  })
})
