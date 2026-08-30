'use client'

// ─── ReauthorPrompt — the inline re-author moment (sketch 003-A) ──────
//
// Where HumFirstMoment (above) is a full-screen once-per-song interrupt,
// this is the OTHER half of the decided split: inline on the diary entry
// itself, low ceremony, and it RECURS — every AI-generated part an artist
// keeps gets one of these, not just the first. DiaryFeed itself stays
// clean (see that component's own header comment): this card is mounted
// by the page next to the specific entry it concerns, never stapled onto
// a diary row.
//
// The doctrine behind the closing line: performance is not authorship.
// Re-singing or re-playing an AI-invented part verbatim does not launder
// it — a human has to actually transform it (new phrasing, different
// intervals or rhythm, an ending of their own) before the part becomes
// theirs. "Keep as-is, disclosed" is kept warmer than a legal warning: it
// is a legitimate choice, not a failure state — it simply leaves that one
// strand as public land rather than claimed, and The Crate's own
// component-level disclosure tier (lib/catalogue/ai-entries.ts) already
// handles that case honestly.

export type ReauthorPromptProps = {
  /** The diary entry this prompt concerns, e.g. "v4 · AI guitar solo (bars 57–64)". */
  entryHeadline: string
  onReauthor: () => void
  onKeepAsIs: () => void
}

export function ReauthorPrompt({ entryHeadline, onReauthor, onKeepAsIs }: ReauthorPromptProps) {
  return (
    <div className="rounded-[12px] border border-hair bg-card px-[15px] py-[13px]">
      <div className="flex items-start justify-between gap-[10px]">
        <b className="text-[12px] text-white">{entryHeadline}</b>
        <span className="inline-flex shrink-0 items-center gap-[5px] whitespace-nowrap rounded-full bg-blue-400/[.13] px-[9px] py-[3px] text-[11px] font-semibold text-blue-400">
          <i aria-hidden="true" className="h-[5px] w-[5px] rounded-full bg-current not-italic" />
          owned by no one
        </span>
      </div>

      <p className="mt-[5px] text-[11px] text-lavdim">
        Keeping it as-is is fine — it just stays public land. Make it yours instead:
      </p>

      <div className="mt-[9px] flex gap-[8px]">
        <button
          type="button"
          onClick={onReauthor}
          className="rounded-[9px] bg-grad px-[13px] py-[7px] text-[12px] font-semibold text-white shadow-cta"
        >
          Re-author it →
        </button>
        <button
          type="button"
          onClick={onKeepAsIs}
          className="rounded-[9px] border border-hairstrong bg-lav/[.06] px-[13px] py-[7px] text-[12px] font-semibold text-lav hover:text-white"
        >
          Keep as-is, disclosed
        </button>
      </div>

      <p className="mt-[8px] text-[11px] text-lavdim">
        Re-author = a human plays it their own way — new phrasing, their own ending.
        Note-for-note replay doesn&apos;t count.
      </p>
    </div>
  )
}
