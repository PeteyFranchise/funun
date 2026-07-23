'use client'

import { useState } from 'react'
import type { PartyPhase } from '@/lib/split-sheets/phase'
import { SplitSheetSigningEmbed } from '@/components/split-sheets/SplitSheetSigningEmbed'
import { formatPartyChanges } from '@/lib/split-sheets/change-summary'
import type { PartyChangeRecord } from '@/lib/split-sheets/change-summary'

// ─── SplitApprovalView ──────────────────────────────────────────────────
// Public approval UI rendered on /approve/[token]. The same durable link
// now hosts BOTH the approve/counter step and the post-approval signing
// step (RESEARCH Pitfall 1 / gap fix 1, P17-01) — which branch renders is
// driven by the server-resolved `phase` prop (lib/split-sheets/phase.ts),
// not a local "is this link still valid" guess.
// Designed to degrade legibly without JavaScript (server-rendered shell).
// No auth required — the 256-bit token is the authorization secret (T-01-10).
// Mobile-first (D-18b) — the studio-with-only-a-phone canonical test: full-
// width tap targets, vertical stack, no fixed widths that overflow at 375px.

type Party = {
  id: string
  name: string
  role: string | null
  split_percentage: number
}

/** This party's own current identity fields (§7) — prefills the optional
 * advanced-information disclosure so the recipient corrects rather than
 * retypes from scratch. */
export type PartyIdentity = {
  legalName: string | null
  pro: string | null
  ipi: string | null
  publishingDesignee: string | null
  administrator: string | null
}

type Props = {
  token: string
  partyId: string
  partyName: string
  partyRole: string | null
  songName: string
  artistName: string
  /** Server-resolved lifecycle phase for this party (lib/split-sheets/phase.ts). */
  phase: PartyPhase
  parties: Party[]
  /**
   * This party's own `/s/{slug}` embed source from their
   * esign_envelope_signers row. Resolved server-side and scoped to ONE
   * signer — never a template URL and never the API key (T-17-15,
   * T-17-19). Null until the envelope is minted.
   */
  signingSrc?: string | null
  /** This party's email, pre-filling the embed's signer step. */
  partyEmail?: string | null
  /** §7 — this party's own current identity, for the advanced-info disclosure. */
  partyIdentity?: PartyIdentity | null
  /**
   * WR-03 / P18-09 — the server-computed diff of what changed when consensus
   * was last reset, shown to this party before they re-approve. Structured
   * records only (no free text — P18-13). Null or empty ⇒ no banner.
   */
  changeSummary?: PartyChangeRecord[] | null
}

type SubmitStatus = 'idle' | 'submitting' | 'approved' | 'countered' | 'error'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30'
const labelClass = 'block text-xs font-medium uppercase tracking-wide text-white/40'

// ─── Shared shell (wordmark + party card) ────────────────────────────────
function PartyRows({ parties, partyId }: { parties: Party[]; partyId: string }) {
  return (
    <div className="mb-4 space-y-1">
      {parties.map(p => (
        <div
          key={p.id}
          className={`flex items-center justify-between rounded-lg px-3 py-2 ${
            p.id === partyId ? 'bg-[#1A1838]' : ''
          }`}
        >
          <div>
            <span className="text-sm text-white">{p.name}</span>
            {p.role && <span className="ml-2 text-xs text-white/40">{p.role}</span>}
            {p.id === partyId && <span className="ml-2 text-xs text-brandindigo">(you)</span>}
          </div>
          <span className="text-sm font-semibold text-white">{p.split_percentage}%</span>
        </div>
      ))}
    </div>
  )
}

function PageShell({
  artistName,
  songName,
  parties,
  partyId,
  children,
}: {
  artistName: string
  songName: string
  parties: Party[]
  partyId: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 py-16">
      <div className="mb-2 text-2xl font-extrabold tracking-tight">
        <span className="gtext">Funūn</span>
      </div>
      <p className="mb-8 text-center text-sm text-white/50">
        Split approval request from <span className="text-white/80">{artistName}</span>
      </p>

      <div className="w-full max-w-[480px] rounded-[18px] border border-white/10 bg-card p-6">
        <h1 className="mb-4 text-lg font-extrabold text-white">{songName}</h1>
        <PartyRows parties={parties} partyId={partyId} />
        <div className="border-t border-white/10 pt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">Total</span>
            <span className="font-bold text-emerald-300">100%</span>
          </div>
        </div>
      </div>

      <div className="mt-6 w-full max-w-[480px] space-y-4">{children}</div>

      <p className="mt-8 text-center text-xs text-white/30">
        Powered by Funūn — rights and registration for independent artists
      </p>
    </div>
  )
}

