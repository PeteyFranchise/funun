import fs from 'fs'
import path from 'path'

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations')
const sql = fs.readFileSync(
  path.join(MIGRATIONS_DIR, '244_verified_signup_claim_sentinel.sql'),
  'utf8'
)
const sql214 = fs.readFileSync(
  path.join(MIGRATIONS_DIR, '214_verified_invite_claim_hardening.sql'),
  'utf8'
)

function stripLineComments(fileSql: string): string {
  return fileSql
    .split('\n')
    .map((line) => {
      let inString = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === "'") {
          inString = !inString
          continue
        }
        if (!inString && ch === '-' && line[i + 1] === '-') return line.slice(0, i)
      }
      return line
    })
    .join('\n')
}

const code = stripLineComments(sql)

/** The function body: from its CREATE OR REPLACE through the closing `$$;`. */
function functionBody(fileSql: string): string {
  const start = fileSql.indexOf('CREATE OR REPLACE FUNCTION public.complete_verified_signup_claim(')
  expect(start).toBeGreaterThanOrEqual(0)
  const end = fileSql.indexOf('END;\n$$;', start)
  expect(end).toBeGreaterThan(start)
  return fileSql.slice(start, end)
}

/** The token redemption span: artist_invites lookup through the final RETURN TRUE. */
function redemptionSpan(fileSql: string): string {
  const body = functionBody(fileSql)
  const start = body.indexOf('SELECT id\n    INTO v_invite_id\n    FROM public.artist_invites')
  expect(start).toBeGreaterThanOrEqual(0)
  const end = body.lastIndexOf('RETURN TRUE;') + 'RETURN TRUE;'.length
  expect(end).toBeGreaterThan(start)
  return body.slice(start, end)
}

/** The auth.users SELECT ... INTO ... FOR UPDATE block, through its terminating semicolon. */
function authUserLockBlock(fileSql: string): string {
  const body = functionBody(fileSql)
  const start = body.indexOf('SELECT email,')
  expect(start).toBeGreaterThanOrEqual(0)
  const marker = 'FOR UPDATE;'
  const end = body.indexOf(marker, start)
  expect(end).toBeGreaterThan(start)
  return body.slice(start, end + marker.length)
}

/** The dead-end sentinel write: 6-space indent, inside the collaborator_invites NOT FOUND branch. */
const DEAD_END_SENTINEL =
  /      UPDATE public\.user_profiles\n {9}SET claimed_at = COALESCE\(claimed_at, now\(\)\)\n {7}WHERE id = p_user_id;\n\n/g

