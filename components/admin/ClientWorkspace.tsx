'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BuyerOrgContact, ClientRelationshipLogEntry } from '@/lib/client-partners/contacts'
import type { GamePlanTopic, PickerTopic } from '@/lib/client-partners/game-plan'
import type { Selects, SelectsStatus } from '@/lib/selects/types'
import type { BuyerOrgStatus } from '@/lib/buyers/schema'
import { ContactsPanel, PersonContactPanel } from './ContactsPanel'
import { GamePlanPanel } from './GamePlanPanel'

// ─── ClientWorkspace (31-09, R1) ────────────────────────────────────────────
// The four-job company/person workspace: Contacts · Activity · Curation
// (Selects) · Notes+status, plus the company website (company view only).
// mode="company" renders the full ContactsPanel (list + rich record); the
// person workspace mounts mode="person" — the same shell scoped to one
// contact via PersonContactPanel. A clearly-marked slot is left for 31.1's
// Game Plan panel (person view only, R14) — not built here.
//
// D-31.1-02 verification Gap 2: last-contact must render BOTH as a
// room-table column (ClientPartnersList.tsx, already built) AND on this
// drill-in card. lastContactedAt below is tracked/display only — it never
// feeds computeHealth() (lib/client-partners/health.ts owns the color
// clock exclusively via the executed-license signal, D-31.1-09).

export type ActivityBriefItem = {
  id: string
  title: string | null
  status: string
  createdAt: string
}

export type ActivityLicenseRequestItem = {
  id: string
  stage: string
  vaultProjectTitle: string | null
  createdAt: string
}

export type ClientWorkspaceProps = {
  mode: 'company' | 'person'
  orgId: string
  companyName: string
  companyStatus: BuyerOrgStatus
  companyWebsite?: string | null
  personName?: string
  contacts: BuyerOrgContact[]
  initialSelects: Selects[]
  initialRelationshipLog: ClientRelationshipLogEntry[]
  briefs: ActivityBriefItem[]
  licenseRequests: ActivityLicenseRequestItem[]
  /** Person view only (R14/D-31.1-06) — omitted/empty for mode="company". */
  initialGamePlanTopics?: GamePlanTopic[]
  /** Person view only — read-time seeded+authored Game-Plan suggestion base (31.2-08/D-31.2-07). */
  gamePlanPickerTopics?: PickerTopic[]
  /** ISO timestamp of the most recent relationship-log contact (company: any contact; person: scoped to this contact), or null if none logged yet. Display only — never a health-color input (D-31.1-02/09). */
  lastContactedAt?: string | null
}

type JobKey = 'contacts' | 'activity' | 'curation' | 'notes'

const JOBS: { key: JobKey; label: string }[] = [
  { key: 'contacts', label: 'Contacts' },
  { key: 'activity', label: 'Activity' },
  { key: 'curation', label: 'Curation · Selects' },
  { key: 'notes', label: 'Notes + status' },
]

const SELECTS_STATUS_LABELS: Record<SelectsStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  approved: 'Approved',
  changes_requested: 'Changes requested',
}

function StatusPill({ status }: { status: BuyerOrgStatus }) {
  const isActive = status === 'active'
  return (
    <span
      className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
      style={
        isActive
          ? { color: 'var(--green-fg)', background: 'var(--green-bg)', borderColor: 'var(--green-line)' }
          : { color: 'var(--amber-fg)', background: 'var(--amber-bg)', borderColor: 'var(--amber-line)' }
      }
    >
      {isActive ? 'Active' : 'Pending onboarding'}
    </span>
  )
}

function SelectsStatusPill({ status }: { status: SelectsStatus }) {
  const tone =
    status === 'approved'
      ? { color: 'var(--green-fg)', background: 'var(--green-bg)', borderColor: 'var(--green-line)' }
      : status === 'changes_requested'
        ? { color: 'var(--rose-fg)', background: 'var(--rose-bg)', borderColor: 'var(--rose-line)' }
        : status === 'sent'
          ? { color: 'var(--amber-fg)', background: 'var(--amber-bg)', borderColor: 'var(--amber-line)' }
          : { color: 'var(--ink-3)', background: 'var(--panel-2)', borderColor: 'var(--border-2)' }
  return (
    <span className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium" style={tone}>
      {SELECTS_STATUS_LABELS[status] ?? status}
    </span>
  )
}

function formatDateTime(dateString: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(dateString))
  } catch {
    return dateString
  }
}

function formatDate(dateString: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(dateString))
  } catch {
    return dateString
  }
}

// D-31.1-02 verification Gap 2 — verbose relative-time copy for the card
// header ("Last contacted 12 days ago"), distinct from
// ClientPartnersList.tsx's abbreviated room-table formatRelative ("12d
// ago"). Display only; never feeds computeHealth (D-31.1-09).
function formatLastContacted(iso: string | null | undefined): string {
  if (!iso) return 'No contact logged yet'
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return 'No contact logged yet'
  const days = Math.floor((Date.now() - then) / 86400000)
  if (days <= 0) return 'Last contacted today'
  if (days === 1) return 'Last contacted 1 day ago'
  return `Last contacted ${days} days ago`
}