// ─── Non-interactive lifecycle states (waiting / countered / done) ──────
function StateCard({
  tone,
  title,
  body,
}: {
  tone: 'info' | 'amber' | 'emerald'
  title: string
  body: string
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400'
      : tone === 'amber'
        ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
        : 'border-white/10 bg-white/5 text-white'

  return (
    <div className={`w-full rounded-[18px] border px-6 py-4 text-center ${toneClass}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-white/50">{body}</p>
    </div>
  )
}

// ─── Sign-phase shell ────────────────────────────────────────────────────
// 17-06 replaced 17-04's placeholder mount point with the live
// @docuseal/react embed. The container stays full-width and vertically
// stacked so it remains thumb-signable at a 375px viewport (D-18b).
function SigningRegion({
  artistName,
  signingSrc,
  signerEmail,
  partyName,
}: {
  artistName: string
  signingSrc: string | null
  signerEmail: string | null
  partyName: string
}) {
  return (
    <div className="w-full space-y-3">
      <StateCard
        tone="info"
        title="Ready to sign"
        body="Everyone has approved the split — you're up to sign the split sheet."
      />
      {signingSrc ? (
        <SplitSheetSigningEmbed
          src={signingSrc}
          signerEmail={signerEmail ?? undefined}
          signerName={partyName}
        />
      ) : (
        // The sheet has reached the sign phase but this party has no
        // signer row yet (mint still in flight, or a re-mint after a
        // void). A waiting state is correct here — rendering an empty
        // embed would read as a broken signing form.
        <div
          id="docuseal-sign-mount"
          data-testid="docuseal-sign-mount"
          className="flex min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-white/15 bg-white/5 px-4 py-8 text-center"
        >
          <p className="text-sm font-semibold text-white">Preparing your document…</p>
          <p className="text-xs text-white/40">
            {artistName}&rsquo;s split sheet is being prepared for signature. Refresh in a
            moment.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── IdentityDisclosure (§7) ─────────────────────────────────────────
// An optional, collapsed-by-default disclosure where the recipient can
// fill in or correct their OWN legal name/PRO/IPI/publishing designee/
// administrator. Never required to approve, counter, or sign — submitting
// it is a distinct action (POST .../update_identity) from approve/counter.
// No free-text field, ever (P18-13) — every field here is a structured
// rights-registry value the initiator already asks for on the builder.
function IdentityDisclosure({ token, initial }: { token: string; initial: PartyIdentity }) {
  const [open, setOpen] = useState(false)
  const [legalName, setLegalName] = useState(initial.legalName ?? '')
  const [pro, setPro] = useState(initial.pro ?? '')
  const [ipi, setIpi] = useState(initial.ipi ?? '')
  const [publishingDesignee, setPublishingDesignee] = useState(initial.publishingDesignee ?? '')
  const [administrator, setAdministrator] = useState(initial.administrator ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSave() {
    setStatus('saving')
    setErrorMsg('')
    try {
      const res = await fetch(`/api/approve/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_identity',
          legal_name: legalName,
          pro,
          ipi,
          publishing_designee: publishingDesignee,
          administrator,
        }),
      })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        throw new Error(json.error ?? 'Could not save your details.')
      }
      setStatus('saved')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Could not save your details.')
      setStatus('error')
    }
  }

  return (
    <div className="w-full rounded-[18px] border border-white/10 bg-card p-5">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="text-sm font-medium text-brandindigo hover:text-white"
      >
        {open ? '– Hide advanced information' : '+ Advanced information'}
      </button>
      {!open && (
        <p className="mt-1 text-xs text-white/40">
          Fix your own legal name, PRO, IPI, publisher, or administrator — never
          required to approve or sign.
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          <div>
            <label className={labelClass}>Legal name</label>
            <input
              value={legalName}
              onChange={e => setLegalName(e.target.value)}
              placeholder="Full legal name, as registered with PRO"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className={labelClass}>PRO</label>
              <input
                value={pro}
                onChange={e => setPro(e.target.value)}
                placeholder="ASCAP, BMI, SESAC…"
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label className={labelClass}>IPI #</label>
              <input
                value={ipi}
                onChange={e => setIpi(e.target.value)}
                placeholder="IPI #"
                className={`mt-1 ${inputClass}`}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Publishing designee</label>
              <input
                value={publishingDesignee}
                onChange={e => setPublishingDesignee(e.target.value)}
                placeholder="Publisher name, or None"
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label className={labelClass}>Administrator</label>
              <input
                value={administrator}
                onChange={e => setAdministrator(e.target.value)}
                placeholder="Publishing administrator, or None"
                className={`mt-1 ${inputClass}`}
              />
            </div>
          </div>

          {status === 'error' && <p className="text-sm text-rose-400">{errorMsg}</p>}
          {status === 'saved' && <p className="text-sm text-emerald-300">Saved.</p>}

          <button
            type="button"
            onClick={handleSave}
            disabled={status === 'saving'}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm font-medium text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-40"
          >
            {status === 'saving' ? 'Saving…' : 'Save my details'}
          </button>
        </div>
      )}
    </div>
  )
}

