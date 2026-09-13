export default function WorkspaceContractsLoading() {
  return (
    <main className="flex-1 px-6 py-10" aria-busy="true" aria-label="Loading Contract Locker">
      <div className="mx-auto max-w-[1180px] animate-pulse">
        <div className="h-3 w-40 rounded bg-white/10" />
        <div className="mt-4 h-10 w-72 rounded bg-white/10" />
        <div className="mt-4 h-4 w-full max-w-2xl rounded bg-white/[.07]" />
        <div className="mt-8 h-20 rounded-[16px] border border-hair bg-card" />
        <div className="mt-6 space-y-4">
          <div className="h-56 rounded-[20px] border border-hair bg-card" />
          <div className="h-44 rounded-[20px] border border-hair bg-card" />
        </div>
      </div>
    </main>
  )
}
