import { buildRegisterPayload, type RegisterForm } from './register'

// ─── buildRegisterPayload contract (23-04 Task 1) ──────────────────────────
// Locks the pure mapping/validation from the public Register (+ "Talk to a
// sales rep") modal's form state to the exact payload
// POST /api/sync/register accepts. No fetch, no I/O — mirrors
// lib/deals/request-payload.test.ts's pure-function style.

const baseForm: RegisterForm = {
  company: 'Acme Ad Agency',
  contactName: 'Jamie Rivera',
  email: 'Jamie.Rivera@Acme.com',
  phone: '555-123-4567',
  role: 'Marketing Director',
  useCase: 'agency',
}

describe('buildRegisterPayload', () => {
  it('maps the happy path, trimming and normalizing fields', () => {
    const result = buildRegisterPayload(baseForm)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.body).toEqual({
      company: 'Acme Ad Agency',
      contactName: 'Jamie Rivera',
      email: 'jamie.rivera@acme.com',
      phone: '555-123-4567',
      role: 'Marketing Director',
      useCase: 'agency',
      source: 'register',
    })
  })

  it('trims surrounding whitespace on every field', () => {
    const result = buildRegisterPayload({
      ...baseForm,
      company: '  Acme Ad Agency  ',
      contactName: '  Jamie Rivera  ',
      email: '  jamie.rivera@acme.com  ',
      phone: '  555-123-4567  ',
      role: '  Marketing Director  ',
      useCase: '  agency  ',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.body.company).toBe('Acme Ad Agency')
    expect(result.body.contactName).toBe('Jamie Rivera')
    expect(result.body.email).toBe('jamie.rivera@acme.com')
    expect(result.body.phone).toBe('555-123-4567')
    expect(result.body.role).toBe('Marketing Director')
    expect(result.body.useCase).toBe('agency')
  })

  // ── company ──
  it('rejects a missing company', () => {
    const result = buildRegisterPayload({ ...baseForm, company: '' })
    expect(result).toEqual({ ok: false, error: 'Company name is required.' })
  })

  it('rejects a whitespace-only company', () => {
    const result = buildRegisterPayload({ ...baseForm, company: '   ' })
    expect(result).toEqual({ ok: false, error: 'Company name is required.' })
  })

  // ── contactName ──
  it('rejects a missing contact name', () => {
    const result = buildRegisterPayload({ ...baseForm, contactName: '' })
    expect(result).toEqual({ ok: false, error: 'Contact name is required.' })
  })

  // ── email ──
  it('rejects a missing email', () => {
    const result = buildRegisterPayload({ ...baseForm, email: '' })
    expect(result).toEqual({ ok: false, error: 'A valid work email is required.' })
  })

  it('rejects a malformed email', () => {
    const result = buildRegisterPayload({ ...baseForm, email: 'not-an-email' })
    expect(result).toEqual({ ok: false, error: 'A valid work email is required.' })
  })

  it('rejects an email missing a domain', () => {
    const result = buildRegisterPayload({ ...baseForm, email: 'jamie@' })
    expect(result).toEqual({ ok: false, error: 'A valid work email is required.' })
  })

  it('lowercases a valid email', () => {
    const result = buildRegisterPayload({ ...baseForm, email: 'JAMIE@ACME.COM' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.body.email).toBe('jamie@acme.com')
  })

  // ── phone ──
  it('rejects a missing phone', () => {
    const result = buildRegisterPayload({ ...baseForm, phone: '' })
    expect(result).toEqual({ ok: false, error: 'A valid phone number is required.' })
  })

  it('rejects a too-short phone', () => {
    const result = buildRegisterPayload({ ...baseForm, phone: '12345' })
    expect(result).toEqual({ ok: false, error: 'A valid phone number is required.' })
  })

  it('accepts a loosely-formatted phone at the minimum length', () => {
    const result = buildRegisterPayload({ ...baseForm, phone: '1234567' })
    expect(result.ok).toBe(true)
  })

  // ── role / useCase (free text, no external validation) ──
  it('accepts empty role and useCase as trimmed empty strings', () => {
    const result = buildRegisterPayload({ ...baseForm, role: '', useCase: '' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.body.role).toBe('')
      expect(result.body.useCase).toBe('')
    }
  })

  // ── source discriminant ──
  it('defaults source to "register" when omitted', () => {
    const { source, ...rest } = baseForm
    const result = buildRegisterPayload(rest)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.body.source).toBe('register')
  })

  it('accepts source "sales_rep"', () => {
    const result = buildRegisterPayload({ ...baseForm, source: 'sales_rep' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.body.source).toBe('sales_rep')
  })

  it('falls back to "register" for an invalid source value', () => {
    const result = buildRegisterPayload({ ...baseForm, source: 'something_else' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.body.source).toBe('register')
  })

  // ── mass-assignment guard ──
  it('never emits keys outside the allowlist', () => {
    const pollutedForm = {
      ...baseForm,
      status: 'active',
      ae_user_id: 'staff-id',
    } as RegisterForm & { status: string; ae_user_id: string }
    const result = buildRegisterPayload(pollutedForm)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.body).sort()).toEqual(
      ['company', 'contactName', 'email', 'phone', 'role', 'useCase', 'source'].sort()
    )
  })
})
