'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClientPartnersList } from './ClientPartnersList'
import type { ClientPartnerRow } from '@/lib/client-partners/columns'
import type { AeCoverage, CoverageSummary } from '@/lib/client-partners/coverage'

// ─── ClientPartnersRoom (D-31.1-01/04) ──────────────────────────────────────
// The consolidated Client Partners room's client wrapper. Renders the My tab
// for every staff member and, for leadership only, the All tab (coverage
// strip + Needs-an-AE queue + book table + By-AE grouping). This is the
// component future plans (06's assign panel, later Game Plan work) mount
// their interactivity into — receives ONLY data + string props from the RSC
// page (app/(admin)/admin/client-partners/page.tsx); no function crosses
// that boundary (Pitfall 1, commit 80443bb — production 500 otherwise).

export type ClientPartnersAllData = {
  rows: ClientPartnerRow[]
  coverage: CoverageSummary
  byAe: AeCoverage[]
  /** Rows with no assignedAeId — the pinned "Needs an AE" queue. */
  unassigned: ClientPartnerRow[]
}

export type ClientPartnersRoomProps = {
  myCompanyRows: ClientPartnerRow[]
  myClientRows: ClientPartnerRow[]
  /** Whether the caller may see the All tab at all — D-31.1-01: hidden entirely for non-leadership, not merely disabled. */
  isLeadership: boolean
  /** Null for a non-leadership caller — the RSC page never fetches this data for them (T-31.1-info-disclosure). */
  allData: ClientPartnersAllData | null
  companyHrefBase: string
  clientHrefBase: string
}

type RoomTab = 'my' | 'all'

function initialsFor(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2)
  return parts.map(w => w[0]?.toUpperCase() ?? '').join('') || '—'
}

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`
}

const HEALTH_MIX_TONE: Record<'good' | 'warning' | 'at_risk', { fg: string; bg: string }> = {
  good: { fg: 'var(--green-fg)', bg: 'var(--green-bg)' },
  warning: { fg: 'var(--amber-fg)', bg: 'var(--amber-bg)' },
  at_risk: { fg: 'var(--rose-fg)', bg: 'var(--rose-bg)' },
}

export function ClientPartnersRoom({
  myCompanyRows,
  myClientRows,
  isLeadership,
  allData,
  companyHrefBase,
  clientHrefBase,
}: ClientPartnersRoomProps) {
  const [tab, setTab] = useState<RoomTab>('my')
  const showAll = isLeadership && allData !== null && tab === 'all'

  return (
    <div className="mt-2">
      {isLeadership && (
        <div
          className="mb-4 inline-flex gap-[3px] rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-1"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'my'}
            onClick={() => setTab('my')}
            className={`rounded-lg px-4 py-2 text-[13px] font-medium transition ${
              tab === 'my'
                ? 'bg-[color:var(--panel-2)] text-[color:var(--ink)]'
                : 'text-[color:var(--ink-2)] hover:text-[color:var(--ink)]'
            }`}
          >
            My Client Partners
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'all'}
            onClick={() => setTab('all')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition ${
              tab === 'all'
                ? 'bg-[color:var(--panel-2)] text-[color:var(--ink)]'
                : 'text-[color:var(--ink-2)] hover:text-[color:var(--ink)]'
            }`}
          >
            All Client Partners
            <span
              className="rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[.05em]"
              style={{ color: 'var(--indigo)', background: 'color-mix(in srgb, var(--indigo) 16%, transparent)' }}
            >
              Leadership
            </span>
          </button>
        </div>
      )}

      {!showAll && (
        <ClientPartnersList
          companyRows={myCompanyRows}
          clientRows={myClientRows}
          companyHrefBase={companyHrefBase}
          clientHrefBase={clientHrefBase}
        />
      )}

      {showAll && allData && (
        <AllTabView data={allData} companyHrefBase={companyHrefBase} clientHrefBase={clientHrefBase} />
      )}
    </div>
  )
}