describe('migration 244: claim sentinel for verified signups without a redeemable invite', () => {
  const body = functionBody(code)

  it('redefines complete_verified_signup_claim with the same signature and security settings', () => {
    expect(code).toContain('CREATE OR REPLACE FUNCTION public.complete_verified_signup_claim(')
    expect(body).toContain('p_invite_token TEXT DEFAULT NULL')
    expect(body).toContain('RETURNS BOOLEAN')
    expect(body).toContain('SECURITY DEFINER')
    expect(body).toContain("SET search_path = ''")
  })

  it('redefines only that one function', () => {
    const defs = code.match(/CREATE OR REPLACE FUNCTION/g) ?? []
    expect(defs).toHaveLength(1)
    expect(code).not.toMatch(/handle_new_user/)
  })

  it('still requires a confirmed email under FOR UPDATE and rejects unconfirmed users before any claimed_at write', () => {
    expect(body).toContain('email_confirmed_at IS NOT NULL')
    expect(body).toContain('FOR UPDATE')
    const guard = body.indexOf('IF NOT FOUND OR v_email IS NULL THEN')
    expect(guard).toBeGreaterThanOrEqual(0)
    expect(body.slice(guard, guard + 120)).toMatch(/RETURN FALSE;/)
    const firstWrite = body.indexOf('claimed_at')
    expect(firstWrite).toBeGreaterThan(guard)
  })

  it('sets the sentinel on the no-token branch and still returns FALSE', () => {
    expect(body).toMatch(
      /IF v_token IS NULL OR v_token !~ '\^\[A-Fa-f0-9\]\{64\}\$' THEN[\s\S]*?UPDATE public\.user_profiles[\s\S]*?SET claimed_at = COALESCE\(claimed_at, now\(\)\)[\s\S]*?RETURN FALSE;/
    )
    // The sentinel write sits inside that branch, not after it.
    const branch = body.indexOf("IF v_token IS NULL OR v_token !~ '^[A-Fa-f0-9]{64}$' THEN")
    const branchEnd = body.indexOf('END IF;', branch)
    const write = body.indexOf('claimed_at', branch)
    expect(write).toBeGreaterThan(branch)
    expect(write).toBeLessThan(branchEnd)
  })

  it('sets the sentinel when a well-formed token matches no redeemable invite and still returns FALSE', () => {
    const collab = body.indexOf('FROM public.collaborator_invites')
    expect(collab).toBeGreaterThanOrEqual(0)
    const deadEnd = body.indexOf('IF NOT FOUND THEN', collab)
    expect(deadEnd).toBeGreaterThan(collab)
    const block = body.slice(deadEnd, body.indexOf('END IF;', deadEnd))
    expect(block).toMatch(
      /UPDATE public\.user_profiles\s+SET claimed_at = COALESCE\(claimed_at, now\(\)\)\s+WHERE id = p_user_id;\s+RETURN FALSE;/
    )
  })

  it('writes the sentinel on exactly two return-FALSE paths plus the 214 success path, never for unconfirmed users', () => {
    const writes = body.match(/SET claimed_at = COALESCE\(claimed_at, now\(\)\)/g) ?? []
    // no-token branch, dead-token branch, success path.
    expect(writes).toHaveLength(3)
    const guard = body.indexOf('IF NOT FOUND OR v_email IS NULL THEN')
    expect(body.slice(guard, body.indexOf('END IF;', guard))).not.toContain('claimed_at')
  })

  it('leaves the token redemption path identical to migration 214 apart from the dead-end sentinel write', () => {
    const span244 = redemptionSpan(sql)
    expect(span244.match(DEAD_END_SENTINEL) ?? []).toHaveLength(1)
    expect(span244.replace(DEAD_END_SENTINEL, '')).toBe(redemptionSpan(sql214))
  })

  it('locks the auth.users row FOR UPDATE with the exact 214 tail and a hex-gated explicit token', () => {
    const block244 = authUserLockBlock(sql)
    const block214 = authUserLockBlock(sql214)
    const tail = (b: string) => b.slice(b.indexOf('    INTO v_email, v_token'))
    expect(tail(block244)).toBe(tail(block214))
    expect(tail(block244)).toBe(
      [
        '    INTO v_email, v_token',
        '    FROM auth.users',
        '   WHERE id = p_user_id',
        '     AND email_confirmed_at IS NOT NULL',
        '   FOR UPDATE;',
      ].join('\n')
    )
    // The explicit parameter wins only when it is 64-hex; otherwise metadata is used.
    expect(block244).toContain(
      "WHEN trim(p_invite_token) ~ '^[A-Fa-f0-9]{64}$' THEN trim(p_invite_token)"
    )
    expect(block244).toContain("NULLIF(trim(raw_user_meta_data->>'signup_invite_token'), '')")
    expect(block244).not.toContain('NULLIF(trim(p_invite_token)')
  })

  it('keeps the early-return ledger branch as in 214', () => {
    const ledger = (s: string) => {
      const b = functionBody(s)
      const start = b.indexOf('IF EXISTS (')
      return b.slice(start, b.indexOf('END IF;', start) + 'END IF;'.length)
    }
    expect(ledger(sql)).toBe(ledger(sql214))
  })

  it('stays service-role only', () => {
    expect(code).toMatch(
      /REVOKE ALL ON FUNCTION public\.complete_verified_signup_claim\(UUID, TEXT\)\s+FROM PUBLIC, anon, authenticated;/
    )
    expect(code).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.complete_verified_signup_claim\(UUID, TEXT\)\s+TO service_role;/
    )
    expect(code).not.toMatch(/GRANT[^;]*\b(anon|authenticated)\b/)
  })

  it('backfills only confirmed users the function would set the sentinel for', () => {
    const backfill = code.match(/UPDATE public\.user_profiles p[\s\S]*?;/)?.[0] ?? ''
    expect(backfill).not.toBe('')
    expect(backfill).toContain('auth.users')
    expect(backfill).toContain('p.claimed_at IS NULL')
    expect(backfill).toContain('u.email_confirmed_at IS NOT NULL')
    expect(backfill).toContain('u.email IS NOT NULL')
    // Ledger users are skipped: the function returns TRUE for them.
    expect(backfill).toMatch(
      /NOT EXISTS \(\s+SELECT 1\s+FROM public\.verified_signup_invite_claims c\s+WHERE c\.user_id = u\.id\s+\)/
    )
    // Tokenless or malformed token.
    expect(backfill).toContain("NULLIF(trim(u.raw_user_meta_data->>'signup_invite_token'), '') IS NULL")
    expect(backfill).toContain("trim(u.raw_user_meta_data->>'signup_invite_token') !~ '^[A-Fa-f0-9]{64}$'")
    // Dead token: neither lookup redeems it, using the function's own predicates.
    expect(backfill).toMatch(/NOT EXISTS \(\s+SELECT 1\s+FROM public\.artist_invites ai/)
    expect(backfill).toContain('lower(ai.email) = lower(u.email)')
    expect(backfill).toContain(
      "(ai.status = 'pending' AND (ai.token_expires_at IS NULL OR ai.token_expires_at > now()))"
    )
    expect(backfill).toContain("(ai.status = 'accepted' AND ai.accepted_user_id = u.id)")
    expect(backfill).toMatch(/AND NOT EXISTS \(\s+SELECT 1\s+FROM public\.collaborator_invites ci/)
    expect(backfill).toContain('lower(ci.invited_email) = lower(u.email)')
    expect(backfill).toContain("(ci.status = 'pending' AND ci.token_expires_at > now())")
    expect(backfill).toContain("(ci.status = 'accepted' AND ci.accepted_user_id = u.id)")
  })

  it('is atomic: function, backfill and NOTIFY sit inside one BEGIN/COMMIT', () => {
    const begin = code.search(/^BEGIN;/m)
    const fn = code.indexOf('CREATE OR REPLACE FUNCTION')
    const backfillAt = code.indexOf('UPDATE public.user_profiles p')
    const notify = code.indexOf("NOTIFY pgrst, 'reload schema';")
    const commit = code.search(/^COMMIT;/m)
    expect(begin).toBeGreaterThanOrEqual(0)
    expect(begin).toBeLessThan(fn)
    expect(fn).toBeLessThan(backfillAt)
    expect(backfillAt).toBeLessThan(notify)
    expect(notify).toBeLessThan(commit)
    expect(code.match(/^BEGIN;/gm)).toHaveLength(1)
    expect(code.match(/^COMMIT;/gm)).toHaveLength(1)
  })

  it('ships owner verification probes and states the production count and scope', () => {
    expect(sql).toContain('OWNER-RUN BEHAVIORAL VERIFICATION')
    expect(sql).toContain('Closes #191')
    expect(sql).toContain('2026-10-18')
    expect(sql).toContain('preventive')
  })

  it('contains no em dashes', () => {
    expect(sql).not.toContain('—')
  })
})
