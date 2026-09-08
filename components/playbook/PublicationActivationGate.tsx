export function PublicationActivationGate({ documentSchemaReady, readingSchemaReady }: { documentSchemaReady: boolean; readingSchemaReady: boolean }) {
  const steps = [
    { migration: '199–200', label: 'Phase 38.2 billing and beta flag', ready: null },
    { migration: '201', label: 'Rich Playbook documents and governance', ready: documentSchemaReady },
    { migration: '202', label: 'Reading assignments and acknowledgements', ready: readingSchemaReady },
  ]

  return (
    <section className="mt-6 rounded-2xl border border-amber-300/30 bg-amber-300/5 p-5" aria-labelledby="activation-blocked-title">
      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-amber-300">Activation held safely</p>
      <h2 id="activation-blocked-title" className="mt-2 text-lg font-extrabold text-[color:var(--ink)]">The production schema is not ready for the doctrine pilot.</h2>
      <p className="mt-2 max-w-[76ch] text-[12px] leading-6 text-[color:var(--ink-3)]">Nothing is broken and nothing was partially published. The reserved migration sequence must be completed in order through the owner-controlled database process.</p>
      <ol className="mt-4 grid gap-3 lg:grid-cols-3">
        {steps.map(step => (
          <li key={step.migration} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <span className={`text-[10px] font-bold uppercase tracking-[.1em] ${step.ready ? 'text-emerald-300' : 'text-amber-300'}`}>{step.ready === null ? 'Verify ledger' : step.ready ? 'Detected' : 'Waiting'} · migration {step.migration}</span>
            <p className="mt-2 text-[12px] font-bold text-[color:var(--ink-2)]">{step.label}</p>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[11px] leading-5 text-[color:var(--ink-3)]">Do not renumber or promote migrations 201–202 until Phase 38.2 has authored 199–200. Return here after the migration ledger is complete; the A&R-first pilot will then become available.</p>
    </section>
  )
}
