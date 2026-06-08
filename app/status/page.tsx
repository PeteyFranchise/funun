import Link from 'next/link'
import { TOOLS } from '@/lib/tools/registry'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Platform Status · ArtistOS',
}

// ─── Status model ─────────────────────────────────────────────────────
type State = 'done' | 'partial' | 'planned'

type Feature = {
  name: string
  desc: string
  state: State
  links?: { label: string; href: string }[]
}

type Area = {
  title: string
  blurb: string
  features: Feature[]
}

const STATE_META: Record<State, { label: string; dot: string; text: string; ring: string }> = {
  done: { label: 'Live', dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'border-emerald-400/30 bg-emerald-400/10' },
  partial: { label: 'Partial', dot: 'bg-amber-400', text: 'text-amber-300', ring: 'border-amber-400/30 bg-amber-400/10' },
  planned: { label: 'Planned', dot: 'bg-white/30', text: 'text-white/50', ring: 'border-white/15 bg-white/[0.04]' },
}

// Tools section is derived from the registry so it never drifts from reality.
const toolFeatures: Feature[] = TOOLS.map(t => ({
  name: t.name,
  desc: t.description,
  state: t.available ? 'done' : 'planned',
  links: t.available ? [{ label: 'Test in a project', href: '/vault' }] : undefined,
}))

const AREAS: Area[] = [
  {
    title: 'Auth & onboarding',
    blurb: 'Account creation, sign-in, and route protection.',
    features: [
      { name: 'Sign up', desc: 'Create an account (email confirmation disabled for now).', state: 'done', links: [{ label: 'Sign up', href: '/signup' }] },
      { name: 'Sign in', desc: 'Password sign-in with redirect back to intended page.', state: 'done', links: [{ label: 'Sign in', href: '/signin' }] },
      { name: 'Route protection', desc: 'Middleware gates /dashboard, /vault, /settings behind a session.', state: 'done' },
    ],
  },
  {
    title: 'Artist profile',
    blurb: 'The profile that feeds tool generation.',
    features: [
      { name: 'Profile settings', desc: 'Edit identity, bio, location, and social links.', state: 'done', links: [{ label: 'Open settings', href: '/settings' }] },
    ],
  },
  {
    title: 'Sound Vault',
    blurb: 'The core release-management workspace.',
    features: [
      { name: 'Dashboard', desc: 'Pipeline stats, recent projects, upcoming releases.', state: 'done', links: [{ label: 'Open dashboard', href: '/dashboard' }] },
      { name: 'Project list', desc: 'Browse all projects grouped by type.', state: 'done', links: [{ label: 'Open vault', href: '/vault' }] },
      { name: 'Create project', desc: 'New single / snippet / EP / album / unreleased.', state: 'done', links: [{ label: 'New project', href: '/vault/new' }] },
      { name: 'Edit & delete', desc: 'Update fields, change lifecycle status, delete.', state: 'done', links: [{ label: 'Open a project', href: '/vault' }] },
    ],
  },
  {
    title: 'Project contents',
    blurb: 'Everything attached to a release.',
    features: [
      { name: 'Tracks', desc: 'Add tracks with title, number, and ISRC.', state: 'done', links: [{ label: 'Open a project', href: '/vault' }] },
      { name: 'Cover art upload', desc: 'Upload cover art to Supabase Storage.', state: 'done', links: [{ label: 'Open a project', href: '/vault' }] },
      { name: 'Asset upload', desc: 'Press photos, lyric cards, snippet visuals, banners.', state: 'done', links: [{ label: 'Open a project', href: '/vault' }] },
      { name: 'Documents', desc: 'Split sheets, copyright, hire agreements with status.', state: 'done', links: [{ label: 'Open a project', href: '/vault' }] },
    ],
  },
  {
    title: 'Vault Readiness',
    blurb: 'The 0–100 release-readiness score.',
    features: [
      { name: 'Readiness scoring', desc: 'DB triggers recompute the score on every change (insert/update/delete).', state: 'done', links: [{ label: 'Open a project', href: '/vault' }] },
    ],
  },
  {
    title: 'Tools',
    blurb: 'AI-generated, project-scoped launch assets. Run from inside a project.',
    features: toolFeatures,
  },
  {
    title: 'Not built yet',
    blurb: 'On the roadmap.',
    features: [
      { name: 'Public EPK / share page', desc: 'A public, shareable page for a project or artist.', state: 'planned' },
      { name: 'Billing (Stripe)', desc: 'Subscriptions and paywalling of tools.', state: 'planned' },
      { name: 'Transactional email (Resend)', desc: 'Welcome / notification emails.', state: 'planned' },
    ],
  },
]

