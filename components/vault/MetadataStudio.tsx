'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  COMPOSER_ROLE_LABELS,
  COMPOSER_ROLE_VALUES,
  LANGUAGES,
  PRO_LABELS,
  PRO_VALUES,
  PERFORMER_ROLES,
  PERFORMER_ROLE_LABELS,
  ORIGINAL_PURPOSES,
  ORIGINAL_PURPOSE_LABELS,
  type Composer,
  type Performer,
} from '@/lib/metadata/schema'
import { validateRelease, type ValidationReport } from '@/lib/metadata/validate'
import { isValidIswc, isValidIswcShape } from '@/lib/metadata/identifiers'
import { assessCwrReadiness, type CwrReadiness } from '@/lib/metadata/cwr'

// ─── MetadataStudio ──────────────────────────────────────────────────
// Capture UI for everything a release needs before delivery: release-level
// rights & contact, per-track identifiers and composer splits, a live
// validation report, and the export/embed actions.

type StudioTrack = {
  id: string
  title: string
  track_number: number | null
  isrc: string
  iswc: string
  language: string
  audio_file_url: string | null
  composers: Composer[]
  lyrics: string
  lyricsExplicit: boolean
  performers: Performer[]
  recordingDate: string
  recordingCountry: string
  originalPurpose: string
  commerciallyAvailable: boolean
}

type ReleaseState = {
  upc: string
  label: string
  publisher: string
  c_line: string
  p_line: string
  copyright_year: string
  primary_language: string
  contact_name: string
  contact_email: string
  contact_phone: string
}

const LEVEL_DOT: Record<'error' | 'warn' | 'ok', string> = {
  error: 'bg-rose-400',
  warn: 'bg-amber-400',
  ok: 'bg-emerald-400',
}

