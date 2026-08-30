'use client'

import { LearnWhy } from '@/components/ui/LearnWhy'
import { HumCaptureButton, type HumCaptureButtonProps } from './HumCaptureButton'
import type { WorkVersion } from '@/types/catalogue'

// ─── HumFirstMoment — the deliberate minute (sketch 003-B) ────────────
//
// A full-screen moment, shown ONCE per song, before that song's first AI
// entry — the diary timestamp a hum produces is only evidence if it
// precedes the thing it is evidence against. The once-per-song rule is
// enforced entirely by the PARENT (plan 12): this component's own
// contract is that it renders whenever it is mounted, full stop — it
// keeps no memory of whether it has fired before and makes no decision
// about when to appear. That decision belongs one layer up, where the
// per-song "has this fired" fact actually lives.
//
// Two lines below are owner copy, reproduced verbatim (not paraphrased):
// the headline ("Save and protect your idea by just humming or singing
// right now") and the rule line ("Hum every melody you want to own, and
// the song is entirely yours."). The supporting sentence keeps the
// owner's portable-asset framing — the take stays the artist's to play
// back or export to any tool — but names no tool by name, per this
// plan's own prohibition (sketch 003-B's own source text names one; this
// component deliberately does not).
//
// The "why" collapses behind components/ui/LearnWhy.tsx rather than a
// new disclosure widget, matching that component's own contract: what
// stays visible is the rule, what collapses is the why. The skip —
// "Continue without — I understand the risk" — is deliberately present
// and deliberately honest about its cost (T-37-58): guidance that cannot
// be escaped gets escaped dishonestly, and an unskippable moment mid-flow
// is a wall, not guidance.
//
// The actual recording is HumCaptureButton (task 1), mounted here rather
// than reimplemented — this component owns the moment's framing only.

export type HumFirstMomentProps = {
  workId: string
  songTitle: string
  onCaptured: (version: WorkVersion) => void
  onAttachExisting: () => void
  onSkip: () => void
  /**
   * Passed straight through to HumCaptureButton — the same test seam
   * documented on that component. A production caller never sets this;
   * the browser's own MediaRecorder.isTypeSupported is the default.
   */
  isTypeSupported?: HumCaptureButtonProps['isTypeSupported']
}

export function HumFirstMoment({
  workId,
  songTitle,
  onCaptured,
  onAttachExisting,
  onSkip,
  isTypeSupported,
}: HumFirstMomentProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-6 py-12">
      <div className="w-full max-w-[460px] rounded-[12px] border border-hair bg-card px-[26px] py-[26px] text-center">
        <p className="text-[10px] uppercase tracking-[.16em] text-lavdim">
          Before the AI sings on {songTitle}
        </p>
        <b className="mt-[6px] block text-[18px] leading-snug text-white">
          Save and protect your idea by just humming or singing right now
        </b>
        <p className="mt-[4px] text-[12px] text-lavdim">
          A hum is enough. It stays yours to play back or export to any tool — the idea is on
          record as yours.
        </p>

        <div className="mt-[6px] flex justify-center">
          <LearnWhy label="Why this protects you">
            <p className="mx-auto max-w-[360px] text-[11px] text-lavdim">
              A hum recorded here is timestamped the moment you make it — the strongest form
              your authorship trail can take. It exists before the AI ever touches this song,
              which is exactly what makes it evidence rather than a claim you&apos;re asking
              someone to take your word for.
            </p>
          </LearnWhy>
        </div>

        <div className="mt-[18px] flex justify-center">
          <HumCaptureButton workId={workId} onCaptured={onCaptured} isTypeSupported={isTypeSupported} />
        </div>

        <p className="mt-[16px] text-[13px] text-lav">
          <b>&#8220;Hum every melody you want to own, and the song is entirely yours.&#8221;</b>
        </p>

        <div className="mt-[14px] border-t border-hair pt-[14px]">
          <div className="flex items-center justify-center gap-[8px]">
            <button
              type="button"
              onClick={onAttachExisting}
              className="rounded-[9px] border border-hairstrong bg-lav/[.06] px-[13px] py-[7px] text-[12px] font-semibold text-lav hover:text-white"
            >
              Attach an existing take
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="border-0 bg-transparent px-[13px] py-[7px] text-[12px] font-semibold text-lavdim hover:text-white"
            >
              Continue without — I understand the risk
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