// ─── Config health (booleans only — never the secret values) ──────────
function configHealth() {
  const has = (v: string | undefined) => Boolean(v && v.length > 0)
  return [
    { label: 'Supabase URL', ok: has(process.env.NEXT_PUBLIC_SUPABASE_URL) },
    { label: 'Supabase anon key', ok: has(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) },
    { label: 'Supabase service role', ok: has(process.env.SUPABASE_SERVICE_ROLE_KEY) },
    { label: 'Anthropic API key', ok: has(process.env.ANTHROPIC_API_KEY) },
    { label: 'Stripe key', ok: has(process.env.STRIPE_SECRET_KEY) },
    { label: 'Resend key', ok: has(process.env.RESEND_API_KEY) },
  ]
}

function StatusBadge({ state }: { state: State }) {
  const m = STATE_META[state]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.ring} ${m.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} aria-hidden />
      {m.label}
    </span>
  )
}

export default function StatusPage() {
  const demo = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
  const config = configHealth()

  const allFeatures = AREAS.flatMap(a => a.features)
  const liveCount = allFeatures.filter(f => f.state === 'done').length
  const totalCount = allFeatures.length

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <header className="border-b border-white/10 pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">Platform Status</h1>
            <p className="mt-1 text-sm text-white/50">
              What&apos;s built, what&apos;s next, and quick links to test each area.
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold text-white">
              {liveCount}
              <span className="text-base text-white/40">/{totalCount}</span>
            </p>
            <p className="text-xs text-white/40">features live</p>
          </div>
        </div>

        {/* Environment + config */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
              demo ? 'border-amber-400/30 bg-amber-400/10 text-amber-300' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
            }`}
          >
            {demo ? 'Demo mode (file-backed store)' : 'Live mode (Supabase)'}
          </span>
          {config.map(c => (
            <span
              key={c.label}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-white/60"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${c.ok ? 'bg-emerald-400' : 'bg-rose-500'}`} aria-hidden />
              {c.label}
            </span>
          ))}
        </div>
      </header>

      <div className="mt-10 space-y-10">
        {AREAS.map(area => (
          <section key={area.title}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">{area.title}</h2>
              <span className="text-xs text-white/40">
                {area.features.filter(f => f.state === 'done').length}/{area.features.length} live
              </span>
            </div>
            <p className="mt-0.5 text-sm text-white/40">{area.blurb}</p>

            <ul className="mt-4 space-y-2">
              {area.features.map(f => (
                <li
                  key={f.name}
                  className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white">{f.name}</p>
                      <StatusBadge state={f.state} />
                    </div>
                    <p className="mt-0.5 text-sm text-white/50">{f.desc}</p>
                  </div>
                  {f.links && f.links.length > 0 && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {f.links.map(l => (
                        <Link
                          key={l.href + l.label}
                          href={l.href}
                          className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white transition hover:border-white/30 hover:bg-white/[0.08]"
                        >
                          {l.label} →
                        </Link>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="mt-12 border-t border-white/10 pt-6 text-xs text-white/30">
        Internal progress page · not part of the product nav · visit{' '}
        <Link href="/dashboard" className="text-white/50 hover:text-white">
          /dashboard
        </Link>{' '}
        for the live app.
      </footer>
    </div>
  )
}
