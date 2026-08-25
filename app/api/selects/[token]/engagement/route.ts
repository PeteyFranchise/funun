import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { resolveSelectsByToken, loadOwnSelectsTrack } from '@/lib/selects/public-resolve'
import { clampDelta } from '@/lib/selects/engagement'

// ─── POST /api/selects/[token]/engagement — audible-time telemetry write path (R13, D-31.2-12/14) ──
// Public, token-gated, no login required — the SAME structural shape as
// app/api/selects/[token]/react/route.ts (31.2-PATTERNS.md exact analog):
// resolveSelectsByToken (never a bare id) → dual checkRateLimit → zod
// `.strict()` body → loadOwnSelectsTrack (scoped, TOCTOU-safe) → persist.
//
// Two request shapes share this one endpoint:
//   - a delta event (heartbeat/pause/ended/unload) — a per-track audible-time
//     flush from useAudibleTimeAccumulator (components/selects-player/
//     useAudibleTimeAccumulator.ts), clamped server-side to <=15s via
//     clampDelta (lib/selects/engagement.ts, plan 02) before persisting to
//     selects_track_engagement — defense in depth alongside the migration-132
//     DB CHECK (0 < delta <= 15) + per-(track,viewer) cap trigger (Pitfall 2).
//     The server, never the client, is the source of truth for the accepted
//     delta bound.
//   - an open event (event: 'open') — one row per viewer "opened this
//     Selects" moment, persisted to selects_opens instead of a delta row
//     (D-31.2-12).
//
// Attribution is viewer_key ONLY. Migration 132 ships no reacted_by-style
// authenticated-user column on either table (unlike selects_reactions) —
// per-recipient attribution here is exclusively the SELECTS_VIEWER_COOKIE
// key the player mints/persists client-side, staff-only and never surfaced
// back to the client (D-31.2-14). This route NEVER returns any aggregate or
// engagement readback — staff-only rollups are plan 10's read routes.
//
// Never re-derive Selects-by-token resolution — always call
// resolveSelectsByToken (public-resolve.ts's module-header contract).

const DELTA_EVENT_VALUES = ['heartbeat', 'pause', 'ended', 'unload'] as const

const DeltaBodySchema = z
  .object({
    selectsTrackId: z.string().uuid(),
    deltaSeconds: z.number().finite(),
    event: z.enum(DELTA_EVENT_VALUES),
    viewerKey: z.string().trim().min(8).max(200).optional(),
  })
  .strict()

const OpenBodySchema = z
  .object({
    event: z.literal('open'),
    viewerKey: z.string().trim().min(8).max(200).optional(),
  })
  .strict()

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = createServiceClient()

  const selects = await resolveSelectsByToken(service, token)
  if (!selects) {
    return NextResponse.json({ error: "This link isn't live." }, { status: 404 })
  }

  // A distinct key namespace from selects-react:* so a Selects' reaction
  // traffic and its telemetry traffic never share a rate-limit bucket — same
  // generous ceilings as the reaction route (audit #6 doctrine, dual
  // per-(token+ip) and per-token dimensions).
  const ip = getClientIp(request)
  if (
    (await checkRateLimit(`selects-engagement:${token}:${ip}`, { maxAttempts: 60 })) ||
    (await checkRateLimit(`selects-engagement:${token}`, { maxAttempts: 300 }))
  ) {
    return NextResponse.json({ error: 'Too many requests — please slow down.' }, { status: 429 })
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  if (body.event === 'open') {
    const parsed = OpenBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
    }
    const { error } = await service.from('selects_opens').insert({
      selects_id: selects.id,
      viewer_key: parsed.data.viewerKey ?? null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: { ok: true } })
  }

  const parsed = DeltaBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
  }

  // Never trust a bare selectsTrackId — scope it to THIS Selects
  // (loadOwnSelectsTrack), the same TOCTOU-safe pattern the react route uses,
  // so a caller cannot write telemetry against a track belonging to a
  // different Selects by guessing/reusing an id.
  const track = await loadOwnSelectsTrack(service, selects.id, parsed.data.selectsTrackId)
  if (!track) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Defense in depth with the migration-132 DB CHECK + cap trigger — clamp
  // before persisting rather than trusting the client's raw delta (Pitfall 2).
  // A delta that clamps to 0 (non-finite, zero, or negative) is not real
  // audible playback time — rejected rather than silently inserted, since
  // the DB CHECK (0 < delta <= 15) would reject a 0-second row anyway.
  const deltaSeconds = clampDelta(parsed.data.deltaSeconds)
  if (deltaSeconds <= 0) {
    return NextResponse.json({ error: 'deltaSeconds must be a positive number of seconds.' }, { status: 400 })
  }

  const { error } = await service.from('selects_track_engagement').insert({
    selects_id: selects.id,
    selects_track_id: track.id,
    viewer_key: parsed.data.viewerKey ?? null,
    delta_seconds: deltaSeconds,
    event: parsed.data.event,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: { ok: true } })
}
