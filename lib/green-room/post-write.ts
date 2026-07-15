import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isGreenRoomLinkedObjectType,
  isGreenRoomPostType,
  isGreenRoomVisibility,
  normalizeCustomAudience,
  type GreenRoomCustomAudience,
  type GreenRoomLinkedObjectType,
  type GreenRoomPostType,
  type GreenRoomVisibility,
} from '@/lib/green-room/feed'

export type GreenRoomPostStatus = 'draft' | 'published'

export type GreenRoomLinkedObject = {
  type: GreenRoomLinkedObjectType
  id: string
}

export type GreenRoomPostInput = {
  postType: GreenRoomPostType
  body: string
  visibility: GreenRoomVisibility
  status: GreenRoomPostStatus
  linkedObject: GreenRoomLinkedObject | null
  allowResharing: boolean
  audience: GreenRoomCustomAudience | null
}

export type GreenRoomCreatedPost = {
  id: string
  authorId: string
  postType: GreenRoomPostType
  body: string
  visibility: GreenRoomVisibility
  status: GreenRoomPostStatus
  linkedObject: GreenRoomLinkedObject | null
  allowResharing: boolean
  publishedAt: string | null
  createdAt: string
}

type ValidationResult =
  | { ok: true; input: GreenRoomPostInput }
  | { ok: false; error: string; status: number }

const BODY_MAX = 4000
const ALLOWED_FIELDS = new Set([
  'postType',
  'body',
  'visibility',
  'status',
  'linkedObject',
  'allowResharing',
  'audience',
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function validateGreenRoomPostInput(raw: unknown): ValidationResult {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'Post payload must be an object', status: 400 }
  }

  const unknownFields = Object.keys(raw).filter(key => !ALLOWED_FIELDS.has(key))
  if (unknownFields.length > 0) {
    return { ok: false, error: `Unknown field: ${unknownFields[0]}`, status: 400 }
  }

  if (!isGreenRoomPostType(raw.postType)) {
    return { ok: false, error: 'A valid post type is required', status: 400 }
  }

  const body = typeof raw.body === 'string' ? raw.body.trim() : ''
  if (body.length === 0) {
    return { ok: false, error: 'Post body is required', status: 400 }
  }
  if (body.length > BODY_MAX) {
    return { ok: false, error: `Post body must be ${BODY_MAX} characters or fewer`, status: 400 }
  }

  const status = raw.status === 'draft' ? 'draft' : 'published'
  const visibility = raw.visibility ?? (status === 'draft' ? 'draft' : 'public')
  if (!isGreenRoomVisibility(visibility)) {
    return { ok: false, error: 'A valid visibility is required', status: 400 }
  }
  if (status === 'draft' && visibility !== 'draft') {
    return { ok: false, error: 'Draft posts must use draft visibility', status: 400 }
  }
  if (status === 'published' && visibility === 'draft') {
    return { ok: false, error: 'Published posts cannot use draft visibility', status: 400 }
  }

  const linkedObject = normalizeLinkedObject(raw.linkedObject)
  if (!linkedObject.ok) return linkedObject

  const allowResharing = typeof raw.allowResharing === 'boolean' ? raw.allowResharing : true

  let audience: GreenRoomCustomAudience | null = null
  if (visibility === 'custom') {
    const normalized = normalizeCustomAudience(raw.audience)
    if (!normalized.ok) return { ok: false, error: normalized.error, status: 400 }
    audience = normalized.audience
  } else if (raw.audience != null) {
    return { ok: false, error: 'Audience is only allowed for custom visibility', status: 400 }
  }

  return {
    ok: true,
    input: {
      postType: raw.postType,
      body,
      visibility,
      status,
      linkedObject: linkedObject.value,
      allowResharing,
      audience,
    },
  }
}

