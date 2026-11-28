import { Client } from 'pg'
import { createHash } from 'node:crypto'
// MEDIUM (review 2026-11-28): replay must be STATUS-SAFE. "You already did
// this" is only true while the thing you did still stands.
let fails = 0
const ok = (c_,l,x='') => { if(!c_) fails++; console.log(`${c_?'OK  ':'*** FAIL ***'}  ${l}${x?': '+x:''}`) }
const c = new Client({ host: process.env.PGHOST ?? '/private/tmp/pgtest', port: Number(process.env.PGPORT ?? 54329), user:'postgres', database:'postgres' })
await c.connect()
const U='11111111-1111-1111-1111-111111111111'
const sha = s => createHash('sha256').update(s).digest('hex')
const SPARE = "(SELECT id FROM public.tracks WHERE project_id='22222222-2222-2222-2222-222222222222' AND NOT EXISTS (SELECT 1 FROM public.sync_listings l WHERE l.track_id = tracks.id) LIMIT 1)"

async function captured(tag) {
  const r = await c.query(`INSERT INTO public.sync_listings (vault_project_id,track_id,artist_user_id,status)
    VALUES ('22222222-2222-2222-2222-222222222222',${SPARE},$1,'pending_admit') RETURNING id`,[U])
  const L = r.rows[0].id, D = sha('bytes '+tag)
  await c.query(`SELECT public.crate_record_quality_review($1,'track-audio','p',$2,10,'audio/wav',$3,'passed',null)`,[L,D,U])
  await c.query(`SELECT public.crate_capture_admitted_song($1,'crate-audio',$2,$3,10,'audio/wav',$4)`,[L,`captured/${L}/a.wav`,D,U])
  return { L, D }
}
const retry = (L,D) => c.query(`SELECT public.crate_capture_admitted_song($1,'crate-audio',$2,$3,10,'audio/wav',$4) out`,
  [L,`captured/${L}/b.wav`,D,U])

{ const { L, D } = await captured('admitted')
  const r = await retry(L, D).then(x=>x.rows[0].out).catch(e=>({err:e.message}))
  ok(r.outcome === 'replayed', 'replay while ADMITTED succeeds', r.err ?? r.outcome) }

for (const state of ['withdrawn','removed','rejected']) {
  const { L, D } = await captured(state)
  await c.query(`UPDATE public.sync_listings SET status=$2 WHERE id=$1`,[L,state])
  const r = await retry(L, D).then(x=>({ok:true,out:x.rows[0].out})).catch(e=>({ok:false,msg:e.message}))
  ok(!r.ok && /no longer admitted/.test(r.msg ?? ''), `replay after ${state.toUpperCase()} is refused`,
     r.ok ? `RETURNED ${JSON.stringify(r.out.outcome)}` : '')
}
console.log(fails===0 ? '\nREPLAY IS STATUS-SAFE' : `\n${fails} FAILURE(S)`)
await c.end(); process.exitCode = fails===0?0:1
