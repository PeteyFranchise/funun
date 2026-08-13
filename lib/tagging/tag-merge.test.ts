import type { TrackDescriptors, AiSuggestedTags } from '@/lib/metadata/schema'
import { MOOD_VALUES } from '@/lib/metadata/schema'
import {
  mergeAiSuggestion,
  applyStaffRefinement,
  proposeStaffRefinement,
  approvePendingTags,
  rejectPendingTags,
  isTagApprover,
  TAG_APPROVER_ROLES,
} from './tag-merge'

const driving = MOOD_VALUES.find(m => m === 'driving')!
const chill = MOOD_VALUES.find(m => m === 'chill')!
const cinematic = MOOD_VALUES.find(m => m === 'cinematic')!
// 'moody' is the closest real controlled-vocab term to plan's "warm" example moods.
const warm = MOOD_VALUES.find(m => m === 'moody')!
const warmTerm: string = warm

function baseDescriptors(): TrackDescriptors {
  return { moods: [driving], energy: null, vocal: null }
}

function suggestion(moods: string[]): AiSuggestedTags {
  return {
    moods: moods.filter((m): m is typeof MOOD_VALUES[number] => (MOOD_VALUES as string[]).includes(m)),
    energy: null,
    vocal: null,
    instruments: [],
    suggested_at: '2026-08-13T00:00:00.000Z',
    model: 'claude-sonnet-4-20250514',
  }
}

describe('mergeAiSuggestion', () => {
  it('never overwrites confirmed moods — AI lands in ai_suggested only', () => {
    const current = baseDescriptors()
    const result = mergeAiSuggestion(current, suggestion([chill]))
    expect(result.moods).toEqual([driving])
    expect(result.ai_suggested?.moods).toEqual([chill])
  })

  it('does not mutate the input object', () => {
    const current = baseDescriptors()
    const snapshot = JSON.parse(JSON.stringify(current))
    mergeAiSuggestion(current, suggestion([chill]))
    expect(current).toEqual(snapshot)
  })
})

describe('applyStaffRefinement', () => {
  it('sets the confirmed moods, stamps staff_refined_by, preserves ai_suggested, clears pending', () => {
    const current: TrackDescriptors = {
      ...baseDescriptors(),
      ai_suggested: suggestion([chill]),
      pending: { moods: [warm], energy: null, vocal: null, instruments: [], proposed_by: 'ae-1', proposed_at: 'x' },
    }
    const result = applyStaffRefinement(current, { moods: [cinematic] }, 'staff-1')
    expect(result.moods).toEqual([cinematic])
    expect(result.staff_refined_by).toBe('staff-1')
    expect(result.ai_suggested?.moods).toEqual([chill])
    expect(result.pending).toBeUndefined()
  })

  it('does not mutate its input', () => {
    const current = baseDescriptors()
    const snapshot = JSON.parse(JSON.stringify(current))
    applyStaffRefinement(current, { moods: [cinematic] }, 'staff-1')
    expect(current).toEqual(snapshot)
  })

  it('drops off-vocab values routed through schema coercion', () => {
    const current = baseDescriptors()
    const result = applyStaffRefinement(current, { moods: [cinematic, 'not-a-real-mood'] }, 'staff-1')
    expect(result.moods).toEqual([cinematic])
  })
})

describe('proposeStaffRefinement', () => {
  it("an AE's proposal lands in pending — confirmed moods UNCHANGED, never auto-confirmed", () => {
    const current = baseDescriptors()
    const result = proposeStaffRefinement(current, { moods: [warmTerm] }, 'ae-1', 'ae')
    expect(result.moods).toEqual([driving])
    expect(result.pending?.moods).toEqual([warm])
    expect(result.pending?.proposed_by).toBe('ae-1')
  })

  it('a leadership proposal auto-confirms — no pending left', () => {
    const current = baseDescriptors()
    const result = proposeStaffRefinement(current, { moods: [warmTerm] }, 'lead-1', 'leadership')
    expect(result.moods).toEqual([warm])
    expect(result.pending).toBeUndefined()
    expect(result.staff_refined_by).toBe('lead-1')
  })

  it("an 'anr' proposal auto-confirms — no pending left", () => {
    const current = baseDescriptors()
    const result = proposeStaffRefinement(current, { moods: [warmTerm] }, 'anr-1', 'anr')
    expect(result.moods).toEqual([warm])
    expect(result.pending).toBeUndefined()
    expect(result.staff_refined_by).toBe('anr-1')
  })

  it('does not mutate its input', () => {
    const current = baseDescriptors()
    const snapshot = JSON.parse(JSON.stringify(current))
    proposeStaffRefinement(current, { moods: [warmTerm] }, 'ae-1', 'ae')
    expect(current).toEqual(snapshot)
  })

  it('drops off-vocab values from an AE proposal', () => {
    const current = baseDescriptors()
    const result = proposeStaffRefinement(current, { moods: ['not-real'] }, 'ae-1', 'ae')
    expect(result.pending?.moods).toEqual([])
  })
})

describe('approvePendingTags', () => {
  it('promotes pending to confirmed, stamps staff_refined_by = approver id, clears pending', () => {
    const current: TrackDescriptors = {
      ...baseDescriptors(),
      pending: { moods: [warm], energy: null, vocal: null, instruments: [], proposed_by: 'ae-1', proposed_at: 'x' },
    }
    const result = approvePendingTags(current, 'lead-2')
    expect(result.moods).toEqual([warm])
    expect(result.staff_refined_by).toBe('lead-2')
    expect(result.pending).toBeUndefined()
  })

  it('is a no-op on confirmed tags when nothing is pending', () => {
    const current = baseDescriptors()
    const result = approvePendingTags(current, 'lead-2')
    expect(result.moods).toEqual([driving])
    expect(result.pending).toBeUndefined()
  })
})

describe('rejectPendingTags', () => {
  it('clears pending without touching confirmed tags', () => {
    const current: TrackDescriptors = {
      ...baseDescriptors(),
      pending: { moods: [warm], energy: null, vocal: null, instruments: [], proposed_by: 'ae-1', proposed_at: 'x' },
    }
    const result = rejectPendingTags(current)
    expect(result.pending).toBeUndefined()
    expect(result.moods).toEqual([driving])
  })

  it('does not mutate its input', () => {
    const current: TrackDescriptors = {
      ...baseDescriptors(),
      pending: { moods: [warm], energy: null, vocal: null, instruments: [], proposed_by: 'ae-1', proposed_at: 'x' },
    }
    const snapshot = JSON.parse(JSON.stringify(current))
    rejectPendingTags(current)
    expect(current).toEqual(snapshot)
  })
})

describe('isTagApprover / TAG_APPROVER_ROLES', () => {
  it('leadership and anr are approvers', () => {
    expect(isTagApprover('leadership')).toBe(true)
    expect(isTagApprover('anr')).toBe(true)
  })

  it('ae and bd are not approvers', () => {
    expect(isTagApprover('ae')).toBe(false)
    expect(isTagApprover('bd')).toBe(false)
  })

  it('TAG_APPROVER_ROLES contains exactly leadership + anr', () => {
    expect([...TAG_APPROVER_ROLES].sort()).toEqual(['anr', 'leadership'])
  })
})
