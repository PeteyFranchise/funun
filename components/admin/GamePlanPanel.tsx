'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SEEDED_GAME_PLAN_TOPICS, coveredSummary, type GamePlanTopic } from '@/lib/client-partners/game-plan'

// ─── GamePlanPanel (31.1 plan 07, R14/D-31.1-06) ───────────────────────────
// Mounted in ClientWorkspace mode="person" — the AE's per-account call-prep
// doc: topics (themes) carrying open-ended questions, checked off on the
// call, then "Log conversation" writes "X of N covered" + notes to the
// relationship log and retires the plan (server reseeds from defaults).
//
// Data + string action paths only (T-31.1-rsc-func-prop, Pitfall 1):
// receives orgId + the initial topics/Selects names as plain data from the
// RSC page (via ClientWorkspace), builds its own PUT/POST fetch paths
// client-side — mirrors ContactsPanel/NotesJob's convention — and refreshes
// via router.refresh(). No function props cross the server/client boundary.
//
// Suggested topics in 31.1 are seeded defaults + custom (AE-typed) + Selects
// context only (D-31.1-06) — dynamic sourcing from an authored
// Playbook/Plays is deferred to 31.2 (T-31.1 prohibition: do not source
// topics dynamically here).

let customTopicSeq = 0
function nextCustomId(): string {
  customTopicSeq += 1
  return `custom-${Date.now()}-${customTopicSeq}`
}

