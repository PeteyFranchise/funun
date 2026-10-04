import {
  SEAT_ANSWER_VALUES,
  resolveRouting,
  sanitizeTeamTierLead,
  bdEndingCopy,
  selfServeEndingCopy,
} from './qualification'

describe('resolveRouting', () => {
  it.each([
    ['me_or_a_few', 'self_serve'],
    ['small_team', 'self_serve'],
    ['more_than_ten', 'bd'],
    ['not_sure', 'bd'],
  ] as const)('%s -> %s', (seatAnswer, expected) => {
    expect(resolveRouting(seatAnswer)).toBe(expected)
  })

  it('covers every SEAT_ANSWER_VALUES member and is total/pure', () => {
    for (const seatAnswer of SEAT_ANSWER_VALUES) {
      const first = resolveRouting(seatAnswer)
      const second = resolveRouting(seatAnswer)
      expect(first).toBe(second)
      expect(['bd', 'self_serve']).toContain(first)
    }
  })
})

describe('sanitizeTeamTierLead', () => {
  it('accepts a valid self-serve submission with no contact info', () => {
    const result = sanitizeTeamTierLead({
      seatAnswer: 'small_team',
      catalogueAnswer: 'from_25_to_200',
      painPoints: ['unsigned_splits'],
    })
    expect(result).toEqual({
      ok: true,
      value: {
        seatAnswer: 'small_team',
        catalogueAnswer: 'from_25_to_200',
        painPoints: ['unsigned_splits'],
        painPointsOther: null,
        contactName: null,
        contactEmail: null,
      },
    })
  })

  it('accepts a valid BD submission WITH contact info', () => {
    const result = sanitizeTeamTierLead({
      seatAnswer: 'more_than_ten',
      catalogueAnswer: 'over_1000',
      painPoints: ['scattered_files', 'finding_sync'],
      painPointsOther: '  We also need help with sync pitching.  ',
      contactName: '  Jamie Rivera  ',
      contactEmail: '  Jamie.Rivera@Example.COM  ',
    })
    expect(result).toEqual({
      ok: true,
      value: {
        seatAnswer: 'more_than_ten',
        catalogueAnswer: 'over_1000',
        painPoints: ['scattered_files', 'finding_sync'],
        painPointsOther: 'We also need help with sync pitching.',
        contactName: 'Jamie Rivera',
        contactEmail: 'jamie.rivera@example.com',
      },
    })
  })

  it('rejects a BD-routed submission missing contactEmail', () => {
    const result = sanitizeTeamTierLead({
      seatAnswer: 'more_than_ten',
      catalogueAnswer: 'over_1000',
      contactName: 'Jamie Rivera',
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a BD-routed submission missing contactName', () => {
    const result = sanitizeTeamTierLead({
      seatAnswer: 'not_sure',
      catalogueAnswer: 'under_25',
      contactEmail: 'jamie@example.com',
    })
    expect(result.ok).toBe(false)
  })

  it('rejects more than 2 pain points', () => {
    const result = sanitizeTeamTierLead({
      seatAnswer: 'small_team',
      catalogueAnswer: 'under_25',
      painPoints: ['chasing_details', 'unsigned_splits', 'scattered_files'],
    })
    expect(result.ok).toBe(false)
  })

  it('rejects an invalid painPoints member', () => {
    const result = sanitizeTeamTierLead({
      seatAnswer: 'small_team',
      catalogueAnswer: 'under_25',
      painPoints: ['not_a_real_pain_point'],
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a malformed email on the BD branch', () => {
    const result = sanitizeTeamTierLead({
      seatAnswer: 'more_than_ten',
      catalogueAnswer: 'over_1000',
      contactName: 'Jamie Rivera',
      contactEmail: 'not-an-email',
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a missing seatAnswer', () => {
    const result = sanitizeTeamTierLead({ catalogueAnswer: 'under_25' })
    expect(result.ok).toBe(false)
  })

  it('rejects a missing catalogueAnswer', () => {
    const result = sanitizeTeamTierLead({ seatAnswer: 'small_team' })
    expect(result.ok).toBe(false)
  })

  it('drops an unknown extra key (mass-assignment)', () => {
    const result = sanitizeTeamTierLead({
      seatAnswer: 'small_team',
      catalogueAnswer: 'under_25',
      painPoints: [],
      routingOutcome: 'bd',
      isAdmin: true,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).not.toHaveProperty('routingOutcome')
      expect(result.value).not.toHaveProperty('isAdmin')
    }
  })

  it('rejects a non-object input', () => {
    expect(sanitizeTeamTierLead(null).ok).toBe(false)
    expect(sanitizeTeamTierLead('string').ok).toBe(false)
    expect(sanitizeTeamTierLead(undefined).ok).toBe(false)
  })
})

describe('ending copy', () => {
  it('bdEndingCopy() returns the exact literal promise', () => {
    expect(bdEndingCopy()).toEqual({
      headline: 'This is bigger than Team.',
      body:
        "Entourage is built for groups like yours. We've got your answers on file — someone from Funūn will follow up by email.",
    })
  })

  it('selfServeEndingCopy() returns the exact literal promise and a working invite link', () => {
    expect(selfServeEndingCopy()).toEqual({
      headline: "Team's built for a group your size.",
      body:
        "We're invite-only right now, so the next step is requesting an invite — mention your team when you do, and we'll follow up about onboarding once you're in.",
      cta: { label: 'Request an invite', href: '/signup' },
    })
  })
})
