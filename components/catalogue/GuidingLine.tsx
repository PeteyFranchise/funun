import type { GuidingLineStep } from '@/lib/catalogue/guiding-line'

// ─── The guiding line — one sentence, or nothing (sketch 005-C) ───────
// DESIGN RULE, VERBATIM FROM THE SKETCH/lib/catalogue/guiding-line.ts:
// the line rotates through the song's single most important next step,
// never stacks, and is absent when nothing is needed. This component
// renders exactly what `resolveGuidingLine()` (plan 03) returned.
//
// The prop is a single `GuidingLineStep | null` — deliberately, never an
// array. A component whose prop type admitted a list would eventually be
// handed one, and the "never a stack" rule would degrade from structural
// to a convention someone could quietly violate. See
// GuidingLine.test.tsx for the type-level assertion that a stack cannot
// even be constructed here.
//
// Dismissal is per-step-per-song and is a courtesy on top of
// resolveGuidingLine()'s own cadence gates (fired-once-per-contributor,
// the doors-only silencer) — this component never decides WHETHER to
// show a step, only HOW. onDismiss just reports the choice upward; the
// parent (plan 12's page) is the one that persists it and recomputes the
// snapshot passed back in on the next render.
//
// The row spends a gradient-tinted BORDER and a very faint gradient
// WASH here — never the full `bg-grad` gradient, which is this surface's
// single spend and belongs to ComposerCard's empty-state primary action
// (or, on a non-empty song, to whatever the page's own primary CTA is).
// Reusing `bg-grad` here would double-spend the budget the composer
// already accounted for.

export type GuidingLineProps = {
  step: GuidingLineStep | null
  onDoIt: (step: GuidingLineStep) => void
  onDismiss: (step: GuidingLineStep) => void
}

export function GuidingLine({ step, onDoIt, onDismiss }: GuidingLineProps) {
  // Absent when nothing is needed — not an empty container, not a
  // placeholder. Literally nothing.
  if (!step) return null

  return (
    <div className="mt-2 flex items-center gap-[9px] rounded-[10px] border border-brandindigo/30 bg-gradient-to-r from-brandindigo/10 to-brandfuchsia/5 px-[13px] py-[9px]">
      <span aria-hidden="true" className="text-[13px]">💡</span>
      <span className="flex-1 text-[11px] text-lav">
        <b className="font-bold text-white">Next for this song:</b> {step.headline}
      </span>
      <button
        type="button"
        onClick={() => onDoIt(step)}
        className="rounded-[9px] border border-hairstrong bg-lav/[.06] px-[11px] py-[4px] text-[11px] font-semibold text-lav hover:text-white"
      >
        {step.actionLabel} →
      </button>
      <button
        type="button"
        onClick={() => onDismiss(step)}
        aria-label="Dismiss"
        title="Dismiss"
        className="border-0 bg-transparent p-0 text-[13px] text-lavdim hover:text-white"
      >
        ✕
      </button>
    </div>
  )
}
