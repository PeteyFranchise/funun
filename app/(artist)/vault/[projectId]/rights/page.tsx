import { notFound, redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { readPerformers } from '@/lib/metadata/schema'
import { assessRdrReadiness, type RdrTrackInput } from '@/lib/metadata/rdr'
import { CopyrightFiling } from '@/components/vault/CopyrightFiling'
import { RightsStatusPatch } from '@/components/vault/RightsStatusPatch'
import { SongtrustGuideCard } from '@/components/vault/SongtrustGuideCard'
import { MlcGuideCard } from '@/components/vault/MlcGuideCard'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// ─── Badge helpers ────────────────────────────────────────────────────────────

function StatusBadge({
  variant,
  label,
}: {
  variant: 'green' | 'amber' | 'gray'
  label: string
}) {
  const styles = {
    green: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    amber: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    gray: 'border-white/15 bg-white/5 text-white/50',
  }
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${styles[variant]}`}
    >
      {label}
    </span>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function RightsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  // Demo mode does not support rights registration tracking
  if (DEMO) redirect('/vault')

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  // 1. Fetch project — only the columns rights page needs
  const { data: project } = await supabase
    .from('vault_projects')
    .select(
      'id, title, type, copyright_status, pro_registration_status, soundexchange_registered, mlc_registered, p_line, label, publisher'
    )
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single()

  if (!project) notFound()

  // 2. Tracks
  const { data: trackRows } = await supabase
    .from('tracks')
    .select('id, title, isrc, iswc, metadata, duration_seconds')
    .eq('project_id', projectId)
    .order('track_number')

  const tracks = trackRows ?? []

  // 3. Artist profile. pro / ipi / soundexchange_id are PRIVATE columns
  // under migration 040 (no authenticated SELECT grant) — a session-bound
  // read would fail the whole query with 42501 and silently blank the
  // registration data. Ownership is established via auth.getUser() above,
  // so the read runs on the service-role client scoped to the verified
  // user.id (D-19 companion pattern).
  const service = createServiceClient()
  const { data: profile } = await service
    .from('artist_profiles')
    .select('id, artist_name, pro, ipi, soundexchange_id')
    .eq('id', user.id)
    .maybeSingle()

  // 4. Derive RDR readiness for SoundExchange status
  const rdrInput: RdrTrackInput[] = tracks.map(t => ({
    id: t.id,
    title: t.title ?? '',
    isrc: t.isrc ?? null,
    mainArtist: profile?.artist_name ?? '',
    rightsOwner:
      (project as { p_line?: string | null }).p_line ??
      (project as { label?: string | null }).label ??
      profile?.artist_name ??
      '',
    performers: readPerformers(
      (t as { metadata?: Record<string, unknown> | null }).metadata
    ),
    recording: null,
  }))
  const rdr = assessRdrReadiness(rdrInput)

  const seReady = rdr.coreCount === rdr.tracks.length && rdr.tracks.length > 0
  const seStatus = project.soundexchange_registered
    ? 'registered'
    : seReady
      ? 'ready'
      : 'not_ready'

  // Tracks missing ISRC or performer credits for the "incomplete" note
  const tracksNotCoreReady = rdr.tracks.filter(t => t.profile === 'none')
  const tracksLackingIsrc = tracksNotCoreReady.filter(t =>
    t.coreMissing.includes('ISRC')
  ).length
  const tracksLackingPerformers = tracksNotCoreReady.filter(t =>
    t.coreMissing.some(m => m.toLowerCase().includes('performer'))
  ).length

  // ISWC count for PRO section
  const tracksWithIswc = tracks.filter(
    t => (t as { iswc?: string | null }).iswc
  ).length

  // copyright_registration doc check for the existing CopyrightFiling "filed" prop
  const { count: copyrightDocCount } = await supabase
    .from('vault_documents')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .eq('type', 'copyright_registration')

  const copyrightDocFiled = (copyrightDocCount ?? 0) > 0

  // 5. Latest split sheet contributors (for per-party callout)
  const { data: splitSheetDocs } = await supabase
    .from('vault_documents')
    .select('document_data')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .eq('type', 'split_sheet')
    .order('created_at', { ascending: false })
    .limit(1)

  const splitContributors: string[] = (() => {
    const raw = splitSheetDocs?.[0]?.document_data as
      | { contributors?: { name?: string }[] }
      | undefined
    return (raw?.contributors ?? [])
      .map(c => String(c.name ?? '').trim())
      .filter(Boolean)
  })()

  // ── Derived badge values ──────────────────────────────────────────────────
  const copyrightStatus = project.copyright_status ?? 'not_filed'
  const proStatus = project.pro_registration_status ?? 'not_registered'

  const copyrightBadge =
    copyrightStatus === 'registered'
      ? { variant: 'green' as const, label: 'Registered' }
      : copyrightStatus === 'filed'
        ? { variant: 'amber' as const, label: 'Filed' }
        : { variant: 'gray' as const, label: 'Not filed' }

  const proBadge =
    proStatus === 'registered'
      ? { variant: 'green' as const, label: 'Registered' }
      : { variant: 'gray' as const, label: 'Not registered' }

  const seBadge =
    seStatus === 'registered'
      ? { variant: 'green' as const, label: 'Registered' }
      : seStatus === 'ready'
        ? { variant: 'amber' as const, label: 'Ready to register' }
        : { variant: 'gray' as const, label: 'Data incomplete' }

  const mlcStatus = project.mlc_registered ? 'registered' : 'not_registered'
  const mlcBadge = mlcStatus === 'registered'
    ? { variant: 'green' as const, label: 'Registered' }
    : { variant: 'gray' as const, label: 'Not registered' }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      {/* Page heading */}
      <div>
        <p className="text-xs uppercase tracking-wide text-white/40">
          {project.title}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-white">
          Rights &amp; Registrations
        </h1>
        <p className="mt-1 text-sm text-white/50">
          Every songwriter on this project is responsible for registering their own share.
          Track your registrations below.
        </p>
      </div>

      {/* ── 1. Copyright ─────────────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-white">Copyright Registration</h2>
            <StatusBadge {...copyrightBadge} />
          </div>
          <a
            href="https://eco.copyright.gov"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-medium text-white/70 transition hover:border-white/30 hover:text-white"
          >
            File at eCO ↗
          </a>
        </div>
        <p className="mt-1 text-xs text-white/50">
          File with the US Copyright Office eCO system to protect your composition and sound
          recording. One registration can cover the entire release.
        </p>
        <div className="mt-3">
          <CopyrightFiling
            projectId={projectId}
            filed={copyrightDocFiled}
            copyrightStatus={copyrightStatus as 'not_filed' | 'filed' | 'registered'}
          />
        </div>
      </section>

      {/* ── 2. PRO Registration ──────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-white">PRO Registration</h2>
            <StatusBadge {...proBadge} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="https://www.ascap.com/music-creators"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-medium text-white/70 transition hover:border-white/30 hover:text-white"
            >
              ASCAP ↗
            </a>
            <a
              href="https://www.bmi.com/songwriters"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-medium text-white/70 transition hover:border-white/30 hover:text-white"
            >
              BMI ↗
            </a>
            <a
              href="https://www.sesac.com"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-medium text-white/70 transition hover:border-white/30 hover:text-white"
            >
              SESAC ↗
            </a>
            {/* TODO: verify SOCAN URL — https://www.socan.com/music-creators/ is [ASSUMED] from research; checkpoint in 03-03 will confirm */}
            <a
              href="https://www.socan.com/music-creators/"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-medium text-white/70 transition hover:border-white/30 hover:text-white"
            >
              SOCAN ↗
            </a>
          </div>
        </div>
        {splitContributors.length > 1 && (
          <div className="mt-2 rounded-lg border border-indigo-400/20 bg-indigo-400/[0.06] px-3 py-2.5 text-xs text-indigo-200/80 leading-relaxed">
            Co-writers on this project:{' '}
            <span className="font-semibold text-indigo-200">
              {splitContributors.join(', ')}
            </span>
            . Each is responsible for registering their own share with their PRO and the MLC.
          </div>
        )}
        <p className="mt-1 text-xs text-white/50">
          Each co-writer registers their share independently with their own PRO (ASCAP, BMI,
          SESAC, or SOCAN). Your PRO collects public performance royalties when your music is
          played publicly — but only for the share you registered.
        </p>
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          {profile?.pro && profile.pro !== 'none' && (
            <p className="text-xs text-white/70">
              Your PRO:{' '}
              <span className="font-semibold text-white">{profile.pro}</span>
              {profile.ipi && (
                <span className="ml-2 text-white/40">IPI {profile.ipi}</span>
              )}
            </p>
          )}
          <p className="mt-1 text-xs text-white/50">
            ISWC codes on this project:{' '}
            <span className={tracksWithIswc > 0 ? 'text-white/80' : 'text-amber-300'}>
              {tracksWithIswc}/{tracks.length}
            </span>
            {tracksWithIswc === 0 && tracks.length > 0 && (
              <span className="ml-1 text-white/40">
                — add ISWC codes in Metadata Studio
              </span>
            )}
          </p>
          <div className="mt-3">
            <RightsStatusPatch
              projectId={projectId}
              field="pro_registration_status"
              value="registered"
              label="Mark as registered"
              disabled={proStatus === 'registered'}
            />
          </div>
        </div>
      </section>

      {/* ── 3. SoundExchange ─────────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-white">SoundExchange</h2>
            <StatusBadge {...seBadge} />
          </div>
          <a
            href="https://www.soundexchange.com"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-medium text-white/70 transition hover:border-white/30 hover:text-white"
          >
            SoundExchange ↗
          </a>
        </div>
        <p className="mt-1 text-xs text-white/50">
          SoundExchange collects digital performance royalties for sound recordings played on
          satellite radio, internet radio, and non-interactive streaming services.
        </p>
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          {seStatus === 'not_ready' && tracks.length > 0 && (
            <div className="mb-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-3">
              <p className="text-xs font-semibold text-amber-300">
                Missing data on {tracksNotCoreReady.length} track
                {tracksNotCoreReady.length !== 1 ? 's' : ''}:
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-white/50">
                {tracksLackingIsrc > 0 && (
                  <li>
                    {tracksLackingIsrc} track{tracksLackingIsrc !== 1 ? 's' : ''} missing
                    ISRC code
                  </li>
                )}
                {tracksLackingPerformers > 0 && (
                  <li>
                    {tracksLackingPerformers} track
                    {tracksLackingPerformers !== 1 ? 's' : ''} missing performer credits
                  </li>
                )}
              </ul>
              <p className="mt-1 text-xs text-white/40">
                Add missing data in Metadata Studio to become register-ready.
              </p>
            </div>
          )}
          {tracks.length === 0 && (
            <p className="mb-3 text-xs text-white/40">
              Add tracks to this project to assess SoundExchange readiness.
            </p>
          )}
          <div className="flex items-center gap-3">
            <p className="text-xs text-white/50">
              Core-ready tracks:{' '}
              <span className={seReady ? 'text-emerald-300' : 'text-white/80'}>
                {rdr.coreCount}/{rdr.tracks.length}
              </span>
            </p>
          </div>
          <div className="mt-3">
            <RightsStatusPatch
              projectId={projectId}
              field="soundexchange_registered"
              value={true}
              label="Mark as registered"
              disabled={!!project.soundexchange_registered}
            />
          </div>
        </div>
      </section>

      {/* ── 4. Songtrust ─────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-base font-semibold text-white">Songtrust</h2>
        <p className="mt-1 text-xs text-white/50">
          Global publishing administration — collect royalties in territories where you
          haven&apos;t registered directly.
        </p>
        <div className="mt-3">
          <SongtrustGuideCard cwrHref={`/vault/${projectId}/metadata/cwr`} />
        </div>
      </section>

      {/* ── 5. MLC ───────────────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-white">MLC — Mechanical Licensing Collective</h2>
            <StatusBadge {...mlcBadge} />
          </div>
          <a
            href="https://www.themlc.com"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-medium text-white/70 transition hover:border-white/30 hover:text-white"
          >
            themlc.com ↗
          </a>
        </div>
        <p className="mt-1 text-xs text-white/50">
          The MLC distributes mechanical royalties from on-demand streaming and downloads in the US.
          Every songwriter with music on streaming platforms should register — this is separate from
          your PRO membership and covers a different royalty stream.
        </p>
        <div className="mt-3">
          <MlcGuideCard />
        </div>
        <div className="mt-3">
          <RightsStatusPatch
            projectId={projectId}
            field="mlc_registered"
            value={true}
            label="Mark as registered"
            disabled={!!project.mlc_registered}
          />
        </div>
      </section>
    </div>
  )
}
