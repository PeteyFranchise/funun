export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRoomAccessPage } from '@/lib/playbook/rooms'
import { readDocumentBody } from '@/lib/playbook/content'
import { MarkdownDoc } from '@/components/playbook/MarkdownDoc'
import { extractPlaybookHeadings } from '@/lib/playbook/remark-callouts'
import { isRoomLead } from '@/lib/playbook/entries'
import { RevisionHistory } from '@/components/playbook/RevisionHistory'
import { ChangeBroadcastForm } from '@/components/playbook/ChangeBroadcastForm'
import { ALL_STAFF_ROLES, type StaffRole } from '@/lib/admin/staff-role'
import { canAccessRoom } from '@/lib/playbook/rooms'
import { ReaderFeedbackForm } from '@/components/playbook/ReaderFeedbackForm'

type DocumentRow = {
  id: string
  title: string
  slug: string
  content: Record<string, unknown>
  updated_at: string
  published_at: string | null
  revision_number: number
  draft_version: number
  sub_group_id: string | null
  owner_id: string | null
  review_due_at: string | null
  review_interval_days: number | null
  last_reviewed_at: string | null
  source_kind: 'native' | 'adopted_markdown'
  source_path: string | null
  source_hash: string | null
}

type RevisionRow = {
  id: string
  revision_number: number
  publication_action: string
  created_at: string
}

