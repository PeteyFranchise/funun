import { renderToStaticMarkup } from 'react-dom/server'
import { WorkRoster, type WorkRosterMember } from './WorkRoster'

// No jsdom in this repo (testEnvironment: 'node') — asserted as static
// markup, same treatment as ComposerCard.test.tsx / QuickInviteModal's
// sibling components in this codebase.

const members: WorkRosterMember[] = [
  { id: 'm-owner', name: 'Pete', tier: 'administer', isOwner: true, isPending: false, isOnSheet: true, isWriterBadge: true },
  { id: 'm-ben', name: 'Ben Cooke', tier: 'contribute', isOwner: false, isPending: false, isOnSheet: false },
  { id: 'm-dana', name: 'Dana Whitfield', tier: 'contribute', isOwner: false, isPending: true, isOnSheet: false },
]

describe('WorkRoster', () => {
  it('renders the two groupings — membership and the split sheet — with the plain-words distinction', () => {
    const markup = renderToStaticMarkup(
      <WorkRoster workId="work-1" members={members} viewerTier="administer" viewerIsOwner />
    )
    expect(markup).toContain("Who&#x27;s on this song")
    expect(markup).toContain('On the split sheet')
    expect(markup).toContain('Being on the work means you can add to it')
    expect(markup).toContain('Being on the sheet means you own part of')
  })

  it('offers My Roster first, plus name/email invitation and a tier choice, for an administer viewer', () => {
    const markup = renderToStaticMarkup(
      <WorkRoster workId="work-1" members={members} viewerTier="administer" viewerIsOwner />
    )
    expect(markup).toContain('Add from My Roster')
    expect(markup).toContain('Or invite someone new')
    expect(markup).toContain('id="work-roster-first-name"')
    expect(markup).toContain('id="work-roster-email"')
    expect(markup).toContain('id="work-roster-tier"')
    expect(markup).toContain('Contributor')
    expect(markup).toContain('Administrator')
  })

  it('places writer promotion outside the add form', () => {
    const markup = renderToStaticMarkup(
      <WorkRoster workId="work-1" members={members} viewerTier="administer" viewerIsOwner />
    )
    const formMatch = markup.match(/<form[\s\S]*?<\/form>/)
    expect(formMatch).not.toBeNull()
    expect(formMatch?.[0]).not.toContain('Mark as writer')
    expect(markup).toContain('Mark as writer')
  })

  it('hides the add form and the promote control from a contribute-tier, non-owner viewer', () => {
    const markup = renderToStaticMarkup(
      <WorkRoster workId="work-1" members={members} viewerTier="contribute" viewerIsOwner={false} />
    )
    expect(markup).not.toContain('id="work-roster-first-name"')
    expect(markup).not.toContain('id="work-roster-email"')
    expect(markup).not.toContain('Mark as writer')
    expect(markup).not.toContain('Add a collaborator')
  })

  it('shows the roster and split-sheet groupings read-only for a contribute-tier viewer', () => {
    const markup = renderToStaticMarkup(
      <WorkRoster workId="work-1" members={members} viewerTier="contribute" viewerIsOwner={false} />
    )
    expect(markup).toContain('Ben Cooke')
    expect(markup).toContain('On the split sheet')
  })

  it('renders a pending invitee in its own distinct state', () => {
    const markup = renderToStaticMarkup(
      <WorkRoster workId="work-1" members={members} viewerTier="administer" viewerIsOwner />
    )
    expect(markup).toContain("Pending — hasn&#x27;t signed up yet")
  })

  it('contains no percentage input or percentage figure anywhere', () => {
    const markup = renderToStaticMarkup(
      <WorkRoster workId="work-1" members={members} viewerTier="administer" viewerIsOwner />
    )
    expect(markup).not.toMatch(/type="number"/)
    expect(markup).not.toContain('%')
  })

  it('renders the writer and singer badges matching the pad vocabulary', () => {
    const markup = renderToStaticMarkup(
      <WorkRoster workId="work-1" members={members} viewerTier="administer" viewerIsOwner />
    )
    expect(markup).toContain('✍')
  })

  it('contains no raw hex colour', () => {
    const markup = renderToStaticMarkup(
      <WorkRoster workId="work-1" members={members} viewerTier="administer" viewerIsOwner />
    )
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  // ─── Owner self-add as a writer (split-sheet section) ─────────────────

  const ownerOffSheet: WorkRosterMember[] = [
    { id: 'm-owner', name: 'peterzora', tier: 'administer', isOwner: true, isPending: false, isOnSheet: false },
    { id: 'm-ben', name: 'Ben Cooke', tier: 'contribute', isOwner: false, isPending: false, isOnSheet: false },
  ]

  it('offers the owner a self-add-as-writer control, with its proper-use copy, when they are not yet on the sheet', () => {
    const markup = renderToStaticMarkup(
      <WorkRoster workId="work-1" members={ownerOffSheet} viewerTier="administer" viewerIsOwner />
    )
    expect(markup).toContain('Add yourself as a writer')
    expect(markup).toContain('put yourself on the split sheet')
    expect(markup).toContain('What makes someone a writer?')
    // It lives in the split-sheet section, never inside the collaborator form.
    const formMatch = markup.match(/<form[\s\S]*?<\/form>/)
    expect(formMatch?.[0] ?? '').not.toContain('Add yourself as a writer')
  })

  it('drops the self-add control once the owner is on the sheet', () => {
    const markup = renderToStaticMarkup(
      <WorkRoster workId="work-1" members={members} viewerTier="administer" viewerIsOwner />
    )
    expect(markup).not.toContain('Add yourself as a writer')
  })

  it('never shows self-add to a non-owner, even when the owner is off the sheet', () => {
    const markup = renderToStaticMarkup(
      <WorkRoster workId="work-1" members={ownerOffSheet} viewerTier="contribute" viewerIsOwner={false} />
    )
    expect(markup).not.toContain('Add yourself as a writer')
  })

  // ─── Writer designation (DDEX/PRO) ────────────────────────────────────

  it('does not open the designation picker until a writer is being added', () => {
    const markup = renderToStaticMarkup(
      <WorkRoster workId="work-1" members={ownerOffSheet} viewerTier="administer" viewerIsOwner />
    )
    // The picker is state-driven — closed on first paint, so no role
    // prompt appears until the owner clicks to add themselves.
    expect(markup).not.toContain('What did you write?')
  })

  it('shows a writer’s designation on the split sheet, in the formal DDEX/PRO label', () => {
    const withRole: WorkRosterMember[] = [
      {
        id: 'm-owner',
        name: 'peterzora',
        tier: 'administer',
        isOwner: true,
        isPending: false,
        isOnSheet: true,
        isWriterBadge: true,
        writerDesignation: 'composer_lyricist',
      },
    ]
    const markup = renderToStaticMarkup(
      <WorkRoster workId="work-1" members={withRole} viewerTier="administer" viewerIsOwner />
    )
    expect(markup).toContain('Composer / Lyricist')
  })

  // --- Profile avatars --------------------------------------------------

  it('renders a member profile avatar when they have one', () => {
    const withAvatar: WorkRosterMember[] = [
      { id: 'm-owner', name: 'Maya Reyes', avatarUrl: 'https://cdn.test/maya.png', tier: 'administer', isOwner: true, isPending: false, isOnSheet: false },
    ]
    const markup = renderToStaticMarkup(
      <WorkRoster workId="work-1" members={withAvatar} viewerTier="administer" viewerIsOwner />
    )
    expect(markup).toContain('https://cdn.test/maya.png')
  })

  it('falls back to an initials monogram for a member with no avatar', () => {
    const markup = renderToStaticMarkup(
      <WorkRoster workId="work-1" members={members} viewerTier="administer" viewerIsOwner />
    )
    // Ben Cooke has no avatarUrl in the fixture -> two-letter monogram.
    expect(markup).toContain('>BC<')
  })
})
