'use client'

import { useState } from 'react'
import type { BuyerOrgContact } from '@/lib/client-partners/contacts'

// ─── ContactsPanel (31-09, D-08/D-09) ──────────────────────────────────────
// The Contacts job of the four-job company/person workspace. Lists a
// company's contacts with the primary visibly flagged, opens a rich D-09
// record (name, title, email, phone, linkedin_url, timezone, tags, address,
// notes, custom_fields) editable via the 31-06
// /api/admin/client-partners/[orgId]/contacts route, and supports add, edit,
// and set-primary. The one-primary invariant (D-08) is server-enforced
// (lib/client-partners/contacts.ts's setPrimaryContact) — this component
// only re-renders local state to match whatever the server returns.
//
// PersonContactPanel below is the person-scoped variant (single record, no
// list) the person workspace reuses — same rich D-09 fields, same PATCH
// route, no add/set-primary affordances (a person view is already scoped to
// exactly one contact).

type ContactFormValue = {
  name: string
  title: string
  email: string
  phone: string
  linkedin_url: string
  timezone: string
  tags: string
  addressLine: string
  notes: string
  customFields: { key: string; value: string }[]
}

function contactToFormValue(contact?: BuyerOrgContact): ContactFormValue {
  const address = (contact?.address ?? null) as { full?: unknown } | null
  const customFields = contact?.custom_fields ?? {}
  return {
    name: contact?.name ?? '',
    title: contact?.title ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    linkedin_url: contact?.linkedin_url ?? '',
    timezone: contact?.timezone ?? '',
    tags: (contact?.tags ?? []).join(', '),
    addressLine: typeof address?.full === 'string' ? address.full : '',
    notes: contact?.notes ?? '',
    customFields: Object.entries(customFields).map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value),
    })),
  }
}

function formValueToPayload(value: ContactFormValue): Record<string, unknown> {
  const tags = value.tags
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
  const customFields: Record<string, string> = {}
  for (const row of value.customFields) {
    const key = row.key.trim()
    if (!key) continue
    customFields[key] = row.value
  }
  return {
    name: value.name.trim(),
    title: value.title.trim() || null,
    email: value.email.trim() || null,
    phone: value.phone.trim() || null,
    linkedin_url: value.linkedin_url.trim() || null,
    timezone: value.timezone.trim() || null,
    tags,
    address: value.addressLine.trim() ? { full: value.addressLine.trim() } : null,
    notes: value.notes.trim() || null,
    custom_fields: customFields,
  }
}

const inputClass =
  'w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none'

const labelClass = 'mb-1 block text-[11px] font-medium uppercase tracking-[.08em] text-[color:var(--ink-3)]'

