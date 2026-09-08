'use client'
import { useState } from 'react'
export type SimulationCard = {
  assignmentId: string
  scenarioId: string
  title: string
  description: string
  roomKey: string
  roomLabel: string
  prompts: { id: string; prompt: string }[]
  dueAt: string | null
  attemptStatus: string | null
  certificateExpiresAt: string | null
}
export type SimulationReviewCard = {
  attemptId: string
  title: string
  roomKey: string
  responses: { promptId: string; response: string }[]
  submittedAt: string
}
export function SimulationCenter({
  initialAssignments,
  reviews,
  sources,
  roles,
}: {
  initialAssignments: SimulationCard[]
  reviews: SimulationReviewCard[]
  sources: { id: string; title: string; roomKey: string }[]
  roles: string[]
}) {
  const [message, setMessage] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  async function submit(card: SimulationCard) {
    const responses = card.prompts.map((prompt) => ({
      promptId: prompt.id,
      response: answers[`${card.assignmentId}:${prompt.id}`] ?? '',
    }))
    const response = await fetch(
      `/api/admin/playbook/simulations/assignments/${card.assignmentId}/submit`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ responses, selfReflection: null }),
      }
    )
    const body = await response.json().catch(() => ({}))
    setMessage(
      response.ok
        ? 'Submitted for human review.'
        : (body.error ?? 'Could not submit simulation')
    )
  }
  async function review(card: SimulationReviewCard) {
    const score = Number(window.prompt('Score from 0 to 100'))
    if (!Number.isFinite(score)) return
    const note = window.prompt('Review note and coaching context')
    if (!note) return
    const needsRemediation = window.confirm(
      'Does this person need a remediation path? Select Cancel for no.'
    )
    const response = await fetch(
      `/api/admin/playbook/simulations/attempts/${card.attemptId}/review`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roomKey: card.roomKey,
          score,
          needsRemediation,
          note,
        }),
      }
    )
    const body = await response.json().catch(() => ({}))
    setMessage(
      response.ok
        ? `Review recorded: ${body.data.status}`
        : (body.error ?? 'Could not review attempt')
    )
  }
  async function create(form: HTMLFormElement) {
    const data = new FormData(form)
    const source = sources.find((x) => x.id === data.get('sourceEntryId'))
    if (!source) return
    const due = data.get('dueAt')
    const response = await fetch('/api/admin/playbook/simulations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        roomKey: source.roomKey,
        sourceEntryId: source.id,
        title: data.get('title'),
        description: data.get('description'),
        prompts: String(data.get('prompts'))
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean),
        passingScore: Number(data.get('passingScore')),
        certificateValidDays: Number(data.get('certificateValidDays')),
        targetRole: data.get('targetRole'),
        dueAt: due ? new Date(String(due)).toISOString() : null,
      }),
    })
    const body = await response.json().catch(() => ({}))
    setMessage(
      response.ok
        ? 'Scenario published and assigned.'
        : (body.error ?? 'Could not publish scenario')
    )
  }
  return (
    <div className="mt-6 space-y-5">
      {sources.length > 0 && (
        <details className="rounded-xl border border-[color:var(--border)] p-4">
          <summary className="cursor-pointer font-bold">
            Build a human-reviewed simulation
          </summary>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void create(e.currentTarget)
            }}
            className="mt-4 grid gap-3 md:grid-cols-2"
          >
            <select
              name="sourceEntryId"
              className="rounded-lg bg-[color:var(--panel-2)] p-3"
            >
              {sources.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
            </select>
            <input
              name="title"
              required
              placeholder="Scenario title"
              className="rounded-lg bg-[color:var(--panel-2)] p-3"
            />
            <textarea
              name="description"
              required
              placeholder="Learning objective and context"
              className="rounded-lg bg-[color:var(--panel-2)] p-3 md:col-span-2"
            />
            <textarea
              name="prompts"
              required
              rows={5}
              placeholder={
                'One scenario prompt per line\nWhat would you do first?\nWho must be notified?'
              }
              className="rounded-lg bg-[color:var(--panel-2)] p-3 md:col-span-2"
            />
            <input
              name="passingScore"
              type="number"
              min="1"
              max="100"
              defaultValue="80"
              className="rounded-lg bg-[color:var(--panel-2)] p-3"
            />
            <input
              name="certificateValidDays"
              type="number"
              min="1"
              max="3650"
              defaultValue="365"
              className="rounded-lg bg-[color:var(--panel-2)] p-3"
            />
            <select
              name="targetRole"
              className="rounded-lg bg-[color:var(--panel-2)] p-3"
            >
              {roles.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
            <input
              name="dueAt"
              type="datetime-local"
              className="rounded-lg bg-[color:var(--panel-2)] p-3"
            />
            <button className="w-fit rounded-lg bg-[color:var(--indigo)] px-4 py-2 font-bold text-white">
              Publish simulation
            </button>
          </form>
        </details>
      )}
      {message && (
        <p aria-live="polite" className="text-sm text-[color:var(--ink-3)]">
          {message}
        </p>
      )}
      <section>
        <h2 className="font-bold">My simulations</h2>
        <div className="mt-3 space-y-3">
          {initialAssignments.map((card) => (
            <article
              key={card.assignmentId}
              className="rounded-xl border border-[color:var(--border)] p-4"
            >
              <p className="text-xs uppercase text-[color:var(--ink-3)]">
                {card.roomLabel}
                {card.dueAt
                  ? ` · due ${new Date(card.dueAt).toLocaleDateString()}`
                  : ''}
              </p>
              <h3 className="mt-1 font-bold">{card.title}</h3>
              <p className="mt-1 text-sm text-[color:var(--ink-3)]">
                {card.description}
              </p>
            {card.attemptStatus === 'submitted' || card.attemptStatus === 'passed' ? (
                <p className="mt-3 text-sm">
                  Status: {card.attemptStatus}
                  {card.certificateExpiresAt
                    ? ` · certified through ${new Date(card.certificateExpiresAt).toLocaleDateString()}`
                    : ''}
                </p>
            ) : (
              <div className="mt-4 space-y-3">
                {card.attemptStatus && <p className="text-sm text-amber-200">Previous result: {card.attemptStatus}. Complete the remediation guidance, then submit a new attempt.</p>}
                  {card.prompts.map((prompt) => (
                    <label key={prompt.id} className="block text-sm">
                      {prompt.prompt}
                      <textarea
                        value={
                          answers[`${card.assignmentId}:${prompt.id}`] ?? ''
                        }
                        onChange={(e) =>
                          setAnswers((current) => ({
                            ...current,
                            [`${card.assignmentId}:${prompt.id}`]:
                              e.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-lg bg-[color:var(--panel-2)] p-3"
                      />
                    </label>
                  ))}
                  <button
                    onClick={() => void submit(card)}
                    className="rounded-lg bg-[color:var(--indigo)] px-4 py-2 font-bold text-white"
                  >
                    Submit for review
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
      {reviews.length > 0 && (
        <section>
          <h2 className="font-bold">Review queue</h2>
          <div className="mt-3 space-y-3">
            {reviews.map((card) => (
              <article
                key={card.attemptId}
                className="rounded-xl border border-amber-400/30 p-4"
              >
                <h3 className="font-bold">{card.title}</h3>
                {card.responses.map((x, index) => (
                  <p key={x.promptId} className="mt-2 text-sm">
                    <span className="text-[color:var(--ink-3)]">
                      Response {index + 1}:
                    </span>{' '}
                    {x.response}
                  </p>
                ))}
                <button
                  onClick={() => void review(card)}
                  className="mt-3 rounded-lg border border-[color:var(--border)] px-4 py-2 text-sm font-bold"
                >
                  Review attempt
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
