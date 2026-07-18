'use client'

import { useCallback, useEffect, useState } from 'react'
import type { NetworkData, NetworkEntry, BlockedEntry, NetworkPerson } from '@/lib/network/query'
import type { NetworkRelationship } from '@/lib/trust-safety/contracts'

// ─────────────────────────────────────────────────────────────────────────
// Network tab (Plan 13-02, DISCOVER-04). Client-fetches the single GET
// /api/network payload once, then slices it into tabs client-side —
// server enforces every privacy rule (viewer-scoping, public-safe columns,
// own-blocklist-only); this component only renders what the API returns.
// ─────────────────────────────────────────────────────────────────────────

type TabKey = 'connections' | 'following' | 'followers' | 'pending' | 'blocked'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'connections', label: 'Connections' },
  { key: 'following', label: 'Following' },
  { key: 'followers', label: 'Followers' },
  { key: 'pending', label: 'Pending' },
  { key: 'blocked', label: 'Blocked' },
]

const EMPTY_DATA: NetworkData = {
  connections: [],
  following: [],
  followers: [],
  pendingOutgoing: [],
  pendingIncoming: [],
  blocked: [],
}

export function NetworkTab() {
  const [tab, setTab] = useState<TabKey>('connections')
  const [data, setData] = useState<NetworkData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/network', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not load your network')
      setData({
        connections: json.connections ?? [],
        following: json.following ?? [],
        followers: json.followers ?? [],
        pendingOutgoing: json.pendingOutgoing ?? [],
        pendingIncoming: json.pendingIncoming ?? [],
        blocked: json.blocked ?? [],
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your network')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const counts: Record<TabKey, number> = {
    connections: data.connections.length,
    following: data.following.length,
    followers: data.followers.length,
    pending: data.pendingOutgoing.length + data.pendingIncoming.length,
    blocked: data.blocked.length,
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 lg:px-8">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[.24em] text-emerald-300/80">Your Network</p>
        <h1 className="mt-3 text-3xl font-black tracking-[-.03em] text-white md:text-4xl">
          Who you follow, who follows you, and who you trust.
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
          Manage connections, review pending requests, and control who can reach you.
        </p>
      </header>

      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-black/25 p-2">
        {TABS.map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={[
              'min-w-28 shrink-0 rounded-xl px-4 py-3 text-left transition',
              tab === item.key ? 'bg-white text-black' : 'bg-white/[0.03] text-white hover:bg-white/[0.08]',
            ].join(' ')}
          >
            <span className="block text-sm font-black">{item.label}</span>
            <span
              className={['mt-1 block text-[11px]', tab === item.key ? 'text-black/55' : 'text-white/38'].join(' ')}
            >
              {counts[item.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {loading && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-sm text-white/55">
            Loading your network…
          </div>
        )}
        {error && (
          <div className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-5 text-sm text-rose-100">
            {error}
          </div>
        )}
        {!loading && !error && <TabPanel tab={tab} data={data} onChanged={load} />}
      </div>
    </div>
  )
}

function TabPanel({ tab, data, onChanged }: { tab: TabKey; data: NetworkData; onChanged: () => void }) {
  if (tab === 'connections') {
    if (data.connections.length === 0) {
      return <Empty text="No connections yet. Send a connect request from a profile or People Search." />
    }
    return (
      <div className="space-y-3">
        {data.connections.map(entry => (
          <PersonRow key={entry.profileId} entry={entry} onChanged={onChanged} />
        ))}
      </div>
    )
  }

  if (tab === 'following') {
    if (data.following.length === 0) {
      return <Empty text="You aren't following anyone outside your connections yet." />
    }
    return (
      <div className="space-y-3">
        {data.following.map(entry => (
          <PersonRow key={entry.profileId} entry={entry} onChanged={onChanged} />
        ))}
      </div>
    )
  }

  if (tab === 'followers') {
    if (data.followers.length === 0) {
      return <Empty text="No one is following you outside your connections yet." />
    }
    return (
      <div className="space-y-3">
        {data.followers.map(entry => (
          <PersonRow key={entry.profileId} entry={entry} onChanged={onChanged} />
        ))}
      </div>
    )
  }

  if (tab === 'pending') {
    const hasAny = data.pendingIncoming.length > 0 || data.pendingOutgoing.length > 0
    if (!hasAny) return <Empty text="No pending connection requests." />
    return (
      <div className="space-y-6">
        {data.pendingIncoming.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[.18em] text-white/45">Requests to you</h2>
            <div className="space-y-3">
              {data.pendingIncoming.map(entry => (
                <PersonRow key={entry.profileId} entry={entry} onChanged={onChanged} />
              ))}
            </div>
          </section>
        )}
        {data.pendingOutgoing.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[.18em] text-white/45">Requests you sent</h2>
            <div className="space-y-3">
              {data.pendingOutgoing.map(entry => (
                <PersonRow key={entry.profileId} entry={entry} onChanged={onChanged} />
              ))}
            </div>
          </section>
        )}
      </div>
    )
  }

  // blocked
  if (data.blocked.length === 0) return <Empty text="You haven't blocked anyone." />
  return (
    <div className="space-y-3">
      {data.blocked.map(entry => (
        <BlockedRow key={entry.blockedProfileId} entry={entry} onChanged={onChanged} />
      ))}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-white/50">
      {text}
    </div>
  )
}

