import { Client } from 'pg'
const c = new Client({ host: process.env.PGHOST ?? '/private/tmp/pgtest', port: Number(process.env.PGPORT ?? 54329), user:'postgres', database:'postgres' })
await c.connect()

// seed one row of evidence to attack
await c.query(`INSERT INTO auth.users (id) VALUES ('11111111-1111-1111-1111-111111111111') ON CONFLICT DO NOTHING`)
await c.query(`INSERT INTO public.vault_projects (id,user_id,type,title) VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','single','P') ON CONFLICT DO NOTHING`)
await c.query(`INSERT INTO public.tracks (id,project_id,title,audio_file_url) VALUES ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','Song','u/p/t.wav') ON CONFLICT DO NOTHING`)
await c.query(`INSERT INTO public.user_profiles (id,artist_name) VALUES ('11111111-1111-1111-1111-111111111111','An Artist') ON CONFLICT DO NOTHING`)
await c.query(`INSERT INTO public.sync_listings (id,vault_project_id,track_id,artist_user_id,status)
               VALUES ('44444444-4444-4444-4444-444444444444','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','pending_admit') ON CONFLICT DO NOTHING`)
const SHA = 'a'.repeat(64)
await c.query(`SELECT public.crate_record_quality_review($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
  ['44444444-4444-4444-4444-444444444444','track-audio','u/p/t.wav',SHA,1234,'audio/wav',
   '11111111-1111-1111-1111-111111111111','passed',null])

let holes = 0
async function probe(label, sql, expect) {
  await c.query('BEGIN')
  try {
    await c.query('SET LOCAL ROLE service_role')
    await c.query(sql)
    const bad = expect === 'refused'
    if (bad) holes++
    console.log(`${bad?'*** HOLE ***':'OK  '}  ${label}: SUCCEEDED`)
  } catch (e) {
    const bad = expect !== 'refused'
    if (bad) holes++
    console.log(`${bad?'*** BROKEN ***':'OK  '}  ${label}: ${e.code} ${(e.message||'').slice(0,58)}`)
  }
  await c.query('ROLLBACK')
}

console.log('--- service_role must be REFUSED on evidence writes ---')
await probe('INSERT into crate_quality_reviews',
  `INSERT INTO public.crate_quality_reviews (listing_id,source_bucket,source_path,sha256,size_bytes,mime_type,reviewer_id,verdict)
   VALUES ('44444444-4444-4444-4444-444444444444','b','p','${'b'.repeat(64)}',1,'audio/wav','11111111-1111-1111-1111-111111111111','passed')`, 'refused')
await probe('UPDATE crate_quality_reviews', `UPDATE public.crate_quality_reviews SET verdict='failed'`, 'refused')
await probe('DELETE crate_quality_reviews', `DELETE FROM public.crate_quality_reviews`, 'refused')
await probe('TRUNCATE crate_quality_reviews', `TRUNCATE public.crate_quality_reviews CASCADE`, 'refused')
await probe('INSERT into crate_songs', `INSERT INTO public.crate_songs (title,primary_artist_name,payee_user_id,captured_by) VALUES ('x','y','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111')`, 'refused')
await probe('CREATE TRIGGER on crate_songs', `CREATE TRIGGER t BEFORE UPDATE ON public.crate_songs FOR EACH ROW EXECUTE FUNCTION public.crate_append_only()`, 'refused')
await probe('CREATE TABLE in public', `CREATE TABLE public.sneaky (id int)`, 'refused')

console.log('--- must-succeed controls ---')
await probe('SELECT from crate_quality_reviews', `SELECT count(*) FROM public.crate_quality_reviews`, 'allowed')
await probe('EXECUTE the sanctioned writer', `SELECT public.crate_record_quality_review('44444444-4444-4444-4444-444444444444','b','p','${'c'.repeat(64)}',5,'audio/wav','11111111-1111-1111-1111-111111111111','failed',null)`, 'allowed')

console.log('--- the append-only trigger, as the OWNER (not just via grants) ---')
try { await c.query(`UPDATE public.crate_quality_reviews SET verdict='failed'`); console.log('*** HOLE ***  superuser UPDATE succeeded') }
catch (e) { console.log('OK    superuser UPDATE refused by trigger:', e.message.slice(0,60)) }
try { await c.query(`TRUNCATE public.crate_quality_reviews`); console.log('*** HOLE ***  superuser TRUNCATE succeeded') }
catch (e) { console.log('OK    superuser TRUNCATE refused by trigger:', e.message.slice(0,60)) }
console.log(holes === 0 ? '\nNO HOLES FOUND' : `\n${holes} HOLE(S) FOUND`)
await c.end()
