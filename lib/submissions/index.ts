import type { SupabaseClient } from '@supabase/supabase-js'
import type { Submission } from '@/types'

/**
 * Shared submission helpers used by BOTH outreach surfaces:
 *  - The Antenna apply flow (artist applies to an industry opportunity)
 *  - PitchPlug (artist sends a cold pitch to a curator/blog/booker)
 *
 * Every outbound pitch becomes a `submissions` row so the artist gets one
 * unified outreach history per project (components/vault/SubmissionHistory).
 *
 * Status flow: draft → sent → viewed → responded → accepted/declined.
 *
 * All functions take an authenticated Supabase client (RLS-scoped to the
 * caller) so ownership is enforced by Postgres, not here.
 */

export type SubmissionDestination = {
  name: string
  contact?: string | null
}

export async function createSubmission(
  supabase: SupabaseClient,
  args: {
    projectId: string
    userId: string
    type: string
    destination: SubmissionDestination
    pitchText?: string | null
    status?: Submission['status']
  }
): Promise<{ data: Submission | null; error: string | null }> {
  const status = args.status ?? 'sent'
  const { data, error } = await supabase
    .from('submissions')
    .insert({
      project_id: args.projectId,
      user_id: args.userId,
      destination_type: args.type,
      destination_name: args.destination.name,
      destination_contact: args.destination.contact ?? null,
      pitch_text: args.pitchText ?? null,
      status,
      submitted_at: status === 'draft' ? null : new Date().toISOString(),
    })
    .select()
    .single()

  return { data: (data as Submission) ?? null, error: error?.message ?? null }
}

export async function updateSubmissionStatus(
  supabase: SupabaseClient,
  submissionId: string,
  status: Submission['status'],
  responseMessage?: string | null
): Promise<{ data: Submission | null; error: string | null }> {
  const patch: Record<string, unknown> = { status }
  if (status === 'sent') patch.submitted_at = new Date().toISOString()
  if (status === 'responded' || status === 'accepted' || status === 'declined') {
    patch.responded_at = new Date().toISOString()
    if (responseMessage != null) patch.response_message = responseMessage
  }

  const { data, error } = await supabase
    .from('submissions')
    .update(patch)
    .eq('id', submissionId)
    .select()
    .single()

  return { data: (data as Submission) ?? null, error: error?.message ?? null }
}

export async function getProjectSubmissions(
  supabase: SupabaseClient,
  projectId: string
): Promise<Submission[]> {
  const { data } = await supabase
    .from('submissions')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  return (data as Submission[]) ?? []
}
