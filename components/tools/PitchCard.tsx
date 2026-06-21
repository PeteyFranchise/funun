'use client'

import { useState } from 'react'
import { getCurator, type CuratorType, type GeneratedPitch } from '@/lib/tools/pitchplug'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="rounded-md border border-white/15 px-2.5 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

export function PitchCard({
  curatorType,
  pitch,
  projectId,
  demo,
}: {
  curatorType: CuratorType
  pitch: GeneratedPitch
  projectId: string
  demo?: boolean
}) {
  const curator = getCurator(curatorType)
  const isSubmitHub = curatorType === 'submithub_blog'

  const [sent, setSent] = useState(false)
  const [sentVia, setSentVia] = useState<'email' | 'manual' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [confirming, setConfirming] = useState(false)

  const fullEmail = `Subject: ${pitch.subject}\n\n${pitch.body}`
  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
    pitch.subject
  )}&body=${encodeURIComponent(pitch.body)}`

  async function sendViaFunun() {
    setBusy(true)
    setError(null)
    const res = await fetch('/api/tools/pitchplug/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        curatorType,
        recipientEmail: email.trim(),
        recipientName: name.trim(),
        subject: pitch.subject,
        body: pitch.body,
      }),
    })
    setBusy(false)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json.error ?? 'Could not send')
      return
    }
    setSent(true)
    setSentVia('email')
    setConfirming(false)
  }

  async function markSent() {
    setBusy(true)
    setError(null)
    const res = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        type: curatorType,
        destinationName: name.trim() || (curator?.name ?? 'Curator'),
        destinationContact: email.trim() || null,
        pitchText: fullEmail,
      }),
    })
    setBusy(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Could not record')
      return
    }
    setSent(true)
    setSentVia('manual')
  }

  return (
    <div className="rounded-xl border border-[#1A1838] bg-[#0E0D1E] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{curator?.name ?? curatorType}</p>
          <p className="text-xs text-white/40">{curator?.blurb}</p>
        </div>
        {sent && (
          <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-300">
            {sentVia === 'email' ? 'Emailed' : 'Logged'}
          </span>
        )}
      </div>

      <div className="mt-4 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-white/40">Subject</p>
          <CopyButton text={pitch.subject} label="Copy" />
        </div>
        <p className="text-sm text-white/90">{pitch.subject}</p>
      </div>

      <div className="mt-4 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-white/40">Body</p>
          <CopyButton text={pitch.body} label="Copy" />
        </div>
        <p className="whitespace-pre-wrap rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm text-white/70">
          {pitch.body}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <CopyButton text={fullEmail} label="Copy full email" />
        {isSubmitHub && (
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(fullEmail)
              window.open('https://www.submithub.com/', '_blank', 'noopener')
            }}
            className="rounded-md border border-white/15 px-2.5 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
          >
            Copy &amp; open SubmitHub
          </button>
        )}
      </div>

      {!sent && (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Recipient / outlet name"
              className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
            />
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              type="email"
              placeholder="Recipient email"
              className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
            />
          </div>

          {error && <p className="text-xs text-rose-300">{error}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={mailto}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
            >
              Open in email app
            </a>

            {!confirming ? (
              <button
                onClick={() => {
                  setError(null)
                  if (demo) {
                    setError('Sending is disabled in demo mode.')
                    return
                  }
                  if (!EMAIL_RE.test(email.trim())) {
                    setError('Enter a valid recipient email to send.')
                    return
                  }
                  setConfirming(true)
                }}
                className="rounded-lg bg-[#818CF8] px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-[#9aa3fa]"
              >
                Send via Funūn
              </button>
            ) : (
              <span className="flex items-center gap-2">
                <span className="text-xs text-white/60">Send to {email.trim()}?</span>
                <button
                  onClick={sendViaFunun}
                  disabled={busy}
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
                >
                  {busy ? 'Sending…' : 'Confirm send'}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="rounded-lg px-2 py-1.5 text-xs text-white/50 transition hover:text-white"
                >
                  Cancel
                </button>
              </span>
            )}

            {!demo && (
              <button
                onClick={markSent}
                disabled={busy}
                className="rounded-lg px-3 py-1.5 text-xs text-white/50 transition hover:text-white disabled:opacity-40"
              >
                I sent it elsewhere
              </button>
            )}
          </div>
          <p className="text-[11px] text-white/30">
            Sent from Funūn with replies routed to your contact email. Review before confirming —
            we send exactly what&rsquo;s shown above.
          </p>
        </div>
      )}
    </div>
  )
}
