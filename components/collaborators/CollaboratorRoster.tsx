'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { CollaboratorProfile } from '@/lib/collaborators'
import { CollaboratorCard } from '@/components/collaborators/CollaboratorCard'
import { CollaboratorForm } from '@/components/collaborators/CollaboratorForm'
import { CollaboratorInvitePrompt } from '@/components/collaborators/CollaboratorInvitePrompt'
import { QuickInviteModal } from '@/components/collaborators/QuickInviteModal'

// ─── CollaboratorRoster ───────────────────────────────────────
// Two-tab page-level client component:
//   Tab 1 — My Roster: the artist's own collaborator roster (Phase 1).
//   Tab 2 — My Credits: every project the logged-in user is credited on
//            via the email-based claim (Phase 4).

type SplitSheetRef = {
  song_name: string
  vault_project_id: string | null
}

type SplitSheetParty = {
  id?: string
  split_percentage: number
  role: string | null
  split_sheets: SplitSheetRef | SplitSheetRef[] | null
}

type CreditRow = CollaboratorProfile & {
  split_sheet_parties?: SplitSheetParty[]
}

type Props = {
  collaborators: CollaboratorProfile[]
  credits: CreditRow[]
  initialTab?: 'roster' | 'credits'
  memberHandles?: Record<string, string>
  inviteStatus?: Record<string, { sentAt: string; status: string }>
}

