import { readFileSync } from 'fs'
import path from 'path'

// The eight MEDIUM findings from the 2026-11-25 adversarial review of migration
// 248, locked so a later edit cannot quietly undo one. These are TEXT assertions
// against the SQL, which is a weaker thing than executing it: there is no
// Postgres in this environment, so nothing here proves the migration runs or that
// the constraints behave. What they do prove is that the specific binding each
// finding asked for is still present.
const SQL = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/248_crate_song_expand.sql'),
  'utf8'
)

// Collapse whitespace so assertions survive reformatting.
const flat = SQL.replace(/\s+/g, ' ')
const has = (s: string) => flat.includes(s.replace(/\s+/g, ' '))

describe('migration 248 — M1: the write boundary exists', () => {
  it('creates a NOLOGIN NOINHERIT evidence owner', () => {
    expect(has('CREATE ROLE funun_crate_evidence NOLOGIN NOINHERIT')).toBe(true)
  })

  it('transfers every created table to that owner', () => {
    const created = [...SQL.matchAll(/CREATE TABLE public\.([a-z_]+) \(/g)].map((m) => m[1])
    expect(created.length).toBeGreaterThan(0)
    for (const t of created) {
      expect(has(`ALTER TABLE public.${t} OWNER TO funun_crate_evidence;`)).toBe(true)
    }
  })

  it('revokes ALL from service_role on every created table, then grants back only SELECT', () => {
    const created = [...SQL.matchAll(/CREATE TABLE public\.([a-z_]+) \(/g)].map((m) => m[1])
    for (const t of created) {
      // Round two: the enumerated form left the TRIGGER privilege behind, which
      // was enough for service_role to attach the append-only guard to a mutable
      // projection and block every sanctioned UPDATE.
      expect(has(`REVOKE ALL ON public.${t} FROM service_role;`)).toBe(true)
      expect(has(`GRANT SELECT ON public.${t} TO service_role;`)).toBe(true)
      expect(has(`REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.${t} FROM service_role;`)).toBe(false)
    }
  })

  it('revokes CREATE on schema public from service_role', () => {
    expect(has('REVOKE CREATE ON SCHEMA public FROM service_role;')).toBe(true)
  })

  it('enforces the role attributes it can, and ASSERTS the two it cannot', () => {
    // Setting NOSUPERUSER or NOBYPASSRLS requires superuser, and Supabase's
    // migration runner is not one — the second production apply failed at that
    // exact statement with 42501. Those two are now asserted and the migration
    // refuses if they are wrong; the rest are still enforced.
    expect(has('ALTER ROLE funun_crate_evidence NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE;')).toBe(true)
    expect(has('SELECT rolsuper, rolbypassrls INTO v_super, v_bypass')).toBe(true)
    expect(has('must be NOSUPERUSER and NOBYPASSRLS before it can own the evidence tables')).toBe(true)
    // the form that cannot run on a hosted runner must not come back
    expect(SQL).not.toContain('ALTER ROLE funun_crate_evidence NOLOGIN NOINHERIT NOSUPERUSER')
  })

  it('the harness applies as a non-superuser, the way production does', () => {
    const baseline = readFileSync(
      path.join(process.cwd(), 'scripts/crate-scratch-verify/baseline.sql'), 'utf8')
    const apply = readFileSync(
      path.join(process.cwd(), 'scripts/crate-scratch-verify/apply.mjs'), 'utf8')
    expect(baseline).toContain('CREATE ROLE migration_runner NOLOGIN NOSUPERUSER NOBYPASSRLS CREATEROLE')
    expect(apply).toContain("SET ROLE migration_runner")
    // and it must not hand itself an extension production keeps elsewhere
    expect(baseline).not.toContain('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
  })

  it('uses gen_random_uuid, which needs no extension', () => {
    // Code only. The identifier survives in the comment explaining why it is
    // NOT used — the sixth time in this file an assertion has had to be
    // narrowed because it matched prose rather than the thing the prose is
    // about.
    const codeOnly = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(codeOnly).not.toContain('uuid_generate_v4()')
    expect(codeOnly).toContain('gen_random_uuid()')
  })

  it('refuses to transfer ownership if an application role is a member of the owner', () => {
    expect(has("m.rolname IN ('service_role', 'authenticated', 'anon', 'authenticator')")).toBe(true)
    expect(has('the write boundary would be inherited away')).toBe(true)
  })

  it('takes temporary membership explicitly and transfers ownership LAST', () => {
    expect(has('GRANT funun_crate_evidence TO CURRENT_USER;')).toBe(true)
    expect(has('REVOKE funun_crate_evidence FROM CURRENT_USER;')).toBe(true)
    // ownership must come after the grants, not before
    expect(SQL.indexOf('ALTER TABLE public.crate_songs OWNER TO funun_crate_evidence;'))
      .toBeGreaterThan(SQL.indexOf('GRANT SELECT ON public.crate_songs TO service_role;'))
  })

  it('guards every append-only table against TRUNCATE, which row triggers do not catch', () => {
    const rowGuarded = [...SQL.matchAll(/BEFORE UPDATE OR DELETE ON public\.([a-z_]+)/g)].map((m) => m[1])
    expect(rowGuarded.length).toBeGreaterThan(0)
    for (const t of rowGuarded) {
      expect(has(`BEFORE TRUNCATE ON public.${t} FOR EACH STATEMENT`)).toBe(true)
    }
  })
})

describe('migration 248 — M2 to M6: the same-song and same-request bindings', () => {
  it('M2: a submission snapshot cannot name another song’s assessment', () => {
    expect(
      has(`FOREIGN KEY (clearance_assessment_id_at_submission, crate_song_id)
           REFERENCES public.crate_clearance_assessments (id, crate_song_id)`)
    ).toBe(true)
  })

  it('M3: a contract snapshot binds its manifest by both song and request', () => {
    expect(has('crate_contract_snapshots_manifest_same_song')).toBe(true)
    expect(has('crate_contract_snapshots_manifest_same_request')).toBe(true)
  })

  it('M4: hold coverage carries the request and binds both sides to it', () => {
    expect(has('license_request_hold_decision_holds_decision_same_request')).toBe(true)
    expect(has('license_request_hold_decision_holds_hold_same_request')).toBe(true)
  })

  it('M4: execution authority has a mandatory basis and one row per accepted assessment', () => {
    expect(has("basis TEXT NOT NULL CHECK (btrim(basis) <> '')")).toBe(true)
    expect(has('license_request_execution_authority_one_per_assessment UNIQUE (request_id, accepted_assessment_id)')).toBe(true)
  })

  it('M5: a manifest item cannot name a different request from its header', () => {
    expect(has('crate_manifest_items_header_same_request')).toBe(true)
  })

  it('M6: artifact supersession stays on the same song, now via the stronger lineage FK', () => {
    // M6's same-song binding was SUPERSEDED by the owner's 2026-11-27 lineage
    // decision: the predecessor FK now carries song, role and version, which
    // implies same-song and also stops an instrumental superseding artwork.
    expect(has('crate_song_artifacts_predecessor_is_real')).toBe(true)
    expect(has('FOREIGN KEY (supersedes_artifact_id, crate_song_id, role, supersedes_version)')).toBe(true)
    // the single-column form the review broke must not come back
    expect(has('supersedes_artifact_id UUID REFERENCES public.crate_song_artifacts(id)')).toBe(false)
  })
})

describe('migration 248 — owner decision 2026-11-27: authority provenance', () => {
  it('records which kind of act granted authority', () => {
    expect(has("authority_kind TEXT NOT NULL CHECK (authority_kind IN ('initial_acceptance', 'hold_decision'))")).toBe(true)
  })

  it('ties decision_id nullability to that kind, so a NULL is never ambiguous', () => {
    expect(
      has("CHECK ( (authority_kind = 'hold_decision') = (decision_id IS NOT NULL) )")
    ).toBe(true)
  })
})

describe('migration 248 — M7: supersession chains cannot cycle', () => {
  it('an approval cannot supersede itself', () => {
    expect(has('crate_artifact_approvals_no_self_supersede CHECK (supersedes_approval_id <> id)')).toBe(true)
  })

  it('approvals carry monotonic adjacency, so a two-row cycle is unrepresentable', () => {
    expect(has('crate_artifact_approvals_chain_adjacent')).toBe(true)
    expect(has('crate_artifact_approvals_predecessor_is_real')).toBe(true)
  })

  it('an artifact cannot have two independent approval roots', () => {
    // Round two: adjacency closed cycles and UNIQUE (supersedes) closed forks
    // from one predecessor, but two version-1 rows with NULL predecessors both
    // inserted cleanly and each could grow its own chain.
    expect(has('crate_artifact_approvals_one_root_per_artifact UNIQUE (artifact_id, chain_version)')).toBe(true)
  })

  it('manifests carry the same adjacency', () => {
    expect(has('crate_delivery_manifests_chain_adjacent')).toBe(true)
    expect(has('crate_delivery_manifests_predecessor_is_real')).toBe(true)
  })
})

describe('migration 248 — owner decision 2026-11-27: artifact lineage is linear', () => {
  it('carries the predecessor through song, ROLE and version, not song alone', () => {
    // Same-song alone still let an instrumental claim it superseded that song's
    // artwork, which is not lineage.
    expect(
      has(`FOREIGN KEY (supersedes_artifact_id, crate_song_id, role, supersedes_version)
           REFERENCES public.crate_song_artifacts (id, crate_song_id, role, chain_version)`)
    ).toBe(true)
  })

  it('allows one successor per predecessor and one row per song, role and version', () => {
    expect(has('crate_song_artifacts_linear_chain UNIQUE (supersedes_artifact_id)')).toBe(true)
    expect(has('crate_song_artifacts_one_per_song_role_version UNIQUE (crate_song_id, role, chain_version)')).toBe(true)
  })

  it('keeps origin shape and adjacency, matching the approval and manifest chains', () => {
    expect(has('crate_song_artifacts_chain_shape')).toBe(true)
    expect(has('crate_song_artifacts_chain_adjacent')).toBe(true)
  })
})

describe('migration 248 — M8: the assessment CAS column', () => {
  it('crate_songs carries assessment_version, separate from lifecycle_version', () => {
    expect(has('assessment_version INT NOT NULL DEFAULT 0')).toBe(true)
    expect(has('lifecycle_version INT NOT NULL DEFAULT 0')).toBe(true)
  })
})

// ─── Round three (review 2026-11-28): the writer findings ───────────────
const W251 = readFileSync(path.join(process.cwd(), 'supabase/migrations/251_crate_quality_review_writer.sql'), 'utf8')
const W252 = readFileSync(path.join(process.cwd(), 'supabase/migrations/252_crate_capture_writer.sql'), 'utf8')
const W253 = readFileSync(path.join(process.cwd(), 'supabase/migrations/253_crate_backfill_writer.sql'), 'utf8')
const flatOf = (s: string) => s.replace(/\s+/g, ' ')

describe('writers — M1: ownership transfer can actually happen', () => {
  it('every writer migration reacquires the membership 248 revoked', () => {
    for (const sql of [W251, W252, W253]) {
      expect(flatOf(sql)).toContain('GRANT funun_crate_evidence TO CURRENT_USER;')
      expect(flatOf(sql)).toContain('REVOKE funun_crate_evidence FROM CURRENT_USER;')
    }
  })

  it('248 grants the evidence role the legacy reads its functions need', () => {
    expect(has('GRANT SELECT (id, status, track_id, vault_project_id, artist_user_id) ON public.sync_listings TO funun_crate_evidence;')).toBe(true)
    expect(has('ON public.tracks TO funun_crate_evidence;')).toBe(true)
    expect(has('ON public.user_profiles TO funun_crate_evidence;')).toBe(true)
  })
})

describe('writers — M3/M4: the RPC derives and validates rather than trusting', () => {
  it('capture locks the listing first', () => {
    expect(flatOf(W252)).toContain('FROM public.sync_listings WHERE id = p_listing_id FOR UPDATE')
  })

  it('capture selects the CURRENT review instead of accepting one', () => {
    expect(flatOf(W252)).toContain('ORDER BY reviewed_at DESC, id DESC')
    expect(flatOf(W252)).not.toContain('p_quality_review_id')
  })

  it('capture requires the listing to be pending_admit', () => {
    expect(flatOf(W252)).toContain("v_listing.status <> 'pending_admit'")
  })

  it('capture no longer accepts identity from the caller', () => {
    for (const arg of ['p_source_track_id', 'p_source_project_id', 'p_payee_user_id', 'p_title']) {
      expect(W252).not.toContain(arg)
    }
  })

  it('idempotency is EXACT REPLAY: a different-bytes capture is a conflict', () => {
    expect(flatOf(W252)).toContain('is already captured as song % holding different bytes')
  })

  it('the destination bucket and path prefix are enforced in the database', () => {
    expect(flatOf(W252)).toContain("IF p_bucket <> 'crate-audio' THEN")
    expect(flatOf(W252)).toContain("'^captured/' || p_listing_id::text || '/'")
  })
})

describe('writers — M2/M5: the orphan queue cannot eat a live artifact', () => {
  it('refuses to queue a path a captured artifact references', () => {
    expect(flatOf(W252)).toContain('refusing to queue %/% for deletion: a captured artifact references it')
  })

  it('a reused path is reset to a fresh job, but lease_generation only increases', () => {
    expect(flatOf(W252)).toContain("SET state = 'pending', attempts = 0")
    expect(flatOf(W252)).toContain('lease_generation = public.crate_capture_orphans.lease_generation + 1')
  })
})

describe('writers — M7: a backfill is an operator act', () => {
  it('requires an operator and refuses the artist structurally', () => {
    expect(flatOf(W253)).toContain('backfill requires an explicit operator id')
    expect(flatOf(W253)).toContain('the artist cannot be recorded as the backfill operator')
  })

  it('does not claim the backfilled bytes are the admitted recording', () => {
    expect(flatOf(W253)).toContain('nobody has confirmed these are the bytes that were admitted')
  })
})

// ─── Owner decisions 2026-11-28: backfill topology and exposure ─────────

describe('backfill topology — a backfill is not a review', () => {
  it('attestations are their own relation, not a row in crate_quality_reviews', () => {
    expect(has('CREATE TABLE public.crate_backfill_attestations (')).toBe(true)
    expect(flatOf(W253)).toContain('INSERT INTO public.crate_backfill_attestations')
    expect(flatOf(W253)).not.toContain('INSERT INTO public.crate_quality_reviews')
  })

  it('crate_quality_reviews means one thing again: a named human approved these bytes', () => {
    expect(has('reviewer_id    UUID NOT NULL REFERENCES auth.users(id)')).toBe(true)
    expect(has("verdict        TEXT NOT NULL CHECK (verdict IN ('passed', 'failed'))")).toBe(true)
    // The contradiction is gone from the SCHEMA. The words survive in comments
    // explaining why, which is the point of keeping them: asserting on prose
    // rather than on the column definition is how a test checks the wrong thing.
    const codeOnly = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(codeOnly).not.toContain("'unreviewed'")
    expect(codeOnly).not.toContain('provenance     TEXT')
    expect(codeOnly).not.toContain('crate_quality_reviews_reviewer_matches_provenance')
  })

  it('an artifact rests on exactly one basis, enforced by XOR', () => {
    expect(has('crate_song_artifacts_playback_basis_xor')).toBe(true)
    expect(has('(quality_review_id IS NOT NULL) <> (backfill_attestation_id IS NOT NULL)')).toBe(true)
  })

  it('the attestation table is append-only and truncate-guarded like other evidence', () => {
    expect(has('BEFORE UPDATE OR DELETE ON public.crate_backfill_attestations')).toBe(true)
    expect(has('BEFORE TRUNCATE ON public.crate_backfill_attestations')).toBe(true)
  })
})

// ─── Round four (static second round, 2026-11-28) ──────────────────────
describe('round four — M1: the writer role can actually lock and read', () => {
  it('reads explicit columns, never SELECT *', () => {
    for (const sql of [W252, W253]) {
      expect(flatOf(sql)).toContain('SELECT id, status, track_id, vault_project_id, artist_user_id')
      expect(flatOf(sql)).not.toContain('SELECT * INTO v_listing')
    }
  })

  it('grants the UPDATE privilege FOR UPDATE requires, narrowed to the decision columns', () => {
    // Widened from UPDATE(updated_at) when the admission transition moved INTO
    // the capture transaction: the role now records a decision as well as
    // taking the lock. Still column-level, so it cannot touch anything else.
    expect(has('GRANT UPDATE (status, admitted_at, decided_at, decided_by, updated_at) ON public.sync_listings TO funun_crate_evidence;')).toBe(true)
  })

  it('gives the evidence role the RLS policies without which it sees no rows', () => {
    // NOBYPASSRLS plus column grants is not enough: all three legacy tables
    // have ownership-scoped RLS, so without policies the writers find nothing.
    expect(has('CREATE POLICY crate_evidence_reads_listings ON public.sync_listings')).toBe(true)
    expect(has('CREATE POLICY crate_evidence_locks_listings ON public.sync_listings')).toBe(true)
    expect(has('CREATE POLICY crate_evidence_reads_tracks ON public.tracks')).toBe(true)
    expect(has('CREATE POLICY crate_evidence_reads_profiles ON public.user_profiles')).toBe(true)
  })

  it('uses the house standard empty search_path, not public/pg_temp', () => {
    for (const sql of [W251, W252, W253]) {
      expect(sql).toContain("SET search_path = ''")
      expect(sql).not.toContain('SET search_path = public')
    }
  })

  it('admission happens inside the capture transaction', () => {
    expect(flatOf(W252)).toContain("SET status = 'admitted'")
    expect(flatOf(W252)).toContain("WHERE id = p_listing_id AND status = 'pending_admit'")
  })
})

describe('round four — M2: migration 254 is cut from this slice', () => {
  it('no promotion migration ships in 50.5B', () => {
    // Every PASSING promotion rolled back: the successor artifact reused the
    // predecessor's bucket and path against UNIQUE (storage_bucket,
    // storage_path). Whether an artifact version is a new stored object or a new
    // evidentiary state over the same one is an open design question, and it
    // belongs with the approval slice.
    expect(() =>
      readFileSync(path.join(process.cwd(), 'supabase/migrations/254_crate_review_captured_artifact.sql'))
    ).toThrow()
  })
})

describe('round four — M3: outcomes are distinguishable', () => {
  it('capture returns a structured outcome, not a bare id', () => {
    expect(flatOf(W252)).toContain('RETURNS JSONB')
    expect(flatOf(W252)).toContain("'outcome', 'created'")
    expect(flatOf(W252)).toContain("'outcome', 'replayed'")
  })

  it('a replay returns the EXISTING artifact path, not the caller’s', () => {
    expect(flatOf(W252)).toContain('SELECT a.storage_path INTO v_existing_path')
  })
})

describe('round four — M4: enqueue serialises with capture', () => {
  it('takes the same listing lock capture takes, closing the check-before-commit window', () => {
    expect(flatOf(W252)).toContain('PERFORM 1 FROM public.sync_listings WHERE id = p_listing_id FOR UPDATE;')
    expect(flatOf(W252)).toContain('crate_enqueue_capture_orphan( p_listing_id UUID')
  })
})

describe('round four — L1/L2: the constraint and the claims', () => {
  it('a non-playback artifact may carry NO basis at all', () => {
    expect(has('ELSE quality_review_id IS NULL AND backfill_attestation_id IS NULL')).toBe(true)
  })

  it('no longer claims no foreign key reaches an attestation', () => {
    // The phrase survives in the comment that CORRECTS it, which is the point
    // of keeping it. Assert on the original claim's exact wording instead —
    // this is the third assertion in this file to match explanatory prose
    // rather than the thing it explains.
    // Phrases must sit on ONE line: has() collapses whitespace but does not
    // strip the leading `--`, so a phrase spanning a comment break can never
    // match no matter how true it is.
    expect(SQL).not.toContain('and no foreign key reaches it.')
    expect(has('is exactly such a key')).toBe(true)
    expect(has('It is not a blanket proof of approval.')).toBe(true)
  })

  it('253’s comment describes what it actually writes', () => {
    expect(flatOf(W253)).toContain('Produces a row in crate_backfill_attestations and NO quality review')
    expect(flatOf(W253)).not.toContain('provenance=backfilled, verdict=unreviewed review row')
  })
})

// ─── Round five (targeted remediation, 2026-11-28) ─────────────────────
describe('round five — replay is status-safe and route-reachable', () => {
  it('the RPC refuses replay for a listing that is no longer admitted', () => {
    expect(flatOf(W252)).toContain("IF v_listing.status <> 'admitted' THEN")
    expect(flatOf(W252)).toContain('is no longer admitted')
  })

  it('the route lets an already-admitted exact retry reach the replay path', () => {
    const route = readFileSync(
      path.join(process.cwd(), 'app/api/sync-library/admin/[listingId]/route.ts'), 'utf8')
    expect(route).toContain("row.status === 'admitted'")
    expect(route).toContain('sync_library.admit_idempotent_retry')
  })

  it('the retry does not resend the notification, and says why', () => {
    const route = readFileSync(
      path.join(process.cwd(), 'app/api/sync-library/admin/[listingId]/route.ts'), 'utf8')
    expect(route).toContain('notificationResent: false')
    expect(route).toContain('NOTIFICATION IS DELIBERATELY NOT RESENT')
  })
})
