import { Client } from 'pg'
import { createHash } from 'node:crypto'
const c = new Client({ host: process.env.PGHOST ?? '/private/tmp/pgtest', port: Number(process.env.PGPORT ?? 54329), user:'postgres', database:'postgres' })
await c.connect()
let fails = 0
const ok = (cond, label, extra='') => { if(!cond) fails++; console.log(`${cond?'OK  ':'*** FAIL ***'}  ${label}${extra?': '+extra:''}`) }

const U='11111111-1111-1111-1111-111111111111'
async function freshListing(status='pending_admit') {
  const r = await c.query(`INSERT INTO public.sync_listings (vault_project_id,track_id,artist_user_id,status)
    VALUES ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333',$1,$2) RETURNING id`,[U,status])
  return r.rows[0].id
}
const sha = (s) => createHash('sha256').update(s).digest('hex')
const REVIEWED = sha('the reviewed bytes')

async function review(listing, digest, verdict='passed') {
  const r = await c.query(`SELECT public.crate_record_quality_review($1,'track-audio','u/p/t.wav',$2,999,'audio/wav',$3,$4,null) id`,
    [listing, digest, U, verdict])
  return r.rows[0].id
}
async function capture(listing, digest, size=999) {
  const path = `captured/${listing}/attempt.review_playback.wav`
  const r = await c.query(`SELECT public.crate_capture_admitted_song($1,'crate-audio',$2,$3,$4,'audio/wav',$5) out`,
    [listing, path, digest, size, U])
  return r.rows[0].out
}

console.log('--- the comparison this slice exists for ---')
let L = await freshListing(); await review(L, REVIEWED)
try { await capture(L, sha('DIFFERENT bytes')); ok(false,'digest mismatch refused') }
catch (e) { ok(/do not match the reviewed bytes/.test(e.message), 'digest mismatch refused', e.code) }

const r1 = await capture(L, REVIEWED)
ok(r1.outcome === 'created', 'clean capture creates', JSON.stringify(r1.outcome))
const art = await c.query(`SELECT a.role,a.status,a.quality_review_id,a.backfill_attestation_id
  FROM public.crate_song_artifacts a WHERE a.crate_song_id=$1`,[r1.crate_song_id])
ok(art.rows.length===1 && art.rows[0].role==='review_playback', 'exactly one review_playback artifact')
ok(art.rows[0].quality_review_id && !art.rows[0].backfill_attestation_id, 'artifact rests on a REVIEW, not an attestation')

console.log('--- idempotency is exact replay ---')
const r2 = await capture(L, REVIEWED)
ok(r2.outcome === 'replayed', 'retry replays rather than creating a second song')
ok(r2.crate_song_id === r1.crate_song_id, 'replay returns the SAME song')
ok(r2.artifact_path === r1.artifact_path, 'replay returns the AUTHORITATIVE path')
try { await capture(L, sha('other')); ok(false,'different-bytes retry is a conflict') }
catch (e) { ok(e.code==='23505' || /different bytes|do not match/.test(e.message), 'different-bytes retry is a conflict', e.code) }

console.log('--- the current review wins, not the one a caller remembers ---')
let L2 = await freshListing(); await review(L2, REVIEWED, 'passed'); await review(L2, REVIEWED, 'failed')
try { await capture(L2, REVIEWED); ok(false,'a later FAILING review blocks capture') }
catch (e) { ok(/did not pass/.test(e.message), 'a later FAILING review blocks capture') }

console.log('--- listing state and destination are enforced in the database ---')
let L3 = await freshListing('applied'); await review(L3, REVIEWED)
try { await capture(L3, REVIEWED); ok(false,'capture requires pending_admit') }
catch (e) { ok(/not pending_admit/.test(e.message), 'capture requires pending_admit') }
let L4 = await freshListing(); await review(L4, REVIEWED)
try { await c.query(`SELECT public.crate_capture_admitted_song($1,'public-bucket','captured/x/y.wav',$2,999,'audio/wav',$3)`,[L4,REVIEWED,U]); ok(false,'wrong bucket refused') }
catch (e) { ok(/live in crate-audio/.test(e.message), 'wrong bucket refused') }
try { await c.query(`SELECT public.crate_capture_admitted_song($1,'crate-audio','captured/SOMEONE-ELSE/y.wav',$2,999,'audio/wav',$3)`,[L4,REVIEWED,U]); ok(false,'path outside the listing prefix refused') }
catch (e) { ok(/not inside this listing/.test(e.message), 'path outside the listing prefix refused') }

console.log('--- the orphan queue cannot eat a live artifact ---')
try { await c.query(`SELECT public.crate_enqueue_capture_orphan($1,'crate-audio',$2)`,[L, r1.artifact_path]); ok(false,'queueing a live artifact refused') }
catch (e) { ok(/captured artifact references it/.test(e.message), 'queueing a live artifact refused') }
const q = await c.query(`SELECT public.crate_enqueue_capture_orphan($1,'crate-audio','captured/stray/x.wav') id`,[L])
ok(!!q.rows[0].id, 'a genuine stray CAN be queued')

console.log('--- backfill is an operator act, and not a review ---')
let L5 = await freshListing('admitted')
try { await c.query(`SELECT public.crate_backfill_capture_song($1,'crate-audio',$2,$3,999,'audio/wav',$4)`,
      [L5, `captured/${L5}/b.wav`, REVIEWED, U]); ok(false,'artist as operator refused') }
catch (e) { ok(/artist cannot be recorded as the backfill operator/.test(e.message), 'artist as operator refused') }
const OP='99999999-9999-9999-9999-999999999999'
await c.query(`INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING`,[OP])
const b = await c.query(`SELECT public.crate_backfill_capture_song($1,'crate-audio',$2,$3,999,'audio/wav',$4) id`,
      [L5, `captured/${L5}/b.wav`, REVIEWED, OP])
ok(!!b.rows[0].id, 'backfill by an operator succeeds')
const ba = await c.query(`SELECT quality_review_id, backfill_attestation_id FROM public.crate_song_artifacts WHERE crate_song_id=$1`,[b.rows[0].id])
ok(!ba.rows[0].quality_review_id && !!ba.rows[0].backfill_attestation_id, 'backfilled artifact rests on an ATTESTATION, never a review')
const lc = await c.query(`SELECT lifecycle_state FROM public.crate_songs WHERE id=$1`,[b.rows[0].id])
ok(lc.rows[0].lifecycle_state === 'draft', 'backfilled song is draft, reaching no buyer')

console.log(fails===0 ? '\nALL BEHAVIOURAL PROBES PASSED' : `\n${fails} PROBE(S) FAILED`)
await c.end()
process.exit(fails===0?0:1)
