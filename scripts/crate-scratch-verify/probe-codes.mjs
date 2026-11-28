import { Client } from 'pg'
import { createHash } from 'node:crypto'
const c = new Client({ host: process.env.PGHOST ?? '/private/tmp/pgtest', port: Number(process.env.PGPORT ?? 54329), user:'postgres', database:'postgres' })
await c.connect()
const U='11111111-1111-1111-1111-111111111111'
const sha = s => createHash('sha256').update(s).digest('hex')

const r = await c.query(`INSERT INTO public.sync_listings (vault_project_id,track_id,artist_user_id,status)
  VALUES ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333',$1,'pending_admit') RETURNING id`,[U])
const L = r.rows[0].id
const A = sha('bytes A'), B = sha('bytes B')

await c.query(`SELECT public.crate_record_quality_review($1,'track-audio','p',$2,10,'audio/wav',$3,'passed',null)`,[L,A,U])
await c.query(`SELECT public.crate_capture_admitted_song($1,'crate-audio',$2,$3,10,'audio/wav',$4)`,[L,`captured/${L}/a.wav`,A,U])

// Now a NEW passing review of DIFFERENT bytes, then capture: the song exists
// holding A while the current review approves B. This is the already-captured
// conflict my TypeScript maps from SQLSTATE 23505.
await c.query(`SELECT public.crate_record_quality_review($1,'track-audio','p',$2,10,'audio/wav',$3,'passed',null)`,[L,B,U])
try {
  await c.query(`SELECT public.crate_capture_admitted_song($1,'crate-audio',$2,$3,10,'audio/wav',$4)`,[L,`captured/${L}/b.wav`,B,U])
  console.log('*** FAIL ***  a second capture with different bytes SUCCEEDED')
} catch (e) {
  console.log(`code=${e.code}  ${e.message.slice(0,80)}`)
  console.log(e.code === '23505'
    ? 'OK    SQLSTATE matches what the caller maps to already_captured_different_bytes'
    : `*** MISMATCH ***  caller maps 23505, database raised ${e.code} — that branch is dead code`)
}
await c.end()
