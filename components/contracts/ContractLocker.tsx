'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { VerificationCheck, VerificationStatus } from '@/types'
import type { AttentionSections, PartyProgressState } from '@/lib/contracts/locker-attention'

export type ContractRow = {
  id: string
  type: string
  label: string
  projectTitle: string
  status: 'verified' | 'signed' | 'pending'
  source: 'generated' | 'uploaded'
  detail: string
  needsFixing: boolean
  splitTotal: number | null
  writers: number | null
  signedAt: string | null
  // Real AI verification (uploaded docs), when present.
  verificationStatus?: VerificationStatus
  verificationChecks?: VerificationCheck[]
  verificationSummary?: string | null
  // Standalone (project_id IS NULL) split sheet — P17-05. When true, this
  // row has no parent release and can be attached to one via splitSheetId.
  unattached: boolean
  splitSheetId: string | null
}

const STATUS_BADGE = {
  verified: { cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30', text: 'Verified' },
  signed: { cls: 'text-brandindigo bg-brandindigo/10 border-brandindigo/30', text: 'Signed' },
  pending: { cls: 'text-money2 bg-money/10 border-money/30', text: 'Pending' },
  bad: { cls: 'text-rose-400 bg-rose-500/10 border-rose-500/30', text: 'Needs fixing' },
} as const

function badgeFor(r: ContractRow) {
  return r.needsFixing ? STATUS_BADGE.bad : STATUS_BADGE[r.status]
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#C7CBF7" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  )
}
function Check({ color = '#34D399' }: { color?: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="m20 6-11 11-5-5" />
    </svg>
  )
}

// ─── Per-party 3-state indicator (P18-10 extension) ───────────────────────
// invited (hasn't opened) / opened (hasn't signed) / signed — rendered
// exactly as buildAttentionSections() derived it. This component derives
// NOTHING itself; every label here is a pass-through of the attention
// module's output.
const PARTY_STATE_LABEL: Record<PartyProgressState, string> = {
  invited: "invited, hasn't opened yet",
  opened: "opened, hasn't signed",
  signed: 'signed',
}

function PartyStateDot({ state }: { state: PartyProgressState }) {
  if (state === 'signed') return <Check />
  return (
    <span
      className={`h-[9px] w-[9px] rounded-full border ${state === 'opened' ? 'border-money2 bg-money2/40' : 'border-lavdim bg-transparent'}`}
    />
  )
}

// ─── Attention section shell — a consistent card wrapper every section
// below reuses, so the landing reads as one system rather than four
// differently-styled panels bolted together.
function AttentionCard({
  title,
  tone,
  children,
}: {
  title: string
  tone: 'warn' | 'info'
  children: React.ReactNode
}) {
  return (
    <div className="rounded-[16px] border border-hair bg-card p-5">
      <div
        className={`mb-3 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[.1em] ${
          tone === 'warn' ? 'text-money2' : 'text-lav'
        }`}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

function AwaitingSignatureSection({ rows }: { rows: AttentionSections['awaitingSignature'] }) {
  if (rows.length === 0) return null
  return (
    <AttentionCard title="Awaiting signature" tone="warn">
      <div className="flex flex-col gap-4">
        {rows.map(row => (
          <Link
            key={row.sheetId}
            href={`/split-sheets/${row.sheetId}`}
            className="block rounded-[12px] border border-hair bg-card2 p-4 transition hover:border-hairstrong"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[15px] font-bold text-white">{row.songName}</span>
              <span className="text-[12.5px] font-semibold text-lavdim">
                {row.signedCount} of {row.totalCount} signed
              </span>
            </div>
            <div className="mt-3 flex flex-col gap-[6px]">
              {row.parties.map(p => (
                <div key={`${row.sheetId}-${p.userId ?? p.name}`} className="flex items-center gap-[9px] text-[13px]">
                  <PartyStateDot state={p.state} />
                  <span className="text-lav">{p.name}</span>
                  <span className="text-lavdim">— {PARTY_STATE_LABEL[p.state]}</span>
                </div>
              ))}
            </div>
            {row.viewerSharePercentage != null && (
              <div className="mt-3 text-[12px] text-lavdim">Your share: {row.viewerSharePercentage}%</div>
            )}
          </Link>
        ))}
      </div>
    </AttentionCard>
  )
}

function DraftsInProgressSection({ rows }: { rows: AttentionSections['draftsInProgress'] }) {
  if (rows.length === 0) return null
  return (
    <AttentionCard title="Drafts in progress" tone="info">
      <div className="flex flex-col gap-[10px]">
        {rows.map(row => (
          <Link
            key={row.sheetId}
            href={`/split-sheets/${row.sheetId}`}
            className="flex items-center justify-between rounded-[12px] border border-hair bg-card2 px-4 py-3 text-[14px] font-semibold text-white transition hover:border-hairstrong"
          >
            {row.songName}
            <span className="text-[12px] font-bold uppercase tracking-[.08em] text-lavdim">Continue draft →</span>
          </Link>
        ))}
      </div>
    </AttentionCard>
  )
}

function UnattachedExecutedSection({ rows }: { rows: AttentionSections['unattachedExecuted'] }) {
  if (rows.length === 0) return null
  return (
    <AttentionCard title="Ready to attach" tone="info">
      <div className="flex flex-col gap-[10px]">
        {rows.map(row => (
          <Link
            key={row.sheetId}
            href={`/split-sheets/${row.sheetId}/attach`}
            className="flex items-center justify-between rounded-[12px] border border-hair bg-card2 px-4 py-3 text-[14px] font-semibold text-white transition hover:border-hairstrong"
          >
            {row.songName}
            <span className="text-[12px] font-bold uppercase tracking-[.08em] text-lavdim">Attach to a release →</span>
          </Link>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-lavdim">
        Signed and unattached is a valid permanent state for an unreleased song — attach whenever it lands on a release.
      </p>
    </AttentionCard>
  )
}

function SongsWithNoSheetSection({ rows }: { rows: AttentionSections['songsWithNoSheet'] }) {
  if (rows.length === 0) return null
  return (
    <AttentionCard title="Songs with no split sheet" tone="warn">
      <div className="flex flex-col gap-[10px]">
        {rows.map(row => (
          <Link
            key={`${row.projectId}-${row.trackId}`}
            href="/split-sheets/new"
            className="flex items-center justify-between rounded-[12px] border border-hair bg-card2 px-4 py-3 text-[14px] font-semibold text-white transition hover:border-hairstrong"
          >
            <span>
              {row.trackTitle} <span className="font-normal text-lavdim">· {row.projectTitle}</span>
            </span>
            <span className="text-[12px] font-bold uppercase tracking-[.08em] text-lavdim">Start a split sheet →</span>
          </Link>
        ))}
      </div>
    </AttentionCard>
  )
}

// ─── Create section (design section 10a item 2) ──────────────────────────
// Laid out to hold a SET of document types — the contract library named in
// the roadmap adds siblings here later — not hardcoded to a single button.
function CreateSection() {
  const createActions: { href: string; label: string }[] = [{ href: '/split-sheets/new', label: 'New split sheet' }]
  return (
    <div className="rounded-[16px] border border-hair bg-card p-5">
      <div className="mb-3 text-[13px] font-bold uppercase tracking-[.1em] text-lav">Create</div>
      <div className="flex flex-wrap gap-[10px]">
        {createActions.map(action => (
          <Link
            key={action.href}
            href={action.href}
            className="rounded-[10px] bg-brandindigo px-4 py-[10px] text-[13.5px] font-bold text-white"
          >
            {action.label}
          </Link>
        ))}
      </div>
    </div>
  )
}

// ─── Ask slot (design section 10a item 4) ─────────────────────────────────
// Reserved place in the layout, per plan instruction — no input, no
// handler, no route behind it. Belongs to Contract Locker Intelligence.
function AskSlot() {
  return (
    <div className="rounded-[16px] border border-dashed border-hair bg-transparent p-5 text-[13px] text-lavdim">
      <span className="font-bold uppercase tracking-[.1em] text-lavdim">Ask</span> — natural-language search across your
      contracts is coming soon.
    </div>
  )
}

// ─── Attach-to-project affordance (P17-05/P17-05a) ────────────────────────
// A standalone executed sheet lands in the locker unattached; this offers a
// one-tap attach to a project the artist owns, hitting Task 2's route.
function AttachPanel({ row, projects }: { row: ContractRow; projects: { id: string; title: string }[] }) {
  const router = useRouter()
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function attach() {
    if (!row.splitSheetId || !projectId) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/split-sheets/${row.splitSheetId}/attach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vault_project_id: projectId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Could not attach this sheet.')
        return
      }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-5 rounded-[14px] border border-brandindigo/30 bg-brandindigo/5 p-4">
      <div className="text-[13px] font-bold text-white">Attach to a release</div>
      <p className="mt-1 text-[12.5px] text-lavdim">
        This sheet isn&apos;t linked to a project yet — attaching moves it (and this project&apos;s readiness) into that release.
      </p>
      {projects.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-lavdim">Create a Vault project first to attach this sheet.</p>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="min-w-0 flex-1 rounded-[10px] border border-hair bg-card2 px-3 py-2 text-[13px] text-white"
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <button
            onClick={attach}
            disabled={busy || !row.splitSheetId}
            className="rounded-[10px] bg-brandindigo px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Attaching…' : 'Attach'}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-[12px] text-rose-400">{error}</p>}
    </div>
  )
}

// ─── Per-viewer soft-hide (P18-11) ─────────────────────────────────────────
// Removes a shared agreement from THIS Locker view only — never deletes
// the document, never affects another party's copy. Labelled accordingly.
function HideFromViewButton({ row }: { row: ContractRow }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function hide() {
    setBusy(true)
    try {
      await fetch(`/api/contracts/documents/${row.id}/hide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: true }),
      })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={hide}
      disabled={busy}
      title="Removes this from your own Locker only — it does not delete the signed agreement or remove it for anyone else."
      className="mt-4 text-[12px] font-semibold text-lavdim underline decoration-dotted underline-offset-4 hover:text-lav disabled:opacity-50"
    >
      {busy ? 'Removing…' : 'Remove from your view'}
    </button>
  )
}

function VerifyPanel({ row, projects }: { row: ContractRow | null; projects: { id: string; title: string }[] }) {
  if (!row) {
    return (
      <div className="h-fit rounded-[18px] border border-hair bg-[#0b0a16] p-6 text-[13px] text-lavdim">
        Select a contract to see its AI verification.
      </div>
    )
  }

  // Prefer real AI-verification results (uploaded docs); else compute from
  // the generated doc's status + split picture.
  const real = row.verificationChecks && row.verificationChecks.length > 0
  const splitOk = row.splitTotal == null ? row.status === 'verified' : row.splitTotal === 100
  const checks: { t: string; s: string; state: 'ok' | 'bad' | 'pending' }[] = real
    ? row.verificationChecks!.map(c => ({
        t: c.label,
        s: c.detail,
        state: c.state === 'pass' ? 'ok' : c.state === 'fail' ? 'bad' : 'pending',
      }))
    : [
        {
          t: 'Splits total 100%',
          s: row.splitTotal == null ? 'Payout percentages add up' : `Totals ${row.splitTotal}%`,
          state: row.splitTotal != null ? (splitOk ? 'ok' : 'bad') : row.status === 'verified' ? 'ok' : 'pending',
        },
        { t: 'All parties present', s: row.writers ? `${row.writers} named & accounted for` : 'Named & accounted for', state: row.status === 'verified' ? 'ok' : 'pending' },
        { t: 'Signatures present', s: 'Every signature block completed', state: row.status === 'pending' ? 'pending' : 'ok' },
        { t: 'Terms match release', s: 'Title, ISRC & dates align with Vault', state: row.status === 'verified' ? 'ok' : 'pending' },
      ]

  const verStatus = real ? row.verificationStatus : undefined
  const badge =
    verStatus === 'failed' || row.needsFixing
      ? { cls: 'text-rose-400 bg-rose-500/10 border-rose-500/30', text: 'Needs fixing' }
      : verStatus === 'verified' || (!real && row.status === 'verified')
        ? { cls: 'text-emerald-400 bg-emerald-400/12 border-emerald-400/30', text: 'Verified — airtight' }
        : verStatus === 'verifying'
          ? { cls: 'text-brandindigo bg-brandindigo/12 border-brandindigo/30', text: 'Verifying…' }
          : !real && row.status === 'signed'
            ? { cls: 'text-brandindigo bg-brandindigo/12 border-brandindigo/30', text: 'Signed — verifying' }
            : { cls: 'text-money2 bg-money/12 border-money/30', text: 'Pending review' }

  return (
    <div className="h-fit rounded-[18px] border border-hair bg-[#0b0a16] p-6">
      <div className="mb-[18px] flex items-center gap-[10px] text-[12px] font-bold uppercase tracking-[.14em] text-brandindigo">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="#818CF8" strokeWidth={1.8}>
          <path d="M12 2v4m0 0a6 6 0 0 1 6 6c0 4-3 5-3 8H9c0-3-3-4-3-8a6 6 0 0 1 6-6Z" />
        </svg>
        AI verification
      </div>
      <div className="text-[18px] font-extrabold text-white">{row.label}</div>
      <div className="mt-[5px] text-[13px] text-lavdim">
        {row.unattached ? 'Unattached' : row.projectTitle} · {row.source === 'uploaded' ? 'uploaded PDF' : 'generated in Funūn'} · read by Funūn AI
      </div>
      <div className={`mt-4 inline-flex items-center gap-[9px] rounded-[11px] border px-4 py-[10px] text-[14.5px] font-extrabold ${badge.cls}`}>
        {!row.needsFixing && verStatus !== 'failed' && <Check color="currentColor" />}
        {badge.text}
      </div>
      {real && row.verificationSummary && (
        <p className="mt-3 text-[13.5px] leading-[1.5] text-lav">{row.verificationSummary}</p>
      )}

      <div className="mt-5">
        {checks.map((c, i) => (
          <div key={i} className={`flex items-start gap-3 py-[14px] ${i < checks.length - 1 ? 'border-b border-hair' : ''}`}>
            <span
              className={`flex h-6 w-6 flex-none items-center justify-center rounded-[7px] ${c.state === 'ok' ? 'bg-emerald-400/14' : c.state === 'bad' ? 'bg-rose-500/14' : 'bg-money/14'}`}
            >
              {c.state === 'ok' ? (
                <Check />
              ) : c.state === 'bad' ? (
                <span className="text-[13px] font-black text-rose-400">!</span>
              ) : (
                <span className="h-[7px] w-[7px] rounded-full bg-money2" />
              )}
            </span>
            <div>
              <div className="text-[14.5px] font-semibold text-white">{c.t}</div>
              <div className="mt-[3px] text-[12.5px] text-lavdim">{c.s}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-[18px] text-[12.5px] leading-[1.5] text-lavdim">
        {row.signedAt && (
          <>
            <b className="text-lav">Signed</b> {new Date(row.signedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            <br />
          </>
        )}
        {row.unattached
          ? 'Not tied to a release yet — attach it below to feed that release’s readiness.'
          : `Feeds Release Readiness · ${row.needsFixing ? 'resolve to clear this release for pitching.' : 'helps clear this release for pitching.'}`}
      </div>

      {row.unattached && <AttachPanel row={row} projects={projects} />}
      <HideFromViewButton row={row} />
    </div>
  )
}

export function ContractLocker({
  rows,
  projects = [],
  attention,
}: {
  rows: ContractRow[]
  projects?: { id: string; title: string }[]
  attention?: AttentionSections
}) {
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null)
  const selected = rows.find(r => r.id === selectedId) ?? null

  const hasAttention =
    !!attention &&
    (attention.awaitingSignature.length > 0 ||
      attention.draftsInProgress.length > 0 ||
      attention.unattachedExecuted.length > 0 ||
      attention.songsWithNoSheet.length > 0)

  return (
    <div className="flex flex-col gap-7">
      {/* ── Attention-first landing (design section 10a) ─────────────── */}
      {attention && hasAttention && (
        <div className="flex flex-col gap-4">
          <AwaitingSignatureSection rows={attention.awaitingSignature} />
          <DraftsInProgressSection rows={attention.draftsInProgress} />
          <UnattachedExecutedSection rows={attention.unattachedExecuted} />
          <SongsWithNoSheetSection rows={attention.songsWithNoSheet} />
        </div>
      )}

      <CreateSection />

      {/* ── Browse complete (the pre-existing archive, unchanged shape) ── */}
      <div className="grid gap-7 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col">
          <div className="grid grid-cols-[1fr_150px_132px] gap-4 px-5 pb-[14px] text-[12px] font-bold uppercase tracking-[.12em] text-lavdim">
            <div>Document</div>
            <div>Source</div>
            <div>Status</div>
          </div>

          {rows.length === 0 ? (
            <p className="px-5 text-[14px] text-lavdim">No contracts yet — generate one from a release, or upload an existing agreement.</p>
          ) : (
            rows.map(r => {
              const badge = badgeFor(r)
              const sel = r.id === selectedId
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={[
                    'mb-[11px] grid grid-cols-[1fr_150px_132px] items-center gap-4 rounded-[14px] border px-5 py-4 text-left transition',
                    sel
                      ? 'border-brandindigo/45 bg-[linear-gradient(150deg,rgba(129,140,248,.1),rgba(217,70,239,.05))]'
                      : 'border-hair bg-card hover:border-hairstrong',
                  ].join(' ')}
                >
                  <span className="flex min-w-0 items-center gap-[14px]">
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] border border-hair bg-card2">
                      <DocIcon />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-[7px]">
                        <span className="block truncate text-[15.5px] font-bold text-white">{r.label}</span>
                        {r.unattached && (
                          <span className="flex-none rounded-full border border-money/30 bg-money/10 px-[8px] py-[2px] text-[10.5px] font-bold uppercase tracking-[.08em] text-money2">
                            Unattached
                          </span>
                        )}
                      </span>
                      <span className="mt-[3px] block truncate text-[12.5px] text-lavdim">{r.detail}</span>
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-[7px] text-[13.5px] font-semibold text-lav">
                    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="#7c80b4" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      {r.source === 'uploaded' ? (
                        <>
                          <path d="M12 16V4m0 0-4 4m4-4 4 4" />
                          <path d="M4 18v2h16v-2" />
                        </>
                      ) : (
                        <>
                          <circle cx="12" cy="12" r="9" />
                          <path d="m8 12 2.5 2.5L16 9" />
                        </>
                      )}
                    </svg>
                    {r.source === 'uploaded' ? 'Uploaded' : 'Generated'}
                  </span>
                  <span className={`inline-flex items-center gap-[7px] rounded-full border px-3 py-[6px] text-[12.5px] font-bold ${badge.cls}`}>
                    <span className="h-[7px] w-[7px] rounded-full bg-current" />
                    {badge.text}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <VerifyPanel row={selected} projects={projects} />
      </div>

      <AskSlot />
    </div>
  )
}
