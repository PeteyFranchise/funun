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

  it('hardens the owner role unconditionally, not only when creating it', () => {
    expect(has('ALTER ROLE funun_crate_evidence NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;')).toBe(true)
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
