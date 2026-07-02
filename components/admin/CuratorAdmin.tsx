'use client'

import { useState } from 'react'
import type { Curator, CuratorPlatform } from '@/types'
import { PLATFORM_VALUES, PLATFORM_LABELS } from '@/lib/curators/schema'

// ─── CuratorAdmin ─────────────────────────────────────────────────────────
// Mirrors ChecklistAdmin's inline add/edit/delete state machine, minus
// drag-and-drop (curators have no manual order — no @dnd-kit imports here).

type FormState = {
  name: string
  email: string
  platform: CuratorPlatform
  playlist_name: string
  playlist_url: string
  genre_focus: string // comma-separated tag input; split to string[] on save
  submission_notes: string
}

const EMPTY_FORM: FormState = {
  name: '',
  email: '',
  platform: 'spotify',
  playlist_name: '',
  playlist_url: '',
  genre_focus: '',
  submission_notes: '',
}

function toGenreArray(input: string): string[] {
  return input
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
}

function reachLabel(curator: Curator): string {
  if (curator.reach_signal == null) return 'Reach signal not yet available'
  const unit = curator.platform === 'youtube_music' ? 'subscribers' : 'followers'
  return `~${curator.reach_signal.toLocaleString()} ${unit}`
}

function curatorToForm(curator: Curator): FormState {
  return {
    name: curator.name,
    email: curator.email,
    platform: curator.platform,
    playlist_name: curator.playlist_name ?? '',
    playlist_url: curator.playlist_url ?? '',
    genre_focus: curator.genre_focus.join(', '),
    submission_notes: curator.submission_notes ?? '',
  }
}

