import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getDemoProject } from '@/lib/vault/demo-store'
import { buildBundle, type ProjectRow, type TrackRow } from '@/lib/metadata/bundle'
import {
  assessCwrReadiness,
  defaultSelfSubmitSender,
  type CwrWorkStatus,
} from '@/lib/metadata/cwr'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

const PROJECT_COLS =
  'title, type, genre, sub_genre, release_date, upc, cover_art_url, label, publisher, c_line, p_line, copyright_year, primary_language, contact_name, contact_email, contact_phone'
const TRACK_COLS =
  'id, title, track_number, isrc, iswc, duration_seconds, bpm, key_signature, explicit, language, featuring_artists, audio_file_url, metadata'

export default async function CwrPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  let projectRow: ProjectRow | null = null
  let trackRows: TrackRow[] = []
  let artistName = ''

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
    const supabase = await createServerClient()
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
    }
  }

  if (!projectRow) notFound()

  const bundle = buildBundle(projectRow, trackRows, artistName)
  const sender = defaultSelfSubmitSender(bundle)
  const readiness = assessCwrReadiness(
    { tracks: bundle.tracks, publisher: bundle.rights.publisher },
    sender
  )

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Link
        href={`/vault/${projectId}/metadata/registrations`}
        className="text-sm text-white/50 transition hover:text-white"
      >
        ← Back to registration packages
      </Link>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/40">CWR export</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Common Works Registration</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/50">
            The machine-readable file composition societies accept for registering your works. We
            build it from the metadata you already captured — for the works that are ready.
          </p>
        </div>
        <a
          href={`/api/vault/${projectId}/metadata/cwr`}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
            readiness.hasReady
              ? 'border-white/15 text-white/70 hover:border-white/30 hover:text-white'
              : 'pointer-events-none border-white/5 text-white/20'
          }`}
        >
          Download .V21
        </a>
      </div>

      <div className="mt-4 rounded-xl border border-indigo-400/20 bg-indigo-400/[0.04] p-4 text-xs text-white/60">
        This is a <span className="text-white/80">draft export</span>. Two things gate actual
        submission, and neither is something we can issue: every writer needs an{' '}
        <span className="text-white/80">IPI</span> (you get one by joining a PRO), and the file
        needs a <span className="text-white/80">sender ID</span> the society has onboarded.
        Funūn becoming that central sender is the next phase — for now this file is yours to
        validate and hold.
      </div>

      {/* Readiness summary */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-white">Work readiness</h2>
          <span className="text-xs text-white/50">
            {readiness.readyCount} of {readiness.totalWorks} ready
          </span>
        </div>
        {readiness.totalWorks === 0 ? (
          <p className="mt-3 text-sm text-white/40">
            No works with writers captured yet — add composers in the Metadata Studio.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {readiness.works.map((w, i) => (
              <WorkStatusCard key={i} w={w} />
            ))}
          </div>
        )}
      </section>

      {/* Acquisition guidance */}
      <section className="mt-10">
        <h2 className="text-base font-semibold text-white">Getting submission-ready</h2>
        <div className="mt-3 space-y-3">
          <Step
            n="1"
            title="Each writer needs an IPI"
            body="An IPI is assigned when a songwriter joins a PRO (ASCAP, BMI, or SESAC in the US). It's the only way to get one — there's no separate registry. Once a writer has theirs, add it on their credit in the Metadata Studio."
          />
          <Step
            n="2"
            title="Splits must total 100% per work"
            body="CWR rejects a work whose writer shares don't reconcile. Fix any work flagged above before you rely on its file."
          />
          <Step
            n="3"
            title="Writer-controlled only, for now"
            body="We register works where the writers control them (self-published). If you name a third-party publisher, CWR needs the writer-vs-publisher share breakdown, which we don't capture yet — that's on the roadmap."
          />
          <Step
            n="4"
            title="A sender ID is the real gate"
            body="Societies only accept CWR from a submitter they've onboarded. Most indie writers don't have one — which is why Funūn is working toward becoming the central registered sender, so you won't need your own."
          />
        </div>
      </section>
    </div>
  )
}

function WorkStatusCard({ w }: { w: CwrWorkStatus }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        w.ready
          ? 'border-emerald-400/20 bg-emerald-400/[0.04]'
          : 'border-amber-400/20 bg-amber-400/[0.04]'
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-white">{w.title}</p>
        <span className={`text-xs ${w.ready ? 'text-emerald-300/80' : 'text-amber-300'}`}>
          {w.ready ? 'Ready' : 'Needs attention'}
        </span>
      </div>
      {w.errors.length > 0 && (
        <ul className="mt-2 space-y-1">
          {w.errors.map((e, i) => (
            <li key={i} className="text-xs text-amber-200/90">
              • {e}
            </li>
          ))}
        </ul>
      )}
      {w.warnings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {w.warnings.map((e, i) => (
            <li key={i} className="text-xs text-white/50">
              ⚠ {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <span className="text-sm font-semibold text-white/40">{n}.</span>
      <div>
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="mt-0.5 text-xs text-white/50">{body}</p>
      </div>
    </div>
  )
}