function PersonRow({ entry, onChanged }: { entry: NetworkEntry; onChanged: () => void }) {
  const kind: NetworkRelationship = entry.relationship
  const { profile } = entry
  const [busy, setBusy] = useState(false)
  const [confirmingBlock, setConfirmingBlock] = useState(false)
  const [following, setFollowing] = useState(kind === 'follower' ? Boolean(entry.viewerFollowsBack) : kind === 'following')

  async function respond(action: 'accept' | 'decline' | 'withdraw') {
    if (busy || !entry.connectionId) return
    setBusy(true)
    try {
      const res = await fetch('/api/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: entry.connectionId, action }),
      })
      if (res.ok) onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function toggleFollow() {
    if (busy) return
    setBusy(true)
    const next = !following
    setFollowing(next) // optimistic
    try {
      const res = await fetch('/api/follows', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followeeId: profile.id }),
      })
      if (!res.ok) setFollowing(!next) // revert
      else if (kind === 'following') onChanged() // unfollow moves the row out of this tab
    } finally {
      setBusy(false)
    }
  }

  async function confirmBlock() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/network/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockedProfileId: profile.id }),
      })
      if (res.ok) onChanged()
    } finally {
      setBusy(false)
      setConfirmingBlock(false)
    }
  }

  const canRespond = kind === 'pending_incoming' || kind === 'pending_outgoing'

  return (
    <article className="rounded-[18px] border border-white/10 bg-black/25 p-4">
      <div className="flex items-start gap-3">
        <Avatar person={profile} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <a href={profile.profileHref} className="truncate text-sm font-black text-white hover:underline">
              {profile.displayName}
            </a>
            {profile.verified && (
              <span title="Verified" className="text-emerald-300" aria-label="Verified member">
                ✓
              </span>
            )}
          </div>
          {profile.handle && <p className="truncate text-xs text-white/45">@{profile.handle}</p>}
          {profile.primaryRole && (
            <p className="mt-1 text-[11px] font-bold uppercase tracking-[.12em] text-emerald-200/70">
              {profile.primaryRole}
            </p>
          )}

          {!confirmingBlock ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={profile.profileHref}
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold text-white/80 hover:text-white"
              >
                View profile
              </a>
              <a
                href={`/messages?with=${profile.id}`}
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold text-white/80 hover:text-white"
              >
                Message
              </a>

              {kind === 'pending_incoming' && (
                <>
                  <button
                    type="button"
                    onClick={() => respond('accept')}
                    disabled={busy}
                    className="rounded-full bg-emerald-300 px-3 py-1.5 text-xs font-black text-black hover:bg-emerald-200 disabled:opacity-60"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => respond('decline')}
                    disabled={busy}
                    className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold text-white/80 hover:text-white disabled:opacity-60"
                  >
                    Decline
                  </button>
                </>
              )}

              {kind === 'pending_outgoing' && (
                <button
                  type="button"
                  onClick={() => respond('withdraw')}
                  disabled={busy}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold text-white/80 hover:text-white disabled:opacity-60"
                >
                  Withdraw
                </button>
              )}

              {(kind === 'following' || kind === 'follower') && (
                <button
                  type="button"
                  onClick={toggleFollow}
                  disabled={busy}
                  className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-black text-black hover:bg-white disabled:opacity-60"
                >
                  {following ? 'Following' : 'Follow'}
                </button>
              )}

              {!canRespond && (
                <button
                  type="button"
                  onClick={() => setConfirmingBlock(true)}
                  className="rounded-full border border-rose-400/30 px-3 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-500/10"
                >
                  Block
                </button>
              )}
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3">
              <p className="text-xs text-rose-100">
                Block {profile.displayName}? They will not be able to view your profile, message you, or find you in
                discovery.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={confirmBlock}
                  disabled={busy}
                  className="rounded-full bg-rose-400 px-3 py-1.5 text-xs font-black text-black hover:bg-rose-300 disabled:opacity-60"
                >
                  {busy ? 'Blocking…' : 'Confirm block'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingBlock(false)}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold text-white/70 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function BlockedRow({ entry, onChanged }: { entry: BlockedEntry; onChanged: () => void }) {
  const { profile } = entry
  const [busy, setBusy] = useState(false)
  const [confirmingUnblock, setConfirmingUnblock] = useState(false)

  async function confirmUnblock() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/network/blocks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockedProfileId: profile.id }),
      })
      if (res.ok) onChanged()
    } finally {
      setBusy(false)
      setConfirmingUnblock(false)
    }
  }

  return (
    <article className="rounded-[18px] border border-white/10 bg-black/25 p-4">
      <div className="flex items-start gap-3">
        <Avatar person={profile} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-white">{profile.displayName}</p>
          {profile.handle && <p className="truncate text-xs text-white/45">@{profile.handle}</p>}

          {!confirmingUnblock ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setConfirmingUnblock(true)}
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold text-white/80 hover:text-white"
              >
                Unblock
              </button>
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-white/15 bg-white/[0.04] p-3">
              <p className="text-xs text-white/70">
                Unblock {profile.displayName}? They will be able to view your profile, message you, and find you
                again.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={confirmUnblock}
                  disabled={busy}
                  className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-black text-black hover:bg-white disabled:opacity-60"
                >
                  {busy ? 'Unblocking…' : 'Confirm unblock'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingUnblock(false)}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold text-white/70 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function Avatar({ person }: { person: NetworkPerson }) {
  if (person.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={person.avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
  }
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-black text-white/60">
      {person.displayName.charAt(0).toUpperCase()}
    </div>
  )
}
