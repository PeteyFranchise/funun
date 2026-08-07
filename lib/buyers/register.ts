// ─── buildRegisterPayload (23-04 Task 1) ───────────────────────────────────
// Pure mapper/validator for the public light-touch Register (+ "Talk to a
// sales rep") form — modelled on lib/deals/request-payload.ts's
// buildRequestBody: no fetch, no Supabase client, no I/O. This is the ONLY
// place the modal's free-form inputs get validated and coerced into the
// exact shape POST /api/sync/register accepts. Validates strictly against
// an explicit allowlist (company, contactName, email, phone, role, useCase,
// source) — never spreads arbitrary keys through.
//
// Phone is a loose min-length check only (this codebase's free-text phone
// precedent — 23-RESEARCH's Standard Stack, no validation library). Email
// reuses the EMAIL_REGEX shape from app/api/admin/buyer-orgs/route.ts.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Loose min-length only — matches the free-text phone precedent used
// elsewhere in this codebase (tracks.metadata.composers[].phone,
// artist_profiles.contact_phone). Not E.164/format validation.
const PHONE_MIN_LENGTH = 7

export const REGISTER_SOURCE_VALUES = ['register', 'sales_rep'] as const

export type RegisterSource = (typeof REGISTER_SOURCE_VALUES)[number]

export type RegisterForm = {
  company: string
  contactName: string
  email: string
  phone: string
  role: string
  useCase: string
  source?: string
}

export type RegisterPayload = {
  company: string
  contactName: string
  email: string
  phone: string
  role: string
  useCase: string
  source: RegisterSource
}

export type BuildRegisterPayloadResult =
  | { ok: true; body: RegisterPayload }
  | { ok: false; error: string }

function isRegisterSource(value: unknown): value is RegisterSource {
  return typeof value === 'string' && (REGISTER_SOURCE_VALUES as readonly string[]).includes(value)
}

export function buildRegisterPayload(form: RegisterForm): BuildRegisterPayloadResult {
  const company = (form.company ?? '').trim()
  if (!company) return { ok: false, error: 'Company name is required.' }

  const contactName = (form.contactName ?? '').trim()
  if (!contactName) return { ok: false, error: 'Contact name is required.' }

  const email = (form.email ?? '').trim().toLowerCase()
  if (!email || !EMAIL_REGEX.test(email)) {
    return { ok: false, error: 'A valid work email is required.' }
  }

  const phone = (form.phone ?? '').trim()
  if (phone.length < PHONE_MIN_LENGTH) {
    return { ok: false, error: 'A valid phone number is required.' }
  }

  const role = (form.role ?? '').trim()
  const useCase = (form.useCase ?? '').trim()
  const source: RegisterSource = isRegisterSource(form.source) ? form.source : 'register'

  return {
    ok: true,
    body: { company, contactName, email, phone, role, useCase, source },
  }
}
