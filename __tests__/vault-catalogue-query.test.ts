import { readFileSync } from 'fs'
import path from 'path'

const vaultPage = readFileSync(
  path.join(process.cwd(), 'app/(artist)/vault/page.tsx'),
  'utf8'
)

describe('Vault catalogue query', () => {
  it('selects the all-takes relationship after works gained a working-take foreign key', () => {
    expect(vaultPage).toContain(
      'work_versions:work_versions!work_versions_work_id_fkey (id, source, created_at)'
    )
    expect(vaultPage).not.toContain('  work_versions (id, source, created_at),')
  })

  it('surfaces catalogue query failures instead of rendering a false empty Vault', () => {
    expect(vaultPage).toContain(
      'error = res.error ?? ownedWorksRes.error ?? workMembershipRes.error'
    )
    expect(vaultPage).toContain('error: memberWorksError')
    expect(vaultPage).toContain('error ??= memberWorksError')
  })
})
