// ─── Team-tier qualification questionnaire — shared schema ────────────────
// Single TypeScript source of truth for /team-fit's vocabulary, routing,
// ending copy, and input sanitizing (quick task 261004-ttq). Every
// consumer (the public page, the POST route, the admin list, migration
// 229's CHECK constraints) must agree with the value arrays below —
// mirrors lib/metadata/schema.ts's `_VALUES`/`_LABELS` export convention.
// Pure, no I/O, safe to import on the client.
//
// A Team or Entourage customer here is a MEMBER buying a larger Member
// workspace. Nothing in this module creates a Client Partner or reads/
// writes buyer_orgs/buyer_members.

// ─── Q1 — seat count (routing) ─────────────────────────────────────────────
export const SEAT_ANSWER_VALUES = [
  'me_or_a_few',
  'small_team',
  'more_than_ten',
  'not_sure',
] as const

export type SeatAnswer = (typeof SEAT_ANSWER_VALUES)[number]

export const SEAT_ANSWER_LABELS: Record<SeatAnswer, string> = {
  me_or_a_few: 'Just me and one or two others',
  small_team: 'A small team — three to ten',
  more_than_ten: 'More than ten',
  not_sure: 'Not sure yet, it changes',
}

// ─── Q2 — catalogue size (sizing) ──────────────────────────────────────────
// DRAFT bands from the 2026-09-26 todo
// (.planning/todos/pending/2026-09-26-team-tier-qualification-
// questionnaire.md); owner has not set final cutoffs -- do not treat as
// settled.
export const CATALOGUE_ANSWER_VALUES = [
  'under_25',
  'from_25_to_200',
  'from_200_to_1000',
  'over_1000',
] as const

export type CatalogueAnswer = (typeof CATALOGUE_ANSWER_VALUES)[number]

export const CATALOGUE_ANSWER_LABELS: Record<CatalogueAnswer, string> = {
  under_25: 'Under 25 songs',
  from_25_to_200: '25 to 200',
  from_200_to_1000: '200 to 1,000',
  over_1000: 'More than 1,000',
}

// ─── Q3 — pain points (color) ──────────────────────────────────────────────
export const PAIN_POINT_VALUES = [
  'chasing_details',
  'unsigned_splits',
  'readiness_unclear',
  'scattered_files',
  'registrations_unclear',
  'finding_sync',
  'something_else',
] as const

export type PainPoint = (typeof PAIN_POINT_VALUES)[number]

export const PAIN_POINT_LABELS: Record<PainPoint, string> = {
  chasing_details: 'Chasing people for their details',
  unsigned_splits: 'Splits that never get signed',
  readiness_unclear: "Not knowing what's actually ready to release",
  scattered_files: 'Masters and files scattered across drives',
  registrations_unclear: 'Registrations nobody is sure got done',
  finding_sync: 'Finding sync and placement opportunities',
  something_else: 'Something else',
}

export const MAX_PAIN_POINTS = 2

// ─── Routing ────────────────────────────────────────────────────────────
export type RoutingOutcome = 'bd' | 'self_serve'

function isSeatAnswer(value: unknown): value is SeatAnswer {
  return typeof value === 'string' && (SEAT_ANSWER_VALUES as readonly string[]).includes(value)
}

function isCatalogueAnswer(value: unknown): value is CatalogueAnswer {
  return typeof value === 'string' && (CATALOGUE_ANSWER_VALUES as readonly string[]).includes(value)
}

function isPainPoint(value: unknown): value is PainPoint {
  return typeof value === 'string' && (PAIN_POINT_VALUES as readonly string[]).includes(value)
}

// 'not_sure' -> 'bd' is the todo's own recommendation ("a missed Entourage
// lead costs more than a conversation that turns out to be small"), not an
// owner ruling -- flagged, not silently finalized.
export function resolveRouting(seatAnswer: SeatAnswer): RoutingOutcome {
  if (seatAnswer === 'more_than_ten' || seatAnswer === 'not_sure') return 'bd'
  return 'self_serve'
}