export default async function PlaybookDocumentPage({
  params,
}: {
  params: Promise<{ room: string; slug: string }>
}) {
  const { room: roomKey, slug } = await params
  const auth = await requireRoomAccessPage(roomKey)

  const service = createServiceClient()
  const { data: room, error: roomError } = await service
    .from('playbook_rooms')
    .select('id, label')
    .eq('key', roomKey)
    .maybeSingle()
  if (roomError) throw new Error(`Failed to load Playbook room: ${roomError.message}`)
  if (!room) notFound()
  const canRestore =
    auth.staffRole === 'leadership' ||
    (await isRoomLead(service, (room as { id: string }).id, auth.user.id))

  const { data, error: entryError } = await service
    .from('playbook_entries')
    .select('id, title, slug, content, updated_at, published_at, revision_number, draft_version, sub_group_id, owner_id, review_due_at, review_interval_days, last_reviewed_at, source_kind, source_path, source_hash')
    .eq('room_id', (room as { id: string }).id)
    .eq('slug', slug)
    .eq('entry_type', 'document')
    .eq('status', 'published')
    .maybeSingle()
  if (entryError) throw new Error(`Failed to load Playbook document: ${entryError.message}`)
  if (!data) notFound()

  const entry = data as DocumentRow
  const body = readDocumentBody(entry.content)
  if (!body) notFound()
  const headings = extractPlaybookHeadings(body)

  const [{ data: revisions, error: revisionsError }, { data: linkRows, error: linksError }, ownerResult, grantsResult, staffResult] =
    await Promise.all([
      service
        .from('playbook_entry_revisions')
        .select('id, revision_number, publication_action, created_at')
        .eq('entry_id', entry.id)
        .order('revision_number', { ascending: false }),
      service
        .from('playbook_entry_game_plan_links')
        .select('member_template_id, relationship_kind')
        .eq('entry_id', entry.id),
      entry.owner_id
        ? service.from('funun_staff').select('display_name').eq('user_id', entry.owner_id).limit(1)
        : Promise.resolve({ data: [], error: null }),
      canRestore
        ? service.from('playbook_room_role_grants').select('role').eq('room_id', (room as { id: string }).id)
        : Promise.resolve({ data: [], error: null }),
      canRestore
        ? service.from('funun_staff').select('user_id, display_name, staff_role, staff_roles').order('display_name')
        : Promise.resolve({ data: [], error: null }),
    ])
  if (revisionsError) throw new Error(`Failed to load Playbook revisions: ${revisionsError.message}`)
  if (linksError) throw new Error(`Failed to load connected Gameplans: ${linksError.message}`)
  if (ownerResult.error) throw new Error(`Failed to load Playbook owner: ${ownerResult.error.message}`)
  if (grantsResult.error) throw new Error(`Failed to load Playbook update audiences: ${grantsResult.error.message}`)
  if (staffResult.error) throw new Error(`Failed to load Playbook Team Members: ${staffResult.error.message}`)

  const templateIds = (linkRows ?? []).map(link => link.member_template_id)
  const { data: templates, error: templatesError } = templateIds.length > 0
    ? await service.from('member_game_plan_templates').select('id, title, beta_only').in('id', templateIds)
    : { data: [], error: null }
  if (templatesError) throw new Error(`Failed to load Gameplan names: ${templatesError.message}`)
  const templateById = new Map((templates ?? []).map(template => [template.id, template]))
  const ownerName = ownerResult.data?.[0]?.display_name?.trim() || null
  const grantedRoles = (grantsResult.data ?? []).map(row => row.role as StaffRole)
  const updateRoles = ALL_STAFF_ROLES.filter(role => canAccessRoom([role], grantedRoles))
  const updateStaff = (staffResult.data ?? []).flatMap(row => {
    const staffRoles = ((row.staff_roles as StaffRole[] | null)?.length ? row.staff_roles : [row.staff_role]) as StaffRole[]
    return canAccessRoom(staffRoles, grantedRoles)
      ? [{ userId: row.user_id as string, label: String(row.display_name || 'Team Member') }]
      : []
  })

  return (
    <article className="min-w-0 flex-1">
      <header className="border-b border-[color:var(--border)] px-9 py-6">
        <Link
          href={`/admin/playbook/${roomKey}`}
          className="text-[12px] font-semibold text-[color:var(--indigo)] hover:underline"
        >
          ← {(room as { label: string }).label}
        </Link>
        <h1 className="mt-3 text-[28px] font-extrabold tracking-[-0.02em] text-[color:var(--ink)]">
          {entry.title}
        </h1>
        <p className="mt-2 text-[11px] text-[color:var(--ink-3)]">
          Published document · Revision {entry.revision_number ?? 1} · Updated{' '}
          {new Date(entry.published_at ?? entry.updated_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[color:var(--ink-3)]">
          {ownerName && <span className="rounded-full border border-[color:var(--border)] px-2.5 py-1">Owner: {ownerName}</span>}
          {entry.review_due_at && (
            <span className="rounded-full border border-[color:var(--border)] px-2.5 py-1">
              Review due {new Date(entry.review_due_at).toLocaleDateString('en-US')}
            </span>
          )}
          {canRestore && entry.source_kind === 'adopted_markdown' && entry.source_path && (
            <span className="rounded-full border border-[color:var(--border)] px-2.5 py-1 font-mono">
              Source: {entry.source_path}
            </span>
          )}
        </div>
      </header>
      {headings.length >= 2 && (
        <nav
          aria-label="On this page"
          className="mx-auto mt-5 max-w-[900px] rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] px-5 py-4"
        >
          <p className="text-[11px] font-bold uppercase tracking-[.08em] text-[color:var(--ink-3)]">
            On this page
          </p>
          <ol className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {headings.map(heading => (
              <li key={heading.id} style={{ paddingLeft: `${Math.max(0, heading.depth - 2) * 12}px` }}>
                <a href={`#${heading.id}`} className="text-[12.5px] text-[color:var(--indigo)] hover:underline">
                  {heading.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <MarkdownDoc content={body} />
      <footer className="mx-auto max-w-[900px] px-[34px] pb-[60px]">
        <ReaderFeedbackForm entryId={entry.id} roomKey={roomKey} revision={entry.revision_number} />
        {(linkRows ?? []).length > 0 && (
          <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <h2 className="text-[14px] font-bold text-[color:var(--ink)]">Connected CRM Gameplans</h2>
            <ul className="mt-2 space-y-1.5 text-[12.5px] text-[color:var(--ink-2)]">
              {(linkRows ?? []).map(link => {
                const template = templateById.get(link.member_template_id)
                if (!template) return null
                return (
                  <li key={link.member_template_id}>
                    {template.title}{template.beta_only ? ' · Beta' : ''} ·{' '}
                    {link.relationship_kind === 'required_reading' ? 'Required reading' : 'Reference'}
                  </li>
                )
              })}
            </ul>
          </section>
        )}
        {(revisions ?? []).length > 0 && (
          <RevisionHistory
            entryId={entry.id}
            currentRevision={entry.revision_number}
            currentDraftVersion={entry.draft_version}
            revisions={(revisions ?? []) as RevisionRow[]}
            canRestore={canRestore}
          />
        )}
        {canRestore && (
          <ChangeBroadcastForm
            entryId={entry.id}
            entryTitle={entry.title}
            roomKey={roomKey}
            revision={entry.revision_number}
            roles={updateRoles}
            staff={updateStaff}
          />
        )}
      </footer>
    </article>
  )
}
