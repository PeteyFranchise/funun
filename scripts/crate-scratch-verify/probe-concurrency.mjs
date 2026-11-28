import { Client } from 'pg'

// LOW (review 2026-11-28): a probe that prints a failure and exits 0 lets a
// scripted run report success while an assertion failed. Every console.log is
// routed through a tally so the process status matches what was printed.
let probeFailures = 0
const rawLog = console.log.bind(console)
console.log = (...a) => { const s = a.join(' '); if (s.includes('*** ')) probeFailures++; rawLog(...a) }
process.on('exit', () => { if (probeFailures > 0) process.exitCode = 1 })
import { createHash } from 'node:crypto'
const U='11111111-1111-1111-1111-111111111111'
const sha = s => createHash('sha256').update(s).digest('hex')
const conn = () => new Client({ host: process.env.PGHOST ?? '/private/tmp/pgtest', port: Number(process.env.PGPORT ?? 54329), user:'postgres', database:'postgres' })

const setup = conn(); await setup.connect()
const r = await setup.query(`INSERT INTO public.sync_listings (vault_project_id,track_id,artist_user_id,status)
  VALUES ('22222222-2222-2222-2222-222222222222',(SELECT id FROM public.tracks WHERE project_id='22222222-2222-2222-2222-222222222222' AND NOT EXISTS (SELECT 1 FROM public.sync_listings l WHERE l.track_id = tracks.id) LIMIT 1),$1,'pending_admit') RETURNING id`,[U])
const L = r.rows[0].id
const D = sha('concurrent bytes')
await setup.query(`SELECT public.crate_record_quality_review($1,'track-audio','p',$2,10,'audio/wav',$3,'passed',null)`,[L,D,U])

// Two sessions capture the SAME listing with the SAME bytes, each to its own
// per-attempt path, started together.
const A = conn(), B = conn(); await A.connect(); await B.connect()
const go = (cli, tag) => cli.query(
  `SELECT public.crate_capture_admitted_song($1,'crate-audio',$2,$3,10,'audio/wav',$4) out`,
  [L, `captured/${L}/${tag}.wav`, D, U]
).then(res => ({ tag, out: res.rows[0].out })).catch(e => ({ tag, err: e.code + ' ' + e.message.slice(0,60) }))

const [ra, rb] = await Promise.all([go(A,'a'), go(B,'b')])
for (const x of [ra, rb]) console.log(`  ${x.tag}: ${x.err ? 'ERROR ' + x.err : JSON.stringify(x.out)}`)

const songs = await setup.query(`SELECT count(*)::int n FROM public.crate_songs WHERE source_listing_id=$1`,[L])
const arts  = await setup.query(`SELECT count(*)::int n FROM public.crate_song_artifacts a
  JOIN public.crate_songs s ON s.id=a.crate_song_id WHERE s.source_listing_id=$1`,[L])

const outcomes = [ra, rb].map(x => x.err ? 'error' : x.out.outcome).sort()
console.log('\noutcomes:', outcomes.join(' + '))
console.log('crate_songs rows for this listing:', songs.rows[0].n, '| artifacts:', arts.rows[0].n)

const clean = songs.rows[0].n === 1 && arts.rows[0].n === 1 && !ra.err && !rb.err
console.log(clean
  ? 'OK    both sessions resolved cleanly: one created, one replayed, exactly one song and one artifact'
  : '*** CHECK ***  a session errored or a duplicate exists — the loser is not clean')

// and the M4 serialisation: enqueue must WAIT for an open capture, not race it
const winner = ra.out ?? rb.out
await A.query('BEGIN')
await A.query(`SELECT 1 FROM public.sync_listings WHERE id=$1 FOR UPDATE`,[L])
let enqueueResolved = false
const enq = B.query(`SELECT public.crate_enqueue_capture_orphan($1,'crate-audio',$2)`,[L, winner.artifact_path])
  .then(()=>{enqueueResolved='succeeded'}).catch(e=>{enqueueResolved=e.message.slice(0,50)})
await new Promise(r=>setTimeout(r,400))
console.log('\nwhile a capture holds the listing lock, enqueue is:', enqueueResolved === false ? 'BLOCKED (correct)' : `NOT BLOCKED: ${enqueueResolved}`)
await A.query('ROLLBACK')
await enq
console.log('after the lock releases, enqueue returns:', enqueueResolved)
await A.end(); await B.end(); await setup.end()
