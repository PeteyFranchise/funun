import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { generateResponseToken } from '@/lib/curators/tokens'
import { PITCH_NOTE_MAX_WORDS } from '@/lib/curators/pitch-copy'
import { sendEmail } from '@/lib/email'

type SendBody = {
  projectId?: string
  trackId?: string
  curatorIds?: string[]
  note?: string
}

type BlockedCurator = { curatorId: string; reason: string }

// Hard character cap on the note, independent of the word-count gate below —
// a single unbroken "word" would otherwise pass the 150-word check while
// still carrying an arbitrarily large payload (CR-01).
const PITCH_NOTE_MAX_CHARS = 2000
const PITCH_RESPONSE_TOKEN_EXPIRY_DAYS = 30

// HTML-escape artist-controlled text before interpolating into the outbound
// pitch email (CR-01) — trimmedNote and track.title are both fully
// artist-controlled free text with no markup sanitization upstream.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// POST /api/pitches — send route. Ownership + 3-gate server re-validation
// (curator selected / note non-empty / word count <= 150 — T-06-11) +
// duplicate-send guard (pre-check + uniq_curator_track_pitch 23505 backstop,
// T-06-13) + pitch_history row creation with a per-row response_token +
// email delivery from PITCH_FROM_EMAIL (D-22, graceful no-op when unset).
// This is the ONLY route that creates pitch_history rows and the ONLY
// place response_token is generated (06-06 reads, never generates).
export async function POST(request: Request) {
  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as SendBody
  const { projectId, trackId } = body
  const curatorIds = Array.isArray(body.curatorIds) ? body.curatorIds : []
  const note = typeof body.note === 'string' ? body.note : ''

  if (!projectId || !trackId) {
    return NextResponse.json({ error: 'projectId and trackId are required' }, { status: 400 })
  }

  // ── Gate 1: at least one curator selected ──────────────────────────────
  if (curatorIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one curator' }, { status: 400 })
  }

  // ── Gate 2: note non-empty ──────────────────────────────────────────────
  const trimmedNote = note.trim()
  if (trimmedNote.length === 0) {
    return NextResponse.json(
      { error: 'Add a playlist-specific note (up to 150 words) to send.' },
      { status: 400 }
    )
  }

  // ── Gate 3: word count <= 150 — server-side, never trust client state ──
  const wordCount = trimmedNote.split(/\s+/).filter(Boolean).length
  if (wordCount > PITCH_NOTE_MAX_WORDS) {
    return NextResponse.json(
      { error: `Note must be ${PITCH_NOTE_MAX_WORDS} words or fewer (currently ${wordCount}).` },
      { status: 400 }
    )
  }

  // ── Gate 4: character cap — backstop against a single unbroken "word" ──
  // carrying an arbitrarily large payload past the word-count gate above.
  if (trimmedNote.length > PITCH_NOTE_MAX_CHARS) {
    return NextResponse.json(
      { error: `Note must be ${PITCH_NOTE_MAX_CHARS} characters or fewer.` },
      { status: 400 }
    )
  }

  // ── Ownership: project + track must belong to the caller ───────────────
  const { data: project } = await supabase
    .from('vault_projects')
    .select('id, title, tracks (id, title)')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const track = ((project.tracks ?? []) as { id: string; title: string }[]).find(
    t => t.id === trackId
  )
  if (!track) return NextResponse.json({ error: 'Track not found in project' }, { status: 404 })

  // ── Load selected curators (service client — need email/claim_token) ───
  const service = createServiceClient()
  const { data: curators } = await service
    .from('curators')
    .select('id, name, email, email_valid, do_not_pitch, claim_token')
    .in('id', curatorIds)

  const curatorsById = new Map((curators ?? []).map(c => [c.id, c]))

  // ── Pre-check duplicates: existing pitch_history for this track ────────
  const { data: existingPitches } = await service
    .from('pitch_history')
    .select('curator_id')
    .eq('track_id', trackId)
    .in('curator_id', curatorIds)
  const alreadyPitchedIds = new Set((existingPitches ?? []).map(p => p.curator_id as string))

  // ── Block: not-found / do_not_pitch / bounced / already-pitched ────────
  const blocked: BlockedCurator[] = []
  const eligible: { id: string; name: string; email: string; claim_token: string | null }[] = []

  for (const curatorId of curatorIds) {
    const curator = curatorsById.get(curatorId)
    if (!curator) {
      blocked.push({ curatorId, reason: 'Curator not found' })
      continue
    }
    if (alreadyPitchedIds.has(curatorId)) {
      blocked.push({ curatorId, reason: 'Already pitched for this track' })
      continue
    }
    if (curator.do_not_pitch) {
      blocked.push({ curatorId, reason: 'Unsubscribed' })
      continue
    }
    if (!curator.email_valid) {
      blocked.push({ curatorId, reason: 'Email bounced' })
      continue
    }
    eligible.push({
      id: curator.id,
      name: curator.name,
      email: curator.email,
      claim_token: curator.claim_token,
    })
  }

  if (blocked.length > 0) {
    const dupeCount = blocked.filter(b => b.reason === 'Already pitched for this track').length
    const message =
      dupeCount > 0
        ? `${dupeCount} of these curators were already pitched for this track.`
        : 'One or more selected curators cannot be pitched right now.'
    return NextResponse.json({ error: message, blocked }, { status: 409 })
  }

  // ── Build + insert pitch_history rows in ONE bulk insert (atomic — a ────
  // uniq_curator_track_pitch (23505) race backstop fails the whole batch,
  // never a partial insert) ────────────────────────────────────────────────
  const rows = eligible.map(curator => ({
    project_id: projectId,
    track_id: trackId,
    curator_id: curator.id,
    artist_id: user.id,
    note: trimmedNote,
    response_token: generateResponseToken(),
    response_token_expires_at: new Date(
      Date.now() + PITCH_RESPONSE_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    ).toISOString(),
  }))

  const { data: inserted, error: insertError } = await service
    .from('pitch_history')
    .insert(rows)
    .select('id, curator_id, response_token')

  if (insertError) {
    if ((insertError as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'One or more of these curators were already pitched for this track.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // ── Send emails — best-effort; a send failure does not roll back the ───
  // pitch_history row (D-22: PITCH_FROM_EMAIL may be unconfigured) ────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const playerUrl = `${appUrl}/r/${projectId}`

  let sent = 0
  for (const row of inserted ?? []) {
    const curator = eligible.find(c => c.id === row.curator_id)
    if (!curator) continue

    const claimUrl = curator.claim_token ? `${appUrl}/curators/claim/${curator.claim_token}` : null
    const acceptUrl = `${appUrl}/pitch/accept/${row.response_token}`
    const declineUrl = `${appUrl}/pitch/decline/${row.response_token}`
    const unsubscribeUrl = `${appUrl}/pitch/unsubscribe/${row.response_token}`

    const result = await sendEmail({
      to: curator.email,
      from: process.env.PITCH_FROM_EMAIL,
      // A curator replying with a question (rather than using the
      // Accept/Decline links) should reach the artist, not
      // PITCH_FROM_EMAIL's own unmonitored cold-outreach mailbox (WR-03).
      // user.email comes straight off the already-loaded auth session, no
      // extra lookup needed.
      replyTo: user.email,
      subject: `A track for ${curator.name} — "${track.title}"`,
      html: `
        <p>Hi ${escapeHtml(curator.name)},</p>
        <p>${escapeHtml(trimmedNote).replace(/\n/g, '<br />')}</p>
        <p><a href="${playerUrl}" style="display:inline-block;padding:10px 20px;background:#818CF8;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Listen to "${escapeHtml(track.title)}"</a></p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #eee" />
        <p style="color:#888;font-size:12px">
          <a href="${acceptUrl}">Accept this pitch</a> ·
          <a href="${declineUrl}">Decline</a>
          ${claimUrl ? ` · <a href="${claimUrl}">Claim your curator profile</a>` : ''}
          · <a href="${unsubscribeUrl}">Unsubscribe from future pitches</a>
        </p>
      `,
      text: [
        `Hi ${curator.name},`,
        '',
        trimmedNote,
        '',
        `Listen: ${playerUrl}`,
        '',
        `Accept: ${acceptUrl}`,
        `Decline: ${declineUrl}`,
        claimUrl ? `Claim your curator profile: ${claimUrl}` : '',
        `Unsubscribe: ${unsubscribeUrl}`,
      ]
        .filter(Boolean)
        .join('\n'),
    })
    if (result.ok) sent += 1
  }

  return NextResponse.json({ data: { sent, blocked: 0 } })
}
