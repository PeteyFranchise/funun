import fs from 'fs'
import path from 'path'
import { PLAYBOOK_PUBLICATION_MANIFEST } from '@/lib/playbook/publication-manifest'
import { extractPublicationMarkdown } from '@/lib/playbook/publication-source'

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/223_member_workspace_playbook_doctrine.sql'),
  'utf8'
)

const keys = ['member-workspace-doctrine', 'member-workspace-ar-sales', 'member-workspace-it-controls']

describe('migration 223 Member workspace doctrine publication', () => {
  it('publishes every workspace doctrine manifest target in its existing room', () => {
    const items = PLAYBOOK_PUBLICATION_MANIFEST.filter(item => keys.includes(item.key))
    expect(items).toHaveLength(3)
    for (const item of items) {
      expect(sql).toContain(item.title)
      expect(sql).toContain(item.sourcePath)
      expect(sql).toContain(`'${item.roomKey}'`)
      expect(sql).toContain(`'${item.subgroupKey}'`)
    }
  })

  it('publishes immutable adopted Markdown with a source hash', () => {
    expect(sql).toContain("'document'")
    expect(sql).toContain("'published'")
    expect(sql).toContain("'adopted_markdown'")
    expect(sql).toContain("extensions.digest(resolved.body, 'sha256')")
    expect(sql).toContain("'schemaVersion', 1, 'format', 'markdown'")
  })

  it('packages the exact repository source bodies without immediate drift', () => {
    const sourceFile = path.join(
      process.cwd(),
      '.planning/deliberations/member-workspaces/member-workspaces-doctrine.md'
    )
    const markdown = fs.readFileSync(sourceFile, 'utf8')
    const cases = [
      ['workspace', 'member-workspaces-identity-authority-and-custody-doctrine'],
      ['commercial', 'a-r-and-sales-working-through-member-workspaces'],
      ['operations', 'it-and-leadership-workspace-rollout-and-incident-controls'],
    ] as const

    for (const [tag, fragment] of cases) {
      const packaged = new RegExp(`\\$${tag}\\$\\n([\\s\\S]*?)\\n    \\$${tag}\\$::TEXT`).exec(sql)?.[1]
      expect(packaged?.trim()).toBe(extractPublicationMarkdown(markdown, fragment))
    }
  })

  it('does not mutate identities, permissions, rights, or billing state', () => {
    expect(sql).not.toMatch(/workspace_members|workspace_grants|workspace_subscriptions|buyer_members/)
    expect(sql).not.toMatch(/UPDATE public\.(?:vault_projects|subscriptions|workspaces)/)
  })
})
