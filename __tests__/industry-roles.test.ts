import {
  ALL_INDUSTRY_ROLE_SLUGS,
  INDUSTRY_ROLE_GROUPS,
  industryRoleLabel,
} from '@/lib/industry-roles'
import { isValidRoleSlugList, mapSlugsToProfileRoles } from '@/lib/industry/roleMapping'

describe('INDUSTRY_ROLE_GROUPS', () => {
  it('includes the legal, executive, creative, and live-sound roles requested for profiles', () => {
    expect(INDUSTRY_ROLE_GROUPS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          group: 'Legal & Executive',
          roles: expect.arrayContaining([
            { slug: 'attorney', label: 'Attorney' },
            { slug: 'publishing_administrator', label: 'Publishing Administrator' },
            { slug: 'label_executive', label: 'Label Executive' },
          ]),
        }),
      ])
    )

    expect(ALL_INDUSTRY_ROLE_SLUGS).toEqual(expect.arrayContaining([
      'dj',
      'live_sound_mixer',
      'attorney',
      'publishing_administrator',
    ]))
  })

  it('returns labels for new roles and allows them through role-slug validation', () => {
    expect(industryRoleLabel('attorney')).toBe('Attorney')
    expect(industryRoleLabel('publishing_administrator')).toBe('Publishing Administrator')
    expect(industryRoleLabel('dj')).toBe('DJ')
    expect(industryRoleLabel('live_sound_mixer')).toBe('Live Sound Mixer')

    expect(isValidRoleSlugList([
      'attorney',
      'publishing_administrator',
      'dj',
      'live_sound_mixer',
    ])).toBe(true)
  })

  it('maps new roles to custom profile badges unless a preset exists', () => {
    expect(mapSlugsToProfileRoles(['attorney', 'publishing_administrator', 'dj'])).toEqual([
      { kind: 'custom', label: 'Attorney' },
      { kind: 'custom', label: 'Publishing Administrator' },
      { kind: 'custom', label: 'DJ' },
    ])
  })
})