const EMPTY_IDENTITY: PartyIdentity = {
  legalName: null,
  pro: null,
  ipi: null,
  publishingDesignee: null,
  administrator: null,
}

export function SplitApprovalView({
  token,
  partyId,
  partyName,
  songName,
  artistName,
  phase,
  parties,
  signingSrc,
  partyEmail,
  partyIdentity,
  changeSummary,
}: Props) {
  if (phase === 'preview') {
    // P18-08: a draft share is explicitly NOT a formal ask. No approve
    // control, no counter control, no submit path — and, per §7, no
    // identity-correction section either (that belongs to the approve/sign
    // phases, where the recipient is genuinely being asked to act).
    return (
      <PageShell artistName={artistName} songName={songName} parties={parties} partyId={partyId}>
        <StateCard
          tone="info"
          title="Proposed split — shared for review"
          body={`${artistName} is sharing this proposed split for your review. No approval or signature is being requested yet.`}
        />
      </PageShell>
    )
  }

  if (phase === 'sign') {
    return (
      <PageShell artistName={artistName} songName={songName} parties={parties} partyId={partyId}>
        <SigningRegion
          artistName={artistName}
          signingSrc={signingSrc ?? null}
          signerEmail={partyEmail ?? null}
          partyName={partyName}
        />
        <IdentityDisclosure token={token} initial={partyIdentity ?? EMPTY_IDENTITY} />
      </PageShell>
    )
  }

  if (phase === 'waiting') {
    return (
      <PageShell artistName={artistName} songName={songName} parties={parties} partyId={partyId}>
        <StateCard
          tone="info"
          title="Waiting on other parties"
          body="You've approved this split. We'll email you as soon as it's ready to sign."
        />
      </PageShell>
    )
  }

  if (phase === 'countered') {
    return (
      <PageShell artistName={artistName} songName={songName} parties={parties} partyId={partyId}>
        <StateCard
          tone="amber"
          title="Your counter-proposal is recorded"
          body={`${artistName} has been notified and will review your proposal.`}
        />
      </PageShell>
    )
  }

  if (phase === 'done') {
    return (
      <PageShell artistName={artistName} songName={songName} parties={parties} partyId={partyId}>
        <StateCard
          tone="emerald"
          title="Fully executed"
          body="Every party has signed. The signed document is on file in Funūn."
        />
      </PageShell>
    )
  }

  return (
    <ApprovePhase
      token={token}
      partyId={partyId}
      partyName={partyName}
      songName={songName}
      artistName={artistName}
      parties={parties}
      partyIdentity={partyIdentity ?? EMPTY_IDENTITY}
      changeSummary={changeSummary ?? null}
    />
  )
}

// ─── Approve-phase (approve/counter) — original interactive UI ─────────
type ApprovePhaseProps = {
  token: string
  partyId: string
  partyName: string
  songName: string
  artistName: string
  parties: Party[]
  partyIdentity: PartyIdentity
  changeSummary: PartyChangeRecord[] | null
}