function AllTabView({
  data,
  companyHrefBase,
  clientHrefBase,
}: {
  data: ClientPartnersAllData
  companyHrefBase: string
  clientHrefBase: string
}) {
  const { coverage, byAe, unassigned, rows } = data

  return (
    <div className="mt-1">
      {/* Coverage strip (D-31.1-04) */}
      <div className="mb-5 flex flex-wrap gap-2.5">
        <CoverageStat label="Client partners" value={coverage.totalClients} />
        <CoverageStat
          label="Unassigned"
          value={coverage.unassigned}
          tone={coverage.unassigned > 0 ? 'warn' : undefined}
        />
        <CoverageStat label="Active AEs" value={coverage.aeCount} />
        <CoverageStat label="Open pipeline" value={formatMoney(coverage.openPipelineValue)} tone="money" />
        <CoverageStat label="At risk" value={coverage.atRiskCount} tone={coverage.atRiskCount > 0 ? 'risk' : undefined} />
      </div>

      {/* Pinned "Needs an AE" queue */}
      {unassigned.length > 0 && (
        <>
          <div className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.1em] text-[color:var(--ink-3)]">
            Needs an AE
            <span
              className="rounded-full border px-2 py-0.5 text-[10px]"
              style={{
                color: 'var(--amber-fg)',
                background: 'var(--amber-bg)',
                borderColor: 'var(--amber-line)',
              }}
            >
              {unassigned.length}
            </span>
          </div>
          <div className="mb-6 flex flex-wrap gap-2.5">
            {unassigned.map(row => (
              <div
                key={row.id}
                className="flex min-w-[240px] flex-1 items-center gap-3 rounded-2xl border px-4 py-3"
                style={{ borderColor: 'var(--amber-line)', background: 'var(--panel)' }}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold"
                  style={{ background: 'var(--panel-2)', color: 'var(--amber-fg)' }}
                >
                  {initialsFor(row.name)}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-[color:var(--ink)]">{row.name}</div>
                  <div className="text-[11px] text-[color:var(--ink-3)]">{row.status ?? 'New lead'}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Create Client Partner — folded in from the former /admin/buyer-orgs
          page (D-31.1-01's "keep the create-org action reachable inside
          the All tab"). AE assignment and per-org member management stay
          on ClientPartnersList's row drill-in / the plan 06 assign panel —
          this panel is scoped to org creation only. */}
      <CreateClientPartnerPanel />

      {/* The whole book, reusing ClientPartnersList's Companies view */}
      <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[.1em] text-[color:var(--ink-3)]">The book</div>
      <ClientPartnersList
        companyRows={rows}
        clientRows={[]}
        companyHrefBase={companyHrefBase}
        clientHrefBase={clientHrefBase}
        initialTab="companies"
        rowActionLabel="+ Assign AE"
      />

      {/* By-AE coverage */}
      {byAe.length > 0 && (
        <>
          <div className="mb-2.5 mt-7 text-[11px] font-bold uppercase tracking-[.1em] text-[color:var(--ink-3)]">
            By AE — coverage
          </div>
          <div className="flex flex-col gap-3">
            {byAe.map(ae => (
              <div
                key={ae.aeId}
                className="overflow-hidden rounded-2xl border"
                style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}
              >
                <div className="flex items-center gap-3 px-4 py-3" style={{ background: 'var(--panel-2)' }}>
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                    style={{ background: 'var(--indigo)' }}
                  >
                    {initialsFor(ae.aeName || '—')}
                  </span>
                  <div>
                    <div className="text-[14px] font-bold text-[color:var(--ink)]">{ae.aeName || 'Unnamed'}</div>
                    <div className="text-[11.5px] text-[color:var(--ink-3)]">
                      {ae.load} client{ae.load === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="ml-auto flex gap-1.5 text-[11.5px] font-bold">
                    {(['good', 'warning', 'at_risk'] as const).map(state => (
                      <span
                        key={state}
                        className="min-w-[26px] rounded-md px-1.5 py-0.5 text-center"
                        style={{ background: HEALTH_MIX_TONE[state].bg, color: HEALTH_MIX_TONE[state].fg }}
                      >
                        {ae.healthMix[state]}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Create Client Partner (folded in from the former buyer-orgs page) ────
// Scoped to org creation only — POSTs the same /api/admin/buyer-orgs route
// the old page used, then router.refresh() so the RSC page re-fetches
// loadWholeBookWithCoverage with the new org included (D-06 doctrine: no
// client-side row fabrication of health/coverage data).
type CreateOrgForm = { orgName: string; adminEmail: string; adminDisplayName: string }
const EMPTY_CREATE_ORG_FORM: CreateOrgForm = { orgName: '', adminEmail: '', adminDisplayName: '' }

function CreateClientPartnerPanel() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<CreateOrgForm>(EMPTY_CREATE_ORG_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!form.orgName.trim() || !form.adminEmail.trim() || !form.adminDisplayName.trim()) {
      setError('Company name, admin email, and admin name are all required.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/buyer-orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_name: form.orgName.trim(),
          admin_email: form.adminEmail.trim(),
          admin_display_name: form.adminDisplayName.trim(),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong — please try again.')
      setForm(EMPTY_CREATE_ORG_FORM)
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-5 rounded-lg px-4 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90"
        style={{ background: 'var(--grad)' }}
      >
        + Create Client Partner
      </button>
    )
  }

  return (
    <div className="mb-5 rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
      <h3 className="mb-3 text-[13px] font-bold text-[color:var(--ink-2)]">Create a Client Partner</h3>
      {error && <p className="mb-3 text-[13px] text-[color:var(--rose-fg)]">{error}</p>}
      <div className="grid gap-3">
        <input
          value={form.orgName}
          onChange={e => setForm(prev => ({ ...prev, orgName: e.target.value }))}
          placeholder="Company name"
          className="w-full rounded-lg border px-3 py-2 text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--panel-2)' }}
        />
        <input
          value={form.adminEmail}
          onChange={e => setForm(prev => ({ ...prev, adminEmail: e.target.value }))}
          placeholder="First org admin email"
          className="w-full rounded-lg border px-3 py-2 text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--panel-2)' }}
        />
        <input
          value={form.adminDisplayName}
          onChange={e => setForm(prev => ({ ...prev, adminDisplayName: e.target.value }))}
          placeholder="First org admin name"
          className="w-full rounded-lg border px-3 py-2 text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--panel-2)' }}
        />
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={handleCreate}
          disabled={submitting}
          className="rounded-lg px-4 py-2 text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--grad)' }}
        >
          {submitting ? 'Creating…' : 'Create + invite admin'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setForm(EMPTY_CREATE_ORG_FORM)
            setError(null)
          }}
          className="rounded-lg border px-4 py-2 text-[13px] text-[color:var(--ink-2)]"
          style={{ borderColor: 'var(--border)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function CoverageStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number | string
  tone?: 'warn' | 'risk' | 'money'
}) {
  const toneStyle =
    tone === 'warn'
      ? { borderColor: 'var(--amber-line)', background: 'var(--amber-bg)' }
      : tone === 'risk'
        ? { borderColor: 'var(--rose-line)', background: 'var(--rose-bg)' }
        : { borderColor: 'var(--border)', background: 'var(--panel)' }
  const valueColor = tone === 'warn' ? 'var(--amber-fg)' : tone === 'risk' ? 'var(--rose-fg)' : 'var(--ink)'

  return (
    <div className="min-w-[128px] flex-1 rounded-2xl border px-4 py-3" style={toneStyle}>
      <div className={`text-[22px] font-extrabold ${tone === 'money' ? 'text-money2' : ''}`} style={tone === 'money' ? undefined : { color: valueColor }}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] font-bold uppercase tracking-[.04em] text-[color:var(--ink-3)]">{label}</div>
    </div>
  )
}
