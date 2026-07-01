'use client'

import { useState, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ChecklistItem } from '@/types'

// ─── Types ─────────────────────────────────────────────────────────────────

type Section = 'before_release' | 'week_1' | 'week_2' | 'weeks_3_4'
type ActionType = 'internal_tool' | 'external_url'

const SECTION_VALUES: Section[] = ['before_release', 'week_1', 'week_2', 'weeks_3_4']
const SECTION_LABELS: Record<Section, string> = {
  before_release: 'Before release',
  week_1: 'Week 1',
  week_2: 'Week 2',
  weeks_3_4: 'Weeks 3–4',
}
const ACTION_TYPE_VALUES: ActionType[] = ['internal_tool', 'external_url']

type FormState = {
  key: string
  label: string
  section: Section
  action_type: ActionType
  action_href: string
  action_label: string
  sort_order: string
}

const EMPTY_FORM: FormState = {
  key: '',
  label: '',
  section: 'week_1',
  action_type: 'external_url',
  action_href: '',
  action_label: '',
  sort_order: '',
}

// ─── SortableRow ────────────────────────────────────────────────────────────

function SortableRow({
  item,
  onEditClick,
  onDeleteClick,
  editingKey,
  deletingKey,
  editForm,
  onEditFormChange,
  onEditSave,
  onEditCancel,
  onDeleteConfirm,
  onDeleteCancel,
  saving,
  error,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  item: ChecklistItem & { tip_draft?: string | null; author?: string | null }
  onEditClick: (key: string) => void
  onDeleteClick: (key: string) => void
  editingKey: string | null
  deletingKey: string | null
  editForm: FormState
  onEditFormChange: (field: keyof FormState, value: string) => void
  onEditSave: () => Promise<void>
  onEditCancel: () => void
  onDeleteConfirm: () => Promise<void>
  onDeleteCancel: () => void
  saving: boolean
  error: string | null
  onMoveUp: (key: string) => void
  onMoveDown: (key: string) => void
  isFirst: boolean
  isLast: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    setActivatorNodeRef,
  } = useSortable({ id: item.key })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const isEditing = editingKey === item.key
  const isDeleting = deletingKey === item.key

  return (
    <div ref={setNodeRef} style={style}>
      {/* Row */}
      <div
        className={[
          'flex items-center gap-3 rounded-[10px] border px-4 py-3 transition-all',
          isDragging
            ? 'opacity-60 scale-[1.02] shadow-2xl border-brandindigo/60 bg-card2'
            : 'border-hair bg-card',
        ].join(' ')}
      >
        {/* Drag handle (desktop only) */}
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder ${item.label}`}
          className="hidden md:flex shrink-0 cursor-grab active:cursor-grabbing items-center justify-center w-7 h-7 rounded text-white/30 hover:text-white/60 transition-colors"
        >
          {/* 6-dot grip icon */}
          <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
            <circle cx="3" cy="2" r="1.5" />
            <circle cx="9" cy="2" r="1.5" />
            <circle cx="3" cy="8" r="1.5" />
            <circle cx="9" cy="8" r="1.5" />
            <circle cx="3" cy="14" r="1.5" />
            <circle cx="9" cy="14" r="1.5" />
          </svg>
        </button>

        {/* Mobile up/down arrows */}
        <div className="flex md:hidden shrink-0 flex-col gap-1">
          <button
            onClick={() => onMoveUp(item.key)}
            disabled={isFirst}
            aria-label={`Move ${item.label} up`}
            className="rounded-lg border border-white/15 p-1.5 text-white/50 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <path d="M5 1l4 5H1l4-5z" />
            </svg>
          </button>
          <button
            onClick={() => onMoveDown(item.key)}
            disabled={isLast}
            aria-label={`Move ${item.label} down`}
            className="rounded-lg border border-white/15 p-1.5 text-white/50 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <path d="M5 9L1 4h8L5 9z" />
            </svg>
          </button>
        </div>

        {/* Item info */}
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-white truncate">{item.label}</p>
          <p className="text-[12px] text-lavdim mt-0.5">
            {SECTION_LABELS[item.section as Section] ?? item.section} · {item.action_type}
          </p>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => onEditClick(item.key)}
            className="text-[12px] text-white/50 hover:text-white border border-white/10 rounded-lg px-3 py-1.5 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => onDeleteClick(item.key)}
            className="text-[12px] text-rose-400/70 hover:text-rose-400 border border-rose-400/20 rounded-lg px-3 py-1.5 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Inline edit form */}
      {isEditing && (
        <div className="mt-1 mb-2 rounded-[10px] border border-brandindigo/30 bg-[#0a0a0f] p-4">
          <h3 className="text-[13px] font-bold text-white/70 mb-3">Edit item</h3>
          {error && (
            <p className="mb-3 text-[13px] text-rose-400">{error}</p>
          )}
          <div className="grid gap-3">
            <div>
              <label className="block text-[13px] font-bold text-white/70 mb-1">Label *</label>
              <input
                value={editForm.label}
                onChange={e => onEditFormChange('label', e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-brandindigo/60"
                placeholder="Label"
              />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-white/70 mb-1">Section *</label>
              <select
                value={editForm.section}
                onChange={e => onEditFormChange('section', e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-card px-3 py-2 text-[14px] text-white focus:outline-none focus:border-brandindigo/60"
              >
                {SECTION_VALUES.map(s => (
                  <option key={s} value={s}>{SECTION_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-bold text-white/70 mb-1">Action type *</label>
              <select
                value={editForm.action_type}
                onChange={e => onEditFormChange('action_type', e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-card px-3 py-2 text-[14px] text-white focus:outline-none focus:border-brandindigo/60"
              >
                {ACTION_TYPE_VALUES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-bold text-white/70 mb-1">Action href</label>
              <input
                value={editForm.action_href}
                onChange={e => onEditFormChange('action_href', e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-brandindigo/60"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-white/70 mb-1">Action label</label>
              <input
                value={editForm.action_label}
                onChange={e => onEditFormChange('action_label', e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-brandindigo/60"
                placeholder="e.g. Register with ASCAP"
              />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-white/70 mb-1">Sort order</label>
              <input
                type="number"
                value={editForm.sort_order}
                onChange={e => onEditFormChange('sort_order', e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-brandindigo/60"
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={onEditSave}
              disabled={saving}
              className="rounded-lg bg-white px-4 py-2 text-[13px] font-bold text-black transition hover:bg-white/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save item'}
            </button>
            <button
              onClick={onEditCancel}
              className="rounded-lg border border-white/10 px-4 py-2 text-[13px] text-white/60 hover:text-white transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Inline delete confirm */}
      {isDeleting && (
        <div
          role="alert"
          className="mt-1 mb-2 rounded-[10px] border border-rose-500/30 bg-rose-500/5 p-4"
        >
          <p className="text-[14px] text-white mb-3">
            Delete this item? All artist progress on it will be permanently removed. This cannot be undone.
          </p>
          {error && (
            <p className="mb-3 text-[13px] text-rose-400">{error}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={onDeleteConfirm}
              disabled={saving}
              className="rounded-lg bg-rose-500 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-rose-600 disabled:opacity-50"
            >
              {saving ? 'Deleting…' : 'Delete item'}
            </button>
            <button
              onClick={onDeleteCancel}
              className="rounded-lg border border-white/10 px-4 py-2 text-[13px] text-white/60 hover:text-white transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ChecklistAdmin ─────────────────────────────────────────────────────────

type AdminItem = ChecklistItem & { tip_draft?: string | null; author?: string | null }

export function ChecklistAdmin({ initialItems }: { initialItems: AdminItem[] }) {
  const [items, setItems] = useState<AdminItem[]>(initialItems)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ─── Persist reordered list ─────────────────────────────────────────
  const persistOrder = useCallback(async (reordered: AdminItem[]) => {
    const order = reordered.map((it, idx) => ({ key: it.key, sort_order: idx }))
    const res = await fetch('/api/admin/checklist', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    })
    if (!res.ok) {
      throw new Error('Couldn\'t save — please try again.')
    }
  }, [])

  // ─── Drag end ───────────────────────────────────────────────────────
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = items.findIndex(it => it.key === active.id)
      const newIndex = items.findIndex(it => it.key === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      // Capture the pre-drag snapshot before the optimistic update so that
      // the rollback uses the correct pre-drag state even if multiple drags
      // fire before the previous API call completes (WR-05).
      const snapshot = items
      const reordered = arrayMove(items, oldIndex, newIndex)
      setItems(reordered)
      try {
        await persistOrder(reordered)
      } catch {
        setItems(snapshot)
        setError('Couldn\'t save — please try again.')
      }
    },
    [items, persistOrder]
  )

  // ─── Mobile move (up/down) ──────────────────────────────────────────
  const move = useCallback(
    async (key: string, dir: 'up' | 'down') => {
      const idx = items.findIndex(it => it.key === key)
      if (idx === -1) return
      const targetIdx = dir === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= items.length) return

      // Capture pre-move snapshot before the optimistic update (WR-05).
      const snapshot = items
      const reordered = arrayMove(items, idx, targetIdx)
      setItems(reordered)
      try {
        await persistOrder(reordered)
      } catch {
        setItems(snapshot)
        setError('Couldn\'t save — please try again.')
      }
    },
    [items, persistOrder]
  )

  // ─── Edit ───────────────────────────────────────────────────────────
  const handleEditClick = (key: string) => {
    const item = items.find(it => it.key === key)
    if (!item) return
    setEditingKey(key)
    setDeletingKey(null)
    setError(null)
    setEditForm({
      key: item.key,
      label: item.label,
      section: item.section as Section,
      action_type: item.action_type as ActionType,
      action_href: item.action_href ?? '',
      action_label: item.action_label ?? '',
      sort_order: String(item.sort_order),
    })
  }

  const handleEditFormChange = (field: keyof FormState, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }))
  }

  const handleEditSave = async () => {
    if (!editingKey) return
    if (!editForm.label.trim()) {
      setError('Label is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        label: editForm.label.trim(),
        section: editForm.section,
        action_type: editForm.action_type,
        action_href: editForm.action_href.trim() || null,
        action_label: editForm.action_label.trim() || null,
      }
      if (editForm.sort_order !== '') {
        body.sort_order = Number(editForm.sort_order)
      }
      const res = await fetch(`/api/admin/checklist/${editingKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Couldn\'t save — please try again.')
      }
      const json = await res.json() as { data: AdminItem }
      setItems(prev => prev.map(it => it.key === editingKey ? { ...it, ...json.data } : it))
      setEditingKey(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn\'t save — please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleEditCancel = () => {
    setEditingKey(null)
    setError(null)
  }

  // ─── Delete ─────────────────────────────────────────────────────────
  const handleDeleteClick = (key: string) => {
    setDeletingKey(key)
    setEditingKey(null)
    setError(null)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingKey) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/checklist/${deletingKey}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Couldn\'t save — please try again.')
      }
      setItems(prev => prev.filter(it => it.key !== deletingKey))
      setDeletingKey(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn\'t save — please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteCancel = () => {
    setDeletingKey(null)
    setError(null)
  }

  // ─── Add ─────────────────────────────────────────────────────────────
  const handleAddFormChange = (field: keyof FormState, value: string) => {
    setAddForm(prev => ({ ...prev, [field]: value }))
  }

  const handleAddSave = async () => {
    if (!addForm.key.trim()) {
      setAddError('Key is required.')
      return
    }
    if (!addForm.label.trim()) {
      setAddError('Label is required.')
      return
    }
    setSaving(true)
    setAddError(null)
    try {
      const body: Record<string, unknown> = {
        key: addForm.key.trim(),
        label: addForm.label.trim(),
        section: addForm.section,
        action_type: addForm.action_type,
        action_href: addForm.action_href.trim() || null,
        action_label: addForm.action_label.trim() || null,
      }
      if (addForm.sort_order !== '') {
        body.sort_order = Number(addForm.sort_order)
      }
      const res = await fetch('/api/admin/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Couldn\'t save — please try again.')
      }
      const json = await res.json() as { data: AdminItem }
      setItems(prev => [...prev, json.data])
      setAddForm(EMPTY_FORM)
      setShowAddForm(false)
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Couldn\'t save — please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleAddCancel = () => {
    setShowAddForm(false)
    setAddForm(EMPTY_FORM)
    setAddError(null)
  }

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div className="mt-6">
      {/* Add CTA */}
      {!showAddForm && (
        <button
          onClick={() => { setShowAddForm(true); setAddError(null) }}
          className="mb-4 rounded-lg bg-grad px-4 py-2.5 text-[13px] font-bold text-white shadow transition hover:opacity-90"
        >
          Add checklist item
        </button>
      )}

      {/* Inline add form */}
      {showAddForm && (
        <div className="mb-4 rounded-[10px] border border-brandindigo/30 bg-[#0a0a0f] p-4">
          <h3 className="text-[13px] font-bold text-white/70 mb-3">New checklist item</h3>
          {addError && (
            <p className="mb-3 text-[13px] text-rose-400">{addError}</p>
          )}
          <div className="grid gap-3">
            <div>
              <label className="block text-[13px] font-bold text-white/70 mb-1">Key * (lowercase, underscores)</label>
              <input
                value={addForm.key}
                onChange={e => handleAddFormChange('key', e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-brandindigo/60"
                placeholder="e.g. register_copyright"
              />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-white/70 mb-1">Label *</label>
              <input
                value={addForm.label}
                onChange={e => handleAddFormChange('label', e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-brandindigo/60"
                placeholder="Label"
              />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-white/70 mb-1">Section *</label>
              <select
                value={addForm.section}
                onChange={e => handleAddFormChange('section', e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-card px-3 py-2 text-[14px] text-white focus:outline-none focus:border-brandindigo/60"
              >
                {SECTION_VALUES.map(s => (
                  <option key={s} value={s}>{SECTION_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-bold text-white/70 mb-1">Action type *</label>
              <select
                value={addForm.action_type}
                onChange={e => handleAddFormChange('action_type', e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-card px-3 py-2 text-[14px] text-white focus:outline-none focus:border-brandindigo/60"
              >
                {ACTION_TYPE_VALUES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-bold text-white/70 mb-1">Action href</label>
              <input
                value={addForm.action_href}
                onChange={e => handleAddFormChange('action_href', e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-brandindigo/60"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-white/70 mb-1">Action label</label>
              <input
                value={addForm.action_label}
                onChange={e => handleAddFormChange('action_label', e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-brandindigo/60"
                placeholder="e.g. Register with ASCAP"
              />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-white/70 mb-1">Sort order</label>
              <input
                type="number"
                value={addForm.sort_order}
                onChange={e => handleAddFormChange('sort_order', e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-brandindigo/60"
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleAddSave}
              disabled={saving}
              className="rounded-lg bg-white px-4 py-2 text-[13px] font-bold text-black transition hover:bg-white/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save item'}
            </button>
            <button
              onClick={handleAddCancel}
              className="rounded-lg border border-white/10 px-4 py-2 text-[13px] text-white/60 hover:text-white transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Item list */}
      {items.length === 0 ? (
        <p className="text-[14px] text-white/50 mt-4">
          No checklist items yet. Add the first one above.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map(it => it.key)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-1">
              {items.map((item, idx) => (
                <SortableRow
                  key={item.key}
                  item={item}
                  onEditClick={handleEditClick}
                  onDeleteClick={handleDeleteClick}
                  editingKey={editingKey}
                  deletingKey={deletingKey}
                  editForm={editForm}
                  onEditFormChange={handleEditFormChange}
                  onEditSave={handleEditSave}
                  onEditCancel={handleEditCancel}
                  onDeleteConfirm={handleDeleteConfirm}
                  onDeleteCancel={handleDeleteCancel}
                  saving={saving}
                  error={error}
                  onMoveUp={key => move(key, 'up')}
                  onMoveDown={key => move(key, 'down')}
                  isFirst={idx === 0}
                  isLast={idx === items.length - 1}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
