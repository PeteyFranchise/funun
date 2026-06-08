'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { DocRequirement, Stage3Result } from '@/lib/vault/stage3'
import { STAGE3_CONTINUE_THRESHOLD } from '@/lib/vault/stage3'
import { DocumentCard } from '@/components/vault/DocumentCard'
import { ToolSidePanel } from '@/components/vault/ToolSidePanel'
import { SampleFlagToggle } from '@/components/vault/SampleFlagToggle'

type StageTrack = {
  id: string
  title: string
  has_sample: boolean
  sample_details: string | null
}

// The five Sound Vault stages — documentation is stage 3.
const STAGE_COUNT = 5
const STAGE_INDEX = 3

export function DocumentStage({
  projectId,
  stage3,
  tracks,
  readinessScore,
}: {
  projectId: string
  stage3: Stage3Result
  tracks: StageTrack[]
  readinessScore: number
}) {
  const router = useRouter()
  const [active, setActive] = useState<DocRequirement | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [showComplete, setShowComplete] = useState(false)

  const { required, recommended, complete, requiredComplete, requiredTotal, canContinue, sampleBlock } =
    stage3

  async function markSigned(req: DocRequirement) {
    if (!req.documentId) return
    setBusyKey(req.key)
    try {
      await fetch(`/api/vault/${projectId}/documents/${req.documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'signed' }),
      })
      router.refresh()
    } finally {
      setBusyKey(null)
    }
  }

  async function patchProject(body: Record<string, unknown>, key: string) {
    setBusyKey(key)
    try {
      await fetch(`/api/vault/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      router.refresh()
    } finally {
      setBusyKey(null)
    }
  }

  function markRegistered() {
    void patchProject({ content_id_registered: true }, 'contentid')
  }
  function remindLater() {
    const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    void patchProject({ content_id_dismissed_until: until }, 'contentid')
  }

  function onPanelDone() {
    router.refresh()
  }

  return (
    <div className="space-y-8">
      {/* Stage progress */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/40">
            Stage {STAGE_INDEX} of {STAGE_COUNT}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Complete the documentation</h1>
          <p className="mt-1 text-sm text-white/50">
            The legal paperwork that protects your ownership before you release.
          </p>
        </div>
        <div className="hidden items-center gap-1.5 sm:flex">
          {Array.from({ length: STAGE_COUNT }).map((_, i) => (
            <span
              key={i}
              className={`h-2 rounded-full transition-all ${
                i + 1 === STAGE_INDEX
                  ? 'w-8 bg-indigo-400'
                  : i + 1 < STAGE_INDEX
                    ? 'w-2 bg-white/40'
                    : 'w-2 bg-white/15'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Progress summary */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-white">Required documents</p>
          <span className="text-sm text-white/50">
            {requiredComplete}/{requiredTotal} complete
          </span>
        </div>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all"
            style={{
              width: `${requiredTotal === 0 ? 100 : Math.round((requiredComplete / requiredTotal) * 100)}%`,
            }}
          />
        </div>
        {sampleBlock && (
          <p className="mt-3 flex items-start gap-2 text-xs text-rose-300">
            <span className="mt-px">⚠</span>
            An uncleared sample is capping your readiness. Clear it before release to avoid takedowns.
          </p>
        )}
      </div>

      {/* Required */}
      {required.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-rose-300/80">
            Required · {required.length}
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {required.map(req => (
              <DocumentCard
                key={req.key}
                req={req}
                busy={busyKey === req.key}
                onOpen={setActive}
                onMarkSigned={markSigned}
              />
            ))}
          </div>
        </section>
      )}

      {/* Recommended */}
      {recommended.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-300/80">
            Recommended · {recommended.length}
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {recommended.map(req => (
              <div key={req.key} className="space-y-2">
                <DocumentCard req={req} busy={busyKey === req.key} onOpen={setActive} onMarkSigned={markSigned} />
                {req.tool === 'contentid' && (
                  <div className="flex gap-2">
                    <button
                      onClick={markRegistered}
                      disabled={busyKey === req.key}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-40"
                    >
                      Mark as registered
                    </button>
                    <button
                      onClick={remindLater}
                      disabled={busyKey === req.key}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/40 transition hover:text-white/70 disabled:opacity-40"
                    >
                      Remind me in 30 days
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sample flags */}
      {tracks.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
            Sample check
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {tracks.map(t => (
              <SampleFlagToggle
                key={t.id}
                projectId={projectId}
                trackId={t.id}
                title={t.title}
                initialHasSample={t.has_sample}
                initialDetails={t.sample_details}
              />
            ))}
          </div>
        </section>
      )}

      {/* Complete (collapsed) */}
      {complete.length > 0 && (
        <section>
          <button
            onClick={() => setShowComplete(v => !v)}
            className="flex w-full items-center justify-between text-sm font-semibold uppercase tracking-wide text-emerald-300/80"
          >
            <span>Complete · {complete.length}</span>
            <svg
              viewBox="0 0 24 24"
              className={`h-4 w-4 transition-transform ${showComplete ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {showComplete && (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {complete.map(req => (
                <DocumentCard
                  key={req.key}
                  req={req}
                  busy={busyKey === req.key}
                  onOpen={setActive}
                  onMarkSigned={markSigned}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Empty state */}
      {required.length === 0 && recommended.length === 0 && complete.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <p className="text-sm text-white/60">
            No documents are required for this project yet. Add tracks with collaborators or samples
            to see what protection you need.
          </p>
        </div>
      )}

      {/* Nav */}
      <div className="flex items-center justify-between border-t border-white/10 pt-6">
        <Link
          href={`/vault/${projectId}`}
          className="text-sm text-white/50 transition hover:text-white"
        >
          ← Back to project
        </Link>
        {canContinue ? (
          <Link
            href={`/vault/${projectId}`}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: '#818CF8' }}
          >
            Continue to tools →
          </Link>
        ) : (
          <div className="text-right">
            <button
              disabled
              className="cursor-not-allowed rounded-lg bg-white/10 px-5 py-2.5 text-sm font-semibold text-white/40"
            >
              Continue to tools →
            </button>
            <p className="mt-1.5 text-xs text-white/40">
              {sampleBlock
                ? 'Clear flagged samples to continue.'
                : `Reach ${STAGE3_CONTINUE_THRESHOLD} readiness to continue (currently ${readinessScore}).`}
            </p>
          </div>
        )}
      </div>

      <ToolSidePanel
        projectId={projectId}
        req={active}
        onClose={() => setActive(null)}
        onDone={onPanelDone}
      />
    </div>
  )
}
