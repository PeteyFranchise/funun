import { Client } from 'pg'
import { createHash } from 'node:crypto'
// MEDIUM (review 2026-11-28): the only legal outcomes of racing a capture+admit
// against a reject are "admitted WITH a capture" or "rejected WITHOUT one".
// Before the fix, capture committed and released its lock, a reject slipped in,
// and an immutable captured song sat attached to a rejected listing.
let fails = 0
const ok = (c_, l, x='') => { if(!c_) fails++; console.log(`${c_?'OK  ':'*** FAIL ***'}  ${l}${x?': '+x:''}`) }
const conn = () => new Client({ host:'/private/tmp/pgtest', port:54329, user:'postgres', database:'postgres' })
const U='11111111-1111-1111-1111-111111111111'
const sha = s => createHash('sha256').update(s).digest('hex')

const s = conn(); await s.connect()
await s.query(`INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING`,[U])
await s.query(`INSERT INTO public.vault_projects (id,user_id,type,title) VALUES ('22222222-2222-2222-2222-222222222222',$1,'single','P') ON CONFLICT DO NOTHING`,[U])
await s.query(`INSERT INTO public.tracks (id,project_id,title,audio_file_url) VALUES ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','S','u/p/t.wav') ON CONFLICT DO NOTHING`)
await s.query(`INSERT INTO public.user_profiles (id,artist_name) VALUES ($1,'A') ON CONFLICT DO NOTHING`,[U])

// Both orderings are exercised. A race test where one side always wins has not
// tested the interleaving — it has tested one branch twice.
for (const [trial, rejectDelayMs] of [[1,0],[2,0],[3,60],[4,60]]) {
  // A track per trial: sync_listings_active_track_uniq (096:63-65) permits only
  // one ACTIVE listing per song, and trial 1 leaves an admitted one behind.
  const tr = await s.query(`INSERT INTO public.tracks (project_id,title,audio_file_url)
    VALUES ('22222222-2222-2222-2222-222222222222',$1,'u/p/t.wav') RETURNING id`,['S'+trial])
  const r = await s.query(`INSERT INTO public.sync_listings (vault_project_id,track_id,artist_user_id,status)
    VALUES ('22222222-2222-2222-2222-222222222222',$1,$2,'pending_admit') RETURNING id`,[tr.rows[0].id,U])
  const L = r.rows[0].id, D = sha('bytes'+trial)
  await s.query(`SELECT public.crate_record_quality_review($1,'track-audio','p',$2,10,'audio/wav',$3,'passed',null)`,[L,D,U])

  const A = conn(), B = conn(); await A.connect(); await B.connect()
  const capture = A.query(`SELECT public.crate_capture_admitted_song($1,'crate-audio',$2,$3,10,'audio/wav',$4) out`,
    [L, `captured/${L}/a.wav`, D, U]).then(x=>({ok:true,out:x.rows[0].out})).catch(e=>({ok:false,e:e.message.slice(0,50)}))
  const reject = new Promise(r => setTimeout(r, rejectDelayMs)).then(() =>
    B.query(`UPDATE public.sync_listings SET status='rejected', decided_at=now() WHERE id=$1 AND status='pending_admit' RETURNING id`,[L]))
    .then(x=>({rows:x.rowCount})).catch(e=>({err:e.message.slice(0,50)}))
  const [ca, rj] = await Promise.all([capture, reject])

  const st = (await s.query(`SELECT status FROM public.sync_listings WHERE id=$1`,[L])).rows[0].status
  const songs = (await s.query(`SELECT count(*)::int n FROM public.crate_songs WHERE source_listing_id=$1`,[L])).rows[0].n
  const legal = (st === 'admitted' && songs === 1 && ca.ok) || (st === 'rejected' && songs === 0 && !ca.ok)
  ok(legal, `trial ${trial} (reject +${rejectDelayMs}ms): status=${st} capturedSongs=${songs} capture=${ca.ok?'ok':'refused'} rejectRows=${rj.rows ?? rj.err}`)
  await A.end(); await B.end()
}
console.log(fails===0 ? '\nNO ILLEGAL OUTCOME IN ANY TRIAL' : `\n${fails} ILLEGAL OUTCOME(S)`)
await s.end()
process.exitCode = fails===0?0:1
