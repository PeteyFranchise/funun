import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { createSubmission } from '@/lib/submissions'
import { getCurator } from '@/lib/tools/pitchplug'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function bodyToHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map(p => `<p>${p.replace(/\n/g, '<br>').replace(/</g, '&lt;')}</p>`)
    .join('')
}

// POST /api/tools/pitchplug/send — email a generated pitch to a recipient and
// log it as a submission. Sends from the platform domain with Reply-To set to
// the artist so replies land in their inbox.
export async function POST(request: Request) {
  if (DEMO) {
    return NextResponse.json({ error: 'Sending is disabled in demo mode' }, { status: 400 })
  }

  const b = (await request.json().catch(() => ({}))) as {
    projectId?: string
    curatorType?: string
    recipientEmail?: string
    recipientName?: string
    subject?: string
    body?: string
  }

  if (!b.projectId || !b.subject || !b.body) {
    return NextResponse.json({ error: 'projectId, subject and body are required' }, { status: 400 })
  }
  if (!b.recipientEmail || !EMAIL_RE.test(b.recipientEmail)) {
    return NextResponse.json({ error: 'A valid recipient email is required' }, { status: 400 })
  }

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Ownership + reply-to address.
  const { data: project } = await supabase
    .from('vault_projects')
    .select('id, title, contact_email')
    .eq('id', b.projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const replyTo = project.contact_email || user.email || undefined

  const sent = await sendEmail({
    to: b.recipientEmail,
    subject: b.subject,
    html: bodyToHtml(b.body),
    text: b.body,
    replyTo,
  })
  if (!sent.ok) {
    return NextResponse.json(
      { error: sent.error ?? 'Could not send the email' },
      { status: 502 }
    )
  }

  const curator = b.curatorType ? getCurator(b.curatorType) : undefined
  const { data: submission, error } = await createSubmission(supabase, {
    projectId: b.projectId,
    userId: user.id,
    type: b.curatorType ?? 'playlist_curator',
    destination: {
      name: b.recipientName?.trim() || curator?.name || 'Curator',
      contact: b.recipientEmail,
    },
    pitchText: `${b.subject}\n\n${b.body}`,
    status: 'sent',
  })
  if (error) {
    // Email already went out — report success but flag the tracking miss.
    return NextResponse.json({ data: { sent: true, tracked: false } })
  }

  return NextResponse.json({ data: { sent: true, tracked: true, submission } })
}