function ContactForm({
  value,
  onChange,
  busy,
  error,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  value: ContactFormValue
  onChange: (next: ContactFormValue) => void
  busy: boolean
  error: string | null
  onSubmit: () => void
  onCancel: () => void
  submitLabel: string
}) {
  const set = <K extends keyof ContactFormValue>(key: K, next: ContactFormValue[K]) =>
    onChange({ ...value, [key]: next })

  const updateCustomField = (idx: number, patch: Partial<{ key: string; value: string }>) => {
    const next = value.customFields.slice()
    next[idx] = { ...next[idx], ...patch }
    set('customFields', next)
  }

  const removeCustomField = (idx: number) => {
    set(
      'customFields',
      value.customFields.filter((_, i) => i !== idx)
    )
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

      <div>
        <label className={labelClass}>Name</label>
        <input
          className={inputClass}
          value={value.name}
          onChange={e => set('name', e.target.value)}
          placeholder="Full name"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Title</label>
          <input className={inputClass} value={value.title} onChange={e => set('title', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Timezone</label>
          <input
            className={inputClass}
            value={value.timezone}
            onChange={e => set('timezone', e.target.value)}
            placeholder="e.g. America/Los_Angeles"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Email</label>
          <input
            className={inputClass}
            type="email"
            value={value.email}
            onChange={e => set('email', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Phone</label>
          <input className={inputClass} value={value.phone} onChange={e => set('phone', e.target.value)} />
        </div>
      </div>

      <div>
        <label className={labelClass}>LinkedIn</label>
        <input
          className={inputClass}
          value={value.linkedin_url}
          onChange={e => set('linkedin_url', e.target.value)}
          placeholder="https://linkedin.com/in/…"
        />
      </div>

      <div>
        <label className={labelClass}>Address</label>
        <input
          className={inputClass}
          value={value.addressLine}
          onChange={e => set('addressLine', e.target.value)}
        />
      </div>

      <div>
        <label className={labelClass}>Tags</label>
        <input
          className={inputClass}
          value={value.tags}
          onChange={e => set('tags', e.target.value)}
          placeholder="comma, separated, tags"
        />
      </div>

      <div>
        <label className={labelClass}>Notes</label>
        <textarea
          className={inputClass}
          rows={3}
          value={value.notes}
          onChange={e => set('notes', e.target.value)}
        />
      </div>

      <div>
        <label className={labelClass}>Custom fields</label>
        <div className="flex flex-col gap-2">
          {value.customFields.map((row, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                className={inputClass}
                value={row.key}
                onChange={e => updateCustomField(idx, { key: e.target.value })}
                placeholder="Field name"
              />
              <input
                className={inputClass}
                value={row.value}
                onChange={e => updateCustomField(idx, { value: e.target.value })}
                placeholder="Value"
              />
              <button
                type="button"
                onClick={() => removeCustomField(idx)}
                className="shrink-0 rounded-lg border border-[color:var(--border)] px-2 text-[12px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)]"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set('customFields', [...value.customFields, { key: '', value: '' }])}
            className="self-start text-[12px] font-medium text-[color:var(--indigo)] hover:opacity-80"
          >
            + Add custom field
          </button>
        </div>
      </div>

      <div className="mt-1 flex gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || !value.name.trim()}
          className="rounded-lg bg-[image:var(--grad)] px-4 py-2 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Saving…' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-[color:var(--border)] px-4 py-2 text-[13px] text-[color:var(--ink-2)] transition hover:text-[color:var(--ink)]"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function PrimaryChip() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[.08em]"
      style={{ color: 'var(--green-fg)', background: 'var(--green-bg)', borderColor: 'var(--green-line)' }}
    >
      Primary
    </span>
  )
}

function ContactRow({
  contact,
  expanded,
  onToggle,
  onSetPrimary,
  settingPrimary,
  children,
}: {
  contact: BuyerOrgContact
  expanded: boolean
  onToggle: () => void
  onSetPrimary: () => void
  settingPrimary: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onToggle} className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-medium text-[color:var(--ink)]">{contact.name}</span>
            {contact.is_primary && <PrimaryChip />}
          </div>
          <p className="mt-0.5 text-[12.5px] text-[color:var(--ink-3)]">
            {contact.title || 'No title'}
            {contact.email ? ` · ${contact.email}` : ''}
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {contact.is_primary && contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="rounded-lg border border-[color:var(--border)] px-2 py-1 text-[11px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
            >
              Email
            </a>
          )}
          {contact.is_primary && contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              className="rounded-lg border border-[color:var(--border)] px-2 py-1 text-[11px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
            >
              Call
            </a>
          )}
          {!contact.is_primary && (
            <button
              type="button"
              onClick={onSetPrimary}
              disabled={settingPrimary}
              className="rounded-lg border border-[color:var(--border)] px-2 py-1 text-[11px] text-[color:var(--ink-2)] transition hover:text-[color:var(--ink)] disabled:opacity-50"
            >
              {settingPrimary ? 'Setting…' : 'Set primary'}
            </button>
          )}
          <button
            type="button"
            onClick={onToggle}
            className="rounded-lg border border-[color:var(--border)] px-2 py-1 text-[11px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
          >
            {expanded ? 'Close' : 'Edit'}
          </button>
        </div>
      </div>
      {expanded && <div className="mt-4 border-t border-[color:var(--border)] pt-4">{children}</div>}
    </div>
  )
}

export function ContactsPanel({
  orgId,
  initialContacts,
}: {
  orgId: string
  initialContacts: BuyerOrgContact[]
}) {
  const [contacts, setContacts] = useState<BuyerOrgContact[]>(initialContacts)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<ContactFormValue>(contactToFormValue())
  const [creating, setCreating] = useState(false)
  const [createValue, setCreateValue] = useState<ContactFormValue>(contactToFormValue())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const contactsBase = `/api/admin/client-partners/${orgId}/contacts`

  const upsertLocal = (data: BuyerOrgContact) => {
    setContacts(prev => {
      const others = prev.filter(c => c.id !== data.id)
      const next = data.is_primary ? [...others.map(c => ({ ...c, is_primary: false })), data] : [...others, data]
      return next.sort((a, b) => {
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
        return a.created_at.localeCompare(b.created_at)
      })
    })
  }

  const toggleExpand = (contact: BuyerOrgContact) => {
    if (expandedId === contact.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(contact.id)
    setEditValue(contactToFormValue(contact))
    setError(null)
  }

  const handleSave = async (contactId: string) => {
    setBusyId(contactId)
    setError(null)
    try {
      const res = await fetch(contactsBase, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contactId, ...formValueToPayload(editValue) }),
      })
      const json = (await res.json().catch(() => ({}))) as { data?: BuyerOrgContact; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Failed to save contact.')
      if (json.data) upsertLocal(json.data)
      setExpandedId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save contact.')
    } finally {
      setBusyId(null)
    }
  }

  const handleSetPrimary = async (contactId: string) => {
    setBusyId(contactId)
    setError(null)
    try {
      const res = await fetch(contactsBase, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contactId, set_primary: true }),
      })
      const json = (await res.json().catch(() => ({}))) as { data?: BuyerOrgContact; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Failed to set primary contact.')
      if (json.data) upsertLocal(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set primary contact.')
    } finally {
      setBusyId(null)
    }
  }

  const handleCreate = async () => {
    setBusyId('__create__')
    setError(null)
    try {
      const res = await fetch(contactsBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValueToPayload(createValue)),
      })
      const json = (await res.json().catch(() => ({}))) as { data?: BuyerOrgContact; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Failed to create contact.')
      if (json.data) upsertLocal(json.data)
      setCreating(false)
      setCreateValue(contactToFormValue())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create contact.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && !expandedId && !creating && (
        <p
          className="rounded-lg border px-3 py-2 text-[12.5px]"
          style={{ color: 'var(--rose-fg)', background: 'var(--rose-bg)', borderColor: 'var(--rose-line)' }}
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[color:var(--ink-3)]">
          {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
        </p>
        {!creating && (
          <button
            type="button"
            onClick={() => {
              setCreating(true)
              setCreateValue(contactToFormValue())
              setError(null)
            }}
            className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--ink-2)] transition hover:text-[color:var(--ink)]"
          >
            + Add contact
          </button>
        )}
      </div>

      {creating && (
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
          <ContactForm
            value={createValue}
            onChange={setCreateValue}
            busy={busyId === '__create__'}
            error={error}
            onSubmit={handleCreate}
            onCancel={() => {
              setCreating(false)
              setError(null)
            }}
            submitLabel="Add contact"
          />
        </div>
      )}

      {contacts.length === 0 && !creating ? (
        <p className="text-[13px] text-[color:var(--ink-3)]">No contacts yet.</p>
      ) : (
        contacts.map(contact => (
          <ContactRow
            key={contact.id}
            contact={contact}
            expanded={expandedId === contact.id}
            onToggle={() => toggleExpand(contact)}
            onSetPrimary={() => handleSetPrimary(contact.id)}
            settingPrimary={busyId === contact.id}
          >
            <ContactForm
              value={editValue}
              onChange={setEditValue}
              busy={busyId === contact.id}
              error={expandedId === contact.id ? error : null}
              onSubmit={() => handleSave(contact.id)}
              onCancel={() => setExpandedId(null)}
              submitLabel="Save"
            />
          </ContactRow>
        ))
      )}
    </div>
  )
}

// ─── PersonContactPanel — person-scoped variant ────────────────────────────
// The same rich D-09 record, scoped to a single contact (the person
// workspace's Contacts job). No list, no add, no set-primary — the person
// view already resolves to exactly one contact record.
export function PersonContactPanel({ orgId, contact }: { orgId: string; contact: BuyerOrgContact }) {
  const [current, setCurrent] = useState<BuyerOrgContact>(contact)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<ContactFormValue>(contactToFormValue(contact))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/client-partners/${orgId}/contacts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: current.id, ...formValueToPayload(value) }),
      })
      const json = (await res.json().catch(() => ({}))) as { data?: BuyerOrgContact; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Failed to save contact.')
      if (json.data) setCurrent(json.data)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save contact.')
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-medium text-[color:var(--ink)]">{current.name}</span>
              {current.is_primary && <PrimaryChip />}
            </div>
            <p className="mt-0.5 text-[12.5px] text-[color:var(--ink-3)]">{current.title || 'No title'}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setValue(contactToFormValue(current))
              setEditing(true)
            }}
            className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-[12px] text-[color:var(--ink-2)] transition hover:text-[color:var(--ink)]"
          >
            Edit
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <span className="block text-[11px] uppercase tracking-[.08em] text-[color:var(--ink-3)]">Email</span>
            {current.email ? (
              <a href={`mailto:${current.email}`} className="text-[color:var(--indigo)] hover:opacity-80">
                {current.email}
              </a>
            ) : (
              <span className="text-[color:var(--ink)]">—</span>
            )}
          </div>
          <div>
            <span className="block text-[11px] uppercase tracking-[.08em] text-[color:var(--ink-3)]">Phone</span>
            {current.phone ? (
              <a href={`tel:${current.phone}`} className="text-[color:var(--indigo)] hover:opacity-80">
                {current.phone}
              </a>
            ) : (
              <span className="text-[color:var(--ink)]">—</span>
            )}
          </div>
          <div>
            <span className="block text-[11px] uppercase tracking-[.08em] text-[color:var(--ink-3)]">LinkedIn</span>
            <span className="text-[color:var(--ink)]">{current.linkedin_url || '—'}</span>
          </div>
          <div>
            <span className="block text-[11px] uppercase tracking-[.08em] text-[color:var(--ink-3)]">Timezone</span>
            <span className="text-[color:var(--ink)]">{current.timezone || '—'}</span>
          </div>
        </div>
        {current.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {current.tags.map(tag => (
              <span
                key={tag}
                className="rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[11px] text-[color:var(--ink-2)]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        {current.notes && <p className="mt-3 text-[12.5px] text-[color:var(--ink-2)]">{current.notes}</p>}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
      <ContactForm
        value={value}
        onChange={setValue}
        busy={busy}
        error={error}
        onSubmit={handleSave}
        onCancel={() => {
          setEditing(false)
          setError(null)
        }}
        submitLabel="Save"
      />
    </div>
  )
}
