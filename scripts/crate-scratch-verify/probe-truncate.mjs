import { Client } from 'pg'
const c = new Client({ host: process.env.PGHOST ?? '/private/tmp/pgtest', port: Number(process.env.PGPORT ?? 54329), user:'postgres', database:'postgres' })
await c.connect()
// CASCADE defeats the FK objection, so whatever refuses now is the trigger.
for (const t of ['crate_quality_reviews','crate_song_events','crate_backfill_attestations','crate_artifact_approvals']) {
  try {
    await c.query('BEGIN'); await c.query(`TRUNCATE public.${t} CASCADE`); await c.query('ROLLBACK')
    console.log(`*** HOLE ***  TRUNCATE ${t} CASCADE succeeded`)
  } catch (e) {
    await c.query('ROLLBACK')
    const byTrigger = /append-only/.test(e.message)
    console.log(`${byTrigger ? 'OK  ' : '???'}  TRUNCATE ${t} CASCADE: ${e.message.slice(0,70)}`)
  }
}
// and a MUTABLE table must still be truncatable — otherwise the guard is too broad
try {
  await c.query('BEGIN'); await c.query('TRUNCATE public.crate_capture_orphans'); await c.query('ROLLBACK')
  console.log('OK    TRUNCATE crate_capture_orphans (mutable) succeeded — guard is not over-broad')
} catch (e) { await c.query('ROLLBACK'); console.log('??? mutable table refused:', e.message.slice(0,60)) }
await c.end()
