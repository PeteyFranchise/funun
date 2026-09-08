export function FeatureGateNotice({ schemaReady, label }: { schemaReady: boolean; label: string }) {
  return <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5"><h2 className="font-bold">{schemaReady ? `${label} is not enabled for your beta cohort.` : `${label} is built and awaiting activation.`}</h2><p className="mt-2 text-sm text-[color:var(--ink-3)]">{schemaReady ? 'Leadership can grant this capability through Controlled Activation.' : 'Candidate migration 207 must be owner-approved before this capability can be enabled.'}</p></div>
}