function ApprovePhase({
  token,
  partyId,
  partyName,
  songName,
  artistName,
  parties,
  partyIdentity,
  changeSummary,
}: ApprovePhaseProps) {
  const [showCounter, setShowCounter] = useState(false)
  const [counterInput, setCounterInput] = useState('')
  const [status, setStatus] = useState<SubmitStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleApprove() {
    setStatus('submitting')
    setErrorMsg('')
    try {
      const res = await fetch(`/api/approve/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        throw new Error(json.error ?? 'Could not submit')
      }
      setStatus('approved')
    } catch (e) {
      setErrorMsg(
        e instanceof Error
          ? `Could not submit. The link may have expired — ask ${artistName} for a new one.`
          : `Could not submit. The link may have expired — ask ${artistName} for a new one.`
      )
      setStatus('error')
    }
  }

  async function handleCounter() {
    const n = Number(counterInput)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setErrorMsg('Your proposed split must be between 0% and 100%.')
      return
    }
    setStatus('submitting')
    setErrorMsg('')
    try {
      const res = await fetch(`/api/approve/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'counter', counter_split: n }),
      })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        throw new Error(json.error ?? 'Could not submit')
      }
      setStatus('countered')
    } catch (e) {
      setErrorMsg(
        e instanceof Error
          ? `Could not submit. The link may have expired — ask ${artistName} for a new one.`
          : `Could not submit. The link may have expired — ask ${artistName} for a new one.`
      )
      setStatus('error')
    }
  }

  const isSubmitting = status === 'submitting'

  return (
    <PageShell artistName={artistName} songName={songName} parties={parties} partyId={partyId}>
      {status === 'approved' && (
        <div className="rounded-[18px] border border-emerald-400/30 bg-emerald-400/10 px-6 py-4 text-center">
          <p className="font-semibold text-emerald-400">Split approved</p>
          <p className="mt-1 text-sm text-white/50">
            {artistName} has been notified.
          </p>
        </div>
      )}

      {status === 'countered' && (
        <div className="rounded-[18px] border border-amber-400/30 bg-amber-400/10 px-6 py-4 text-center">
          <p className="font-semibold text-amber-300">Counter-proposal submitted</p>
          <p className="mt-1 text-sm text-white/50">
            {artistName} has been notified and will review your proposal.
          </p>
        </div>
      )}

      {status !== 'approved' && status !== 'countered' && (
        <>
          {/* WR-03 / P18-09 — what changed since consensus was last broken.
              System-worded, structured records only; no user free text ever
              reaches this banner (P18-13). */}
          {changeSummary && changeSummary.length > 0 && (
            <div className="w-full rounded-[18px] border border-amber-400/30 bg-amber-400/10 px-5 py-4">
              <p className="text-sm font-semibold text-amber-300">
                What changed since you last saw this
              </p>
              <ul className="mt-2 space-y-1">
                {formatPartyChanges(changeSummary).map((line, i) => (
                  <li key={i} className="text-sm text-white/70">
                    • {line}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-white/40">
                Review the updated split above before approving.
              </p>
            </div>
          )}

          {/* Error message */}
          {(status === 'error' || errorMsg) && (
            <p className="text-sm text-rose-400">{errorMsg}</p>
          )}

          {/* Approve button — distinct label (accessibility) */}
          <button
            type="button"
            onClick={handleApprove}
            disabled={isSubmitting}
            className="w-full rounded-lg bg-grad px-4 py-3 text-sm font-semibold text-white shadow-cta disabled:opacity-40"
          >
            {isSubmitting && !showCounter ? 'Submitting…' : 'Approve this split'}
          </button>

          {/* Counter toggle */}
          {!showCounter && (
            <button
              type="button"
              onClick={() => {
                setShowCounter(true)
                setErrorMsg('')
              }}
              className="w-full text-center text-sm text-white/50 hover:text-white"
            >
              Propose a different split
            </button>
          )}

          {/* Counter-proposal form */}
          {showCounter && (
            <div className="rounded-[18px] border border-white/10 bg-card p-5 space-y-4">
              <div>
                <label htmlFor="counter-split" className={labelClass}>
                  Your proposed split
                </label>
                <div className="relative mt-1">
                  <input
                    id="counter-split"
                    type="number"
                    min="0"
                    max="100"
                    step="0.001"
                    value={counterInput}
                    onChange={e => {
                      setCounterInput(e.target.value)
                      setErrorMsg('')
                    }}
                    placeholder="e.g. 40"
                    className={inputClass + ' pr-8'}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-white/40">
                    %
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-white/40">
                  The initiating artist will be notified to review and re-send.
                </p>
              </div>

              {/* Validation error */}
              {errorMsg && (
                <p className="text-sm text-rose-400">{errorMsg}</p>
              )}

              <div className="flex gap-3">
                {/* Distinct label — not "Submit" (accessibility) */}
                <button
                  type="button"
                  onClick={handleCounter}
                  disabled={isSubmitting}
                  className="flex-1 rounded-lg bg-grad px-4 py-2.5 text-sm font-semibold text-white shadow-cta disabled:opacity-40"
                >
                  {isSubmitting ? 'Submitting…' : 'Submit counter-proposal'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCounter(false)
                    setCounterInput('')
                    setErrorMsg('')
                  }}
                  className="text-sm text-white/50 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* §7 — optional, collapsed, distinct from approve/counter above */}
      <IdentityDisclosure token={token} initial={partyIdentity} />
    </PageShell>
  )
}