// ─── Curation / Selects job ─────────────────────────────────────────────
function CurationJob({ orgId, initialSelects }: { orgId: string; initialSelects: Selects[] }) {
  const router = useRouter()
  const [selectsList, setSelectsList] = useState<Selects[]>(initialSelects)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleBuildSelects = async () => {
    const name = window.prompt('Name this Selects (e.g. "Holiday social")')
    if (!name || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/selects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, name: name.trim() }),
      })
      const json = (await res.json().catch(() => ({}))) as { data?: Selects; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Failed to start a Selects.')
      if (json.data) {
        setSelectsList(prev => [json.data as Selects, ...prev])
        router.push(`/admin/selects/${json.data.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start a Selects.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p
          className="rounded-lg border px-3 py-2 text-[12.5px]"
          style={{ color: 'var(--rose-fg)', background: 'var(--rose-bg)', borderColor: 'var(--rose-line)' }}
        >
          {error}
        </p>
      )}

      {selectsList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--border-2)] bg-[color:var(--panel)] p-6 text-center">
          <p className="text-[14px] font-medium text-[color:var(--ink)]">No Selects yet</p>
          <p className="mt-1 text-[12.5px] text-[color:var(--ink-3)]">
            Pull tracks from The Crate and send this client a first Selects.
          </p>
          <button
            type="button"
            onClick={handleBuildSelects}
            disabled={busy}
            className="mt-4 rounded-lg bg-[image:var(--grad)] px-4 py-2 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Starting…' : 'Build Selects'}
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-[color:var(--ink-3)]">
              {selectsList.length} Select{selectsList.length !== 1 ? 's' : ''}
            </p>
            <button
              type="button"
              onClick={handleBuildSelects}
              disabled={busy}
              className="rounded-lg bg-[image:var(--grad)] px-3 py-1.5 text-[12px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Starting…' : 'Build Selects'}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {selectsList.map(selects => (
              <a
                key={selects.id}
                href={`/admin/selects/${selects.id}`}
                className="flex items-center justify-between rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4 transition hover:border-[color:var(--border-2)]"
              >
                <div>
                  <p className="text-[14px] font-medium text-[color:var(--ink)]">{selects.name}</p>
                  <p className="mt-0.5 text-[12px] text-[color:var(--ink-3)]">
                    Updated {formatDate(selects.updated_at)}
                  </p>
                </div>
                <SelectsStatusPill status={selects.status} />
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Activity job (read-only) ────────────────────────────────────────────
function ActivityJob({
  briefs,
  licenseRequests,
}: {
  briefs: ActivityBriefItem[]
  licenseRequests: ActivityLicenseRequestItem[]
}) {
  if (briefs.length === 0 && licenseRequests.length === 0) {
    return <p className="text-[13px] text-[color:var(--ink-3)]">No briefs or license requests yet.</p>
  }
  return (
    <div className="flex flex-col gap-5">
      {briefs.length > 0 && (
        <div>
          <h3 className="text-[11px] font-medium uppercase tracking-[.08em] text-[color:var(--ink-3)]">
            Briefs
          </h3>
          <div className="mt-2 flex flex-col gap-2">
            {briefs.map(brief => (
              <div
                key={brief.id}
                className="flex items-center justify-between rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2"
              >
                <span className="text-[13px] text-[color:var(--ink)]">{brief.title || 'Untitled brief'}</span>
                <span className="text-[11px] text-[color:var(--ink-3)]">
                  {brief.status} · {formatDate(brief.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {licenseRequests.length > 0 && (
        <div>
          <h3 className="text-[11px] font-medium uppercase tracking-[.08em] text-[color:var(--ink-3)]">
            License requests
          </h3>
          <div className="mt-2 flex flex-col gap-2">
            {licenseRequests.map(req => (
              <div
                key={req.id}
                className="flex items-center justify-between rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2"
              >
                <span className="text-[13px] text-[color:var(--ink)]">
                  {req.vaultProjectTitle || 'Untitled track'}
                </span>
                <span className="text-[11px] text-[color:var(--ink-3)]">
                  {req.stage} · {formatDate(req.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Notes + status job ──────────────────────────────────────────────────
function NotesJob({
  orgId,
  companyStatus,
  initialLog,
  contactId,
}: {
  orgId: string
  companyStatus: BuyerOrgStatus
  initialLog: ClientRelationshipLogEntry[]
  contactId?: string
}) {
  const [log, setLog] = useState<ClientRelationshipLogEntry[]>(initialLog)
  const [kind, setKind] = useState<'note' | 'conversation'>('note')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAppend = async () => {
    if (!body.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/client-partners/${orgId}/relationship-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, body: body.trim(), contact_id: contactId ?? null }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        data?: ClientRelationshipLogEntry
        error?: string
      }
      if (!res.ok) throw new Error(json.error ?? 'Failed to log entry.')
      if (json.data) setLog(prev => [json.data as ClientRelationshipLogEntry, ...prev])
      setBody('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log entry.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[color:var(--ink-3)]">Company status</span>
        <StatusPill status={companyStatus} />
      </div>

      <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
        {error && <p className="mb-2 text-[12.5px] text-[color:var(--rose-fg)]">{error}</p>}
        <div className="flex gap-2">
          <select
            value={kind}
            onChange={e => setKind(e.target.value as 'note' | 'conversation')}
            className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-2 py-2 text-[13px] text-[color:var(--ink)] focus:border-[color:var(--indigo)] focus:outline-none"
          >
            <option value="note">Note</option>
            <option value="conversation">Conversation</option>
          </select>
          <input
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Log a note or conversation…"
            className="flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAppend}
            disabled={busy || !body.trim()}
            className="shrink-0 rounded-lg bg-[image:var(--grad)] px-4 py-2 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Logging…' : 'Log conversation'}
          </button>
        </div>
      </div>

      {log.length === 0 ? (
        <p className="text-[13px] text-[color:var(--ink-3)]">No relationship log entries yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {log.map(entry => (
            <div key={entry.id} className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-[.08em] text-[color:var(--ink-3)]">
                  {entry.kind.replace('_', ' ')}
                </span>
                <span className="text-[11px] text-[color:var(--ink-3)]">{formatDateTime(entry.created_at)}</span>
              </div>
              {entry.body && <p className="mt-1 text-[13px] text-[color:var(--ink)]">{entry.body}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ClientWorkspace({
  mode,
  orgId,
  companyName,
  companyStatus,
  companyWebsite,
  personName,
  contacts,
  initialSelects,
  initialRelationshipLog,
  briefs,
  licenseRequests,
  initialGamePlanTopics,
  gamePlanPickerTopics,
  lastContactedAt,
}: ClientWorkspaceProps) {
  const [activeJob, setActiveJob] = useState<JobKey>('contacts')
  const headerTitle = mode === 'company' ? companyName : (personName ?? contacts[0]?.name ?? 'Contact')
  const personContact = mode === 'person' ? contacts[0] : undefined

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[21px] font-medium text-[color:var(--ink)]">{headerTitle}</h1>
          <StatusPill status={companyStatus} />
        </div>
        {mode === 'company' && companyWebsite && (
          <a
            href={companyWebsite}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-[13px] text-[color:var(--indigo)] hover:opacity-80"
          >
            {companyWebsite}
          </a>
        )}
        {mode === 'person' && (
          <p className="mt-1 text-[13px] text-[color:var(--ink-3)]">at {companyName}</p>
        )}
        <p className="mt-1 text-[13px] text-[color:var(--ink-3)]">{formatLastContacted(lastContactedAt)}</p>
      </div>

      {/* Secondary underline-tab row (UI-SPEC: text tabs, --indigo underline indicator) */}
      <div className="flex gap-6 border-b border-[color:var(--border)]">
        {JOBS.map(job => {
          const active = activeJob === job.key
          return (
            <button
              key={job.key}
              type="button"
              onClick={() => setActiveJob(job.key)}
              className="relative pb-3 text-[13px] font-medium transition"
              style={{ color: active ? 'var(--ink)' : 'var(--ink-3)' }}
            >
              {job.label}
              {active && (
                <span
                  className="absolute inset-x-0 -bottom-px h-[2px] rounded-full"
                  style={{ background: 'var(--indigo)' }}
                />
              )}
            </button>
          )
        })}
      </div>

      <div>
        {activeJob === 'contacts' &&
          (mode === 'company' ? (
            <ContactsPanel orgId={orgId} initialContacts={contacts} />
          ) : personContact ? (
            <PersonContactPanel orgId={orgId} contact={personContact} />
          ) : (
            <p className="text-[13px] text-[color:var(--ink-3)]">No contact record found.</p>
          ))}

        {activeJob === 'activity' && <ActivityJob briefs={briefs} licenseRequests={licenseRequests} />}

        {activeJob === 'curation' && <CurationJob orgId={orgId} initialSelects={initialSelects} />}

        {activeJob === 'notes' && (
          <NotesJob
            orgId={orgId}
            companyStatus={companyStatus}
            initialLog={initialRelationshipLog}
            contactId={personContact?.id}
          />
        )}
      </div>

      {/* Game Plan panel, person view only (R14/D-31.1-06). */}
      {mode === 'person' && (
        <GamePlanPanel
          orgId={orgId}
          initialTopics={initialGamePlanTopics ?? []}
          selectsNames={initialSelects.map(s => s.name)}
          pickerTopics={gamePlanPickerTopics}
        />
      )}
    </div>
  )
}