function CuratorForm({
  form,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
  saveLabel,
  title,
}: {
  form: FormState
  onChange: (field: keyof FormState, value: string) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  error: string | null
  saveLabel: string
  title: string
}) {
  return (
    <div className="mt-1 mb-2 rounded-[10px] border border-brandindigo/30 bg-[#0a0a0f] p-4">
      <h3 className="mb-3 text-[13px] font-bold text-white/70">{title}</h3>
      {error && <p className="mb-3 text-[13px] text-rose-400">{error}</p>}
      <div className="grid gap-3">
        <div>
          <label className="mb-1 block text-[13px] font-bold text-white/70">Name *</label>
          <input
            value={form.name}
            onChange={e => onChange('name', e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:border-brandindigo/60 focus:outline-none"
            placeholder="Curator or playlist owner name"
          />
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-bold text-white/70">Email *</label>
          <input
            value={form.email}
            onChange={e => onChange('email', e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:border-brandindigo/60 focus:outline-none"
            placeholder="curator@example.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-bold text-white/70">Platform *</label>
          <select
            value={form.platform}
            onChange={e => onChange('platform', e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-card px-3 py-2 text-[14px] text-white focus:border-brandindigo/60 focus:outline-none"
          >
            {PLATFORM_VALUES.map(p => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-bold text-white/70">Playlist / channel name</label>
          <input
            value={form.playlist_name}
            onChange={e => onChange('playlist_name', e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:border-brandindigo/60 focus:outline-none"
            placeholder="e.g. Indie Discoveries"
          />
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-bold text-white/70">Playlist / channel URL</label>
          <input
            value={form.playlist_url}
            onChange={e => onChange('playlist_url', e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:border-brandindigo/60 focus:outline-none"
            placeholder="https://..."
          />
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-bold text-white/70">Genre focus (comma-separated)</label>
          <input
            value={form.genre_focus}
            onChange={e => onChange('genre_focus', e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:border-brandindigo/60 focus:outline-none"
            placeholder="pop, indie, electronic"
          />
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-bold text-white/70">Submission notes</label>
          <input
            value={form.submission_notes}
            onChange={e => onChange('submission_notes', e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:border-brandindigo/60 focus:outline-none"
            placeholder="Submission guidelines or preferences"
          />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-white px-4 py-2 text-[13px] font-bold text-black transition hover:bg-white/90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : saveLabel}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-white/10 px-4 py-2 text-[13px] text-white/60 transition hover:text-white"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export function CuratorAdmin({ initialCurators }: { initialCurators: Curator[] }) {
  const [curators, setCurators] = useState<Curator[]>(initialCurators)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  // ─── Add ────────────────────────────────────────────────────────────
  const handleAddSave = async () => {
    if (!addForm.name.trim()) {
      setAddError('Name is required.')
      return
    }
    if (!addForm.email.trim()) {
      setAddError('Email is required.')
      return
    }
    setSaving(true)
    setAddError(null)
    try {
      const body = {
        name: addForm.name.trim(),
        email: addForm.email.trim(),
        platform: addForm.platform,
        playlist_name: addForm.playlist_name.trim() || null,
        playlist_url: addForm.playlist_url.trim() || null,
        genre_focus: toGenreArray(addForm.genre_focus),
        submission_notes: addForm.submission_notes.trim() || null,
      }
      const res = await fetch('/api/admin/curators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Something went wrong — please try again.')
      }
      const json = (await res.json()) as { data: Curator }
      setCurators(prev => [json.data, ...prev])
      setAddForm(EMPTY_FORM)
      setShowAddForm(false)
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ─── Edit ───────────────────────────────────────────────────────────
  const handleEditClick = (curator: Curator) => {
    setEditingId(curator.id)
    setDeletingId(null)
    setError(null)
    setEditForm(curatorToForm(curator))
  }

  const handleEditSave = async () => {
    if (!editingId) return
    if (!editForm.name.trim()) {
      setError('Name is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const body = {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        platform: editForm.platform,
        playlist_name: editForm.playlist_name.trim() || null,
        playlist_url: editForm.playlist_url.trim() || null,
        genre_focus: toGenreArray(editForm.genre_focus),
        submission_notes: editForm.submission_notes.trim() || null,
      }
      const res = await fetch(`/api/admin/curators/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Something went wrong — please try again.')
      }
      const json = (await res.json()) as { data: Curator }
      setCurators(prev => prev.map(c => (c.id === editingId ? json.data : c)))
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ─── Delete ─────────────────────────────────────────────────────────
  const handleDeleteConfirm = async () => {
    if (!deletingId) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/curators/${deletingId}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Something went wrong — please try again.')
      }
      setCurators(prev => prev.filter(c => c.id !== deletingId))
      setDeletingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ─── Flag inactive toggle ────────────────────────────────────────────
  const handleToggleInactive = async (curator: Curator) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/curators/${curator.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flagged_inactive: !curator.flagged_inactive }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Something went wrong — please try again.')
      }
      const json = (await res.json()) as { data: Curator }
      setCurators(prev => prev.map(c => (c.id === curator.id ? json.data : c)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ─── Reset baseline ──────────────────────────────────────────────────
  const handleResetBaseline = async (curator: Curator) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/curators/${curator.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetBaseline: true }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Something went wrong — please try again.')
      }
      const json = (await res.json()) as { data: Curator }
      setCurators(prev => prev.map(c => (c.id === curator.id ? json.data : c)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-6">
      {/* Add CTA */}
      {!showAddForm && (
        <button
          onClick={() => {
            setShowAddForm(true)
            setAddError(null)
          }}
          className="mb-4 rounded-lg bg-grad px-4 py-2.5 text-[13px] font-bold text-white shadow transition hover:opacity-90"
        >
          Add curator
        </button>
      )}

      {showAddForm && (
        <CuratorForm
          form={addForm}
          onChange={(field, value) => setAddForm(prev => ({ ...prev, [field]: value }))}
          onSave={handleAddSave}
          onCancel={() => {
            setShowAddForm(false)
            setAddForm(EMPTY_FORM)
            setAddError(null)
          }}
          saving={saving}
          error={addError}
          saveLabel="Save curator"
          title="New curator"
        />
      )}

      {curators.length === 0 ? (
        <p className="mt-4 text-[14px] text-white/50">No curators yet. Add the first one above.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {curators.map(curator => {
            const isEditing = editingId === curator.id
            const isDeleting = deletingId === curator.id
            const suggestedHint = !curator.email_valid ? 'Suggested: email bounced' : null
            const hintId = `flag-hint-${curator.id}`

            return (
              <div key={curator.id}>
                <div className="rounded-xl border border-white/10 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold text-white">{curator.name}</p>
                      <p className="mt-0.5 text-[12px] text-lavdim">
                        {curator.email} · {PLATFORM_LABELS[curator.platform]}
                      </p>
                      {curator.genre_focus.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {curator.genre_focus.map(tag => (
                            <span
                              key={tag}
                              className="rounded-full border border-hair bg-card2 px-2 py-0.5 text-[11px] text-lav"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="mt-2 text-[12px] text-lavdim">{reachLabel(curator)}</p>

                      {/* Status pills */}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {curator.claimed_by && (
                          <span className="inline-flex items-center rounded-full border border-brandindigo/30 bg-brandindigo/10 px-2 py-0.5 text-xs font-bold text-brandindigo">
                            Claimed profile
                          </span>
                        )}
                        {!curator.email_valid && (
                          <span className="inline-flex items-center rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-xs font-bold text-rose-300">
                            Email bounced
                          </span>
                        )}
                        {curator.drift_flagged && (
                          <>
                            <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-xs font-bold text-amber-300">
                              Genre focus may have shifted
                            </span>
                            <button
                              onClick={() => handleResetBaseline(curator)}
                              disabled={saving}
                              className="text-[12px] text-white/50 transition hover:text-white disabled:opacity-50"
                            >
                              Reset baseline
                            </button>
                          </>
                        )}
                        {curator.flagged_inactive && (
                          <span className="inline-flex items-center rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-xs font-bold text-rose-300">
                            Inactive
                          </span>
                        )}
                        {curator.do_not_pitch && (
                          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs font-bold text-white/50">
                            Unsubscribed
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditClick(curator)}
                          className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-white/50 transition-colors hover:text-white"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            setDeletingId(curator.id)
                            setEditingId(null)
                            setError(null)
                          }}
                          className="rounded-lg border border-rose-400/20 px-3 py-1.5 text-[12px] text-rose-400/70 transition-colors hover:text-rose-400"
                        >
                          Delete
                        </button>
                      </div>
                      <button
                        onClick={() => handleToggleInactive(curator)}
                        disabled={saving}
                        aria-describedby={suggestedHint ? hintId : undefined}
                        className="text-[12px] text-white/50 transition hover:text-white disabled:opacity-50"
                      >
                        {curator.flagged_inactive ? 'Unflag inactive' : 'Flag inactive'}
                      </button>
                      {suggestedHint && (
                        <span id={hintId} className="text-[11px] text-amber-300">
                          {suggestedHint}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {isEditing && (
                  <CuratorForm
                    form={editForm}
                    onChange={(field, value) => setEditForm(prev => ({ ...prev, [field]: value }))}
                    onSave={handleEditSave}
                    onCancel={() => {
                      setEditingId(null)
                      setError(null)
                    }}
                    saving={saving}
                    error={error}
                    saveLabel="Save curator"
                    title="Edit curator"
                  />
                )}

                {isDeleting && (
                  <div role="alert" className="mt-1 mb-2 rounded-[10px] border border-rose-500/30 bg-rose-500/5 p-4">
                    <p className="mb-3 text-[14px] text-white">
                      Delete this curator? This removes them from the directory permanently and does not affect
                      existing pitch history.
                    </p>
                    {error && <p className="mb-3 text-[13px] text-rose-400">{error}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={handleDeleteConfirm}
                        disabled={saving}
                        className="rounded-lg bg-rose-500 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-rose-600 disabled:opacity-50"
                      >
                        {saving ? 'Deleting…' : 'Delete curator'}
                      </button>
                      <button
                        onClick={() => {
                          setDeletingId(null)
                          setError(null)
                        }}
                        className="rounded-lg border border-white/10 px-4 py-2 text-[13px] text-white/60 transition hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
