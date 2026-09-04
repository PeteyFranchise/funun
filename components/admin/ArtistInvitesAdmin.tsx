'use client'

import { useMemo, useState, type FormEvent } from 'react'

// ─── ArtistInvitesAdmin ───────────────────────────────────────────────────
// Team Console surface for Phase 27's waitlist/invite system (D-14).
// Any staff role sees the waitlist + a per-row "Convert to invite" action
// (D-06). Only Leadership sees the page-level "Reopen & notify waitlist"
// broadcast action (D-15) — gated by the server-resolved `isLeadership`
// prop passed down from app/(admin)/admin/artist-invites/page.tsx, never
// hidden via CSS alone. Opted-out rows keep Convert enabled and show an
// "Unsubscribed" chip (D-19). Calls the 27-08 routes:
//   POST /api/admin/artist-invites/[id]/convert  (any staff)
//   POST /api/admin/artist-invites/broadcast     (leadership, two-step confirm)

export type WaitlistRow = {
  id: string
  email: string
  name: string | null
  note: string | null
  unsubscribed_at: string | null
  notified_reopen_at: string | null
  converted_to_invite_at: string | null
  created_at: string
}

type Props = {
  initialWaitlist: WaitlistRow[]
  isLeadership: boolean
}

// Relative-time formatter — mirrors CollaboratorCard's timeAgo() verbatim.
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return 'recently'
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  return new Date(iso).toLocaleDateString()
}

const inputClass =
  'w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] py-2 pl-9 pr-3 text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none'

