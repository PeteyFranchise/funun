import { Client } from 'pg'
import { createHash } from 'node:crypto'
const c = new Client({ host: process.env.PGHOST ?? '/private/tmp/pgtest', port: Number(process.env.PGPORT ?? 54329), user:'postgres', database:'postgres' })
await c.connect()
let fails = 0
const ok = (cond, label, extra='') => { if(!cond) fails++; console.log(`${cond?'OK  ':'*** FAIL ***'}  ${label}${extra?': '+extra:''}`) }
const U='11111111-1111-1111-1111-111111111111', OP='99999999-9999-9999-9999-999999999999'
const sha = s => createHash('sha256').update(s).digest('hex')

await c.query(`INSERT INTO auth.users (id) VALUES ($1),($2) ON CONFLICT DO NOTHING`,[U,OP])
await c.query(`INSERT INTO public.vault_projects (id,user_id,type,title) VALUES ('22222222-2222-2222-2222-222222222222',$1,'single','P') ON CONFLICT DO NOTHING`,[U])
await c.query(`INSERT INTO public.tracks (id,project_id,title,audio_file_url) VALUES ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','Song','u/p/t.wav') ON CONFLICT DO NOTHING`)
await c.query(`INSERT INTO public.user_profiles (id,artist_name) VALUES ($1,'An Artist') ON CONFLICT DO NOTHING`,[U])

async function newListing(status='pending_admit') {
  const r = await c.query(`INSERT INTO public.sync_listings (vault_project_id,track_id,artist_user_id,status)
    VALUES ('22222222-2222-2222-2222-222222222222',
      -- a track per listing: sync_listings_active_track_uniq (096:63-65) permits
      -- one ACTIVE listing per song, and the stub baseline now reproduces it
      (SELECT id FROM public.tracks WHERE project_id='22222222-2222-2222-2222-222222222222' AND NOT EXISTS (SELECT 1 FROM public.sync_listings l WHERE l.track_id = tracks.id) LIMIT 1),$1,$2) RETURNING id`,[U,status])
  return r.rows[0].id
}
// Every RPC below runs AS service_role, which is how the application calls them.
async function asService(sql, params) {
  await c.query('BEGIN'); await c.query('SET LOCAL ROLE service_role')
  try { const r = await c.query(sql, params); await c.query('COMMIT'); return { ok:true, r } }
  catch (e) { await c.query('ROLLBACK'); return { ok:false, e } }
}

console.log('--- the writers must WORK as service_role, with production RLS on ---')
const L = await newListing()
const D = sha('bytes')
let out = await asService(`SELECT public.crate_record_quality_review($1,'track-audio','u/p/t.wav',$2,10,'audio/wav',$3,'passed',null) id`,[L,D,U])
ok(out.ok, 'quality review records', out.ok ? '' : out.e.message.slice(0,70))

out = await asService(`SELECT public.crate_capture_admitted_song($1,'crate-audio',$2,$3,10,'audio/wav',$4) out`,
  [L, `captured/${L}/a.wav`, D, U])
ok(out.ok, 'capture succeeds', out.ok ? JSON.stringify(out.r.rows[0].out.outcome) : out.e.message.slice(0,90))

const L2 = await newListing('admitted')
out = await asService(`SELECT public.crate_backfill_capture_song($1,'crate-audio',$2,$3,10,'audio/wav',$4) id`,
  [L2, `captured/${L2}/b.wav`, sha('legacy'), OP])
ok(out.ok, 'backfill succeeds', out.ok ? '' : out.e.message.slice(0,90))

console.log('\n--- and the MUST-FAIL control: remove the policies, the writers die ---')
await c.query('BEGIN')
await c.query('DROP POLICY crate_evidence_reads_listings ON public.sync_listings')
await c.query('SET LOCAL ROLE service_role')
const L3id = '55555555-5555-5555-5555-555555555555'
let died = false
try {
  await c.query(`SELECT public.crate_capture_admitted_song($1,'crate-audio',$2,$3,10,'audio/wav',$4)`,
    [L3id, `captured/${L3id}/x.wav`, D, U])
} catch (e) { died = /does not exist/.test(e.message) }
await c.query('ROLLBACK')
ok(died, 'without the listing policy the writer cannot see its row — the policies are what make it work')

console.log('\n--- the boundary still holds as service_role ---')
out = await asService(`INSERT INTO public.crate_quality_reviews (listing_id,source_bucket,source_path,sha256,size_bytes,mime_type,reviewer_id,verdict)
  VALUES ($1,'b','p',$2,1,'audio/wav',$3,'passed')`,[L, sha('x'), U])
ok(!out.ok && out.e.code === '42501', 'direct evidence INSERT still refused', out.ok ? 'SUCCEEDED' : out.e.code)

console.log(fails===0 ? '\nALL RLS PROBES PASSED' : `\n${fails} PROBE(S) FAILED`)
await c.end()
process.exitCode = fails === 0 ? 0 : 1
