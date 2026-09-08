'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MarkdownBody } from '@/components/playbook/MarkdownDoc'
import type { AdoptionState } from '@/lib/playbook/adoption'
import type { PublicationAssessment } from '@/lib/playbook/publication-manifest'

type SourcePayload = {
  title: string
  roomKey: string
  subgroupKey: string
  subGroupId: string
  sourcePath: string
  markdown: string
  sourceHash: string
  reviewerRoles: string[]
  gamePlanKeys: string[]
  supersedesTitles: string[]
}

type CheckPayload = {
  state: AdoptionState
  sourceHash: string
  existing: { id: string; title: string; slug: string | null; status: string; hasPendingDraft: boolean } | null
}

function checkLabel(check: CheckPayload | null): string {
  if (!check) return 'Checking Playbook state…'
  if (check.state === 'available') return 'Verified · no existing adoption'
  if (check.state === 'unchanged') return 'Verified · exact source already adopted'
  if (check.state === 'changed') return check.existing?.hasPendingDraft ? 'Changed · a review draft already exists' : 'Verified · repository source changed'
  return 'Blocked · source belongs to another room'
}

export function GuidedDoctrineAdoption({
  item,
  draftCreationAllowed,
  holdReason,
  onClose,
}: {
  item: PublicationAssessment
  draftCreationAllowed: boolean
  holdReason: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const [source, setSource] = useState<SourcePayload | null>(null)
  const [check, setCheck] = useState<CheckPayload | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadAndCheck() {
      setBusy(true)
      setError(null)
      setSuccess(null)
      setConfirmed(false)
      setSource(null)
      setCheck(null)
      try {
        const sourceResponse = await fetch(
          `/api/admin/playbook/publication/source?key=${encodeURIComponent(item.key)}&roomKey=${encodeURIComponent(item.roomKey)}`,
          { cache: 'no-store' }
        )
        const sourceBody = (await sourceResponse.json()) as { data?: SourcePayload; error?: string }
        if (!sourceResponse.ok || !sourceBody.data) throw new Error(sourceBody.error ?? 'Unable to load doctrine source')
        if (!active) return
        setSource(sourceBody.data)

        const checkResponse = await fetch('/api/admin/playbook/adopt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'check',
            manifestKey: item.key,
            roomKey: sourceBody.data.roomKey,
            subGroupId: sourceBody.data.subGroupId,
            title: sourceBody.data.title,
            sourcePath: sourceBody.data.sourcePath,
            markdown: sourceBody.data.markdown,
          }),
        })
        const checkBody = (await checkResponse.json()) as { data?: CheckPayload; error?: string }
        if (!checkResponse.ok || !checkBody.data) throw new Error(checkBody.error ?? 'Unable to verify Playbook state')
        if (active) setCheck(checkBody.data)
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Unable to prepare doctrine adoption')
      } finally {
        if (active) setBusy(false)
      }
    }

    void loadAndCheck()
    return () => {
      active = false
    }
  }, [item.key, item.roomKey])

  const canCreate =
    source !== null &&
    check !== null &&
    item.state !== 'blocked' &&
    draftCreationAllowed &&
    (check.state === 'available' || (check.state === 'changed' && !check.existing?.hasPendingDraft))

  async function createDraft() {
    if (!source || !check || !canCreate || !confirmed) return
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const action = check.state === 'changed' ? 'propose_update' : 'adopt'
      const response = await fetch('/api/admin/playbook/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          manifestKey: item.key,
          roomKey: source.roomKey,
          subGroupId: source.subGroupId,
          title: source.title,
          sourcePath: source.sourcePath,
          markdown: source.markdown,
        }),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Unable to create doctrine review draft')
      setSuccess(action === 'adopt' ? 'Review draft created. Nothing was published.' : 'Source update draft created. The live entry was not overwritten.')
      setConfirmed(false)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create doctrine review draft')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-[color:var(--indigo)] bg-[color:var(--panel-2)]" aria-label={`Adoption preview for ${item.title}`}>
      <div className="flex flex-col gap-3 border-b border-[color:var(--border)] px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[color:var(--indigo)]">Guided adoption · review first</p>
          <h3 className="mt-1 text-[15px] font-extrabold text-[color:var(--ink)]">{item.title}</h3>
          <p className="mt-1 text-[11px] text-[color:var(--ink-3)]">Destination: {item.roomKey} / {item.subgroupKey}</p>
        </div>
        <button type="button" onClick={onClose} className="self-start rounded-lg border border-[color:var(--border)] px-3 py-2 text-[11px] font-bold text-[color:var(--ink-2)]">Close preview</button>
      </div>

      {busy && !source && <p className="px-4 py-8 text-center text-[12px] text-[color:var(--ink-3)]">Loading the allowlisted source and checking its Playbook state…</p>}
      {error && <p role="alert" className="m-4 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-[11px] text-red-200">{error}</p>}

      {source && (
        <>
          <div className="grid gap-px bg-[color:var(--border)] lg:grid-cols-2">
            <div className="min-w-0 bg-[color:var(--panel-2)] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[color:var(--ink-3)]">Exact repository source</p>
              <pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[color:var(--panel)] p-4 font-mono text-[11px] leading-5 text-[color:var(--ink-2)]">{source.markdown}</pre>
            </div>
            <div className="min-w-0 bg-[color:var(--panel-2)] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[color:var(--ink-3)]">Playbook rendering</p>
              <div className="mt-3 max-h-[520px] overflow-auto rounded-lg bg-[color:var(--panel)] p-4"><MarkdownBody content={source.markdown} /></div>
            </div>
          </div>

          <div className="space-y-3 border-t border-[color:var(--border)] p-4">
            <div className="grid gap-2 text-[10.5px] text-[color:var(--ink-3)] md:grid-cols-2">
              <p><span className="font-bold text-[color:var(--ink-2)]">Source:</span> <span className="break-all font-mono">{source.sourcePath}</span></p>
              <p><span className="font-bold text-[color:var(--ink-2)]">SHA-256:</span> <span className="break-all font-mono">{source.sourceHash}</span></p>
              <p><span className="font-bold text-[color:var(--ink-2)]">Reviewers:</span> {source.reviewerRoles.join(', ')}</p>
              <p><span className="font-bold text-[color:var(--ink-2)]">Gameplans:</span> {source.gamePlanKeys.length > 0 ? source.gamePlanKeys.join(', ') : 'None required'}</p>
            </div>

            {source.supersedesTitles.length > 0 && <p className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[11px] leading-5 text-amber-200">This doctrine has {source.supersedesTitles.length} legacy entries to review. Creating this draft does not supersede them.</p>}
            {item.reasons.length > 0 && <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-[11px] leading-5 text-red-200">Adoption remains blocked: {item.reasons.join('; ')}.</p>}
            <p className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 text-[11px] font-bold text-[color:var(--ink-2)]">{checkLabel(check)}</p>
            {success && <p role="status" className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-200">{success}</p>}
            {!draftCreationAllowed && holdReason && <p className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[11px] leading-5 text-amber-200">{holdReason} Preview remains available, but draft creation is held.</p>}

            {canCreate && !success && (
              <div className="flex flex-col gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-3 lg:flex-row lg:items-center lg:justify-between">
                <label className="flex items-start gap-2 text-[11px] leading-5 text-[color:var(--ink-2)]">
                  <input type="checkbox" className="mt-1" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
                  I verified this exact source, destination, and review path. Create one unpublished review draft.
                </label>
                <button type="button" disabled={!confirmed || busy} onClick={() => void createDraft()} className="shrink-0 rounded-lg px-4 py-2 text-[11px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40" style={{ background: 'var(--grad)' }}>
                  {check?.state === 'changed' ? 'Create update draft' : 'Create review draft'}
                </button>
              </div>
            )}
            <p className="text-[10.5px] leading-5 text-[color:var(--ink-3)]">This import path is optional. New Playbook entries may still be authored directly in the Playbook editor without a repository Markdown file.</p>
          </div>
        </>
      )}
    </section>
  )
}