export function MetadataStudio({
  projectId,
  releaseTitle,
  releaseType,
  genre,
  subGenre,
  coverArtUrl,
  coverWidth,
  coverHeight,
  initialRelease,
  initialTracks,
}: {
  projectId: string
  releaseTitle: string
  releaseType: string
  genre: string | null
  subGenre: string | null
  coverArtUrl: string | null
  coverWidth: number | null
  coverHeight: number | null
  initialRelease: ReleaseState
  initialTracks: StudioTrack[]
}) {
  const router = useRouter()
  const [release, setRelease] = useState<ReleaseState>(initialRelease)
  const [tracks, setTracks] = useState<StudioTrack[]>(initialTracks)
  const [savingRelease, setSavingRelease] = useState(false)
  const [savingTrack, setSavingTrack] = useState<string | null>(null)
  const [embedState, setEmbedState] = useState<Record<string, { busy: boolean; url?: string; msg?: string }>>({})
  const [isrcState, setIsrcState] = useState<Record<string, { busy: boolean; msg?: string; needsSetup?: boolean }>>({})

  const report: ValidationReport = useMemo(
    () =>
      validateRelease({
        title: releaseTitle,
        type: releaseType,
        upc: release.upc || null,
        cover_art_url: coverArtUrl,
        cover_width: coverWidth,
        cover_height: coverHeight,
        rights: {
          label: release.label || null,
          publisher: release.publisher || null,
          c_line: release.c_line || null,
          p_line: release.p_line || null,
          copyright_year: release.copyright_year ? Number(release.copyright_year) : null,
          primary_language: release.primary_language || null,
          contact_name: release.contact_name || null,
          contact_email: release.contact_email || null,
          contact_phone: release.contact_phone || null,
        },
        tracks: tracks.map(t => ({
          id: t.id,
          title: t.title,
          isrc: t.isrc || null,
          iswc: t.iswc || null,
          audio_file_url: t.audio_file_url,
          composers: t.composers,
        })),
      }),
    [release, tracks, releaseTitle, releaseType, coverArtUrl, coverWidth, coverHeight]
  )

  const cwrReadiness: CwrReadiness = useMemo(
    () =>
      assessCwrReadiness({
        tracks: tracks.map(t => ({ title: t.title, composers: t.composers })),
        publisher: release.publisher || null,
      }),
    [tracks, release.publisher]
  )

  function setReleaseField(k: keyof ReleaseState, v: string) {
    setRelease(prev => ({ ...prev, [k]: v }))
  }

  async function saveRelease() {
    setSavingRelease(true)
    try {
      await fetch(`/api/vault/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upc: release.upc || null,
          label: release.label || null,
          publisher: release.publisher || null,
          c_line: release.c_line || null,
          p_line: release.p_line || null,
          copyright_year: release.copyright_year || null,
          primary_language: release.primary_language || null,
          contact_name: release.contact_name || null,
          contact_email: release.contact_email || null,
          contact_phone: release.contact_phone || null,
        }),
      })
      router.refresh()
    } finally {
      setSavingRelease(false)
    }
  }

  function setTrack(id: string, patch: Partial<StudioTrack>) {
    setTracks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)))
  }

  async function saveTrack(t: StudioTrack) {
    setSavingTrack(t.id)
    try {
      await fetch(`/api/vault/${projectId}/tracks/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isrc: t.isrc || null,
          iswc: t.iswc || null,
          language: t.language || null,
          metadata: {
            composers: t.composers,
            lyrics: t.lyrics.trim()
              ? { text: t.lyrics, language: t.language || undefined, explicit: t.lyricsExplicit }
              : null,
            performers: t.performers,
            recording:
              t.recordingDate || t.recordingCountry || t.originalPurpose
                ? {
                    recordingDate: t.recordingDate || undefined,
                    recordingCountry: t.recordingCountry || undefined,
                    originalPurpose: t.originalPurpose || undefined,
                    commerciallyAvailable: t.commerciallyAvailable,
                  }
                : null,
          },
        }),
      })
      router.refresh()
    } finally {
      setSavingTrack(null)
    }
  }

  async function embed(t: StudioTrack) {
    setEmbedState(s => ({ ...s, [t.id]: { busy: true } }))
    try {
      const res = await fetch(`/api/vault/${projectId}/tracks/${t.id}/metadata/embed`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) {
        setEmbedState(s => ({ ...s, [t.id]: { busy: false, msg: json.error ?? 'Embed failed' } }))
        return
      }
      setEmbedState(s => ({ ...s, [t.id]: { busy: false, url: json.data?.url, msg: 'Tagged copy ready.' } }))
    } catch {
      setEmbedState(s => ({ ...s, [t.id]: { busy: false, msg: 'Network error' } }))
    }
  }

  async function generateIsrc(t: StudioTrack) {
    setIsrcState(s => ({ ...s, [t.id]: { busy: true } }))
    try {
      const res = await fetch(`/api/vault/${projectId}/tracks/${t.id}/isrc`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setIsrcState(s => ({
          ...s,
          [t.id]: { busy: false, msg: json.error ?? 'Could not generate', needsSetup: json.needsSetup },
        }))
        return
      }
      setTrack(t.id, { isrc: json.data.isrc })
      setIsrcState(s => ({ ...s, [t.id]: { busy: false } }))
    } catch {
      setIsrcState(s => ({ ...s, [t.id]: { busy: false, msg: 'Network error' } }))
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/40">Metadata Studio</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Prepare the release metadata</h1>
          <p className="mt-1 text-sm text-white/50">
            Everything radio, DJs, licensing, and distributors need — captured once, exported anywhere.
          </p>
        </div>
        <ExportBar projectId={projectId} ready={report.ready} />
      </div>

      {/* Validation summary */}
      <ValidationPanel report={report} />

      {/* Release-level rights & contact */}
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-sm font-semibold text-white">Release rights & contact</h2>
        <p className="mt-0.5 text-xs text-white/40">
          Shared across every track on {releaseTitle}.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField label="UPC / Barcode" value={release.upc} onChange={v => setReleaseField('upc', v)} placeholder="12–13 digits (distributor often assigns)" />
          <TextField label="Label" value={release.label} onChange={v => setReleaseField('label', v)} placeholder="Your label or imprint" />
          <TextField label="℗ line (sound recording)" value={release.p_line} onChange={v => setReleaseField('p_line', v)} placeholder="℗ 2026 Your Name" />
          <TextField label="© line (composition)" value={release.c_line} onChange={v => setReleaseField('c_line', v)} placeholder="© 2026 Your Name" />
          <TextField label="Publisher" value={release.publisher} onChange={v => setReleaseField('publisher', v)} placeholder="Publishing entity (or self)" />
          <TextField label="Copyright year" value={release.copyright_year} onChange={v => setReleaseField('copyright_year', v.replace(/[^\d]/g, ''))} placeholder="2026" />
          <SelectField label="Primary language" value={release.primary_language} onChange={v => setReleaseField('primary_language', v)} options={[{ value: '', label: '—' }, ...LANGUAGES.map(l => ({ value: l.code, label: l.label }))]} />
          <div className="hidden sm:block" />
          <TextField label="Contact name" value={release.contact_name} onChange={v => setReleaseField('contact_name', v)} placeholder="Who to reach" />
          <TextField label="Contact email" value={release.contact_email} onChange={v => setReleaseField('contact_email', v)} placeholder="you@email.com" />
          <TextField label="Contact phone" value={release.contact_phone} onChange={v => setReleaseField('contact_phone', v)} placeholder="Optional" />
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={saveRelease}
            disabled={savingRelease}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
          >
            {savingRelease ? 'Saving…' : 'Save release info'}
          </button>
        </div>
      </section>

      {/* Per-track */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          Tracks · {tracks.length}
        </h2>
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] p-3 text-xs leading-relaxed text-white/60">
          <span className="font-semibold text-amber-200/90">Get writers paid:</span> enter each writer&rsquo;s{' '}
          <span className="text-white/80">full legal name exactly as registered with their PRO</span> — the same
          spelling on every release (middle name/initial, prefix, and suffix included) — plus their{' '}
          <span className="text-white/80">IPI/CAE number</span>. Stage names, nicknames, or inconsistent spelling
          stop royalty services from matching the money to them, and it can sit unclaimed for years.
        </div>
        {tracks.map(t => {
          const splitTotal = Math.round(t.composers.reduce((s, c) => s + (c.split || 0), 0) * 100) / 100
          const es = embedState[t.id]
          const canEmbedMp3 = (t.audio_file_url ?? '').toLowerCase().split('?')[0].endsWith('.mp3')
          return (
            <div key={t.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-white">
                  {t.track_number != null && <span className="text-white/40">{t.track_number}. </span>}
                  {t.title}
                </p>
                {savingTrack === t.id && <span className="text-xs text-white/40">Saving…</span>}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <IsrcField
                  value={t.isrc}
                  onChange={v => setTrack(t.id, { isrc: v.toUpperCase() })}
                  onGenerate={() => generateIsrc(t)}
                  state={isrcState[t.id]}
                />
                <IswcField value={t.iswc} onChange={v => setTrack(t.id, { iswc: v.toUpperCase() })} />
                <SelectField label="Language" value={t.language} onChange={v => setTrack(t.id, { language: v })} options={[{ value: '', label: 'Use release default' }, ...LANGUAGES.map(l => ({ value: l.code, label: l.label }))]} />
              </div>

              {/* Composers */}
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Composers & publishing splits</p>
                  <span className={`text-xs font-medium ${splitTotal === 100 ? 'text-emerald-300' : 'text-amber-300'}`}>{splitTotal}%</span>
                </div>
                <ComposerEditor
                  composers={t.composers}
                  onChange={composers => setTrack(t.id, { composers })}
                />
              </div>

              {/* Lyrics */}
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Lyrics</p>
                  <label className="flex items-center gap-1.5 text-xs text-white/50">
                    <input
                      type="checkbox"
                      checked={t.lyricsExplicit}
                      onChange={e => setTrack(t.id, { lyricsExplicit: e.target.checked })}
                      className="accent-fuchsia-500"
                    />
                    Explicit
                  </label>
                </div>
                <textarea
                  value={t.lyrics}
                  onChange={e => setTrack(t.id, { lyrics: e.target.value.slice(0, 20000) })}
                  rows={t.lyrics ? 8 : 3}
                  placeholder={t.language === 'zxx' ? 'Instrumental — no lyrics.' : 'Paste the song lyrics… (embedded into the file as ID3 lyrics and the metadata sidecar)'}
                  className="mt-2 w-full resize-y rounded-lg border border-white/15 bg-[#0E0D1E] px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
                />
                <p className="mt-1 text-right text-[11px] text-white/30">{t.lyrics.length.toLocaleString()} / 20,000</p>
              </div>

              {/* Performers & neighbouring rights (DDEX RDR-N / SoundExchange, PPL …) */}
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/40">
                    Performers &amp; neighbouring rights
                  </p>
                  <span className="text-[11px] text-white/30">for SoundExchange / PPL collection</span>
                </div>
                <PerformerEditor
                  performers={t.performers}
                  onChange={performers => setTrack(t.id, { performers })}
                />
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <label className="block">
                    <span className="text-xs text-white/40">Recording date</span>
                    <input
                      type="date"
                      value={t.recordingDate}
                      onChange={e => setTrack(t.id, { recordingDate: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-white/40">Country of recording</span>
                    <input
                      value={t.recordingCountry}
                      onChange={e => setTrack(t.id, { recordingCountry: e.target.value.toUpperCase().slice(0, 2) })}
                      placeholder="US"
                      maxLength={2}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm uppercase text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
                    />
                  </label>
                  <SelectField
                    label="Original purpose"
                    value={t.originalPurpose}
                    onChange={v => setTrack(t.id, { originalPurpose: v })}
                    options={[{ value: '', label: '—' }, ...ORIGINAL_PURPOSES.map(p => ({ value: p, label: ORIGINAL_PURPOSE_LABELS[p] }))]}
                  />
                  <label className="flex items-end gap-2 pb-2">
                    <input
                      type="checkbox"
                      checked={t.commerciallyAvailable}
                      onChange={e => setTrack(t.id, { commerciallyAvailable: e.target.checked })}
                      className="accent-fuchsia-500"
                    />
                    <span className="text-xs text-white/60">Commercially available</span>
                  </label>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => saveTrack(t)}
                  disabled={savingTrack === t.id}
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
                >
                  Save track
                </button>
                <a
                  href={`/api/vault/${projectId}/tracks/${t.id}/metadata/sidecar`}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/30 hover:text-white"
                >
                  Download sidecar (.txt)
                </a>
                <button
                  onClick={() => embed(t)}
                  disabled={!canEmbedMp3 || es?.busy}
                  title={canEmbedMp3 ? 'Write tags into the MP3' : 'Embedding needs an MP3 — use the sidecar for other formats'}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-30"
                >
                  {es?.busy ? 'Embedding…' : 'Embed in MP3'}
                </button>
                {es?.url && (
                  <a href={es.url} className="text-xs font-medium text-indigo-300 hover:text-indigo-200">
                    Download tagged file →
                  </a>
                )}
                {es?.msg && !es.url && <span className="text-xs text-white/40">{es.msg}</span>}
              </div>
            </div>
          )
        })}
      </section>

      {/* CWR registration readiness */}
      <CwrReadinessPanel readiness={cwrReadiness} projectId={projectId} />

      <div className="flex items-center justify-between border-t border-white/10 pt-6">
        <Link href={`/vault/${projectId}`} className="text-sm text-white/50 transition hover:text-white">
          ← Back to project
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/vault/${projectId}/metadata/registrations`}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/30 hover:text-white"
          >
            Registration packages →
          </Link>
          <Link
            href={`/vault/${projectId}/metadata/onesheet`}
            target="_blank"
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/30 hover:text-white"
          >
            Open one-sheet ↗
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── Validation panel ────────────────────────────────────────────────
function ValidationPanel({ report }: { report: ValidationReport }) {
  const shown = report.checks.filter(c => c.level !== 'ok')
  return (
    <div
      className={`rounded-xl border p-4 ${
        report.errors > 0
          ? 'border-rose-400/30 bg-rose-400/[0.04]'
          : report.warnings > 0
            ? 'border-amber-400/30 bg-amber-400/[0.04]'
            : 'border-emerald-400/30 bg-emerald-400/[0.04]'
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">
          {report.errors > 0
            ? `${report.errors} ${report.errors === 1 ? 'issue' : 'issues'} to fix before delivery`
            : report.warnings > 0
              ? `Ready — ${report.warnings} ${report.warnings === 1 ? 'recommendation' : 'recommendations'}`
              : 'All checks pass — ready to deliver'}
        </p>
        <span className="text-xs text-white/40">
          {report.errors} errors · {report.warnings} warnings
        </span>
      </div>
      {shown.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {shown.map(c => (
            <li key={c.key} className="flex items-start gap-2 text-xs">
              <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${LEVEL_DOT[c.level]}`} />
              <span className="text-white/70">
                <span className="text-white/90">{c.field}</span>
                {c.trackTitle ? <span className="text-white/40"> · {c.trackTitle}</span> : null} — {c.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── CWR readiness panel ─────────────────────────────────────────────
// Compact summary of how many works are ready for Common Works Registration;
// the full per-work breakdown + export live at /metadata/cwr.
function CwrReadinessPanel({
  readiness,
  projectId,
}: {
  readiness: CwrReadiness
  projectId: string
}) {
  const { totalWorks, readyCount } = readiness
  const allReady = totalWorks > 0 && readyCount === totalWorks
  const noneReady = readyCount === 0

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white">PRO registration (CWR)</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                totalWorks === 0
                  ? 'bg-white/10 text-white/50'
                  : allReady
                    ? 'bg-emerald-400/15 text-emerald-200'
                    : noneReady
                      ? 'bg-amber-400/15 text-amber-200'
                      : 'bg-amber-400/10 text-amber-200/90'
              }`}
            >
              {totalWorks === 0 ? 'No works yet' : `${readyCount}/${totalWorks} ready`}
            </span>
          </div>
          <p className="mt-1 max-w-xl text-xs text-white/50">
            {totalWorks === 0
              ? 'Add composers to a track to register its work with your PRO and The MLC.'
              : allReady
                ? 'Every work has the IPIs, society, and splits CWR needs. Open the export to download a draft file.'
                : 'Some works are missing the IPIs, society, or splits CWR needs. Open the export to see exactly what each one needs.'}
          </p>
        </div>
        <Link
          href={`/vault/${projectId}/metadata/cwr`}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/30 hover:text-white"
        >
          CWR export →
        </Link>
      </div>

      {totalWorks > 0 && !allReady && (
        <ul className="mt-3 space-y-1.5">
          {readiness.works
            .filter(w => !w.ready)
            .slice(0, 4)
            .map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                <span className="text-white/70">
                  <span className="text-white/90">{w.title}</span> — {w.errors[0]}
                </span>
              </li>
            ))}
        </ul>
      )}
    </section>
  )
}

// ─── Export bar ──────────────────────────────────────────────────────
function ExportBar({ projectId, ready }: { projectId: string; ready: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <a
        href={`/api/vault/${projectId}/metadata/export?format=csv`}
        className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/30 hover:text-white"
      >
        Export CSV
      </a>
      <a
        href={`/api/vault/${projectId}/metadata/export?format=ddex`}
        className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/30 hover:text-white"
      >
        DDEX ERN
      </a>
      <a
        href={`/api/vault/${projectId}/metadata/export?format=rdr`}
        className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/30 hover:text-white"
      >
        RDR-N XML
      </a>
      {!ready && <span className="text-xs text-amber-300/80">exports include current data</span>}
    </div>
  )
}

// ─── Composer editor ─────────────────────────────────────────────────
function ComposerEditor({
  composers,
  onChange,
}: {
  composers: Composer[]
  onChange: (next: Composer[]) => void
}) {
  function set(i: number, patch: Partial<Composer>) {
    onChange(composers.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }
  function add() {
    onChange([...composers, { name: '', role: 'composer_lyricist', pro: 'none', split: 0 }])
  }
  function remove(i: number) {
    onChange(composers.filter((_, idx) => idx !== i))
  }

  return (
    <div className="mt-2 space-y-2">
      {composers.map((c, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2 sm:grid-cols-12">
          <input
            value={c.name}
            onChange={e => set(i, { name: e.target.value })}
            placeholder="Full legal name (PRO-registered)"
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none sm:col-span-3"
          />
          <select
            value={c.role}
            onChange={e => set(i, { role: e.target.value as Composer['role'] })}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white focus:border-white/30 focus:outline-none sm:col-span-3"
          >
            {COMPOSER_ROLE_VALUES.map(r => (
              <option key={r} value={r} className="bg-[#0a0a0f]">{COMPOSER_ROLE_LABELS[r]}</option>
            ))}
          </select>
          <select
            value={c.pro}
            onChange={e => set(i, { pro: e.target.value as Composer['pro'] })}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white focus:border-white/30 focus:outline-none sm:col-span-2"
          >
            {PRO_VALUES.map(p => (
              <option key={p} value={p} className="bg-[#0a0a0f]">{PRO_LABELS[p]}</option>
            ))}
          </select>
          <input
            value={c.ipi ?? ''}
            onChange={e => set(i, { ipi: e.target.value })}
            placeholder="IPI #"
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none sm:col-span-2"
          />
          <div className="flex items-center gap-1 sm:col-span-2">
            <div className="relative flex-1">
              <input
                type="number"
                min={0}
                max={100}
                value={c.split || ''}
                onChange={e => set(i, { split: Number(e.target.value) || 0 })}
                placeholder="0"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 pr-6 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white/40">%</span>
            </div>
            <button
              onClick={() => remove(i)}
              className="shrink-0 rounded-lg border border-white/10 p-1.5 text-white/40 transition hover:border-rose-400/40 hover:text-rose-300"
              aria-label="Remove writer"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <input
            type="email"
            value={c.email ?? ''}
            onChange={e => set(i, { email: e.target.value })}
            placeholder="Writer email — for e-signature"
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none sm:col-span-6"
          />
          <input
            type="tel"
            value={c.phone ?? ''}
            onChange={e => set(i, { phone: e.target.value })}
            placeholder="Writer mobile — for SMS confirmation (optional)"
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none sm:col-span-6"
          />
        </div>
      ))}
      <button
        onClick={add}
        className="w-full rounded-lg border border-dashed border-white/15 px-3 py-1.5 text-xs text-white/50 transition hover:border-white/30 hover:text-white"
      >
        + Add writer
      </button>
    </div>
  )
}

// ─── Performer editor (neighbouring rights / DDEX RDR-N) ─────────────
function PerformerEditor({
  performers,
  onChange,
}: {
  performers: Performer[]
  onChange: (next: Performer[]) => void
}) {
  function set(i: number, patch: Partial<Performer>) {
    onChange(performers.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  }
  function add() {
    onChange([...performers, { name: '', role: 'featured' }])
  }
  function remove(i: number) {
    onChange(performers.filter((_, idx) => idx !== i))
  }

  return (
    <div className="mt-2 space-y-2">
      {performers.map((p, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2 sm:grid-cols-12">
          <input
            value={p.name}
            onChange={e => set(i, { name: e.target.value })}
            placeholder="Performer name"
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none sm:col-span-3"
          />
          <select
            value={p.role}
            onChange={e => set(i, { role: e.target.value as Performer['role'] })}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white focus:border-white/30 focus:outline-none sm:col-span-3"
          >
            {PERFORMER_ROLES.map(r => (
              <option key={r} value={r} className="bg-[#0a0a0f]">{PERFORMER_ROLE_LABELS[r]}</option>
            ))}
          </select>
          <input
            value={p.contribution ?? ''}
            onChange={e => set(i, { contribution: e.target.value })}
            placeholder="Contribution (e.g. Lead vocals)"
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none sm:col-span-3"
          />
          <input
            value={p.isni ?? ''}
            onChange={e => set(i, { isni: e.target.value })}
            placeholder="ISNI / IPN"
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none sm:col-span-2"
          />
          <div className="flex items-center justify-end sm:col-span-1">
            <button
              onClick={() => remove(i)}
              className="shrink-0 rounded-lg border border-white/10 p-1.5 text-white/40 transition hover:border-rose-400/40 hover:text-rose-300"
              aria-label="Remove performer"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={add}
        className="w-full rounded-lg border border-dashed border-white/15 px-3 py-1.5 text-xs text-white/50 transition hover:border-white/30 hover:text-white"
      >
        + Add performer
      </button>
    </div>
  )
}

// ─── ISRC field (with one-click generation) ──────────────────────────
function IsrcField({
  value,
  onChange,
  onGenerate,
  state,
}: {
  value: string
  onChange: (v: string) => void
  onGenerate: () => void
  state?: { busy: boolean; msg?: string; needsSetup?: boolean }
}) {
  return (
    <label className="block">
      <span className="text-xs text-white/40">ISRC</span>
      <div className="mt-1 flex gap-1.5">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="CC-XXX-YY-NNNNN"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
        />
        <button
          type="button"
          onClick={onGenerate}
          disabled={state?.busy || Boolean(value)}
          title={value ? 'Clear the ISRC to mint a new one' : 'Mint an ISRC under your registrant code'}
          className="shrink-0 rounded-lg border border-white/15 px-2.5 py-2 text-xs font-medium text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-30"
        >
          {state?.busy ? '…' : 'Generate'}
        </button>
      </div>
      {state?.msg && (
        <span className="mt-1 block text-xs text-amber-300/90">
          {state.msg}
          {state.needsSetup && (
            <>
              {' '}
              <Link href="/settings" className="underline hover:text-amber-200">
                Open Settings
              </Link>
            </>
          )}
        </span>
      )}
    </label>
  )
}

// ─── ISWC field (PRO-issued — validate, don't generate) ───────────────
function IswcField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const shapeOk = isValidIswcShape(value)
  const fullOk = isValidIswc(value)
  const hint = !value
    ? 'Issued by your PRO when you register the work — you can’t self-assign it.'
    : !shapeOk
      ? 'Expected T-DDDDDDDDD-C.'
      : !fullOk
        ? 'Check digit doesn’t match — re-check the code from your PRO.'
        : 'Valid ISWC.'
  const tone = !value ? 'text-white/30' : fullOk ? 'text-emerald-300/90' : 'text-amber-300/90'
  return (
    <label className="block">
      <span className="text-xs text-white/40">ISWC</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="T-DDDDDDDDD-C"
        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
      />
      <span className={`mt-1 block text-xs ${tone}`}>{hint}</span>
    </label>
  )
}

// ─── Inputs ──────────────────────────────────────────────────────────
function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="text-xs text-white/40">{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
      />
    </label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="block">
      <span className="text-xs text-white/40">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
      >
        {options.map(o => (
          <option key={o.value} value={o.value} className="bg-[#0a0a0f]">{o.label}</option>
        ))}
      </select>
    </label>
  )
}
