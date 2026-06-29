// MLC guide card — pure display component (no client state needed).
// Explains mechanical royalty collection via the MLC, how it differs from PRO
// royalties, and links to themlc.com for songwriter registration.
export function MlcGuideCard() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="text-sm font-semibold text-white">
        MLC — Mechanical Licensing Collective
      </h3>
      <p className="mt-1 text-xs text-white/60">
        The MLC administers mechanical royalties for on-demand streaming and downloads in the
        US. Every songwriter and publisher who distributes music on Spotify, Apple Music, or
        any other interactive streaming service should register directly at themlc.com — this
        is separate from PRO royalties, which cover public performance.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <a
          href="https://www.themlc.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-indigo-300 transition hover:text-indigo-200"
        >
          Register at themlc.com →
        </a>
        <a
          href="https://www.themlc.com/royalties"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-indigo-300 transition hover:text-indigo-200"
        >
          About mechanical royalties →
        </a>
      </div>
    </div>
  )
}