// ─── Ending copy ────────────────────────────────────────────────────────
// Both must stay literally true during invite-only beta — no claim of an
// automated workspace, no claim of instant self-serve signup.
export type EndingCopy = {
  headline: string
  body: string
  cta?: { label: string; href: string }
}

export function bdEndingCopy(): EndingCopy {
  return {
    headline: 'This is bigger than Team.',
    body:
      "Entourage is built for groups like yours. We've got your answers on file — someone from Funūn will follow up by email.",
  }
}

export function selfServeEndingCopy(): EndingCopy {
  return {
    headline: "Team's built for a group your size.",
    body:
      "We're invite-only right now, so the next step is requesting an invite — mention your team when you do, and we'll follow up about onboarding once you're in.",
    cta: { label: 'Request an invite', href: '/signup' },
  }
}

// ─── Sanitizer ──────────────────────────────────────────────────────────
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// RFC 5321 §4.5.3.1.3 caps a full email address at 254 characters.
const EMAIL_MAX_LENGTH = 254
const NAME_MAX_LENGTH = 200
const PAIN_POINTS_OTHER_MAX_LENGTH = 500

export type TeamTierLeadInput = {
  seatAnswer: SeatAnswer
  catalogueAnswer: CatalogueAnswer
  painPoints: PainPoint[]
  painPointsOther: string | null
  contactName: string | null
  contactEmail: string | null
}

export type SanitizeTeamTierLeadResult =
  | { ok: true; value: TeamTierLeadInput }
  | { ok: false; error: string }

// Mass-assignment defense (mirrors lib/invites/schema.ts's
// sanitizeWaitlistEntry()): reads only the fields below off an unknown
// input; any other key is silently dropped. contactName/contactEmail are
// required ONLY when resolveRouting(seatAnswer) === 'bd' — this function
// computes that internally to decide whether to enforce the requirement.
export function sanitizeTeamTierLead(input: unknown): SanitizeTeamTierLeadResult {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>

  if (!isSeatAnswer(raw.seatAnswer)) {
    return { ok: false, error: 'A valid answer to the seat-count question is required.' }
  }
  const seatAnswer = raw.seatAnswer

  if (!isCatalogueAnswer(raw.catalogueAnswer)) {
    return { ok: false, error: 'A valid answer to the catalogue-size question is required.' }
  }
  const catalogueAnswer = raw.catalogueAnswer

  const rawPainPoints = Array.isArray(raw.painPoints) ? raw.painPoints : []
  if (rawPainPoints.length > MAX_PAIN_POINTS) {
    return { ok: false, error: `Choose at most ${MAX_PAIN_POINTS} pain points.` }
  }
  const painPoints: PainPoint[] = []
  for (const candidate of rawPainPoints) {
    if (!isPainPoint(candidate)) {
      return { ok: false, error: 'One of the selected pain points is not recognized.' }
    }
    painPoints.push(candidate)
  }

  const rawPainPointsOther = raw.painPointsOther
  const painPointsOther =
    rawPainPointsOther === undefined || rawPainPointsOther === null
      ? null
      : String(rawPainPointsOther).trim().slice(0, PAIN_POINTS_OTHER_MAX_LENGTH) || null

  const routingOutcome = resolveRouting(seatAnswer)

  let contactName: string | null = null
  let contactEmail: string | null = null

  if (routingOutcome === 'bd') {
    const rawName = typeof raw.contactName === 'string' ? raw.contactName.trim() : ''
    if (!rawName) {
      return { ok: false, error: 'A name is required so someone from Funūn can reply.' }
    }
    contactName = rawName.slice(0, NAME_MAX_LENGTH)

    const rawEmail = typeof raw.contactEmail === 'string' ? raw.contactEmail.trim().toLowerCase() : ''
    if (!rawEmail || rawEmail.length > EMAIL_MAX_LENGTH || !EMAIL_REGEX.test(rawEmail)) {
      return { ok: false, error: 'A valid email is required so someone from Funūn can reply.' }
    }
    contactEmail = rawEmail
  }

  return {
    ok: true,
    value: { seatAnswer, catalogueAnswer, painPoints, painPointsOther, contactName, contactEmail },
  }
}
