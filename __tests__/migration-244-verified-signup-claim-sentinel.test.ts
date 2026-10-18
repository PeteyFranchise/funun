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

describe('migration 244: claim sentinel for verified signups without an invite token', () => {
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

  it('leaves the token redemption path identical to migration 214', () => {
    expect(redemptionSpan(sql)).toBe(redemptionSpan(sql214))
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

  it('backfills only confirmed users with no usable token', () => {
    const backfill = code.match(/UPDATE public\.user_profiles p[\s\S]*?;/)?.[0] ?? ''
    expect(backfill).not.toBe('')
    expect(backfill).toContain('auth.users')
    expect(backfill).toContain('p.claimed_at IS NULL')
    expect(backfill).toContain('u.email_confirmed_at IS NOT NULL')
    expect(backfill).toContain('u.email IS NOT NULL')
    expect(backfill).toContain("NULLIF(trim(u.raw_user_meta_data->>'signup_invite_token'), '') IS NULL")
    expect(backfill).toContain("trim(u.raw_user_meta_data->>'signup_invite_token') !~ '^[A-Fa-f0-9]{64}$'")
  })

  it('reloads the schema cache, has no transaction wrapper, and ships owner verification probes', () => {
    expect(code).toContain("NOTIFY pgrst, 'reload schema';")
    expect(code).not.toMatch(/^\s*BEGIN;/m)
    expect(code).not.toMatch(/^\s*COMMIT;/m)
    expect(sql).toContain('OWNER-RUN BEHAVIORAL VERIFICATION')
    expect(sql).toContain('Closes #191')
  })

  it('contains no em dashes', () => {
    expect(sql).not.toContain('—')
  })
})