export async function createGreenRoomPost(
  supabase: SupabaseClient,
  userId: string,
  raw: unknown
): Promise<{ ok: true; post: GreenRoomCreatedPost } | { ok: false; error: string; status: number }> {
  const validation = validateGreenRoomPostInput(raw)
  if (!validation.ok) return validation

  const input = validation.input
  if (input.status === 'published' && input.linkedObject) {
    const linked = await validateLinkedObjectForPublish(supabase, userId, input.linkedObject)
    if (!linked.ok) return linked
  }

  const now = new Date().toISOString()
  const insert = {
    author_id: userId,
    post_type: input.postType,
    body: input.body,
    visibility: input.visibility,
    status: input.status,
    linked_object_type: input.linkedObject?.type ?? null,
    linked_object_id: input.linkedObject?.id ?? null,
    allow_resharing: input.allowResharing,
    published_at: input.status === 'published' ? now : null,
  }

  const { data, error } = await supabase
    .from('green_room_posts')
    .insert(insert)
    .select('id, author_id, post_type, body, visibility, status, linked_object_type, linked_object_id, allow_resharing, published_at, created_at')
    .single()

  if (error) return { ok: false, error: error.message, status: 500 }

  const row = data as {
    id: string
    author_id: string
    post_type: GreenRoomPostType
    body: string
    visibility: GreenRoomVisibility
    status: GreenRoomPostStatus
    linked_object_type: GreenRoomLinkedObjectType | null
    linked_object_id: string | null
    allow_resharing: boolean
    published_at: string | null
    created_at: string
  }

  if (input.audience) {
    const audienceInsert = {
      post_id: row.id,
      relationships: input.audience.relationships,
      roles: input.audience.roles,
      genres: input.audience.genres,
      locations: input.audience.locations,
      people: input.audience.people,
    }
    const { error: audienceError } = await supabase.from('green_room_post_audiences').insert(audienceInsert)
    if (audienceError) {
      await supabase.from('green_room_posts').delete().eq('id', row.id)
      return { ok: false, error: audienceError.message, status: 500 }
    }
  }

  return {
    ok: true,
    post: {
      id: row.id,
      authorId: row.author_id,
      postType: row.post_type,
      body: row.body,
      visibility: row.visibility,
      status: row.status,
      linkedObject: row.linked_object_type && row.linked_object_id
        ? { type: row.linked_object_type, id: row.linked_object_id }
        : null,
      allowResharing: row.allow_resharing,
      publishedAt: row.published_at,
      createdAt: row.created_at,
    },
  }
}

function normalizeLinkedObject(value: unknown):
  | { ok: true; value: GreenRoomLinkedObject | null }
  | { ok: false; error: string; status: number } {
  if (value == null) return { ok: true, value: null }
  if (!isPlainObject(value)) return { ok: false, error: 'Linked object must be an object', status: 400 }
  if (!isGreenRoomLinkedObjectType(value.type)) {
    return { ok: false, error: 'A valid linked object type is required', status: 400 }
  }
  if (typeof value.id !== 'string' || value.id.trim().length === 0) {
    return { ok: false, error: 'A linked object id is required', status: 400 }
  }
  return { ok: true, value: { type: value.type, id: value.id.trim() } }
}

async function validateLinkedObjectForPublish(
  supabase: SupabaseClient,
  userId: string,
  linkedObject: GreenRoomLinkedObject
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (linkedObject.type === 'profile') {
    if (linkedObject.id !== userId) {
      return { ok: false, error: 'Linked profile must be your own profile', status: 403 }
    }
    const { data } = await supabase.from('artist_profiles').select('id').eq('id', userId).maybeSingle()
    return data ? { ok: true } : { ok: false, error: 'Linked profile not found', status: 404 }
  }

  if (linkedObject.type === 'project') {
    const { data } = await supabase
      .from('vault_projects')
      .select('id, user_id, is_public')
      .eq('id', linkedObject.id)
      .eq('user_id', userId)
      .maybeSingle()
    if (!data) return { ok: false, error: 'Linked project not found', status: 404 }
    return (data as { is_public: boolean }).is_public
      ? { ok: true }
      : { ok: false, error: 'Linked project must be public before publishing', status: 400 }
  }

  if (linkedObject.type === 'track') {
    const { data } = await supabase
      .from('tracks')
      .select('id, user_id')
      .eq('id', linkedObject.id)
      .eq('user_id', userId)
      .maybeSingle()
    return data ? { ok: true } : { ok: false, error: 'Linked track not found', status: 404 }
  }

  const { data } = await supabase
    .from('opportunities')
    .select('id, created_by, active')
    .eq('id', linkedObject.id)
    .eq('created_by', userId)
    .maybeSingle()
  if (!data) return { ok: false, error: 'Linked opportunity not found', status: 404 }
  return (data as { active: boolean }).active
    ? { ok: true }
    : { ok: false, error: 'Linked opportunity must be active before publishing', status: 400 }
}

