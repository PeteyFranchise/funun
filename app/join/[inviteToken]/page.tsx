import { createServiceClient } from '@/lib/supabase/server'

// Public page — no auth required. /join is intentionally absent from
// middleware isProtected (D-08, Plan 01 comment). Force-dynamic because
// the invite token lookup must happen per-request.
export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ inviteToken: string }>
}

// ─── /join/[inviteToken] ─────────────────────────────────────────────
// View-only collaborator profile page. Renders the data an artist recorded
// for this collaborator so they can verify it and flag corrections.
// No edit controls — self-edit is deferred (D-09).
export default async function JoinPage({ params }: Props) {
  const { inviteToken } = await params
  const service = createServiceClient()
  const now = new Date().toISOString()

  // ── Token lookup (T-01-13 expiry guard) ─────────────────────────────
  const { data: invite } = await service
    .from('collaborator_invites')
    .select('*, collaborators(*)')
    .eq('invite_token', inviteToken)
    .maybeSingle()

  // ── Expired / missing token state ────────────────────────────────────
  if (!invite || (invite.token_expires_at && invite.token_expires_at < now)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 py-16">
        <div className="mb-8 text-2xl font-extrabold tracking-tight">
          <span className="gtext">Funūn</span>
        </div>
        <div className="w-full max-w-[560px] rounded-[18px] border border-white/10 bg-card p-8 text-center">
          <p className="text-lg font-extrabold text-white">This link has expired</p>
          <p className="mt-2 text-sm text-white/50">
            Ask the artist who invited you to send a new link.
          </p>
        </div>
      </div>
    )
  }

  const collaborator = invite.collaborators as {
    name: string
    email: string | null
    phone: string | null
    pro: string | null
    ipi: string | null
    publisher: string | null
  } | null

  if (!collaborator) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 py-16">
        <div className="mb-8 text-2xl font-extrabold tracking-tight">
          <span className="gtext">Funūn</span>
        </div>
        <div className="w-full max-w-[560px] rounded-[18px] border border-white/10 bg-card p-8 text-center">
          <p className="text-lg font-extrabold text-white">Profile not found</p>
          <p className="mt-2 text-sm text-white/50">
            This collaborator profile may have been removed.
          </p>
        </div>
      </div>
    )
  }

  // ── Look up inviting artist's name + email for mailto ────────────────
  const { data: artistProfile } = await service
    .from('artist_profiles')
    .select('artist_name, display_name, contact_email')
    .eq('user_id', invite.inviting_user_id)
    .maybeSingle()

  const artistName =
    (artistProfile?.artist_name || artistProfile?.display_name || 'The artist') as string
  const artistEmail = (artistProfile?.contact_email ?? '') as string

  // Flag a correction: mailto link
  const mailtoSubject = encodeURIComponent('Correction to my collaborator profile')
  const mailtoBody = encodeURIComponent(
    `Hi ${artistName},\n\nI noticed the following details in my collaborator profile need updating:\n\n`
  )
  const mailtoHref = artistEmail
    ? `mailto:${artistEmail}?subject=${mailtoSubject}&body=${mailtoBody}`
    : `mailto:?subject=${mailtoSubject}&body=${mailtoBody}`

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const signupUrl = `${appUrl}/signup`

  // ── Field display helper ─────────────────────────────────────────────
  function Field({ label, value }: { label: string; value: string | null | undefined }) {
    return (
      <div>
        <dt className="text-xs font-bold uppercase tracking-wide text-white/40">{label}</dt>
        <dd className={`mt-0.5 text-sm ${value ? 'text-white' : 'text-white/30'}`}>
          {value ?? '—'}
        </dd>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 py-16">
      {/* Funūn wordmark */}
      <div className="mb-2 text-2xl font-extrabold tracking-tight">
        <span className="gtext">Funūn</span>
      </div>
      <p className="mb-8 text-sm text-white/50">
        Your collaborator profile — added by{' '}
        <span className="text-white/80">{artistName}</span>
      </p>

      {/* ── Content card ── */}
      <div className="w-full max-w-[560px] rounded-[18px] border border-white/10 bg-card p-6">
        <h1 className="mb-5 text-lg font-extrabold text-white">Your recorded details</h1>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full legal name" value={collaborator.name} />
          <Field label="Email" value={collaborator.email} />
          <Field label="Phone" value={collaborator.phone} />
          <Field label="PRO affiliation" value={collaborator.pro} />
          <Field label="IPI / CAE number" value={collaborator.ipi} />
          <Field label="Publisher" value={collaborator.publisher} />
        </dl>
      </div>

      {/* ── Footer actions ── */}
      <div className="mt-6 w-full max-w-[560px] space-y-4 text-center">
        {/* Flag a correction (T-01-14 — no PII beyond recorded profile) */}
        <p className="text-sm text-white/50">
          Something looks wrong?{' '}
          <a
            href={mailtoHref}
            className="text-white/80 underline hover:text-white"
          >
            Flag a correction
          </a>
        </p>

        {/* Create account CTA */}
        <div className="rounded-[18px] border border-white/10 bg-card p-5">
          <p className="text-sm font-semibold text-white">Keep your rights data up to date</p>
          <p className="mt-1 text-xs text-white/50">
            Create a free Funūn account to manage your IPI, track registrations, and
            ensure your royalties reach you.
          </p>
          <a
            href={signupUrl}
            className="mt-4 inline-block rounded-lg bg-grad px-5 py-2.5 text-sm font-semibold text-white shadow-cta"
          >
            Create your Funūn account
          </a>
        </div>
      </div>

      {/* Footer note */}
      <p className="mt-8 text-xs text-white/30">
        Powered by Funūn — rights and registration for independent artists
      </p>
    </div>
  )
}
