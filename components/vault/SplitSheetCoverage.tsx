import Link from 'next/link'

// Coverage-based split-sheet readiness surface (P18-14/P18-15/P18-16,
// 18-04). Renders alongside the split_sheets readiness gate so a score
// that drops from complete to warning reads as the correction it is, not
// a bug — the artist sees exactly how many of their songs are covered and
// which specific ones are not (T-18-24: repudiation mitigation).
//
// Server component: no client state, purely presentational.

export type SplitSheetCoverageTrack = {
  id: string
  title: string
}

export function SplitSheetCoverage({
  covered,
  needing,
  uncoveredTracks,
}: {
  covered: number
  needing: number
  uncoveredTracks: SplitSheetCoverageTrack[]
}) {
  if (needing === 0) return null
  const allCovered = covered === needing && uncoveredTracks.length === 0

  return (
    <div className="mb-3 rounded-[14px] border border-hair bg-card px-[18px] py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[14px] font-bold text-white">
          Split sheets: <span className="tnum">{covered}</span> of{' '}
          <span className="tnum">{needing}</span> songs covered
        </div>
        {!allCovered && (
          <span className="flex-none rounded-full border border-money/30 bg-money/10 px-3 py-[5px] text-[12px] font-bold text-money2">
            Not fully documented
          </span>
        )}
      </div>

      {uncoveredTracks.length > 0 && (
        <p className="mt-2 text-[13px] text-lavdim">
          Missing a split sheet:{' '}
          <span className="font-semibold text-money2">
            {uncoveredTracks.map(t => t.title).join(', ')}
          </span>
        </p>
      )}

      {!allCovered && (
        <Link
          href="/split-sheets"
          className="mt-3 inline-block text-[12.5px] font-semibold text-brandindigo"
        >
          Create a split sheet →
        </Link>
      )}
    </div>
  )
}
