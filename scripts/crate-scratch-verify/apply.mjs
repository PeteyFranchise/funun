import { Client } from 'pg'
import { readFileSync } from 'node:fs'
const M = process.env.MIGRATIONS_DIR ?? new URL('../../supabase/migrations/', import.meta.url).pathname
const files = ['248_crate_song_expand.sql','251_crate_quality_review_writer.sql',
               '252_crate_capture_writer.sql','253_crate_backfill_writer.sql']
const c = new Client({ host: process.env.PGHOST ?? '/private/tmp/pgtest', port: Number(process.env.PGPORT ?? 54329), user:'postgres', database:'postgres' })
await c.connect()
for (const f of files) {
  const sql = readFileSync(M + f, 'utf8')
  try { await c.query(sql); console.log('APPLIED  ' + f) }
  catch (e) {
    console.log('FAILED   ' + f)
    console.log('   ' + e.message)
    if (e.position) {
      const upto = sql.slice(0, Number(e.position))
      console.log('   at line ' + upto.split('\n').length + ': ' + sql.split('\n')[upto.split('\n').length-1].trim().slice(0,110))
    }
    if (e.hint) console.log('   hint: ' + e.hint)
    await c.end(); process.exit(1)
  }
}
await c.end()