type SuggestedTopic = {
  id: string
  title: string
  source: string | null
  questions: string[]
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function buildSuggestedTopics(existing: GamePlanTopic[], selectsNames: string[]): SuggestedTopic[] {
  const existingIds = new Set(existing.map(t => t.id))
  const existingTitles = new Set(existing.map(t => t.title))

  const seeded: SuggestedTopic[] = SEEDED_GAME_PLAN_TOPICS.filter(t => !existingIds.has(t.id)).map(t => ({
    id: t.id,
    title: t.title,
    source: 'seeded',
    questions: [...t.questions],
  }))

  const selects: SuggestedTopic[] = selectsNames
    .map(name => ({
      id: `selects-${slugify(name)}`,
      title: `Nail the vibe — ${name}`,
      source: `selects:${name}`,
      questions: [
        'When you say the vibe you want — what’s the closest reference?',
        `What scene or moment does "${name}" play under?`,
      ],
    }))
    .filter(t => !existingIds.has(t.id) && !existingTitles.has(t.title))

  return [...seeded, ...selects]
}

export function GamePlanPanel({
  orgId,
  initialTopics,
  selectsNames,
}: {
  orgId: string
  initialTopics: GamePlanTopic[]
  selectsNames: string[]
}) {
  const router = useRouter()
  const [topics, setTopics] = useState<GamePlanTopic[]>(initialTopics)
  const [newTopicTitle, setNewTopicTitle] = useState('')
  const [busy, setBusy] = useState<'save' | 'log' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logged, setLogged] = useState<string | null>(null)

  const gamePlanPath = `/api/admin/client-partners/${orgId}/game-plan`
  const summary = useMemo(() => coveredSummary(topics), [topics])
  const suggested = useMemo(() => buildSuggestedTopics(topics, selectsNames), [topics, selectsNames])

  const toggleDone = (id: string) => {
    setTopics(prev => prev.map(t => (t.id === id ? { ...t, done: !t.done } : t)))
  }

  const updateNote = (id: string, note: string) => {
    setTopics(prev => prev.map(t => (t.id === id ? { ...t, note } : t)))
  }

  const removeTopic = (id: string) => {
    setTopics(prev => prev.filter(t => t.id !== id))
  }

  const addCustomTopic = () => {
    const title = newTopicTitle.trim()
    if (!title) return
    setTopics(prev => [...prev, { id: nextCustomId(), title, source: null, questions: [], done: false, note: '' }])
    setNewTopicTitle('')
  }

  const addSuggested = (s: SuggestedTopic) => {
    setTopics(prev => [
      ...prev,
      { id: s.id, title: s.title, source: s.source, questions: [...s.questions], done: false, note: '' },
    ])
  }

  const handleSave = async () => {
    setBusy('save')
    setError(null)
    setLogged(null)
    try {
      const res = await fetch(gamePlanPath, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics }),
      })
      const json = (await res.json().catch(() => ({}))) as { data?: { topics: GamePlanTopic[] }; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Failed to save the game plan.')
      if (json.data) setTopics(json.data.topics)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the game plan.')
    } finally {
      setBusy(null)
    }
  }

  const handleLogConversation = async () => {
    setBusy('log')
    setError(null)
    setLogged(null)
    try {
      const res = await fetch(gamePlanPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics }),
      })
      const json = (await res.json().catch(() => ({}))) as { data?: { topics: GamePlanTopic[] }; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Failed to log the conversation.')
      setLogged(`Logged ${summary.text} to the relationship log.`)
      if (json.data) setTopics(json.data.topics)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log the conversation.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-medium text-[color:var(--ink)]">Game plan</h3>
          <p className="mt-0.5 text-[12px] text-[color:var(--ink-3)]">
            Pre-call topic planning. Cover topics on the call, then log the conversation.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[color:var(--border)] bg-[color:var(--panel-2)] px-2.5 py-1 text-[11px] text-[color:var(--ink-3)]">
          {summary.text}
        </span>
      </div>

      {error && (
        <p
          className="mt-3 rounded-lg border px-3 py-2 text-[12.5px]"
          style={{ color: 'var(--rose-fg)', background: 'var(--rose-bg)', borderColor: 'var(--rose-line)' }}
        >
          {error}
        </p>
      )}
      {logged && (
        <p
          className="mt-3 rounded-lg border px-3 py-2 text-[12.5px]"
          style={{ color: 'var(--green-fg)', background: 'var(--green-bg)', borderColor: 'var(--green-line)' }}
        >
          {logged}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {topics.length === 0 && (
          <p className="text-[12.5px] text-[color:var(--ink-3)]">No topics yet — add one below.</p>
        )}
        {topics.map(t => (
          <div key={t.id} className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] p-3">
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => toggleDone(t.id)}
                aria-pressed={t.done}
                aria-label={t.done ? 'Mark not covered' : 'Mark covered'}
                className="mt-0.5 h-5 w-5 shrink-0 rounded-md border text-[11px] font-semibold transition"
                style={
                  t.done
                    ? { background: 'var(--grad)', borderColor: 'transparent', color: '#fff' }
                    : { borderColor: 'var(--border-2)', color: 'transparent' }
                }
              >
                {t.done ? '✓' : ''}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium" style={{ color: t.done ? 'var(--ink-3)' : 'var(--ink)' }}>
                    {t.title}
                  </span>
                  {t.source && (
                    <span className="rounded-full bg-[color:var(--panel)] px-2 py-0.5 text-[10px] text-[color:var(--indigo)]">
                      {t.source === 'seeded'
                        ? 'Suggested'
                        : t.source.startsWith('selects:')
                          ? `Selects · ${t.source.slice(8)}`
                          : t.source}
                    </span>
                  )}
                </div>
                {t.questions.length > 0 && (
                  <ul className="mt-1.5 list-disc pl-4 text-[12px] text-[color:var(--ink-3)]">
                    {t.questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                )}
                <input
                  value={t.note}
                  onChange={e => updateNote(t.id, e.target.value)}
                  placeholder="Add a note from the call…"
                  className="mt-2 w-full border-0 border-b border-dashed border-[color:var(--border-2)] bg-transparent px-0 py-1 text-[12.5px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => removeTopic(t.id)}
                aria-label="Remove topic"
                className="shrink-0 text-[16px] leading-none text-[color:var(--ink-3)] hover:text-[color:var(--rose-fg)]"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={newTopicTitle}
          onChange={e => setNewTopicTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') addCustomTopic()
          }}
          placeholder="Add your own topic…"
          className="flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
        />
        <button
          type="button"
          onClick={addCustomTopic}
          disabled={!newTopicTitle.trim()}
          className="shrink-0 rounded-lg border border-[color:var(--border)] px-3 py-2 text-[12.5px] text-[color:var(--ink-2)] transition hover:text-[color:var(--ink)] disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {suggested.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] text-[color:var(--ink-3)]">
            Suggested topics — seeded defaults{selectsNames.length > 0 ? ' & Selects context' : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggested.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => addSuggested(s)}
                className="max-w-[230px] rounded-xl border border-dashed border-[color:var(--border-2)] px-3 py-2 text-left text-[12px] text-[color:var(--ink-2)] transition hover:border-solid hover:border-[color:var(--indigo)] hover:bg-[color:var(--panel-2)]"
              >
                <span className="block font-medium text-[color:var(--ink)]">+ {s.title}</span>
                <span className="mt-0.5 block text-[10.5px] text-[color:var(--ink-3)]">
                  {s.source === 'seeded' ? 'Seeded default' : 'From Selects'} · {s.questions.length} question
                  {s.questions.length !== 1 ? 's' : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="mt-2 text-[10.5px] text-[color:var(--ink-3)]">
        Dynamic topic sourcing from The Playbook is a later phase — these are seeded defaults + Selects context for now.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[color:var(--border)] pt-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy !== null}
          className="rounded-lg border border-[color:var(--border)] px-4 py-2 text-[13px] font-medium text-[color:var(--ink-2)] transition hover:text-[color:var(--ink)] disabled:opacity-50"
        >
          {busy === 'save' ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={handleLogConversation}
          disabled={busy !== null}
          className="rounded-lg bg-[image:var(--grad)] px-4 py-2 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy === 'log' ? 'Logging…' : 'Log conversation'}
        </button>
        <span className="text-[11px] text-[color:var(--ink-3)]">
          Writes <b>{summary.text}</b> + your notes to the relationship log.
        </span>
      </div>
    </div>
  )
}
