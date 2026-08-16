import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { isAssignedToOrg } from '@/lib/staff/scope'
import type { StaffRole } from '@/lib/admin/staff-role'

// ─── CRM-lite people layer — buyer_org_contacts + client_relationship_log ──
// (D-05/D-08/D-09, migration 112). Service-role helpers only — every caller
// is a requireStaff()-gated /api/admin/* route; the tables themselves are
// zero-RLS-policy + REVOKE'd from authenticated/anon (migration 112, section
// e), so a service-role client is the ONLY way to reach them.

// ─── Contacts ───────────────────────────────────────────────────────────

export type BuyerOrgContact = {
  id: string
  buyer_org_id: string
  name: string
  title: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  timezone: string | null
  tags: string[]
  address: Record<string, unknown> | null
  notes: string | null
  custom_fields: Record<string, unknown>
  is_primary: boolean
  created_at: string
  updated_at: string
}

export const CONTACT_COLUMNS =
  'id, buyer_org_id, name, title, email, phone, linkedin_url, timezone, tags, address, notes, custom_fields, is_primary, created_at, updated_at'

// Mass-assignment allowlist (T-31-15, mirrors app/api/profile/route.ts's
// EDITABLE_FIELDS convention). Deliberately EXCLUDES `is_primary` —
// setPrimaryContact() below is the single authority for flipping that flag
// (upholds the D-08 one-primary invariant atomically) — and `id`/
// `buyer_org_id`/`created_at`/`updated_at`, which are server/route-owned.
export const CONTACT_EDITABLE_FIELDS = [
  'name',
  'title',
  'email',
  'phone',
  'linkedin_url',
  'timezone',
  'tags',
  'address',
  'notes',
  'custom_fields',
] as const

export type ContactEditableField = (typeof CONTACT_EDITABLE_FIELDS)[number]

// D-09 rich record shape, zod-validated at the route layer before ever
// reaching pickContactFields(). tags is a bounded string[]; address/
// custom_fields are bounded free-form jsonb (object, not array — a client
// sending an array or primitive is rejected, not silently coerced).
const jsonObject = z.record(z.unknown())

export const ContactCreateSchema = z
  .object({
    name: z.string().trim().min(1, 'Contact name is required.').max(200),
    title: z.union([z.string().trim().max(200), z.null()]).optional(),
    email: z.union([z.string().trim().max(320), z.null()]).optional(),
    phone: z.union([z.string().trim().max(50), z.null()]).optional(),
    linkedin_url: z.union([z.string().trim().max(500), z.null()]).optional(),
    timezone: z.union([z.string().trim().max(100), z.null()]).optional(),
    tags: z.array(z.string().trim().max(50)).max(50).optional(),
    address: z.union([jsonObject, z.null()]).optional(),
    notes: z.union([z.string().trim().max(5000), z.null()]).optional(),
    custom_fields: jsonObject.optional(),
  })
  .strict()

// PATCH allows a partial edit of the same shape (name may not be blanked —
// enforced in patchContact below, not here, since `undefined` vs `''` need
// different handling once merged with the allowlist).
export const ContactPatchSchema = ContactCreateSchema.partial().strict()

// Pure allowlist filter — only CONTACT_EDITABLE_FIELDS keys ever cross into
// a DB write, regardless of what else is present on the input object. This
// is the mass-assignment backstop (T-31-15) independent of the zod schemas
// above, so a field that slips past validation (or a caller that skips zod
// entirely) still cannot reach the database.
export function pickContactFields(body: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const key of CONTACT_EDITABLE_FIELDS) {
    if (!(key in body)) continue
    picked[key] = body[key]
  }
  return picked
}