export function ArtistInvitesAdmin({ initialWaitlist, isLeadership }: Props) {
  const [waitlist, setWaitlist] = useState<WaitlistRow[]>(initialWaitlist)
  const [search, setSearch] = useState('')
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [convertErrors, setConvertErrors] = useState<Record<string, string>>({})

  const [artistName, setArtistName] = useState('')
  const [artistEmail, setArtistEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteResult, setInviteResult] = useState<{
    email: string
    message: string
    inviteLink: string | null
  } | null>(null)
  const [copiedInviteLink, setCopiedInviteLink] = useState(false)

  const [confirmingBroadcast, setConfirmingBroadcast] = useState(false)
  const [broadcasting, setBroadcasting] = useState(false)
  const [broadcastError, setBroadcastError] = useState<string | null>(null)
  const [broadcastResult, setBroadcastResult] = useState<number | null>(null)

  const query = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!query) return waitlist
    return waitlist.filter(row => {
      const haystack = `${row.name ?? ''} ${row.email}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [waitlist, query])

  // Eligible-for-broadcast count (mirrors the broadcast route's own query:
  // unsubscribed_at IS NULL AND notified_reopen_at IS NULL) — used in the
  // two-step confirm's "Send this to {N} people…" copy.
  const eligibleCount = useMemo(
    () => waitlist.filter(row => !row.unsubscribed_at && !row.notified_reopen_at).length,
    [waitlist]
  )

  async function handleConvert(id: string) {
    setConvertingId(id)
    setConvertErrors(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    try {
      const res = await fetch(`/api/admin/artist-invites/${id}/convert`, { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        throw new Error(json.error ?? 'Something went wrong — try again.')
      }
      setWaitlist(prev =>
        prev.map(row =>
          row.id === id ? { ...row, converted_to_invite_at: row.converted_to_invite_at ?? new Date().toISOString() } : row
        )
      )
    } catch (err) {
      setConvertErrors(prev => ({
        ...prev,
        [id]: err instanceof Error ? err.message : 'Something went wrong — try again.',
      }))
    } finally {
      setConvertingId(null)
    }
  }

  async function handleDirectInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = artistEmail.trim().toLowerCase()
    const name = artistName.trim()

    setInviting(true)
    setInviteError(null)
    setInviteResult(null)
    setCopiedInviteLink(false)

    try {
      const res = await fetch('/api/admin/artist-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: name || undefined }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        duplicate?: boolean
        emailSent?: boolean
        inviteLink?: string
      }
      if (!res.ok) {
        throw new Error(json.error ?? 'Could not create the invite — try again.')
      }

      const message = json.duplicate
        ? `${email} already has an active invitation.`
        : json.emailSent === false
          ? `The invite is ready, but the email could not be delivered to ${email}.`
          : `Invitation sent to ${email}.`

      setInviteResult({ email, message, inviteLink: json.inviteLink ?? null })
      setArtistName('')
      setArtistEmail('')
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Could not create the invite — try again.')
    } finally {
      setInviting(false)
    }
  }

  async function handleCopyInviteLink() {
    if (!inviteResult?.inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteResult.inviteLink)
      setCopiedInviteLink(true)
    } catch {
      setInviteError('Could not copy the link. Open it and copy it from the address bar instead.')
    }
  }

  async function handleBroadcast() {
    setBroadcasting(true)
    setBroadcastError(null)
    try {
      const res = await fetch('/api/admin/artist-invites/broadcast', { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as { sent?: number; error?: string }
      if (!res.ok) {
        throw new Error(json.error ?? 'Something went wrong — try again.')
      }
      const sent = json.sent ?? 0
      setBroadcastResult(sent)
      setConfirmingBroadcast(false)
      const now = new Date().toISOString()
      setWaitlist(prev =>
        prev.map(row =>
          !row.unsubscribed_at && !row.notified_reopen_at ? { ...row, notified_reopen_at: now } : row
        )
      )
    } catch (err) {
      setBroadcastError(err instanceof Error ? err.message : 'Something went wrong — try again.')
    } finally {
      setBroadcasting(false)
    }
  }

  return (
    <div className="mt-6">
      <section className="mb-6 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div>
            <h2 className="text-[14px] font-bold text-[color:var(--ink)]">Invite one artist</h2>
            <p className="mt-1 text-[12px] text-[color:var(--ink-3)]">
              Send a private Funūn invitation without adding them to the waiting list.
            </p>
          </div>
          <span className="mt-2 w-fit rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--ink-3)] sm:mt-0">
            One at a time
          </span>
        </div>

        <form onSubmit={handleDirectInvite} className="mt-4 grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] md:items-end">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
              Artist name <span className="normal-case tracking-normal">(optional)</span>
            </span>
            <input
              value={artistName}
              onChange={event => setArtistName(event.target.value)}
              maxLength={120}
              autoComplete="name"
              placeholder="e.g. Maya Reeves"
              className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
              Email
            </span>
            <input
              type="email"
              required
              value={artistEmail}
              onChange={event => setArtistEmail(event.target.value)}
              autoComplete="email"
              placeholder="artist@example.com"
              className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={inviting || !artistEmail.trim()}
            className="fncon-cta h-[38px] rounded-lg px-4 text-[13px] font-bold shadow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {inviting ? 'Sending…' : 'Send invite'}
          </button>
        </form>

        <div aria-live="polite">
          {inviteError && <p className="mt-3 text-[12px] text-[color:var(--rose-fg)]">{inviteError}</p>}
          {inviteResult && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-[color:var(--green-fg)]">
              <span>{inviteResult.message}</span>
              {inviteResult.inviteLink && (
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  className="font-bold text-[color:var(--indigo)] transition hover:text-[color:var(--ink)]"
                >
                  {copiedInviteLink ? 'Link copied' : 'Copy invite link'}
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Leadership-only page-level broadcast action (D-15) — rendered
          strictly from the server-resolved isLeadership prop, never CSS. */}
      {isLeadership && (
        <div className="mb-6 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
          <p className="text-[13px] font-bold text-[color:var(--ink-2)]">Reopen invites</p>
          <p className="mt-1 text-[12px] text-[color:var(--ink-3)]">
            Sends a &quot;we&apos;ve reopened&quot; email to everyone still on the waiting list (opted-out
            people are skipped automatically).
          </p>

          {broadcastResult !== null && !confirmingBroadcast && (
            <p className="mt-3 text-[13px] text-[color:var(--green-fg)]">
              Sent to {broadcastResult} {broadcastResult === 1 ? 'person' : 'people'}.
            </p>
          )}
          {broadcastError && <p className="mt-3 text-[13px] text-[color:var(--rose-fg)]">{broadcastError}</p>}

          <div className="mt-3">
            {!confirmingBroadcast ? (
              <button
                type="button"
                onClick={() => {
                  setBroadcastResult(null)
                  setBroadcastError(null)
                  setConfirmingBroadcast(true)
                }}
                className="fncon-cta rounded-lg px-4 py-2 text-[13px] font-bold shadow transition hover:opacity-90"
              >
                Reopen &amp; notify waitlist
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[13px] text-[color:var(--ink-2)]">
                  Send this to {eligibleCount} {eligibleCount === 1 ? 'person' : 'people'} on the waiting
                  list? This can&apos;t be undone.
                </span>
                <button
                  type="button"
                  disabled={broadcasting}
                  onClick={handleBroadcast}
                  className="rounded-lg bg-rose-500/90 px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-rose-500 disabled:opacity-40"
                >
                  {broadcasting ? 'Sending…' : 'Yes, send'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingBroadcast(false)}
                  className="text-[13px] text-[color:var(--ink-3)] transition hover:text-[color:var(--ink)]"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search / filter (live, name+email) */}
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--ink-3)]"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search the waiting list by name or email…"
          className={inputClass}
        />
      </div>
      <p className="mt-2 text-[12px] text-[color:var(--ink-3)]">
        {query ? `${filtered.length} match${filtered.length === 1 ? '' : 'es'}` : `Showing ${waitlist.length} of ${waitlist.length}`}
      </p>

      {/* List */}
      {waitlist.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-10 w-10 text-[color:var(--ink-3)]"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <p className="text-[15px] font-semibold text-[color:var(--ink-2)]">No one on the waiting list yet</p>
          <p className="max-w-xs text-[13px] text-[color:var(--ink-3)]">
            Waitlist signups from the invite-only signup gate will show up here.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="mt-6 text-[14px] text-[color:var(--ink-3)]">
          No one on the waiting list matches that search.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {filtered.map(row => {
            const isConverted = Boolean(row.converted_to_invite_at)
            const isUnsubscribed = Boolean(row.unsubscribed_at)
            const isConverting = convertingId === row.id
            const rowError = convertErrors[row.id]
            return (
              <div
                key={row.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[14px] font-bold text-[color:var(--ink)]">
                      {row.name || row.email}
                    </p>
                    {isUnsubscribed && (
                      <span className="inline-flex items-center rounded-full border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-200">
                        Unsubscribed
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-[color:var(--ink-3)]">
                    {row.email}
                    {row.note ? ` · ${row.note}` : ''}
                  </p>
                  {rowError && <p className="mt-1 text-[11px] text-rose-300">{rowError}</p>}
                </div>

                <div className="shrink-0">
                  {isConverted ? (
                    <p className="text-[12px] font-semibold text-[color:var(--indigo)]">
                      Invited {timeAgo(row.converted_to_invite_at as string)}
                    </p>
                  ) : (
                    <button
                      type="button"
                      disabled={isConverting}
                      onClick={() => handleConvert(row.id)}
                      className="fncon-cta rounded-lg px-3 py-1.5 text-[13px] font-semibold shadow transition hover:opacity-90 disabled:opacity-40"
                    >
                      {isConverting ? 'Converting…' : 'Convert to invite'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
