'use client'

import { useState } from 'react'
import { getCurator, type CuratorType, type GeneratedPitch } from '@/lib/tools/pitchplug'

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
  const [sent, setSent] = useState(false)
  const [recording, setRecording] = useState(false)
  const [contact, setContact] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showSend, setShowSend] = useState(false)

  async function markSent() {
    setRecording(true)
    setError(null)
    const res = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        type: curatorType,
        destinationName: contact.trim() || (curator?.name ?? 'Curator'),
        pitchText: `${pitch.subject}\n\n${pitch.body}`,
      }),
    })
    setRecording(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Could not record')
      return
    }
    setSent(true)
    setShowSend(false)
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
            Sent
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

      <div className="mt-4">
        <CopyButton text={`Subject: ${pitch.subject}\n\n${pitch.body}`} label="Copy full email" />
      </div>

      {!sent && !demo && (
        <div className="mt-4 border-t border-white/10 pt-4">
          {!showSend ? (
            <button
              onClick={() => setShowSend(true)}
              className="text-xs text-white/50 transition hover:text-white"
            >
              Did you send this? Track it →
            </button>
          ) : (
            <div className="space-y-2">
              <input
                value={contact}
                onChange={e => setContact(e.target.value)}
                placeholder="Who did you send it to? (name / email)"
                className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
              />
              {error && <p className="text-xs text-rose-300">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={markSent}
                  disabled={recording}
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
                >
                  {recording ? 'Saving…' : 'Mark as sent'}
                </button>
                <button
                  onClick={() => setShowSend(false)}
                  className="rounded-lg px-3 py-1.5 text-xs text-white/50 transition hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
