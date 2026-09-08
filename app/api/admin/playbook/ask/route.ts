import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ALL_STAFF_ROLES, getStaffRoles, type StaffRole } from '@/lib/admin/staff-role'
import { requireStaff } from '@/lib/admin/gate'
import { answerFromPlaybook } from '@/lib/playbook/assistant'
import { readRoomGrants } from '@/lib/playbook/access-grants'
import { canAccessRoom, loadRooms } from '@/lib/playbook/rooms'
import { searchPlaybookEntries, type SearchablePlaybookEntry } from '@/lib/playbook/search'
import { isPlaybookEnablementSchemaMissing } from '@/lib/playbook/enablement'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { createServiceClient } from '@/lib/supabase/server'

const Schema = z.object({ question: z.string().trim().min(2).max(1000) }).strict()
export async function POST(request: Request) {
  const auth = await requireStaff(ALL_STAFF_ROLES); if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status }); const parsed = Schema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: 'Question must be between 2 and 1,000 characters' }, { status: 400 })
  if (await checkRateLimit(`playbook-ask:${auth.user.id}`, { maxAttempts: 30, windowMs: 60 * 60 * 1000 })) return NextResponse.json({ error: 'Ask The Playbook has reached its hourly limit. Try again later.' }, { status: 429 })
  const service = createServiceClient(); const roles = getStaffRoles(auth.user); const [rooms, grants] = await Promise.all([loadRooms(service), readRoomGrants(service)]); const grantMap = new Map<string, StaffRole[]>(); for (const grant of grants) grantMap.set(grant.room_id, [...(grantMap.get(grant.room_id) ?? []), grant.role as StaffRole]); const accessible = rooms.filter(room => canAccessRoom(roles, grantMap.get(room.id) ?? [])); if (!accessible.length) return NextResponse.json({ data: { answer: null, noAnswer: true, citations: [] } })
  const entries = await service.from('playbook_entries').select('id, room_id, entry_type, title, slug, content, revision_number, published_at, updated_at').in('room_id', accessible.map(room => room.id)).eq('status','published').limit(1000); if (entries.error) return NextResponse.json({ error: entries.error.message }, { status: 500 }); const roomById = new Map(accessible.map(room => [room.id, room])); const searchable = (entries.data ?? []).flatMap(row => { const room = roomById.get(row.room_id as string); if (!room || !row.slug) return []; return [{ id: row.id, roomId: room.id, roomKey: room.key, roomLabel: room.label, entryType: row.entry_type, title: row.title, slug: row.slug, content: row.content, revisionNumber: Number(row.revision_number), publishedAt: String(row.published_at ?? row.updated_at) } as SearchablePlaybookEntry] }); const sources = searchPlaybookEntries(searchable, parsed.data.question, 8)
  const result = await answerFromPlaybook(parsed.data.question, sources); const ledger = await service.from('playbook_assistant_runs').insert({ user_id: auth.user.id, question: parsed.data.question, answer: result.ok ? result.answer : result.error, citations: result.ok ? result.citations.map(source => ({ entryId: source.entryId, sectionId: source.sectionId, revisionNumber: source.revisionNumber })) : [], source_entry_ids: Array.from(new Set(sources.map(source => source.entryId))), model: result.ok ? result.model : null, input_tokens: result.ok ? result.inputTokens : null, output_tokens: result.ok ? result.outputTokens : null, status: result.ok ? 'answered' : result.noAnswer ? 'no_answer' : 'failed' }); if (ledger.error && !isPlaybookEnablementSchemaMissing(ledger.error)) return NextResponse.json({ error: 'The answer could not be recorded safely.' }, { status: 500 })
  if (!result.ok) return NextResponse.json({ data: { answer: null, noAnswer: result.noAnswer, message: result.error, citations: sources } }, { status: result.noAnswer ? 200 : 503 })
  return NextResponse.json({ data: { answer: result.answer, noAnswer: false, citations: result.citations } })
}