export function CollaboratorRoster({
  collaborators,
  credits,
  initialTab = 'roster',
  memberHandles = {},
  inviteStatus = {},
}: Props) {
  const [activeTab, setActiveTab] = useState<'roster' | 'credits'>(initialTab)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [quickInviteOpen, setQuickInviteOpen] = useState(false)
  const [list, setList] = useState<CollaboratorProfile[]>(
    collaborators.filter(collaborator => !collaborator.archived_at)
  )
  // Post-save invite nudge (D-08a) — set only when the just-saved row is a
  // NEW collaborator with a non-empty email; never gates the save itself.
  const [invitePromptFor, setInvitePromptFor] = useState<CollaboratorProfile | null>(null)
  // Claimed collaborator rows prove identity, not authorship. Flatten only
  // real split-sheet relationships so a bare email/name match can never be
  // presented as a song credit, even if a future server query regresses.
  const creditEntries = credits.flatMap(credit =>
    (credit.split_sheet_parties ?? []).map((party, index) => ({
      key: party.id ?? `${credit.id}-${index}`,
      party,
    }))
  )

  function handleSaved(saved: CollaboratorProfile) {
    // Determine new-vs-edit from the pre-save list (closure state), before
    // the save is folded into `list` below.
    const isNew = !list.some(c => c.id === saved.id)

    setList(prev => {
      const idx = prev.findIndex(c => c.id === saved.id)
      if (idx !== -1) {
        const next = [...prev]
        next[idx] = saved
        return next.sort((a, b) => a.name.localeCompare(b.name))
      }
      return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name))
    })
    setCreating(false)
    setEditingId(null)

    if (isNew && saved.email && saved.email.trim()) {
      setInvitePromptFor(saved)
    }
  }

  // Archive a claimed collaborator — send a non-null marker; server forces the
  // actual timestamp (Task 4 / CR-03). On success, remove the row from active
  // client state immediately; archived identities remain preserved server-side.
  async function handleArchive(id: string) {
    const res = await fetch('/api/collaborators/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived_at: new Date().toISOString() }),
    })
    if (res.ok) {
      setList(prev => prev.filter(c => c.id !== id))
    }
  }

  // Delete an unclaimed collaborator. On 409 (row was claimed concurrently)
  // do NOT remove the row — card renders Archive for claimed rows.
  async function handleDelete(id: string) {
    const res = await fetch('/api/collaborators/' + id, { method: 'DELETE' })
    if (res.ok) {
      setList(prev => prev.filter(c => c.id !== id))
    }
    // 409 = claimed — leave the row in place, no action
  }

  // Toggle the favorite star optimistically, then sync with the server.
  async function handleFavoriteToggle(collab: CollaboratorProfile) {
    const res = await fetch('/api/collaborators/' + collab.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_favorite: !collab.is_favorite }),
    })
    if (res.ok) {
      setList(prev =>
        prev.map(c => c.id === collab.id ? { ...c, is_favorite: !c.is_favorite } : c)
      )
    }
  }

  // QuickInviteModal already sent its own invite (via /api/collaborators/
  // quick-invite) before calling this — fold the returned row into `list`
  // by id (replace on the reuse path, append otherwise), re-sorted the same
  // way handleSaved does. Never opens CollaboratorInvitePrompt: that nudge
  // belongs to the full-form save path, and the quick path already sent.
  function handleQuickInvited(collab: CollaboratorProfile) {
    setList(prev => {
      const idx = prev.findIndex(c => c.id === collab.id)
      if (idx !== -1) {
        const next = [...prev]
        next[idx] = collab
        return next.sort((a, b) => a.name.localeCompare(b.name))
      }
      return [...prev, collab].sort((a, b) => a.name.localeCompare(b.name))
    })
  }

  // Send an educational invite email to a non-member collaborator via the
  // existing 24h-cooldown endpoint. res.ok covers success, cooldown, and the
  // best-effort email path; the card owns the sending/sent/error UI.
  async function handleInvite(id: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch('/api/collaborators/' + id + '/invite', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (res.ok) return { ok: true }
      return { ok: false, error: (body && body.error) || 'Could not send invite' }
    } catch {
      return { ok: false, error: 'Network error — try again' }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-white">Collaborators</h1>
          <p className="mt-1 text-[14px] text-lavdim">
            Your roster — add once, auto-fill everywhere.
          </p>
          <p className="mt-1 text-[13px] text-lavdim">
            Skip the hassle — invite them to Funūn and let them do the typing.
          </p>
        </div>
        {activeTab === 'roster' && !creating && (
          <div className="flex items-center gap-2">
            {/* Invite is now the primary path (owner steer, 260825-i4i
                follow-up) — skips the artist re-typing a collaborator's
                own rights details. */}
            <button
              type="button"
              onClick={() => setQuickInviteOpen(true)}
              className="rounded-lg bg-grad px-4 py-2 text-sm font-semibold text-white shadow-cta"
            >
              Invite collaborator
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(true)
                setEditingId(null)
              }}
              className="rounded-lg border border-hairstrong px-4 py-2 text-sm font-semibold text-lav hover:text-white"
            >
              Add collaborator
            </button>
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div
        role="tablist"
        aria-label="Collaborator sections"
        className="flex gap-1 border-b border-white/10"
      >
        <button
          role="tab"
          aria-selected={activeTab === 'roster'}
          onClick={() => setActiveTab('roster')}
          className={[
            'px-4 pb-2 text-sm font-medium transition-colors',
            activeTab === 'roster'
              ? 'border-b-2 border-white text-white'
              : 'text-white/50 hover:text-white/80',
          ].join(' ')}
        >
          My Roster
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'credits'}
          onClick={() => setActiveTab('credits')}
          className={[
            'px-4 pb-2 text-sm font-medium transition-colors',
            activeTab === 'credits'
              ? 'border-b-2 border-white text-white'
              : 'text-white/50 hover:text-white/80',
          ].join(' ')}
        >
          My Credits
        </button>
      </div>

      {/* ─── My Roster tab ──────────────────────────────────── */}
      <div role="tabpanel" hidden={activeTab !== 'roster'}>
        {/* Create form (inline, replaces button while open) */}
        {creating && (
          <CollaboratorForm
            onSaved={handleSaved}
            onCancel={() => setCreating(false)}
            onSwitchToInvite={() => {
              setCreating(false)
              setQuickInviteOpen(true)
            }}
          />
        )}

        {/* Post-save invite prompt (D-08a) — default-on, dismissible, never
            blocks the save; the row above is already committed to `list`. */}
        {invitePromptFor && (
          <div className="mb-3">
            <CollaboratorInvitePrompt
              collaboratorName={invitePromptFor.name}
              onSend={() => handleInvite(invitePromptFor.id)}
              onDismiss={() => setInvitePromptFor(null)}
            />
          </div>
        )}

        {/* Card grid */}
        {list.length === 0 && !creating ? (
          /* Empty state */
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            {/* People icon — 40×40 */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-10 w-10 text-white/20"
              aria-hidden
            >
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3z" />
              <path d="M8 11c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3z" />
              <path d="M8 13c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              <path d="M16 13c-.29 0-.62.02-.97.05C16.19 13.89 17 15.1 17 17v2h7v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            <p className="text-[15px] font-semibold text-white/60">No collaborators yet</p>
            <p className="max-w-xs text-[13px] text-lavdim">
              Invite the people you work with and they&apos;ll fill in their own rights details —
              or add someone manually if you already have their info.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuickInviteOpen(true)}
                className="rounded-lg bg-grad px-4 py-2 text-sm font-semibold text-white shadow-cta"
              >
                Invite a collaborator
              </button>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="rounded-lg border border-hairstrong px-4 py-2 text-sm font-semibold text-lav hover:text-white"
              >
                Add your first collaborator
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(156px,1fr))]">
            {list.map(collab =>
              editingId === collab.id ? (
                <div key={collab.id} className="sm:col-span-2 lg:col-span-3">
                  <CollaboratorForm
                    initial={collab}
                    onSaved={handleSaved}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <CollaboratorCard
                  key={collab.id}
                  collaborator={collab}
                  onEdit={() => {
                    setEditingId(collab.id)
                    setCreating(false)
                  }}
                  onArchive={() => handleArchive(collab.id)}
                  onDelete={() => handleDelete(collab.id)}
                  onFavoriteToggle={() => handleFavoriteToggle(collab)}
                  onInvite={() => handleInvite(collab.id)}
                  invite={inviteStatus[collab.id] ?? null}
                  memberHandle={collab.claimed_by ? memberHandles[collab.claimed_by] ?? null : null}
                />
              )
            )}
          </div>
        )}
      </div>

      {/* ─── My Credits tab ─────────────────────────────────── */}
      <div role="tabpanel" hidden={activeTab !== 'credits'}>
        {creditEntries.length === 0 ? (
          /* Empty state — no claimed credits found */
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            {/* Music note icon — 40×40 */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-10 w-10 text-white/20"
              aria-hidden
            >
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <p className="text-[15px] font-semibold text-white/60">No credits yet</p>
            <p className="max-w-xs text-[13px] text-lavdim">
              When another artist credits you on a project and you join Funūn, your contributions
              appear here.
            </p>
          </div>
        ) : (
          /* Credits list */
          <ul className="flex flex-col gap-2">
            {creditEntries.map(({ key, party }) => {
              const sheet = Array.isArray(party.split_sheets)
                ? party.split_sheets[0]
                : party.split_sheets
              const songName = sheet?.song_name ?? 'Untitled'
              const projectId = sheet?.vault_project_id

              return (
                <li
                  key={key}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  {/* Song / project name */}
                  <span className="text-sm text-white">{songName}</span>

                  {/* Role chip */}
                  {party.role && (
                    <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/70">
                      {party.role}
                    </span>
                  )}

                  {/* Split percentage */}
                  {party.split_percentage != null && (
                    <span className="tabular-nums text-xs text-white/60">
                      {party.split_percentage}%
                    </span>
                  )}

                  {/* Split sheet link */}
                  {projectId && (
                    <Link
                      href={`/split-sheets?project=${projectId}`}
                      className="ml-auto text-xs text-brandindigo hover:underline"
                      aria-label={`View split sheet for ${songName}`}
                    >
                      View split sheet
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {quickInviteOpen && (
        <QuickInviteModal
          onClose={() => setQuickInviteOpen(false)}
          onInvited={handleQuickInvited}
        />
      )}
    </div>
  )
}
