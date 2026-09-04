'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { QuickIdeaCapture } from '@/components/ideas/QuickIdeaCapture'
import { contributionReceipt, nextMoveForIdea, relatedIdeas } from '@/lib/ideas/insights'
import { safeIdeaDownloadName, type IdeaPermission, type IdeaView } from '@/lib/ideas/schema'

type Option = { userId: string; name: string }
type WorkOption = { id: string; title: string }

function ageLabel(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function timeLabel(ms: number | null): string {
  if (ms === null) return ''
  const total = Math.floor(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

async function callApi(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const result = (await response.json().catch(() => null)) as { data?: Record<string, unknown>; error?: string } | null
  if (!response.ok) throw new Error(result?.error ?? 'Something went wrong.')
  return result?.data ?? {}
}

export function IdeasInbox({
  ideas,
  requestedIdeaId,
  collaboratorOptions,
  works,
  collectionNames,
}: {
  ideas: IdeaView[]
  requestedIdeaId: string | null
  collaboratorOptions: Option[]
  works: WorkOption[]
  collectionNames: string[]
}) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState(requestedIdeaId ?? ideas[0]?.id ?? null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'active' | 'snoozed' | 'archived' | 'promoted' | 'all'>('active')
  const [collectionFilter, setCollectionFilter] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [savedMessage, setSavedMessage] = useState('')
  const [comment, setComment] = useState('')
  const [commentRecordingId, setCommentRecordingId] = useState<string | null>(null)
  const [playheads, setPlayheads] = useState<Record<string, number>>({})
  const [memberUserId, setMemberUserId] = useState('')
  const [memberPermission, setMemberPermission] = useState<IdeaPermission>('comment')
  const [workId, setWorkId] = useState('')
  const [reference, setReference] = useState('')
  const [collection, setCollection] = useState('')
  const [privateLink, setPrivateLink] = useState<{ id: string; url: string } | null>(null)
  const titleRef = useRef<HTMLInputElement | null>(null)

  const visible = useMemo(() => ideas.filter(idea => {
    const expiredSnooze = idea.state === 'snoozed' && idea.snoozedUntil && new Date(idea.snoozedUntil).getTime() <= Date.now()
    const effectiveState = expiredSnooze ? 'active' : idea.state
    if (filter !== 'all' && effectiveState !== filter) return false
    if (collectionFilter && !idea.collections.some(value => value.name === collectionFilter)) return false
    const haystack = `${idea.title} ${idea.note ?? ''} ${idea.transcript ?? ''} ${idea.moods.join(' ')}`.toLocaleLowerCase()
    return haystack.includes(query.trim().toLocaleLowerCase())
  }).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.capturedAt.localeCompare(a.capturedAt)), [ideas, filter, query, collectionFilter])
  const selected = ideas.find(idea => idea.id === selectedId) ?? visible[0] ?? null

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key)
    setError('')
    setSavedMessage('')
    try {
      await action()
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong.')
    } finally {
      setBusy('')
    }
  }

  function openIdea(ideaId: string) {
    setSelectedId(ideaId)
    window.history.replaceState(null, '', `/ideas?idea=${ideaId}`)
  }

  async function patchIdea(update: Record<string, unknown>) {
    if (!selected) return
    await callApi(`/api/ideas/${selected.id}`, 'PATCH', update)
  }

  async function promote() {
    if (!selected) return
    await run('promote', async () => {
      const data = await callApi(`/api/ideas/${selected.id}/promote`, 'POST', { targetWorkId: workId || null })
      const target = typeof data.workId === 'string' ? data.workId : null
      if (target) router.push(`/vault/works/${target}`)
    })
  }

  const canManage = selected?.viewerPermission === 'owner'
  const canContribute = canManage || selected?.viewerPermission === 'contribute'
  const canComment = canContribute || selected?.viewerPermission === 'comment'
  const currentRecording = selected?.recordings.find(recording => recording.id === commentRecordingId) ?? null
  const related = selected ? relatedIdeas(selected, ideas) : []

  return (
    <div className="mx-auto max-w-[1500px]">
      <QuickIdeaCapture onSaved={ideaId => { openIdea(ideaId); router.refresh() }} />

      <div className="mt-7 grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
        <aside className="rounded-[24px] border border-white/10 bg-card p-4">
          <div className="flex gap-2">
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search your ideas" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-lav/60" />
            <select value={filter} onChange={event => setFilter(event.target.value as typeof filter)} className="rounded-xl border border-white/10 bg-card2 px-2 text-xs">
              <option value="active">Active</option><option value="snoozed">Later</option><option value="archived">Archive</option><option value="promoted">Songs</option><option value="all">All</option>
            </select>
          </div>
          {collectionNames.length > 0 && <select value={collectionFilter} onChange={event => setCollectionFilter(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-card2 px-3 py-2 text-xs text-white/65"><option value="">Every collection</option>{collectionNames.map(name => <option key={name} value={name}>{name}</option>)}</select>}
          <div className="mt-4 space-y-2">
            {visible.map(idea => (
              <button key={idea.id} type="button" onClick={() => openIdea(idea.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selected?.id === idea.id ? 'border-lav/50 bg-lav/10' : 'border-white/5 bg-black/15 hover:border-white/15'}`}>
                <div className="flex items-start justify-between gap-3"><div className="truncate font-bold">{idea.title}</div>{idea.pinned && <span title="Pinned">✦</span>}</div>
                <div className="mt-2 flex gap-2 text-xs text-white/40"><span>{idea.recordings.filter(recording => !recording.archivedAt).length} takes</span><span>·</span><span>{ageLabel(idea.capturedAt)}</span>{idea.viewerPermission !== 'owner' && <><span>·</span><span>shared</span></>}</div>
                {idea.moods.length > 0 && <div className="mt-2 truncate text-xs text-lavdim">{idea.moods.join(' · ')}</div>}
              </button>
            ))}
            {visible.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/40">No ideas here yet. Your next tap can change that.</div>}
          </div>
        </aside>

        {selected ? (
          <section className="min-w-0 rounded-[24px] border border-white/10 bg-card p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold uppercase tracking-[.2em] text-lav">{selected.viewerPermission === 'owner' ? 'Private idea' : `Shared by ${selected.ownerName}`}</div>
                {canManage ? <input ref={titleRef} defaultValue={selected.title} onBlur={event => { if (event.target.value !== selected.title) void run('title', () => patchIdea({ title: event.target.value })) }} className="mt-2 w-full border-0 bg-transparent p-0 text-3xl font-black outline-none" /> : <h2 className="mt-2 text-3xl font-black">{selected.title}</h2>}
                <div className="mt-3 text-sm font-semibold text-lav">Next move: {nextMoveForIdea(selected).label}</div>
              </div>
              {canManage && <div className="flex flex-wrap gap-2 text-xs">
                <button type="button" onClick={() => void run('pin', () => patchIdea({ pinned: !selected.pinned }))} className="rounded-full border border-white/10 px-3 py-2">{selected.pinned ? 'Unpin' : 'Pin'}</button>
                <button type="button" onClick={() => void run('snooze', () => patchIdea({ state: 'snoozed' }))} className="rounded-full border border-white/10 px-3 py-2">Later</button>
                <button type="button" onClick={() => void run('archive', () => patchIdea({ state: selected.state === 'archived' ? 'active' : 'archived' }))} className="rounded-full border border-white/10 px-3 py-2">{selected.state === 'archived' ? 'Restore' : 'Archive'}</button>
              </div>}
            </div>

            <div className="mt-7 space-y-3">
              {selected.recordings.filter(recording => !recording.archivedAt).map((recording, index) => (
                <div key={recording.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><span className="font-bold">{recording.label || `Take ${selected.recordings.length - index}`}</span><span className="ml-2 text-xs text-white/35">{recording.kind} · {recording.creatorName}</span></div>
                    <div className="flex gap-2 text-xs">
                      {(['keep', 'maybe'] as const).map(rating => <button key={rating} type="button" onClick={() => void run(`rating-${recording.id}`, async () => { await callApi(`/api/ideas/${selected.id}/recordings/${recording.id}`, 'PATCH', { rating: recording.rating === rating ? null : rating }) })} className={`rounded-full border px-3 py-1 ${recording.rating === rating ? 'border-lav bg-lav/15 text-white' : 'border-white/10 text-white/45'}`}>{rating}</button>)}
                      {canManage && <button type="button" onClick={() => void run(`archive-${recording.id}`, async () => { await callApi(`/api/ideas/${selected.id}/recordings/${recording.id}`, 'PATCH', { archived: true }) })} className="text-white/35 hover:text-white">Archive</button>}
                    </div>
                  </div>
                  {recording.playbackUrl ? <audio controls preload="metadata" src={recording.playbackUrl} onTimeUpdate={event => setPlayheads(current => ({ ...current, [recording.id]: event.currentTarget.currentTime }))} className="mt-3 w-full" /> : <p className="mt-3 text-xs text-white/40">Playback link expired. Refresh to reload it.</p>}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/40">
                    {recording.markers.map(marker => <span key={marker.id}>◆ {timeLabel(marker.timestampMs)}</span>)}
                    {recording.downloadUrl && <a href={recording.downloadUrl} download={safeIdeaDownloadName(selected.title, recording)} className="underline hover:text-white">Download</a>}
                  </div>
                </div>
              ))}
              {selected.recordings.filter(recording => !recording.archivedAt).length === 0 && <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/40">This idea is ready for its first sound.</p>}
              {selected.recordings.some(recording => recording.archivedAt) && <details className="rounded-xl border border-white/5 px-4 py-3 text-xs text-white/45"><summary className="cursor-pointer">Archived takes ({selected.recordings.filter(recording => recording.archivedAt).length})</summary><div className="mt-3 space-y-2">{selected.recordings.filter(recording => recording.archivedAt).map(recording => <div key={recording.id} className="flex items-center justify-between gap-3"><span>{recording.label || recording.kind} · {recording.creatorName}</span>{canManage && <button type="button" onClick={() => void run(`restore-${recording.id}`, async () => { await callApi(`/api/ideas/${selected.id}/recordings/${recording.id}`, 'PATCH', { archived: false }) })} className="text-lav underline">Restore</button>}</div>)}</div></details>}
            </div>

            {canContribute && <div className="mt-4"><QuickIdeaCapture compact ideaId={selected.id} onSaved={() => router.refresh()} /></div>}

            <div className="mt-7 grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 p-5">
                <h3 className="font-bold">Words around the sound</h3>
                <label className="mt-4 block text-xs text-white/45">Notes</label>
                <textarea defaultValue={selected.note ?? ''} disabled={!canManage} onBlur={event => { if (event.target.value !== (selected.note ?? '')) void run('note', () => patchIdea({ note: event.target.value })) }} placeholder="A line, feeling, pocket, or direction…" className="mt-1 min-h-24 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm outline-none disabled:opacity-60" />
                <label className="mt-4 block text-xs text-white/45">Transcript or rough lyrics</label>
                <textarea defaultValue={selected.transcript ?? ''} disabled={!canManage} onBlur={event => { if (event.target.value !== (selected.transcript ?? '')) void run('transcript', () => patchIdea({ transcript: event.target.value })) }} placeholder="Paste a transcript or catch the words you heard." className="mt-1 min-h-28 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm outline-none disabled:opacity-60" />
                {canManage && <input defaultValue={selected.moods.join(', ')} onBlur={event => void run('moods', () => patchIdea({ moods: event.target.value.split(',') }))} placeholder="Mood tags: midnight, warm, gospel" className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm" />}
              </div>

              <div className="rounded-2xl border border-white/10 p-5">
                <h3 className="font-bold">Conversation</h3>
                <div className="mt-3 max-h-48 space-y-3 overflow-auto">
                  {selected.comments.map(value => <div key={value.id} className="text-sm"><span className="font-bold">{value.authorName}</span>{value.timestampMs !== null && <span className="ml-2 text-lav">{timeLabel(value.timestampMs)}</span>}<p className="mt-1 text-white/65">{value.body}</p></div>)}
                  {selected.comments.length === 0 && <p className="text-sm text-white/35">No comments yet.</p>}
                </div>
                {canComment && <div className="mt-4">
                  <select value={commentRecordingId ?? ''} onChange={event => setCommentRecordingId(event.target.value || null)} className="w-full rounded-xl border border-white/10 bg-card2 p-2 text-xs"><option value="">Comment on the whole idea</option>{selected.recordings.filter(recording => !recording.archivedAt).map(recording => <option key={recording.id} value={recording.id}>{recording.label || recording.kind} at {timeLabel(Math.round((playheads[recording.id] ?? 0) * 1000))}</option>)}</select>
                  <div className="mt-2 flex gap-2"><input value={comment} onChange={event => setComment(event.target.value)} placeholder="Leave a thought…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 p-3 text-sm" /><button type="button" disabled={!comment.trim() || busy === 'comment'} onClick={() => void run('comment', async () => { await callApi(`/api/ideas/${selected.id}/comments`, 'POST', { body: comment, recordingId: commentRecordingId, timestampMs: currentRecording ? Math.round((playheads[currentRecording.id] ?? 0) * 1000) : null }); setComment('') })} className="rounded-xl bg-white px-4 font-bold text-black disabled:opacity-40">Send</button></div>
                </div>}
              </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 p-5">
                <h3 className="font-bold">References & collections</h3>
                <div className="mt-3 space-y-2 text-sm">{selected.references.map(value => value.kind === 'text' ? <p key={value.id} className="text-white/60">{value.value}</p> : <a key={value.id} href={value.value} target="_blank" rel="noreferrer" className="block truncate text-lav underline">{value.label || value.value}</a>)}</div>
                {canContribute && <div className="mt-3 flex gap-2"><input value={reference} onChange={event => setReference(event.target.value)} placeholder="Paste a link or write a reference" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 p-3 text-sm" /><button type="button" onClick={() => void run('reference', async () => { await callApi(`/api/ideas/${selected.id}/references`, 'POST', { kind: /^https?:\/\//i.test(reference) ? 'link' : 'text', value: reference }); setReference('') })} disabled={!reference.trim()} className="rounded-xl border border-white/15 px-3 disabled:opacity-40">Add</button></div>}
                {canManage && <div className="mt-4"><div className="flex flex-wrap gap-2">{selected.collections.map(value => <button key={value.id} type="button" title="Remove from collection" onClick={() => void run(`collection-${value.id}`, async () => { await callApi(`/api/ideas/${selected.id}/collections`, 'DELETE', { name: value.name }) })} className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/55">{value.name} ×</button>)}{selected.collections.length === 0 && <span className="text-xs text-white/35">No collection yet</span>}</div><div className="mt-2 flex gap-2"><input list="idea-collections" value={collection} onChange={event => setCollection(event.target.value)} placeholder="Add to collection" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 p-3 text-sm" /><datalist id="idea-collections">{collectionNames.map(name => <option key={name} value={name} />)}</datalist><button type="button" onClick={() => void run('collection', async () => { await callApi(`/api/ideas/${selected.id}/collections`, 'POST', { name: collection }); setCollection('') })} disabled={!collection.trim()} className="rounded-xl border border-white/15 px-3 disabled:opacity-40">Save</button></div></div>}
              </div>

              <div className="rounded-2xl border border-white/10 p-5">
                <h3 className="font-bold">People in this idea</h3>
                <div className="mt-3 space-y-2">{selected.members.map(member => <div key={member.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs"><span>{member.name}</span>{canManage ? <span className="flex items-center gap-2"><select value={member.permission} onChange={event => void run(`member-${member.userId}`, async () => { await callApi(`/api/ideas/${selected.id}/members`, 'POST', { userId: member.userId, permission: event.target.value }) })} className="rounded-lg border border-white/10 bg-card2 px-2 py-1"><option value="listen">listen</option><option value="comment">comment</option><option value="contribute">contribute</option></select><button type="button" onClick={() => void run(`remove-${member.userId}`, async () => { await callApi(`/api/ideas/${selected.id}/members`, 'DELETE', { userId: member.userId }) })} className="text-white/35 hover:text-red-200">Remove</button></span> : <span className="text-white/35">{member.permission}</span>}</div>)}{selected.members.length === 0 && <span className="text-sm text-white/35">Only you</span>}</div>
                {canManage && <><div className="mt-4 grid grid-cols-[1fr_auto] gap-2"><select value={memberUserId} onChange={event => setMemberUserId(event.target.value)} className="min-w-0 rounded-xl border border-white/10 bg-card2 p-3 text-sm"><option value="">Choose a claimed collaborator</option>{collaboratorOptions.filter(option => !selected.members.some(member => member.userId === option.userId)).map(option => <option key={option.userId} value={option.userId}>{option.name}</option>)}</select><select value={memberPermission} onChange={event => setMemberPermission(event.target.value as IdeaPermission)} className="rounded-xl border border-white/10 bg-card2 p-2 text-xs"><option value="listen">listen</option><option value="comment">comment</option><option value="contribute">contribute</option></select></div><button type="button" disabled={!memberUserId} onClick={() => void run('member', async () => { await callApi(`/api/ideas/${selected.id}/members`, 'POST', { userId: memberUserId, permission: memberPermission }); setMemberUserId('') })} className="mt-2 rounded-full border border-white/15 px-4 py-2 text-xs disabled:opacity-40">Invite to idea</button>
                  <div className="mt-5 border-t border-white/10 pt-4"><p className="text-xs text-white/40">Or make a one-use link for an existing Funūn member, good for 7 days.</p><button type="button" onClick={() => void run('link', async () => { const data = await callApi(`/api/ideas/${selected.id}/share-links`, 'POST', { permission: memberPermission, expiresInDays: 7 }); const url = typeof data.url === 'string' ? data.url : ''; const id = typeof data.id === 'string' ? data.id : ''; setPrivateLink(url && id ? { id, url } : null); if (url) await navigator.clipboard.writeText(url).catch(() => undefined) })} className="mt-2 rounded-full border border-white/15 px-4 py-2 text-xs">Create & copy link</button>{privateLink && <div className="mt-2 flex gap-2"><input readOnly value={privateLink.url} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 p-2 text-xs" /><button type="button" onClick={() => void run('revoke-link', async () => { await callApi(`/api/ideas/${selected.id}/share-links`, 'DELETE', { id: privateLink.id }); setPrivateLink(null) })} className="text-xs text-white/45 underline">Revoke</button></div>}</div>
                </>}
              </div>
            </div>

            {contributionReceipt(selected).length > 0 && <div className="mt-5 rounded-2xl border border-white/10 p-5"><h3 className="font-bold">Contribution receipt</h3><div className="mt-3 flex flex-wrap gap-2">{contributionReceipt(selected).map(receipt => <span key={receipt.name} className="rounded-full bg-white/5 px-3 py-2 text-xs">{receipt.name} · {receipt.recordings} recordings · {receipt.comments} comments</span>)}</div><p className="mt-3 text-xs text-white/35">A provenance record, not a split or rights assignment.</p></div>}

            {related.length > 0 && <div className="mt-5"><h3 className="text-sm font-bold">This might belong near…</h3><div className="mt-2 flex flex-wrap gap-2">{related.map(idea => <button key={idea.id} type="button" onClick={() => openIdea(idea.id)} className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/60">{idea.title}</button>)}</div></div>}

            {canManage && <div className="mt-7 rounded-2xl border border-lav/25 bg-lav/5 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="font-bold">Ready to become a song?</h3><p className="mt-1 max-w-xl text-sm text-white/50">Carry every active recording and contributor into a Writer’s Room. Rights, splits, publishing, approvals, and registration stay untouched until you choose to handle them later.</p></div><div className="flex flex-wrap gap-2"><select value={workId} onChange={event => setWorkId(event.target.value)} className="rounded-xl border border-white/10 bg-card2 p-3 text-sm"><option value="">Start a new Writer’s Room</option>{works.map(work => <option key={work.id} value={work.id}>Add to {work.title}</option>)}</select><button type="button" onClick={() => void promote()} disabled={busy === 'promote'} className="rounded-xl bg-white px-5 py-3 font-bold text-black disabled:opacity-50">Promote idea</button></div></div><div className="mt-4 flex flex-wrap gap-4 text-xs"><button type="button" onClick={() => void run('branch', async () => { const data = await callApi(`/api/ideas/${selected.id}/branch`, 'POST', { requestId: crypto.randomUUID() }); if (typeof data.id === 'string') openIdea(data.id) })} className="text-lav underline">Branch this direction</button><a href={`/api/ideas/${selected.id}/export`} className="text-white/50 underline">Download provenance manifest</a></div></div>}

            {(error || savedMessage) && <div className={`sticky bottom-4 mt-5 rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-400/30 bg-red-950/80 text-red-200' : 'border-lav/30 bg-card text-lav'}`}>{error || savedMessage}</div>}
            {busy && <div className="mt-3 text-xs text-white/35">Saving…</div>}
          </section>
        ) : <section className="grid min-h-[430px] place-items-center rounded-[24px] border border-dashed border-white/10 text-center text-white/40"><div><div className="text-4xl">✦</div><p className="mt-3">Record one thought. We’ll keep the rest out of your way.</p></div></section>}
      </div>
    </div>
  )
}
