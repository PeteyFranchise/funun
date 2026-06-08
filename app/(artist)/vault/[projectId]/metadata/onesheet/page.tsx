import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getDemoProject } from '@/lib/vault/demo-store'
import { buildBundle, type ProjectRow, type TrackRow } from '@/lib/metadata/bundle'
import { artistCredit, COMPOSER_ROLE_LABELS, PRO_LABELS } from '@/lib/metadata/schema'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

const PROJECT_COLS =
  'title, type, genre, sub_genre, release_date, upc, cover_art_url, label, publisher, c_line, p_line, copyright_year, primary_language, contact_name, contact_email, contact_phone'
const TRACK_COLS =
  'id, title, track_number, isrc, iswc, duration_seconds, bpm, key_signature, explicit, language, featuring_artists, audio_file_url, metadata'

function fmtDuration(s: number | null): string {
  if (!s) return '—'
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// A print-friendly metadata one-sheet — open in a new tab and print / save
// to PDF, then email to radio, DJs, or licensing partners.
export default async function OneSheetPage({
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
    }
  }

  if (!projectRow) notFound()

  const bundle = buildBundle(projectRow, trackRows, artistName)
  const r = bundle.rights

  return (
    <main className="onesheet mx-auto max-w-3xl bg-white p-10 text-neutral-900">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>

      <div className="no-print mb-6 flex justify-end">
        <PrintHint />
      </div>

      <header className="border-b-2 border-neutral-900 pb-4">
        <p className="text-xs uppercase tracking-widest text-neutral-500">
          {bundle.releaseType}
          {bundle.genre ? ` · ${bundle.genre}` : ''}
          {bundle.sub_genre ? ` · ${bundle.sub_genre}` : ''}
        </p>
        <h1 className="mt-1 text-3xl font-bold">{bundle.releaseTitle}</h1>
        <p className="mt-1 text-lg text-neutral-700">{bundle.artistName}</p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-neutral-600">
          {bundle.release_date && <span>Release: {bundle.release_date}</span>}
          {bundle.upc && <span>UPC: {bundle.upc}</span>}
          {r.label && <span>Label: {r.label}</span>}
        </div>
      </header>

      <section className="mt-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Tracks</h2>
        <div className="mt-3 space-y-4">
          {bundle.tracks.map((t, i) => (
            <div key={i} className="rounded border border-neutral-200 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold">
                  {t.track_number != null && <span className="text-neutral-400">{t.track_number}. </span>}
                  {t.title}
                  {t.explicit && (
                    <span className="ml-2 rounded bg-neutral-900 px-1 text-[10px] font-bold text-white">E</span>
                  )}
                </p>
                <span className="shrink-0 text-sm text-neutral-500">{fmtDuration(t.duration_seconds)}</span>
              </div>
              <p className="mt-1 text-sm text-neutral-600">
                {artistCredit(bundle.artistName, t.featuring_artists)}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-neutral-600 sm:grid-cols-3">
                <Field label="ISRC" value={t.isrc} />
                <Field label="ISWC" value={t.iswc} />
                <Field label="BPM" value={t.bpm != null ? String(t.bpm) : null} />
                <Field label="Key" value={t.key_signature} />
                <Field label="Language" value={t.language ?? r.primary_language} />
              </dl>
              {t.composers.length > 0 && (
                <div className="mt-2 text-xs text-neutral-600">
                  <span className="font-semibold text-neutral-500">Writers: </span>
                  {t.composers
                    .map(
                      c =>
                        `${c.name} (${COMPOSER_ROLE_LABELS[c.role]}, ${c.split}%${
                          c.pro && c.pro !== 'none' ? `, ${PRO_LABELS[c.pro]}` : ''
                        })`
                    )
                    .join('; ')}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 border-t border-neutral-200 pt-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Rights & Contact</h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
          <Field label="℗ (sound recording)" value={r.p_line} />
          <Field label="© (composition)" value={r.c_line} />
          <Field label="Publisher" value={r.publisher} />
          <Field label="Label" value={r.label} />
          <Field label="Contact" value={r.contact_name} />
          <Field label="Email" value={r.contact_email} />
          <Field label="Phone" value={r.contact_phone} />
        </dl>
      </section>

      <footer className="mt-8 border-t border-neutral-200 pt-3 text-xs text-neutral-400">
        Prepared with ArtistOS Metadata Studio
      </footer>
    </main>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <dt className="inline font-semibold text-neutral-500">{label}: </dt>
      <dd className="inline text-neutral-800">{value}</dd>
    </div>
  )
}

function PrintHint() {
  return (
    <span className="rounded border border-neutral-300 px-3 py-1.5 text-xs text-neutral-500">
      Use your browser&apos;s Print → Save as PDF to share this sheet.
    </span>
  )
}
