// Songtrust guide card — pure display component (no client state needed).
// Explains publishing administration, global royalty collection via CWR, and
// links to the existing CWR export page plus the Songtrust website.
export function SongtrustGuideCard({ cwrHref }: { cwrHref: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="text-sm font-semibold text-white">Songtrust</h3>
      <p className="mt-1 text-xs text-white/60">
        Songtrust is a publishing administrator that collects royalties globally on your behalf
        by submitting a CWR file to PROs worldwide. They handle registration with multiple
        societies so you capture royalties in territories where you haven&apos;t registered directly.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <a
          href={cwrHref}
          className="text-xs font-semibold text-indigo-300 transition hover:text-indigo-200"
        >
          Download CWR file →
        </a>
        {/* TODO: verify Songtrust URL — checkpoint in 03-03 will confirm */}
        <a
          href="https://www.songtrust.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-indigo-300 transition hover:text-indigo-200"
        >
          Learn about Songtrust →
        </a>
      </div>
    </div>
  )
}
