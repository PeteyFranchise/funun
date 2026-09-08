'use client'
import { useState } from 'react'
export type FeatureControlCard = {
  key: string
  label: string
  enabled: boolean
  emergencyDisabled: boolean
  reason: string | null
}
export function ActivationConsole({
  initialFeatures,
  cohorts,
  staff,
  memberships,
  grants,
  schemaReady,
}: {
  initialFeatures: FeatureControlCard[]
  cohorts: { id: string; label: string }[]
  staff: { id: string; label: string }[]
  memberships: { cohortId: string; userId: string }[]
  grants: { cohortId: string; featureKey: string }[]
  schemaReady: boolean
}) {
  const [features, setFeatures] = useState(initialFeatures)
  const [message, setMessage] = useState('')
  async function change(
    feature: FeatureControlCard,
    action: 'enable' | 'disable' | 'emergency_disable' | 'emergency_clear'
  ) {
    const note = window.prompt('Reason for this activation change')
    if (!note) return
    const response = await fetch(
      `/api/admin/playbook/activation/features/${feature.key}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, note }),
      }
    )
    const body = await response.json().catch(() => ({}))
    if (!response.ok)
      return setMessage(body.error ?? 'Activation change failed')
    setFeatures((current) =>
      current.map((item) =>
        item.key === feature.key
          ? {
              ...item,
              enabled:
                action === 'enable'
                  ? true
                  : action === 'disable'
                    ? false
                    : item.enabled,
              emergencyDisabled:
                action === 'emergency_disable'
                  ? true
                  : action === 'emergency_clear'
                    ? false
                    : item.emergencyDisabled,
              reason:
                action === 'emergency_disable'
                  ? note
                  : action === 'emergency_clear'
                    ? null
                    : item.reason,
            }
          : item
      )
    )
    setMessage('Activation control updated and recorded.')
  }
  async function cohort(
    form: HTMLFormElement,
    action: 'create' | 'add_member' | 'grant_feature'
  ) {
    const data = new FormData(form)
    const payload =
      action === 'create'
        ? {
            action,
            key: data.get('key'),
            label: data.get('label'),
            description: data.get('description'),
          }
        : action === 'add_member'
          ? {
              action,
              cohortId: data.get('cohortId'),
              userId: data.get('userId'),
              expiresAt: null,
            }
          : {
              action,
              cohortId: data.get('cohortId'),
              featureKey: data.get('featureKey'),
            }
    const response = await fetch('/api/admin/playbook/activation/cohorts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await response.json().catch(() => ({}))
    setMessage(
      response.ok
        ? 'Cohort access updated. Refresh to see the complete state.'
        : (body.error ?? 'Cohort change failed')
    )
  }
  async function revoke(
    payload:
      | { action: 'revoke_member'; cohortId: string; userId: string }
      | { action: 'revoke_feature'; cohortId: string; featureKey: string }
  ) {
    if (!window.confirm('Remove this beta access now?')) return
    const response = await fetch('/api/admin/playbook/activation/cohorts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await response.json().catch(() => ({}))
    setMessage(
      response.ok
        ? 'Access revoked and recorded. Refresh to update this list.'
        : (body.error ?? 'Could not revoke access')
    )
  }
  if (!schemaReady)
    return (
      <p className="mt-6 rounded-xl border border-amber-500/30 p-5 text-sm">
        Controlled activation is built and will default every capability off
        when candidate migration 207 is approved.
      </p>
    )
  return (
    <div className="mt-6 space-y-5">
      {message && (
        <p aria-live="polite" className="text-sm text-[color:var(--ink-3)]">
          {message}
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {features.map((feature) => (
          <article
            key={feature.key}
            className="rounded-xl border border-[color:var(--border)] p-4"
          >
            <div className="flex justify-between gap-4">
              <div>
                <h2 className="font-bold">{feature.label}</h2>
                <p className="text-xs text-[color:var(--ink-3)]">
                  {feature.key}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs ${feature.emergencyDisabled ? 'bg-red-500/10 text-red-200' : feature.enabled ? 'bg-emerald-500/10 text-emerald-200' : 'bg-[color:var(--panel-2)]'}`}
              >
                {feature.emergencyDisabled
                  ? 'Emergency off'
                  : feature.enabled
                    ? 'Enabled'
                    : 'Disabled'}
              </span>
            </div>
            {feature.reason && (
              <p className="mt-2 text-xs text-red-200">{feature.reason}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() =>
                  void change(feature, feature.enabled ? 'disable' : 'enable')
                }
                className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-xs"
              >
                {feature.enabled ? 'Disable' : 'Enable'}
              </button>
              <button
                onClick={() =>
                  void change(
                    feature,
                    feature.emergencyDisabled
                      ? 'emergency_clear'
                      : 'emergency_disable'
                  )
                }
                className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-200"
              >
                {feature.emergencyDisabled
                  ? 'Clear emergency stop'
                  : 'Emergency stop'}
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void cohort(e.currentTarget, 'create')
          }}
          className="grid gap-2 rounded-xl border border-[color:var(--border)] p-4"
        >
          <h2 className="font-bold">Create cohort</h2>
          <input
            name="key"
            required
            placeholder="beta-cohort-key"
            className="rounded-lg bg-[color:var(--panel-2)] p-3"
          />
          <input
            name="label"
            required
            placeholder="Cohort name"
            className="rounded-lg bg-[color:var(--panel-2)] p-3"
          />
          <textarea
            name="description"
            required
            placeholder="Purpose and exit criteria"
            className="rounded-lg bg-[color:var(--panel-2)] p-3"
          />
          <button className="rounded-lg bg-[color:var(--indigo)] p-2 font-bold text-white">
            Create
          </button>
        </form>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void cohort(e.currentTarget, 'add_member')
          }}
          className="grid gap-2 rounded-xl border border-[color:var(--border)] p-4"
        >
          <h2 className="font-bold">Add Team Member</h2>
          <select
            name="cohortId"
            className="rounded-lg bg-[color:var(--panel-2)] p-3"
          >
            {cohorts.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <select
            name="userId"
            className="rounded-lg bg-[color:var(--panel-2)] p-3"
          >
            {staff.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <button className="rounded-lg bg-[color:var(--indigo)] p-2 font-bold text-white">
            Add member
          </button>
        </form>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void cohort(e.currentTarget, 'grant_feature')
          }}
          className="grid gap-2 rounded-xl border border-[color:var(--border)] p-4"
        >
          <h2 className="font-bold">Grant capability</h2>
          <select
            name="cohortId"
            className="rounded-lg bg-[color:var(--panel-2)] p-3"
          >
            {cohorts.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <select
            name="featureKey"
            className="rounded-lg bg-[color:var(--panel-2)] p-3"
          >
            {features.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
          <button className="rounded-lg bg-[color:var(--indigo)] p-2 font-bold text-white">
            Grant
          </button>
        </form>
      </div>
      {(memberships.length > 0 || grants.length > 0) && (
        <section className="rounded-xl border border-[color:var(--border)] p-4">
          <h2 className="font-bold">Active cohort access</h2>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {memberships.map((item) => (
              <div
                key={`${item.cohortId}:${item.userId}`}
                className="flex items-center justify-between rounded-lg bg-[color:var(--panel-2)] p-3 text-xs"
              >
                <span>
                  {cohorts.find((x) => x.id === item.cohortId)?.label} ·{' '}
                  {staff.find((x) => x.id === item.userId)?.label}
                </span>
                <button
                  onClick={() =>
                    void revoke({ action: 'revoke_member', ...item })
                  }
                  className="text-red-200"
                >
                  Revoke
                </button>
              </div>
            ))}
            {grants.map((item) => (
              <div
                key={`${item.cohortId}:${item.featureKey}`}
                className="flex items-center justify-between rounded-lg bg-[color:var(--panel-2)] p-3 text-xs"
              >
                <span>
                  {cohorts.find((x) => x.id === item.cohortId)?.label} ·{' '}
                  {features.find((x) => x.key === item.featureKey)?.label}
                </span>
                <button
                  onClick={() =>
                    void revoke({ action: 'revoke_feature', ...item })
                  }
                  className="text-red-200"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
