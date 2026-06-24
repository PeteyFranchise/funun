import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getDemoProject } from '@/lib/vault/demo-store'
import { buildBundle, type ProjectRow, type TrackRow } from '@/lib/metadata/bundle'
import {
  buildRegistrationPackages,
  type RegWork,
  type RegRecording,
} from '@/lib/metadata/registration'
import { CopyrightFiling } from '@/components/vault/CopyrightFiling'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

const PROJECT_COLS =
  'title, type, genre, sub_genre, release_date, upc, cover_art_url, label, publisher, c_line, p_line, copyright_year, primary_language, contact_name, contact_email, contact_phone'
const TRACK_COLS =
  'id, title, track_number, isrc, iswc, duration_seconds, bpm, key_signature, explicit, language, featuring_artists, audio_file_url, metadata'

function durationStr(s: number | null): string {
  if (!s) return '—'
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

const v = (x: string | number | null | undefined) =>
  x === null || x === undefined || x === '' ? '—' : String(x)

export default async function RegistrationsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  let projectRow: ProjectRow | null = null
  let trackRows: TrackRow[] = []
  let artistName = ''
  let copyrightFiled = false

  if (DEMO) {
    const demo = (await getDemoProject(projectId)) as unknown as
      | (ProjectRow & { tracks?: TrackRow[] })
      | null
    if (demo) {
      projectRow = demo
      trackRows = (demo.tracks ?? []) as TrackRow[]
      artistName = 'Demo Artist'
    }
  } else {
    const supabase = createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data: project } = await supabase
      .from('vault_projects')
      .select(PROJECT_COLS)
      .eq('id', projectId)
      .eq('user_id', user?.id ?? '')
      .maybeSingle()

    if (project) {
      projectRow = project as unknown as ProjectRow
      const { data: tracks } = await supabase
        .from('tracks')
        .select(TRACK_COLS)
        .eq('project_id', projectId)
        .eq('user_id', user?.id ?? '')
      trackRows = (tracks ?? []) as unknown as TrackRow[]

      if (user) {
        const { data: profile } = await supabase
          .from('artist_profiles')
          .select('artist_name')
          .eq('id', user.id)
          .maybeSingle()
        artistName = profile?.artist_name ?? ''
      }

      const { count } = await supabase
        .from('vault_documents')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('user_id', user?.id ?? '')
        .eq('type', 'copyright_registration')
      copyrightFiled = (count ?? 0) > 0
    }
  }

  if (!projectRow) notFound()

  const bundle = buildBundle(projectRow, trackRows, artistName)
  const pkg = buildRegistrationPackages(bundle)
  const worksReadyCount = pkg.works.filter(w => w.writers.length > 0 && w.shareOk).length
  const recsReadyCount = pkg.recordings.filter(r => Boolean(r.isrc)).length

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Link
        href={`/vault/${projectId}/metadata`}
        className="text-sm text-white/50 transition hover:text-white"
      >
        ← Back to Metadata Studio
      </Link>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/40">Registration packages</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">US rights bodies</h1>
          <p className="mt-1 text-sm text-white/50">
            Every field each body needs, pre-filled from your metadata — paste it straight into
            their portal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/vault/${projectId}/metadata/cwr`}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/30 hover:text-white"
          >
            CWR export →
          </Link>
          <a
            href={`/api/vault/${projectId}/metadata/registrations`}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/30 hover:text-white"
          >
            Download .txt
          </a>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
        <span className="font-semibold text-white">Registration status</span>
        <span className="text-white/60">
          Works ready to file:{' '}
          <span className={worksReadyCount === pkg.works.length && pkg.works.length > 0 ? 'text-emerald-300' : 'text-amber-300'}>
            {worksReadyCount}/{pkg.works.length}
          </span>
        </span>
        <span className="text-white/60">
          Recordings ready:{' '}
          <span className={recsReadyCount === pkg.recordings.length && pkg.recordings.length > 0 ? 'text-emerald-300' : 'text-amber-300'}>
            {recsReadyCount}/{pkg.recordings.length}
          </span>
        </span>
        <span className="text-xs text-white/40">
          A work is ready when writers total 100%; a recording when it has an ISRC.
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-indigo-400/20 bg-indigo-400/[0.04] p-4 text-xs text-white/60">
        Register the <span className="text-white/80">work</span> (the composition) with your PRO
        and The MLC; register the <span className="text-white/80">recording</span> (the master)
        with SoundExchange. A writer registers a work with the one PRO they belong to.
      </div>

      {/* Copyright — distinct from the royalty bodies below */}
      <section className="mt-8">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-white/40">©</span>
          <h2 className="text-base font-semibold text-white">Copyright — US Copyright Office</h2>
        </div>
        <p className="mt-0.5 text-xs text-white/40">
          Separate from the royalty bodies below — this registers ownership of the work itself.
        </p>
        <div className="mt-3">
          <CopyrightFiling projectId={projectId} filed={copyrightFiled} />
        </div>
      </section>

      {/* 1 — Performance PROs */}
      <Body
        n="1"
        title="Performance — ASCAP / BMI / SESAC"
        sub="Register each work (composition)."
        portals={[
          { href: 'https://www.ascap.com/music-creators', label: 'ASCAP' },
          { href: 'https://www.bmi.com/songwriters', label: 'BMI' },
          { href: 'https://www.sesac.com', label: 'SESAC' },
        ]}
      >
        {pkg.usProsPresent.length > 0 && (
          <p className="text-xs text-white/50">
            PROs among your writers:{' '}
            <span className="text-white/80">{pkg.usProsPresent.join(', ')}</span>
          </p>
        )}
        {pkg.foreignProsPresent.length > 0 && (
          <p className="mt-1 text-xs text-amber-300/80">
            Non-US PROs (register via their own society): {pkg.foreignProsPresent.join(', ')}
          </p>
        )}
        {pkg.works.length === 0 ? (
          <Empty>No works with writers captured yet — add composers in the Studio.</Empty>
        ) : (
          <div className="mt-3 space-y-3">
            {pkg.works.map((w, i) => (
              <WorkCard key={i} w={w} showRecording />
            ))}
          </div>
        )}
      </Body>

      {/* 2 — The MLC */}
      <Body
        n="2"
        title="Mechanical — The MLC"
        sub="Register each work, then link its recording."
        portals={[{ href: 'https://www.themlc.com', label: 'The MLC' }]}
      >
        {pkg.works.length === 0 ? (
          <Empty>No works with writers captured yet.</Empty>
        ) : (
          <div className="mt-3 space-y-3">
            {pkg.works.map((w, i) => (
              <WorkCard key={i} w={w} showRecording mechanical />
            ))}
          </div>
        )}
      </Body>

      {/* 3 — SoundExchange */}
      <Body
        n="3"
        title="Digital performance — SoundExchange"
        sub="Register each recording (the master)."
        portals={[{ href: 'https://www.soundexchange.com', label: 'SoundExchange' }]}
      >
        <div className="mt-3 space-y-3">
          {pkg.recordings.map((r, i) => (
            <RecordingCard key={i} r={r} />
          ))}
        </div>
      </Body>
    </div>
  )
}

function Body({
  n,
  title,
  sub,
  portals,
  children,
}: {
  n: string
  title: string
  sub: string
  portals?: { href: string; label: string }[]
  children: React.ReactNode
}) {
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-white/40">{n}.</span>
          <h2 className="text-base font-semibold text-white">{title}</h2>
        </div>
        {portals && portals.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {portals.map(p => (
              <a
                key={p.href}
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-medium text-white/70 transition hover:border-white/30 hover:text-white"
              >
                {p.label} ↗
              </a>
            ))}
          </div>
        )}
      </div>
      <p className="mt-0.5 text-xs text-white/40">{sub}</p>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function WorkCard({
  w,
  showRecording,
  mechanical,
}: {
  w: RegWork
  showRecording?: boolean
  mechanical?: boolean
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white">{w.title}</p>
          {w.writers.length > 0 && w.shareOk ? (
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
              Ready
            </span>
          ) : (
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
              {w.writers.length === 0 ? 'Needs writers' : 'Splits ≠ 100%'}
            </span>
          )}
        </div>
        <span className="text-xs text-white/40">ISWC {v(w.iswc)}</span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-white/60 sm:grid-cols-3">
        {!mechanical && <Field label="Duration" value={durationStr(w.durationSeconds)} />}
        <Field label="Publisher" value={w.publisher} />
        {showRecording && <Field label="Recording ISRC" value={v(w.isrc)} />}
        {showRecording && <Field label="Performing artist" value={w.performingArtist} />}
        {mechanical && <Field label="Release date" value={v(w.releaseDate)} />}
      </dl>
      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Writers</p>
        <div className="mt-1 space-y-1">
          {w.writers.map((wr, i) => (
            <p key={i} className="text-xs text-white/70">
              <span className="text-white/90">{wr.name}</span> · {wr.role} · {wr.pro} · IPI{' '}
              {v(wr.ipi)} · <span className="text-white/90">{wr.share}%</span>
            </p>
          ))}
        </div>
        <p className={`mt-1 text-xs ${w.shareOk ? 'text-emerald-300/80' : 'text-amber-300'}`}>
          Writer share total: {w.shareTotal}%{w.shareOk ? '' : ' — must equal 100%'}
        </p>
      </div>
    </div>
  )
}

function RecordingCard({ r }: { r: RegRecording }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white">{r.title}</p>
          {r.isrc ? (
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
              Ready
            </span>
          ) : (
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
              Needs ISRC
            </span>
          )}
        </div>
        <span className="text-xs text-white/40">ISRC {v(r.isrc)}</span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-white/60 sm:grid-cols-3">
        <Field label="Featured artist" value={r.featuredArtist} />
        <Field label="Rights owner (master)" value={r.rightsOwner} />
        <Field label="Album" value={r.album} />
        <Field label="UPC" value={v(r.upc)} />
        <Field label="Release date" value={v(r.releaseDate)} />
      </dl>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-white/40">{label}</dt>
      <dd className="text-white/80">{value}</dd>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm text-white/40">{children}</p>
}
