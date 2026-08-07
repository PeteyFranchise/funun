import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { buildRegisterPayload } from '@/lib/buyers/register'
import { createBuyerAccount, DuplicateBuyerAccountError } from '@/lib/buyers/createBuyerAccount'
import { resolveLeadershipFallback } from '@/lib/staff/leadershipFallback'
import { resolveLeadRecipient, buildLeadRoutedNotification } from '@/lib/staff/notifications'
import { createNotification } from '@/lib/notifications'

// ─── POST /api/sync/register — public, unauthenticated (23-04 Task 3) ─────
// The FIRST genuinely public write path in the buyer domain (RESEARCH
// Pitfall 7) — no session, no requireStaff() gate. Compensating controls
// replace auth: rate limiting, strict allowlist validation
// (buildRegisterPayload), and account-enumeration avoidance on the
// duplicate-email path. Creates a real buyer_orgs row in
// 'pending_onboarding' (NOT a bare lead) + a first approver/org-admin
// member via lib/buyers/createBuyerAccount (D-11/A1), then wires the
// already-built Phase 25 lead-routing hook
// (resolveLeadRecipient/buildLeadRoutedNotification) as a best-effort side
// effect that never blocks or fails the signup.

// Column-explicit select (never select-star — migration 080's column-grant
// doctrine). ae_user_id is always null on a brand-new insert but is
// selected defensively so resolveLeadRecipient's org shape stays honest to
// its real type rather than being hand-constructed.
const ORG_SELECT_COLUMNS = 'id, name, ae_user_id'

// ─── Rate limiting (Pitfall 7) ─────────────────────────────────────────────
// Simple in-route, in-memory per-key window — reuses the *pattern* of
// lib/social/dm.ts's cold-DM limiter (a per-key window), not its table.
// Acceptable for beta per this plan's own directive; a warm serverless
// instance shares this Map across requests it serves, degrading gracefully
// (not failing open or closed) across cold starts/multiple instances.
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const RATE_LIMIT_MAX_ATTEMPTS = 5
const rateLimitStore = new Map<string, number[]>()

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const recent = (rateLimitStore.get(key) ?? []).filter(ts => now - ts < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX_ATTEMPTS) {
    rateLimitStore.set(key, recent)
    return true
  }
  recent.push(now)
  rateLimitStore.set(key, recent)
  return false
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return request.headers.get('x-real-ip') ?? 'unknown'
}

// ─── Best-effort lead routing (Phase 25 hook) ──────────────────────────────
// Never throws — any failure here must never fail the signup it's attached
// to. Resolves the assigned AE (always null on a brand-new org) or the
// leadership fallback, then fires an in-app notification + best-effort
// Resend email copy when the recipient's email is resolvable.
async function routeLead(
  service: SupabaseClient,
  org: { id: string; name: string; ae_user_id: string | null }
): Promise<void> {
  try {
    const leadershipFallbackId = await resolveLeadershipFallback(service)
    const recipientId = resolveLeadRecipient(org, leadershipFallbackId ?? '')
    if (!recipientId) return

    let recipientEmail: string | null = null
    try {
      const { data } = await service.auth.admin.getUserById(recipientId)
      recipientEmail = data?.user?.email ?? null
    } catch {
      recipientEmail = null
    }

    const notification = buildLeadRoutedNotification({
      recipientId,
      orgId: org.id,
      orgName: org.name,
    })

    await createNotification(service, {
      ...notification,
      email: recipientEmail,
      sendEmailCopy: !!recipientEmail,
    })
  } catch {
    // Best-effort — swallow. Lead routing must never fail the signup.
  }
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  if (isRateLimited(`ip:${ip}`)) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const result = buildRegisterPayload({
    company: typeof raw.company === 'string' ? raw.company : '',
    contactName: typeof raw.contactName === 'string' ? raw.contactName : '',
    email: typeof raw.email === 'string' ? raw.email : '',
    phone: typeof raw.phone === 'string' ? raw.phone : '',
    role: typeof raw.role === 'string' ? raw.role : '',
    useCase: typeof raw.useCase === 'string' ? raw.useCase : '',
    source: typeof raw.source === 'string' ? raw.source : undefined,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  const payload = result.body

  // Second rate-limit dimension — same visitor retrying with a different
  // IP (or behind a shared IP) is still capped per email.
  if (isRateLimited(`email:${payload.email}`)) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  const service = createServiceClient()

  const { data: org, error: orgError } = await service
    .from('buyer_orgs')
    .insert({
      name: payload.company,
      status: 'pending_onboarding',
      use_case: payload.useCase || null,
      contact_name: payload.contactName,
      contact_email: payload.email,
      contact_phone: payload.phone,
      contact_role: payload.role || null,
      source: payload.source,
    })
    .select(ORG_SELECT_COLUMNS)
    .single()

  if (orgError || !org) {
    return NextResponse.json(
      { error: 'Failed to complete registration. Please try again.' },
      { status: 500 }
    )
  }

  try {
    const { userId, emailSent } = await createBuyerAccount({
      email: payload.email,
      displayName: payload.contactName,
      orgId: org.id,
      buyerRole: 'approver',
      isOrgAdmin: true,
    })

    await routeLead(service, org)

    return NextResponse.json({ data: { orgId: org.id, userId }, emailSent }, { status: 201 })
  } catch (err) {
    // The buyer_orgs row already exists at this point — never silently roll
    // it back on a downstream failure (mirrors POST /api/admin/buyer-orgs).
    if (err instanceof DuplicateBuyerAccountError) {
      // Account-enumeration avoidance (T-23-11): the SAME neutral 201-shaped
      // response as success — never reveal that this email already has an
      // account to an unauthenticated caller (mirrors forgot-password's
      // discipline). The lead still routes so staff can see the repeat
      // signup attempt in their queue.
      await routeLead(service, org)
      return NextResponse.json({ data: { orgId: org.id }, emailSent: false }, { status: 201 })
    }

    return NextResponse.json(
      { error: 'Failed to complete registration. Please try again.' },
      { status: 500 }
    )
  }
}
