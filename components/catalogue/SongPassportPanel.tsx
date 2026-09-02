'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PassportLayer } from '@/lib/song-passport/schema'
import type { SongPassportFieldView, SongPassportView } from '@/lib/song-passport/view'

const LAYERS: Array<{ key: PassportLayer; label: string; description: string }> = [
  { key: 'contributor', label: 'People', description: 'Who contributed, their roles and identity details.' },
  { key: 'composition', label: 'Song', description: 'The composition, lyrics, writers and publishing facts.' },
  { key: 'recording_version', label: 'Recordings', description: 'What belongs to each take, mix and master candidate.' },
  { key: 'release', label: 'Release', description: 'The facts used when this song moves into a Release Report.' },
]

export function SongPassportPanel({
  workId,
  passport,
  viewerIsOwner,
  recordingVersions,
  songTitle,
}: {
  workId: string
  passport: SongPassportView | null
  viewerIsOwner: boolean
  recordingVersions: Array<{ id: string; label: string }>
  songTitle: string
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [layer, setLayer] = useState<PassportLayer>('composition')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<SongPassportFieldView | null>(null)
  const [editValue, setEditValue] = useState('')
  const [artifactMessage, setArtifactMessage] = useState<string | null>(null)

  async function action(body: Record<string, unknown>, key: string) {
    setBusy(key)
    setError(null)
    const res = await fetch(`/api/works/${workId}/passport`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const response = (await res.json().catch(() => ({}))) as { error?: string }
    setBusy(null)
    if (!res.ok) {
      setError(response.error ?? 'Could not update the Song Passport.')
      return false
    }
    router.refresh()
    return true
  }

  async function discover() {
    setBusy('discovery')
    setError(null)
    const res = await fetch(`/api/works/${workId}/passport/discovery`, { method: 'POST' })
    const response = (await res.json().catch(() => ({}))) as { error?: string }
    setBusy(null)
    if (!res.ok) {
      setError(response.error ?? 'Could not review the existing song information.')
      return
    }
    setExpanded(true)
    router.refresh()
  }

  async function generateArtifact(kind: 'passport_json' | 'metadata_sidecar' | 'tagged_mp3' | 'custody_package', purpose: 'professional_handoff' | 'distributor_upload' | 'archive' | 'custody_transfer') {
    setBusy(`artifact:${kind}`)
    setError(null)
    setArtifactMessage(null)
    const res = await fetch(`/api/works/${workId}/passport/artifacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, purpose }),
    })
    const response = (await res.json().catch(() => ({}))) as { error?: string; data?: { url?: string; artifactId?: string } }
    setBusy(null)
    if (!res.ok || !response.data?.url) {
      setError(response.error ?? 'Could not create the Passport export.')
      return
    }
    setArtifactMessage(`Export ${response.data.artifactId ?? ''} is ready. Its receipt is stored in the Passport.`)
    window.location.assign(response.data.url)
    router.refresh()
  }

  function beginEdit(field: SongPassportFieldView) {
    setEditing(field)
    setEditValue(typeof field.value === 'string' ? field.value : JSON.stringify(field.value, null, 2))
  }

  async function saveProposal() {
    if (!editing) return
    let value: unknown = editValue
    if (typeof editing.value !== 'string') {
      try {
        value = JSON.parse(editValue)
      } catch {
        setError('That structured value is not valid JSON yet.')
        return
      }
    }
    const ok = await action({ operation: 'propose', valueId: editing.id, value }, `edit:${editing.id}`)
    if (ok) setEditing(null)
  }

  const currentLayer = LAYERS.find(item => item.key === layer)!
  const fields = passport?.fields.filter(field => field.layer === layer) ?? []
  const trusted = passport ? `${passport.trustedFacts} of ${passport.visibleFacts} visible facts confirmed or locked` : 'Not reviewed yet'

  return (
    <section className="mt-4 rounded-[12px] border border-hair bg-card/55" aria-label="Song Passport">
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <span>
          <span className="block text-[13px] font-semibold text-white">Song Passport</span>
          <span className="block text-[11px] text-lavdim">Metadata that follows the song · {trusted}</span>
        </span>
        <span className="text-[12px] text-lav">{expanded ? 'Close' : 'Open'} ↓</span>
      </button>

      {expanded && (
        <div className="border-t border-hair px-4 py-4">
          {!passport ? (
            <div className="rounded-[10px] border border-hairstrong bg-card2 px-4 py-4">
              <p className="text-[13px] font-semibold text-white">Build this song’s Passport from what Funūn already knows.</p>
              <p className="mt-1 text-[11px] leading-relaxed text-lavdim">
                You will get inherited facts to review—not automatic approvals. Ambiguities stay visible.
              </p>
              {viewerIsOwner ? (
                <button type="button" disabled={busy === 'discovery'} onClick={() => void discover()} className="mt-3 rounded-[9px] bg-grad px-3 py-2 text-[12px] font-semibold text-white shadow-cta disabled:opacity-50">
                  {busy === 'discovery' ? 'Reviewing…' : 'Review existing song information'}
                </button>
              ) : (
                <p className="mt-3 text-[11px] text-lav">The song owner can start this review.</p>
              )}
            </div>
          ) : (
            <>
              <div role="tablist" aria-label="Song Passport layers" className="flex flex-wrap gap-2">
                {LAYERS.map(item => (
                  <button key={item.key} type="button" role="tab" aria-selected={layer === item.key} onClick={() => setLayer(item.key)} className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${layer === item.key ? 'border-brandindigo bg-brandindigo/15 text-white' : 'border-hair text-lavdim hover:text-white'}`}>
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-lavdim">{currentLayer.description}</p>

              {passport.issues.length > 0 && (
                <div className="mt-3 rounded-[9px] border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-[11px] text-amber-200">
                  {passport.issues.length} source {passport.issues.length === 1 ? 'difference needs' : 'differences need'} review. Funūn has not chosen a winner.
                </div>
              )}

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {fields.map(field => (
                  <article key={field.id} className="rounded-[10px] border border-hair bg-card2 px-3 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-semibold text-white">{field.label}</p>
                        <p className="mt-0.5 text-[10px] text-lavdim">{stateLabel(field.state)} · from {sourceLabel(field.sourceKind)}</p>
                      </div>
                      <span className={stateClass(field.state)}>{field.state}</span>
                    </div>
                    <div className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-words text-[11px] text-lav">
                      {displayValue(field.value)}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {field.canPropose && <button type="button" onClick={() => beginEdit(field)} className="text-[10px] font-semibold text-brandindigo hover:text-white">Propose update</button>}
                      {field.canConfirm && <button type="button" disabled={busy === `confirm:${field.id}`} onClick={() => void action({ operation: 'confirm', valueId: field.id }, `confirm:${field.id}`)} className="text-[10px] font-semibold text-emerald-300 hover:text-white">Confirm mine</button>}
                      <button type="button" disabled={busy === `dispute:${field.id}`} onClick={() => {
                        const reason = window.prompt('What is wrong or unclear about this fact?')?.trim()
                        if (reason) void action({ operation: 'dispute', valueId: field.id, reason }, `dispute:${field.id}`)
                      }} className="text-[10px] font-semibold text-amber-300 hover:text-white">Flag a problem</button>
                    </div>
                  </article>
                ))}
              </div>

              {fields.length === 0 && <p className="mt-4 rounded-[9px] border border-dashed border-hair px-3 py-4 text-center text-[11px] text-lavdim">No visible facts in this layer yet.</p>}

              {layer === 'recording_version' && (
                <div className="mt-4 rounded-[10px] border border-hairstrong bg-card2 px-3 py-3">
                  <p className="text-[11px] font-semibold text-white">Release master</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-lavdim">
                    Select the exact take or final mix. A later replacement becomes a successor; it never erases the prior master.
                  </p>
                  {recordingVersions.length === 0 ? (
                    <p className="mt-2 text-[11px] text-lav">Upload a take or final mix first.</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {recordingVersions.map(version => {
                        const selected = passport.currentMaster?.workVersionId === version.id
                        return (
                          <button key={version.id} type="button" disabled={selected || busy === `master:${version.id}`} onClick={() => void action({ operation: 'select_master', versionId: version.id }, `master:${version.id}`)} className={`rounded-[8px] border px-3 py-1.5 text-[10px] font-semibold ${selected ? 'border-emerald-400/40 text-emerald-300' : 'border-hairstrong text-lav hover:text-white'}`}>
                            {selected ? '✓ Master · ' : 'Select · '}{version.label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {passport.releaseCandidates.length > 0 && (
                    <details className="mt-3 rounded-[8px] border border-hair px-3 py-2">
                      <summary className="cursor-pointer text-[10px] font-semibold text-lav">Final mix already lives in a Release Report?</summary>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {passport.releaseCandidates.map(candidate => (
                          <button key={candidate.trackId} type="button" disabled={busy === `attach:${candidate.trackId}`} onClick={() => void action({ operation: 'attach_final_mix', trackId: candidate.trackId }, `attach:${candidate.trackId}`)} className="rounded-[8px] border border-hairstrong px-2 py-1 text-[10px] text-lav hover:text-white">
                            Attach {candidate.projectTitle} · {candidate.trackTitle}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-[9px] text-lavdim">Funūn links the existing private asset as a recording version; it does not create a second master file.</p>
                    </details>
                  )}
                  {!passport.permissions.includes('select_master') && viewerIsOwner && (
                    <button type="button" disabled={busy === 'grant:master'} onClick={() => void action({ operation: 'grant_self', permission: 'select_master', acknowledge: true }, 'grant:master')} className="mt-3 text-[10px] font-semibold text-brandindigo hover:text-white">Explicitly accept master-selection authority</button>
                  )}
                  {passport.currentMaster && !passport.releaseLink && viewerIsOwner && (
                    <button type="button" disabled={busy === 'graduate'} onClick={() => void action({ operation: 'graduate_release', masterDesignationId: passport.currentMaster!.id, releaseTitle: songTitle }, 'graduate')} className="mt-3 rounded-[8px] bg-grad px-3 py-1.5 text-[10px] font-semibold text-white shadow-cta disabled:opacity-50">Create the Release Report</button>
                  )}
                  {passport.releaseLink && (
                    <a href={`/vault/${passport.releaseLink.vaultProjectId}/play`} className="mt-3 inline-block text-[10px] font-semibold text-emerald-300 hover:text-white">Open the linked Release Report →</a>
                  )}
                </div>
              )}

              <details className="mt-4 rounded-[9px] border border-hair px-3 py-2">
                <summary className="cursor-pointer text-[11px] font-semibold text-lav">Still needed in {currentLayer.label}</summary>
                <p className="mt-2 text-[10px] leading-relaxed text-lavdim">{passport.missingByLayer[layer].slice(0, 12).join(' · ') || 'Nothing currently missing.'}</p>
              </details>

              {passport.tasks.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold text-white">Review tasks</p>
                  <p className="text-[10px] text-lavdim">Finishing a task does not change readiness; the underlying fact still needs the right evidence or approval.</p>
                  <div className="mt-2 space-y-2">
                    {passport.tasks.map(task => (
                      <div key={task.id} className="flex items-center justify-between gap-3 rounded-[8px] bg-card2 px-3 py-2">
                        <span className="text-[11px] text-lav">{task.title}</span>
                        <button type="button" disabled={busy === `task:${task.id}`} onClick={() => void action({ operation: 'task_update', taskId: task.id, status: 'completed' }, `task:${task.id}`)} className="shrink-0 text-[10px] font-semibold text-brandindigo hover:text-white">Mark done</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <details className="mt-4 rounded-[10px] border border-hair bg-card2 px-3 py-3">
                <summary className="cursor-pointer text-[11px] font-semibold text-white">Delivery, portability and custody</summary>
                <p className="mt-2 text-[10px] leading-relaxed text-lavdim">Exports are derived copies bound to one immutable Passport snapshot. A receipt means Funūn generated the file—not that a distributor or recipient accepted it.</p>
                {passport.permissions.includes('export_delivery_safe') ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={busy === 'artifact:passport_json'} onClick={() => void generateArtifact('passport_json', 'professional_handoff')} className="rounded-[8px] border border-hairstrong px-3 py-1.5 text-[10px] text-lav hover:text-white">Passport JSON</button>
                    <button type="button" disabled={busy === 'artifact:metadata_sidecar'} onClick={() => void generateArtifact('metadata_sidecar', 'distributor_upload')} className="rounded-[8px] border border-hairstrong px-3 py-1.5 text-[10px] text-lav hover:text-white">Metadata sidecar</button>
                    {passport.permissions.includes('deliver_clean_master') ? (
                      <button type="button" disabled={busy === 'artifact:tagged_mp3'} onClick={() => void generateArtifact('tagged_mp3', 'distributor_upload')} className="rounded-[8px] border border-hairstrong px-3 py-1.5 text-[10px] text-lav hover:text-white">Tagged MP3 copy</button>
                    ) : viewerIsOwner ? (
                      <button type="button" disabled={busy === 'grant:clean-master'} onClick={() => void action({ operation: 'grant_self', permission: 'deliver_clean_master', acknowledge: true }, 'grant:clean-master')} className="rounded-[8px] border border-amber-400/30 px-3 py-1.5 text-[10px] text-amber-200">Explicitly enable clean-master copies</button>
                    ) : null}
                    {passport.permissions.includes('transfer_custody') ? (
                      <button type="button" disabled={busy === 'artifact:custody_package'} onClick={() => void generateArtifact('custody_package', 'custody_transfer')} className="rounded-[8px] border border-hairstrong px-3 py-1.5 text-[10px] text-lav hover:text-white">Portable custody package</button>
                    ) : null}
                  </div>
                ) : viewerIsOwner ? (
                  <button type="button" disabled={busy === 'grant:export'} onClick={() => void action({ operation: 'grant_self', permission: 'export_delivery_safe', acknowledge: true }, 'grant:export')} className="mt-3 text-[10px] font-semibold text-brandindigo hover:text-white">Explicitly enable delivery-safe exports</button>
                ) : (
                  <p className="mt-2 text-[10px] text-lav">Export authority has not been granted to this account.</p>
                )}

                {viewerIsOwner && (
                  passport.permissions.includes('transfer_custody') ? (
                    <button type="button" disabled={busy === 'custody-transfer'} onClick={() => {
                      const newControllerName = window.prompt('Who now controls the master?')?.trim()
                      if (!newControllerName) return
                      const evidence = window.prompt('What signed agreement, sale, or evidence supports this transfer?')?.trim()
                      if (evidence) void action({ operation: 'record_custody_transfer', newControllerName, evidence, acknowledge: true }, 'custody-transfer')
                    }} className="mt-3 block text-[10px] font-semibold text-amber-200 hover:text-white">Record a completed master custody transfer</button>
                  ) : (
                    <button type="button" disabled={busy === 'grant:custody'} onClick={() => void action({ operation: 'grant_self', permission: 'transfer_custody', acknowledge: true }, 'grant:custody')} className="mt-3 block text-[10px] font-semibold text-brandindigo hover:text-white">Explicitly enable custody-transfer records</button>
                  )
                )}

                {passport.artifacts.length > 0 && (
                  <div className="mt-3 border-t border-hair pt-3">
                    <p className="text-[10px] font-semibold text-lav">Recent evidence</p>
                    {passport.artifacts.slice(0, 5).map(artifact => <p key={artifact.id} className="mt-1 break-all text-[9px] text-lavdim">{artifact.kind.replaceAll('_', ' ')} · {artifact.artifactSha256.slice(0, 16)}…</p>)}
                  </div>
                )}
                {passport.custodyEvents.length > 0 && <p className="mt-3 text-[9px] text-lavdim">{passport.custodyEvents.length} recent custody {passport.custodyEvents.length === 1 ? 'event is' : 'events are'} preserved.</p>}
                {artifactMessage && <p role="status" className="mt-3 text-[10px] text-emerald-300">{artifactMessage}</p>}
              </details>

              {viewerIsOwner && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-hair pt-4">
                  <button type="button" disabled={busy === 'discovery'} onClick={() => void discover()} className="rounded-[8px] border border-hairstrong px-3 py-1.5 text-[10px] font-semibold text-lav hover:text-white">Refresh inherited facts</button>
                  {passport.hasHiddenLegalFacts && !passport.permissions.includes('view_legal') && (
                    <button type="button" disabled={busy === 'grant:legal-view'} onClick={() => void action({ operation: 'grant_self', permission: 'view_legal', acknowledge: true }, 'grant:legal-view')} className="rounded-[8px] border border-amber-400/30 px-3 py-1.5 text-[10px] font-semibold text-amber-200">Explicitly enable legal-fact review</button>
                  )}
                  {(['composition', 'release'] as const).map(scope => {
                    const permission = scope === 'composition' ? 'approve_composition' : 'approve_release'
                    const hasPermission = passport.permissions.includes(permission)
                    return hasPermission ? (
                      <button key={scope} type="button" disabled={busy === `approve:${scope}`} onClick={() => void action({ operation: 'approve', scope }, `approve:${scope}`)} className="rounded-[8px] border border-emerald-400/40 px-3 py-1.5 text-[10px] font-semibold text-emerald-300 hover:text-white">Approve {scope} snapshot</button>
                    ) : (
                      <button key={scope} type="button" disabled={busy === `grant:${scope}`} onClick={() => void action({ operation: 'grant_self', permission, acknowledge: true }, `grant:${scope}`)} className="rounded-[8px] border border-hairstrong px-3 py-1.5 text-[10px] font-semibold text-lav hover:text-white">Explicitly accept {scope} approval authority</button>
                    )
                  })}
                </div>
              )}
            </>
          )}
          {error && <p role="alert" className="mt-3 text-[11px] text-red-300">{error}</p>}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 px-6 py-10">
          <div className="w-full max-w-lg rounded-[12px] border border-hair bg-card px-5 py-5">
            <p className="text-[13px] font-semibold text-white">Propose {editing.label}</p>
            <p className="mt-1 text-[10px] text-lavdim">The current revision stays in history. This proposal becomes the new visible draft after a conflict check.</p>
            <textarea value={editValue} onChange={event => setEditValue(event.target.value)} rows={8} className="mt-3 w-full rounded-[9px] border border-hair bg-card2 px-3 py-2 font-mono text-[11px] text-white outline-none" />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="rounded-[8px] border border-hairstrong px-3 py-1.5 text-[11px] text-lav">Cancel</button>
              <button type="button" disabled={busy === `edit:${editing.id}`} onClick={() => void saveProposal()} className="rounded-[8px] bg-grad px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50">Save proposal</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value, null, 2)
}

function stateLabel(state: string) {
  return ({ inherited: 'Found in an existing Funūn record', draft: 'Proposed, not approved', confirmed: 'Confirmed by its subject', locked: 'Bound to an approval', outdated: 'Needs a successor', disputed: 'Someone flagged a disagreement' } as Record<string, string>)[state] ?? state
}

function sourceLabel(source: string) {
  return source.replaceAll('_', ' ')
}

function stateClass(state: string) {
  const tone = state === 'confirmed' || state === 'locked' ? 'border-emerald-400/40 text-emerald-300' : state === 'disputed' || state === 'outdated' ? 'border-amber-400/40 text-amber-300' : 'border-hairstrong text-lavdim'
  return `rounded-full border px-2 py-0.5 text-[9px] ${tone}`
}
