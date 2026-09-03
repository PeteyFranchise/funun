import { renderToStaticMarkup } from 'react-dom/server'
import { FirstSignInWelcome } from './FirstSignInWelcome'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))

describe('FirstSignInWelcome', () => {
  it('renders the collaborator profile action and contextual shared song', () => {
    const markup = renderToStaticMarkup(
      <FirstSignInWelcome
        welcome={{
          kind: 'collaborator',
          eyebrow: 'Collaborator invite',
          title: 'Welcome to Funūn, @shanemaux.',
          body: 'Peter added your collaborator profile.',
          primary: { label: 'Review my profile', href: '/settings' },
          secondary: null,
          sharedWork: { title: 'Justified Noise', href: '/vault/works/work-1' },
        }}
      />
    )

    expect(markup).toContain('Review my profile')
    expect(markup).toContain('Justified Noise')
    expect(markup).toContain('Open song')
    expect(markup).toContain('Enter my vault')
  })

  it('renders one song-first action for a new artist without inventing a shared work', () => {
    const markup = renderToStaticMarkup(
      <FirstSignInWelcome
        welcome={{
          kind: 'artist',
          eyebrow: 'Your Sound Vault',
          title: 'Welcome to Funūn, @maya-reyes.',
          body: 'Start with one song.',
          primary: { label: 'Start my first song', href: '/vault/new' },
          secondary: { label: 'Set up my rights', href: '/settings' },
          sharedWork: null,
        }}
      />
    )

    expect(markup).toContain('Start my first song')
    expect(markup).toContain('Set up my rights')
    expect(markup).not.toContain('Open song')
    expect(markup).not.toContain('Shared with you')
  })

  it('does not spend another page gradient', () => {
    const markup = renderToStaticMarkup(
      <FirstSignInWelcome
        welcome={{
          kind: 'artist',
          eyebrow: 'Your Sound Vault',
          title: 'Welcome to Funūn.',
          body: 'Start with one song.',
          primary: { label: 'Start my first song', href: '/vault/new' },
          secondary: { label: 'Set up my rights', href: '/settings' },
          sharedWork: null,
        }}
      />
    )

    expect(markup).not.toContain('bg-grad')
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
