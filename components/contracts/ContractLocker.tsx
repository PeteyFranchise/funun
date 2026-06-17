'use client'

import { useState } from 'react'
import type { VerificationCheck, VerificationStatus } from '@/types'

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

function VerifyPanel({ row }: { row: ContractRow | null }) {
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
        {row.projectTitle} · {row.source === 'uploaded' ? 'uploaded PDF' : 'generated in Funūn'} · read by Funūn AI
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
        Feeds Release Readiness · {row.needsFixing ? 'resolve to clear this release for pitching.' : 'helps clear this release for pitching.'}
      </div>
    </div>
  )
}

export function ContractLocker({ rows }: { rows: ContractRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null)
  const selected = rows.find(r => r.id === selectedId) ?? null

  return (
    <div className="grid gap-7 lg:grid-cols-[1fr_360px]">
      {/* List */}
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
                    <span className="block truncate text-[15.5px] font-bold text-white">{r.label}</span>
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

      <VerifyPanel row={selected} />
    </div>
  )
}
