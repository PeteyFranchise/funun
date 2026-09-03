export type FirstSignInWelcome = {
  kind: 'collaborator' | 'artist'
  eyebrow: string
  title: string
  body: string
  primary: { label: string; href: string }
  secondary: { label: string; href: string } | null
  sharedWork: { title: string; href: string } | null
}

type FirstSignInInput = {
  eligible: boolean
  completedAt: string | null
  handle: string | null
  inviterName: string | null
  hasClaimedCollaboratorProfile: boolean
  sharedWork: { id: string; title: string } | null
}

/**
 * Produces the one-time welcome copy from server-established identity facts.
 * Client input never selects an onboarding lane or a destination.
 */
export function buildFirstSignInWelcome(input: FirstSignInInput): FirstSignInWelcome | null {
  if (!input.eligible || input.completedAt) return null

  const handleTitle = input.handle?.trim() ? `, @${input.handle.trim()}` : ''
  const sharedWork = input.sharedWork
    ? { title: input.sharedWork.title, href: `/vault/works/${input.sharedWork.id}` }
    : null

  if (input.hasClaimedCollaboratorProfile) {
    const inviter = input.inviterName?.trim()
    return {
      kind: 'collaborator',
      eyebrow: 'Collaborator invite',
      title: `Welcome to Funūn${handleTitle}.`,
      body: inviter
        ? `${inviter} added your collaborator profile. Review your rights details first so future splits and registrations can fill themselves in.`
        : 'Your collaborator profile is ready. Review your rights details first so future splits and registrations can fill themselves in.',
      primary: { label: 'Review my profile', href: '/settings' },
      secondary: null,
      sharedWork,
    }
  }

  return {
    kind: 'artist',
    eyebrow: 'Your Sound Vault',
    title: `Welcome to Funūn${handleTitle}.`,
    body: 'Start with one song—hum an idea, write lyrics, upload a take or track, or invite the people creating it with you. Or get down to business first and add your rights information in Settings.',
    primary: { label: 'Start my first song', href: '/vault/new' },
    secondary: { label: 'Set up my rights', href: '/settings' },
    sharedWork: null,
  }
}