export async function listContacts(
  service: SupabaseClient,
  orgId: string
): Promise<BuyerOrgContact[]> {
  const { data, error } = await service
    .from('buyer_org_contacts')
    .select(CONTACT_COLUMNS)
    .eq('buyer_org_id', orgId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to list contacts: ${error.message}`)
  return (data ?? []) as BuyerOrgContact[]
}

export async function createContact(
  service: SupabaseClient,
  orgId: string,
  payload: Record<string, unknown>
): Promise<BuyerOrgContact> {
  const fields = pickContactFields(payload)
  const name = typeof fields.name === 'string' ? fields.name.trim() : ''
  if (!name) throw new Error('Contact name is required.')

  const { data, error } = await service
    .from('buyer_org_contacts')
    .insert({ ...fields, name, buyer_org_id: orgId })
    .select(CONTACT_COLUMNS)
    .single()

  if (error) throw new Error(`Failed to create contact: ${error.message}`)
  return data as BuyerOrgContact
}

export async function patchContact(
  service: SupabaseClient,
  contactId: string,
  payload: Record<string, unknown>
): Promise<BuyerOrgContact | null> {
  const fields = pickContactFields(payload)

  if ('name' in fields) {
    const trimmed = typeof fields.name === 'string' ? fields.name.trim() : ''
    if (!trimmed) throw new Error('Contact name cannot be blank.')
    fields.name = trimmed
  }

  if (Object.keys(fields).length === 0) throw new Error('No valid fields to update.')

  const { data, error } = await service
    .from('buyer_org_contacts')
    .update(fields)
    .eq('id', contactId)
    .select(CONTACT_COLUMNS)
    .maybeSingle()

  if (error) throw new Error(`Failed to update contact: ${error.message}`)
  return (data as BuyerOrgContact | null) ?? null
}

export async function deleteContact(service: SupabaseClient, contactId: string): Promise<void> {
  const { error } = await service.from('buyer_org_contacts').delete().eq('id', contactId)
  if (error) throw new Error(`Failed to delete contact: ${error.message}`)
}

// D-08: at most one flagged-primary contact per org. Clears is_primary on
// every OTHER contact for the org first, then sets it on the target, in two
// sequential writes — upholding the invariant at the app layer even though
// the partial unique index (migration 112, buyer_org_contacts_one_primary_
// per_org) also guards it as a backstop. Not a single-statement DB
// transaction (no RPC exists for this), so a crash between the two writes
// is possible in theory; the unique index makes that failure mode
// self-healing on the next successful call rather than silently producing
// two primaries.
export async function setPrimaryContact(
  service: SupabaseClient,
  orgId: string,
  contactId: string
): Promise<BuyerOrgContact> {
  const { error: clearError } = await service
    .from('buyer_org_contacts')
    .update({ is_primary: false })
    .eq('buyer_org_id', orgId)
    .neq('id', contactId)

  if (clearError) throw new Error(`Failed to clear existing primary contact: ${clearError.message}`)

  const { data, error } = await service
    .from('buyer_org_contacts')
    .update({ is_primary: true })
    .eq('id', contactId)
    .eq('buyer_org_id', orgId)
    .select(CONTACT_COLUMNS)
    .maybeSingle()

  if (error) throw new Error(`Failed to set primary contact: ${error.message}`)
  if (!data) throw new Error('Contact not found.')
  return data as BuyerOrgContact
}

// ─── Own-book scope predicate (R5) ─────────────────────────────────────────
// Composes the leadership bypass with isAssignedToOrg — the single scope
// check every contacts/relationship-log route applies. Leadership sees any
// org; ae/bd/anr see only an org assigned to them. Fail-closed: an
// unrecognized staffRole or a missing org row resolves to false.
export function canAccessOrgContacts(
  staffRole: StaffRole,
  org: { ae_user_id: string | null } | null | undefined,
  userId: string
): boolean {
  if (staffRole === 'leadership') return true
  return isAssignedToOrg(org, userId)
}

// ─── Relationship log ──────────────────────────────────────────────────────

export type RelationshipLogKind = 'note' | 'conversation' | 'status_change' | 'assignment'

export type ClientRelationshipLogEntry = {
  id: string
  buyer_org_id: string
  contact_id: string | null
  author_user_id: string
  kind: RelationshipLogKind
  body: string | null
  meta: Record<string, unknown>
  created_at: string
}

export const RELATIONSHIP_LOG_COLUMNS =
  'id, buyer_org_id, contact_id, author_user_id, kind, body, meta, created_at'

// Slice 1 (this plan) only ever writes note/conversation. status_change and
// assignment are Slice 2 (31.1)'s kinds — the CHECK constraint (migration
// 112) already allows all four so 31.1 needs no schema change, but this
// route's POST handler validates against SLICE1 only (T-31-14 posture:
// this slice does not open a write path for kinds it doesn't own).
export const RELATIONSHIP_LOG_SLICE1_KINDS = ['note', 'conversation'] as const

export async function listRelationshipLog(
  service: SupabaseClient,
  orgId: string,
  opts?: { contactId?: string }
): Promise<ClientRelationshipLogEntry[]> {
  let query = service
    .from('client_relationship_log')
    .select(RELATIONSHIP_LOG_COLUMNS)
    .eq('buyer_org_id', orgId)
    .order('created_at', { ascending: false })

  if (opts?.contactId) query = query.eq('contact_id', opts.contactId)

  const { data, error } = await query
  if (error) throw new Error(`Failed to list relationship log: ${error.message}`)
  return (data ?? []) as ClientRelationshipLogEntry[]
}

// Append-only — there is no updateRelationshipLog/deleteRelationshipLog
// export from this module, and the route file mirrors that by exposing no
// PATCH/DELETE handler (T-31-14). author_user_id is always the authenticated
// caller, never client-suppliable.
export async function appendRelationshipLog(
  service: SupabaseClient,
  args: {
    orgId: string
    kind: 'note' | 'conversation'
    body: string
    authorUserId: string
    contactId?: string | null
  }
): Promise<ClientRelationshipLogEntry> {
  const { data, error } = await service
    .from('client_relationship_log')
    .insert({
      buyer_org_id: args.orgId,
      contact_id: args.contactId ?? null,
      author_user_id: args.authorUserId,
      kind: args.kind,
      body: args.body,
    })
    .select(RELATIONSHIP_LOG_COLUMNS)
    .single()

  if (error) throw new Error(`Failed to append relationship log entry: ${error.message}`)
  return data as ClientRelationshipLogEntry
}
