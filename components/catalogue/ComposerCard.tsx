// ─── The composer — four verbs, then the diary (sketch 005-C) ─────────
// Every song page leads with this card. Creation is the interface;
// evidence is the exhaust — the diary that grows beneath it (DiaryFeed)
// is the byproduct of using these four verbs, never a separate chore.
//
// This component performs no fetch and opens no modal itself. Every verb
// is a callback prop; the parent (plan 12's page) owns what "hum it"
// actually does (mounts plan 09's HumCaptureButton flow, the pad, the
// upload flow, or the note composer).

// ─── The four verbs, in the sketch's own order and glyphs ───────────────

type ComposerVerb = {
  key: 'hum' | 'lyrics' | 'audio' | 'note'
  glyph: string
  label: string
  onClick: () => void
}

export type ComposerCardProps = {
  onHum: () => void
  onWriteLyrics: () => void
  onAddAudio: () => void
  onNote: () => void
  /**
   * Whether this browser can record audio at all (plan 09's
   * HumCaptureButton asks the platform at runtime and reports the
   * answer up). When false, the hum tile is not left as a dead button —
   * it becomes the upload path instead, the same degrade plan 09's
   * component performs internally. "Add audio" is unaffected either way.
   */
  supportsCapture: boolean
}

export function ComposerCard({ onHum, onWriteLyrics, onAddAudio, onNote, supportsCapture }: ComposerCardProps) {
  const verbs: ComposerVerb[] = [
    supportsCapture
      ? { key: 'hum', glyph: '🎙', label: 'Hum it', onClick: onHum }
      // Capture unsupported: the hum tile keeps its place first in the
      // row (an artist reaching for "hum" should not have to hunt for a
      // renamed tile) but wires to the upload path instead of a mic that
      // cannot open. "Upload it" tells the truth about what tapping this
      // tile now does — it is not simply "Add audio" restated, which
      // stays as its own, unrelated tile below.
      : { key: 'hum', glyph: '⬆', label: 'Upload it', onClick: onAddAudio },
    { key: 'lyrics', glyph: '✎', label: 'Write lyrics', onClick: onWriteLyrics },
    { key: 'audio', glyph: '⬆', label: 'Add audio', onClick: onAddAudio },
    { key: 'note', glyph: '💬', label: 'Note', onClick: onNote },
  ]

  return (
    <div className="rounded-[12px] border border-brandindigo/40 bg-card px-4 py-[14px]">
      <p className="mb-[9px] text-[11px] text-lavdim">Add to this song</p>
      <div className="grid grid-cols-2 gap-[7px]">
        {verbs.map(verb => (
          <button
            key={verb.key}
            type="button"
            onClick={verb.onClick}
            className="flex flex-col items-center justify-center gap-[7px] rounded-[9px] border border-hairstrong bg-card2 px-2 py-[11px] text-[12px] font-semibold text-white hover:border-brandindigo/50"
          >
            <span aria-hidden="true" className="grid h-[30px] w-[30px] place-items-center rounded-[7px] border border-hairstrong bg-lav/[.09] text-[15px]">{verb.glyph}</span>
            {verb.label}
          </button>
        ))}
      </div>
      {/*
        This line is doing real work, not decoration. It is the one
        sentence that tells an artist why a diary exists before they have
        ever seen one — the whole thesis of 005-C in one breath.
      */}
      <p className="mt-[10px] text-[11px] text-lavdim">
        Whatever you add, the song remembers — who, what, when. That&apos;s your proof, kept automatically.
      </p>
    </div>
  )
}

// ─── Empty state — the pitch, not a form (sketch 005-C) ────────────────
// The owner named this the pitch: a catalogue starts from a hum, not
// from a blank form. This is a brand-new song's very first screen, so it
// carries the surface's single gradient — spent here, on this one
// primary action, and nowhere else on this page (see GuidingLine.tsx's
// header comment for the other half of that budget rule).

export type ComposerCardEmptyStateProps = {
  onHumYourIdea: () => void
  onStartWithLyrics: () => void
  /**
   * Same degrade as ComposerCard's hum tile: when this browser cannot
   * record, the hero's primary action routes to the upload path instead
   * of offering a mic that will never open. The card still carries
   * exactly one gradient-styled primary action either way.
   */
  supportsCapture: boolean
  onAddAudio: () => void
}

export function ComposerCardEmptyState({
  onHumYourIdea,
  onStartWithLyrics,
  supportsCapture,
  onAddAudio,
}: ComposerCardEmptyStateProps) {
  const primaryLabel = supportsCapture ? '🎙 Hum your idea' : '⬆ Add your idea'
  const primaryAction = supportsCapture ? onHumYourIdea : onAddAudio

  return (
    <div className="rounded-[12px] border border-hair bg-card px-[22px] py-[22px] text-center">
      <b className="text-[15px] text-white">Start with a hum</b>
      <p className="mx-auto mb-3 mt-[5px] max-w-[420px] text-[11px] text-lavdim">
        Thirty seconds of melody makes it real — and provably yours.
      </p>
      <div className="flex items-center justify-center gap-2">
        {/*
          BUDGET RULE: one gradient per screen, spent on the primary
          action. This is the only element on this surface that may carry
          `bg-grad` — do not add a second one to a later change here or on
          the composer/guiding-line row above.
        */}
        <button
          type="button"
          onClick={primaryAction}
          className="rounded-[9px] bg-grad px-[13px] py-[7px] text-[12px] font-semibold text-white shadow-cta"
        >
          {primaryLabel}
        </button>
        <button
          type="button"
          onClick={onStartWithLyrics}
          className="rounded-[9px] border border-hairstrong bg-lav/[.06] px-[13px] py-[7px] text-[12px] font-semibold text-lav hover:text-white"
        >
          ✎ Start with lyrics
        </button>
      </div>
    </div>
  )
}
