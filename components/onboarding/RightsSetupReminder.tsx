import Link from 'next/link'

export function RightsSetupReminder({ remainingCount }: { remainingCount: number }) {
  return (
    <section
      className="mb-8 flex flex-col gap-4 rounded-card border border-hair bg-card px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
      aria-labelledby="rights-setup-reminder-title"
    >
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.12em] text-lav">Ready when you are</p>
        <h2 id="rights-setup-reminder-title" className="mt-1.5 text-base font-bold text-white">
          Pick up your rights setup
        </h2>
        <p className="mt-1 max-w-[620px] text-xs leading-5 text-lavdim">
          You asked us to revisit {remainingCount} {remainingCount === 1 ? 'profile detail' : 'profile details'}.
          Nothing here blocks songwriting—you can handle it whenever you’re ready.
        </p>
      </div>
      <Link
        href="/settings"
        className="shrink-0 self-start rounded-lg border border-hairstrong px-4 py-2.5 text-xs font-bold text-lav transition hover:text-white sm:self-auto"
      >
        Continue rights setup
      </Link>
    </section>
  )
}
