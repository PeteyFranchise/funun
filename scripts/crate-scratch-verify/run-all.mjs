#!/usr/bin/env node
// Runs every probe in order and stops on the first nonzero exit.
//
// This exists because the README once listed five probes while the results
// claimed seven passed. One command, one exit code, no chance of a probe being
// quietly left out of the evidence.
import { spawnSync } from 'node:child_process'
const probes = [
  'probe-privileges.mjs', 'probe-truncate.mjs', 'probe-capture.mjs', 'probe-codes.mjs',
  'probe-concurrency.mjs', 'probe-rls.mjs', 'probe-capture-vs-reject.mjs',
  'probe-replay-status.mjs',
]
let failed = null
for (const p of probes) {
  const r = spawnSync(process.execPath, [p], { stdio: 'inherit' })
  console.log(`\n--- ${p}: exit ${r.status} ---\n`)
  if (r.status !== 0) { failed = p; break }
}
console.log(failed ? `HARNESS FAILED at ${failed}` : `HARNESS PASSED — all ${probes.length} probes`)
process.exit(failed ? 1 : 0)
